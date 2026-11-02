import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { diagnoseSource } from "../src/playground/diagnostics";
import { formatAalwyn } from "../src/playground/format";
it("makes header and first-body starts identical", () => {
  const a = compile("fn f(x) = 5\n += 2\nend");
  const b = compile("fn f(x)\n // start\n = 5\n += 2\nend");
  expect(b.simplified).toEqual(a.simplified);
  expect(b.latex).toEqual(a.latex);
  expect(evaluateFunction(b, {x: 0})).toBe(7);
  expect(evaluateFunction(compile(formatAalwyn("fn f(x)\n= x+1\n*=2\nend")), {x: 3})).toBe(8);
});
it("allows only the first statement to initialize, including nested blocks", () => {
  for (const source of ["fn f()\n += 2\n = 5\nend", "fn f() = 1\n = 2\nend", "fn f()\n = 1\n = 2\nend", "fn f() => sum i from 1 to 2 (\n += i\n = 3\n)"])
    expect(() => parse(source)).toThrow("only as the first statement");
  expect(evaluateFunction(compile("fn f(n) => prod i from 1 to n (= 1\n *= i\n)"), {n: 4})).toBe(24);
});
it("warns without blocking compilation and follows implicit zero through definitions", () => {
  const source = "fn f(x)\n define k 5\n *= k\n /= x\n += 2\n *= 3\nend";
  const warnings = diagnoseSource(source);
  expect(warnings.map(w=>[w.line,w.severity])).toEqual([[1,"warning"],[3,"warning"],[4,"warning"]]);
  expect(evaluateFunction(compile(source), {x: 1})).toBe(6);
  expect(() => evaluateFunction(compile(source), {x: 0})).toThrow();
  expect(diagnoseSource("fn f() = 0\n *= 5\nend")).toEqual([]);
  expect(diagnoseSource("fn f()\n = 0\n *= 5\nend")).toEqual([]);
  expect(diagnoseSource("fn f()\n >> exp\n *= 5\nend")).toHaveLength(1);
});
it("checks aggregation term blocks independently", () => {
  expect(diagnoseSource("fn f() = 1\n *= prod i from 1 to 2 (\n *= i\n )\nend").map(w=>[w.line,w.severity])).toEqual([[2,"warning"]]);
  expect(diagnoseSource("fn f()\n += prod i from 1 to 2 (\n = 1\n *= i\n )\nend")).toHaveLength(1);
});
it("initializes each sum or product term once and preserves empty identities", () => {
  for (const [kind, expected, empty] of [["sum", 12, 0], ["prod", 60, 1]] as const) {
    const source = `fn f(n) => ${kind} i from 1 to n (\n // start each term\n = i + 1\n += 1\n)`;
    expect(evaluateFunction(compile(source), {n: 3})).toBe(expected);
    expect(evaluateFunction(compile(source), {n: 0})).toBe(empty);
    for (const body of ["+= 1\n = 2", "= 1\n = 2"])
      expect(() => parse(`fn f() => ${kind} i from 1 to 3 (\n ${body}\n)`)).toThrow("only as the first statement");
  }
});

it("warns for every implicit start but not explicit starts or direct definitions", () => {
  const source = "fn f(n)\n += sum i from 1 to n (\n += i\n )\nend";
  const warnings = diagnoseSource(source);
  expect(warnings.map(p => [p.line, p.severity, p.message])).toEqual([1, 2].map(line => [line, "warning", "No starting value was set using '='; assuming 0."]));
  expect(evaluateFunction(compile(source), {n: 3})).toBe(6);
  expect(diagnoseSource("fn f()\nend")).toHaveLength(1);
  for (const explicit of ["fn f() = 0\nend", "fn f()\n = 0\nend", "fn f() => 0", "fn f() => sum i from 1 to 3 (\n = 0\n += i\n)"])
    expect(diagnoseSource(explicit)).toEqual([]);
});

it("assumes one for product terms and reports that default", () => {
  const source = "fn f() = 0\n += prod i from 1 to 4 (\n *= i\n )\nend";
  expect(evaluateFunction(compile(source), {})).toBe(24);
  const warnings = diagnoseSource(source);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({code: "implicit-start", severity: "warning", message: "No starting value was set using '='; assuming 1."});
});

it("allows nonmutating definitions before initialization and uses their values", () => {
  const source = "fn f(x)\n define a x+1\n define b a*2\n = b\n += 1\nend";
  expect(evaluateFunction(compile(source), {x: 3})).toBe(9);
  expect(diagnoseSource(source)).toEqual([]);
  expect(evaluateFunction(compile(formatAalwyn(source)), {x: 3})).toBe(9);
  for (const kind of ["sum", "prod"]) {
    const aggregate = `fn f() => ${kind} i from 1 to 3 (\n define a i+1\n = a\n *= 2\n)`;
    expect(evaluateFunction(compile(aggregate), {})).toBe(kind === "sum" ? 18 : 192);
    expect(diagnoseSource(aggregate)).toEqual([]);
  }
  for (const first of ["+= 1", ">> exp", "= 1"])
    expect(() => parse(`fn f()\n ${first}\n define a 2\n = a\nend`)).toThrow("first statement that mutates");
  expect(() => compile("fn f()\n = a\n define a 2\nend")).toThrow("Undefined name");
});
it("keeps warnings visible alongside errors in the same program", () => {
  const diagnostics = diagnoseSource("fn f(x)\n += missing\nend");
  expect(diagnostics.some(p => p.severity === "warning" && p.code === "implicit-start")).toBe(true);
  expect(diagnostics.some(p => p.severity !== "warning" && p.message.includes("Undefined name"))).toBe(true);
});

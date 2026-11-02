import {
  compile as strictCompile,
  parse as strictParse,
} from "../src/compiler/compiler";
import { expect, it } from "vitest";
import {
  compile,
  evaluateFunction,
  evaluateMath,
  parse,
  sampleFunction,
} from "./legacy-fixtures";
import { migrateLegacySource } from "../src/compiler/migrate";
import { builtinSpecs } from "../src/compiler/builtins";
import { formatAalwyn } from "../src/playground/format";
import { highlight } from "../src/playground/highlight";
const value = (source: string, values: Record<string, number> = {}) =>
  evaluateFunction(compile(source), values);

it("automatically seeds independent sum terms with zero and product terms with one", () => {
  expect(value("f(n) => sum i from 1 to n ()", { n: 3 })).toBe(0);
  expect(value("f(n) => prod i from 1 to n ()", { n: 3 })).toBe(1);
  expect(value("f() => sum i from 1 to 3 (\n += i\n)")).toBe(6);
  expect(value("f() => prod i from 1 to 4 (\n *= i\n)")).toBe(24);
  expect(value("f() => sum i from 2 to 1 (\n += 1/0\n)")).toBe(0);
  expect(value("f() => prod i from 2 to 1 (\n *= 1/0\n)")).toBe(1);
  expect(
    value("f(n) => sum i from 1 to n (\n += sum j from 1 to i (\n += j\n)\n)", {
      n: 3,
    }),
  ).toBe(10);
  expect(() =>
    strictParse("fn f() => sum i from 1 to 3 init 0 (\n += i\n)"),
  ).toThrow("identity automatically");
});
it("accepts ? domains and rejects the retired colon separator", () => {
  const model = compile("f(real x ? x>0, int n ? n>=1) => x+n");
  expect(evaluateFunction(model, { x: 2, n: 1 })).toBe(3);
  expect(sampleFunction(model, { x: 0, n: 1 })).toBeNull();
  expect(sampleFunction(model, { x: 2, n: 0.5 })).toBeNull();
  expect(() => strictParse("fn f(real x : x>0) => x")).toThrow();
});
it("supports all requested apply forms and repeated references to me", () => {
  for (const [instruction, expected] of [
    [">> sin", Math.sin(2)],
    [">> sin(me)", Math.sin(2)],
    [">> me^2-5", -1],
    [">> me", 2],
    [">> 1/me", 0.5],
    [">> log(2,me)", 1],
    [">> me*me", 4],
    [">> 5^me", 25],
  ] as const)
    expect(value(`f(x) init x\n ${instruction}\nend`, { x: 2 })).toBeCloseTo(
      expected,
    );
  expect(() => strictCompile("fn f(x)\n += x\n apply sin\nend")).toThrow(
    "now written",
  );
  expect(() => compile("f(x) init x\n >> sin(1)\nend")).toThrow(
    "reference 'me'",
  );
  expect(Object.hasOwn(builtinSpecs, "raise")).toBe(false);
  expect(() => strictCompile("fn f(x) => raise(2,x)")).toThrow(
    "Undefined function",
  );
});
it("rejects me everywhere outside an apply expression, including unused definitions and predicates", () => {
  for (const source of [
    "f(x) => me",
    "f(x) init me\nend",
    "f(x) init 0\n define unused me\nend",
    "f(x) init 0\n += me\nend",
    "f(x) init 0\n += 1 ? (me>0) else 2\nend",
    "f(x) init 0\n += 1 ? (x>0) else me\nend",
    "f(x ? me>0) => x",
  ])
    expect(() => compile(source)).toThrow("only valid");
});
it("protects both conditional branches over their inactive domains", () => {
  const source = "f(x) init 0\n += ln(x) ? (x>0) else ln(-x)\nend";
  for (const x of [-3, -0.5, 0.5, 3]) {
    const model = compile(source);
    for (const expression of [model.ir, model.simplified])
      expect(evaluateMath(expression, { x })).toBeCloseTo(
        Math.log(Math.abs(x)),
      );
  }
  expect(() => value(source, { x: 0 })).toThrow();
  expect(JSON.stringify(compile(source).simplified)).not.toMatch(
    /"kind":"(?:piecewise|indicator|comparison)"/,
  );
});
it("applies else operands consistently to all five mutators", () => {
  const expected: Record<string, [number, number]> = {
    "+": [12, 13],
    "-": [8, 7],
    "*": [20, 30],
    "/": [5, 10 / 3],
    "^": [100, 1000],
  };
  for (const [op, [yes, no]] of Object.entries(expected)) {
    const source = `f(x) init 10\n ${op}= 2 ? (x>0) else 3\nend`;
    expect(value(source, { x: 1 })).toBeCloseTo(yes);
    expect(value(source, { x: -1 })).toBeCloseTo(no);
  }
});
it("supports grouped logic, numeric truth, and conventional and-before-or precedence", () => {
  const source = "f(a,b,c) init 0\n += 2 ? (a and b or c) else 3\nend";
  for (const a of [0, 1])
    for (const b of [0, 1])
      for (const c of [0, 1])
        expect(value(source, { a, b, c })).toBe((a && b) || c ? 2 : 3);
  expect(value("f() init 0\n += 1 ? (1 or 0 and 0) else 2\nend")).toBe(1);
  expect(value("f() init 0\n += 1 ? ((1 or 0) and 0) else 2\nend")).toBe(2);
});
it("keeps auxiliary domain requirements conditional on the branch that calls them", () => {
  const model = compile(
    "aux positive(x ? x>0) => x\nf(x) init 0\n += positive(x) ? (x>0) else positive(-x)\nend",
  );
  expect(evaluateFunction(model, { x: 2 })).toBe(2);
  expect(evaluateFunction(model, { x: -2 })).toBe(2);
  expect(sampleFunction(model, { x: 0 })).toBeNull();
});
it("supports abs directly and through apply and gives apply its own color token", () => {
  expect(value("f(x) => abs(x)", { x: -3 })).toBe(3);
  expect(value("f(x) init x\n >> abs\nend", { x: -3 })).toBe(3);
  expect(value("f(x) init x\n >> abs(me)\nend", { x: -3 })).toBe(3);
  expect(
    highlight(">> abs\n += 1")
      .filter((t) => t.style)
      .map((t) => [t.text, t.style]),
  ).toContainEqual([">>", "apply"]);
});
it("migrates old aggregate seeds, domains, guarded logic and raise without changing numeric meaning", () => {
  const original =
    "// retained\nf(real x : x>0) init x\n apply raise 5\n += sum i from 1 to 2 init i (\n += i\n)\nend";
  const migrated = migrateLegacySource(original);
  expect(migrated).toContain("// retained");
  expect(migrated).toContain(">>");
  expect(migrated).not.toContain(" init i");
  expect(value(migrated, { x: 2 })).toBe(31);
  expect(value(migrateLegacySource("f(x) => raise(5,x)"), { x: 2 })).toBe(25);
  expect(formatAalwyn(migrated)).toBe(formatAalwyn(formatAalwyn(migrated)));
});

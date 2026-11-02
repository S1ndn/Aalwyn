import { expect, it } from "vitest";
import {
  compile,
  evaluateFunction,
  evaluateMath,
  parse,
} from "./legacy-fixtures";
import { diagnoseSource } from "../src/playground/diagnostics";
import { formatAalwyn } from "../src/playground/format";
import { highlight } from "../src/playground/highlight";

it("preserves auxiliary calls in direct declarations, block declarations and apply", () => {
  const source =
    "aux grow(x) => exp(x)\naux shift(x) init x\n += 1\nend\nf(x) init x\n apply shift\n apply grow(me)\nend";
  const model = compile(source);
  expect(model.expressionLatex).toContain("grow");
  expect(model.expressionLatex).toContain("shift");
  expect(evaluateFunction(model, { x: 1 })).toBeCloseTo(Math.exp(2));
  expect(compile(formatAalwyn(source)).simplified).toEqual(model.simplified);
  expect(highlight("aux f(x) => exp(x)")[0]).toEqual({
    text: "aux",
    style: "keyword",
  });
  expect(highlight("auxiliary")[0].style).toBeUndefined();
});

it("retains the legacy modifier for saved documents without changing the compiled definition API", () => {
  expect(parse("helper f(x) => x").functions[0].helper).toBe(true);
  const modern = compile("aux h(x) => x^2\nf(x) => h(x)");
  const legacy = compile("helper h(x) => x^2\nf(x) => h(x)");
  expect(modern.simplified).toEqual(legacy.simplified);
  expect(modern.helpers).toEqual(legacy.helpers);
});

it("recovers multiple errors in auxiliary declarations without losing source locations", () => {
  const problems = diagnoseSource(
    "aux fn f(x) => missing\n\naux fn g(x)\n += unknown\nend\n\nfn h(x) => f(x)+g(x)",
  );
  expect(problems.filter(p => p.severity !== "warning").map((p) => p.line)).toEqual([1, 4]);
});

it("supports exp as a real exponential in calls and both apply forms", () => {
  const sources = [
    "f(x) => exp(x)",
    "f(x) => e^x",
    "f(x) init x\n apply exp\nend",
    "f(x) init x\n apply exp(me)\nend",
  ];
  for (const source of sources)
    for (const x of [-4, -0.5, 0, 0.5, 4])
      expect(evaluateFunction(compile(source), { x })).toBeCloseTo(
        Math.exp(x),
        12,
      );
  expect(compile(sources[0]).expressionLatex).toContain("\\exp");
  expect(() => compile("f(x) => exp(x,1)")).toThrow("expects 1");
  expect(() => compile("f(x) init x\n apply exp(1)\nend")).toThrow(
    "reference 'me'",
  );
});

it("protects partial arguments nested in exponentials on inactive branches", () => {
  const model = compile("f(x) init 0\n += exp(ln(x)) ? (x>0)\nend");
  for (const x of [-1, 0])
    for (const expr of [model.ir, model.simplified])
      expect(evaluateMath(expr, { x })).toBe(0);
  expect(evaluateFunction(model, { x: 2 })).toBeCloseTo(2);
});

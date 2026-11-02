import {expect, it} from "vitest";
import {trace} from "../src/compiler/trace";
import {compile, evaluateFunction} from "../src/compiler/compiler";
import {evaluateMath} from "../src/compiler/evaluate";

it("traces construction in source order and separates final simplification", () => {
  const source = "fn f(real x) = x\n    += 3\n    ^= 2\n    >> sin\nend";
  const result = trace(source);
  expect(result.steps.filter(s => s.kind !== "simplify").map(s => s.line)).toEqual([1, 2, 3, 4]);
  expect(result.steps[1].afterLatex).toBe("x + 3");
  expect(result.steps[2].afterLatex).toContain("x + 3");
  expect(result.finalLatex).toBe(compile(source).expressionLatex);
  expect(result.steps.at(-1)?.after).toEqual(compile(source).simplified);
  expect(evaluateMath(result.steps[2].after, {x: 2})).toBe(25);
});

it("shows definitions without changing the enclosing accumulator and retains aggregate spans", () => {
  const source = "fn f(int n ? n >= 1)\n    define total using (\n        = sum k from 1 to n (\n            = k^2\n        )\n    )\n    = total\n    /= n\nend";
  const result = trace(source);
  const definition = result.steps[0];
  expect(definition.kind).toBe("define");
  expect(definition.endLine).toBe(6);
  expect(definition.beforeLatex).toBe(definition.afterLatex);
  expect(evaluateMath(definition.definition!.expression, {n: 3})).toBe(14);
  expect(evaluateMath(result.steps.at(-1)!.after, {n: 3})).toBeCloseTo(14 / 3);
});

it("handles apply chains, semicolons and direct definitions", () => {
  const source = "fn f(x) = x; >> me^2 >> sin; end";
  const result = trace(source);
  expect(result.steps.filter(s => s.kind === "apply")).toHaveLength(2);
  expect(result.finalLatex).toBe(compile(source).expressionLatex);
  expect(trace("fn f(x) => x + 1").steps[0].kind).toBe("start");
});

it("uses real inactive-branch protection and exports auxiliary definitions", () => {
  const source = "aux fn square(x) = x^2; end\nfn f(x) = 0\n += ln(x) ? (x > 0)\n += square(x)\nend";
  const result = trace(source);
  const compiled = compile(source);
  expect(evaluateMath(result.steps.at(-1)!.after, {x: -2}, compiled.helpers)).toBe(evaluateFunction(compiled, {x: -2}));
  expect(result.auxiliaryExports.map(item => item.name)).toEqual(["square"]);
});

it("validates the complete program before emitting steps and clearly rejects recurrence-body traces", () => {
  expect(() => trace("fn f(x) = x; end\nfn broken(x) = missing; end", "f")).toThrow("Undefined name");
  expect(() => trace("recursive seq a(natural n)\n case 0 = 1\n = a[n-1]\nend")).toThrow("recurrence-body tracing");
});

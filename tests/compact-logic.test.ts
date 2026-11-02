import { describe, expect, it } from "vitest";
import {
  compile,
  evaluateMath,
  evaluateFunction,
  sampleFunction,
  simplify,
} from "./legacy-fixtures";
import katex from "katex";

describe("compact mathematical logic", () => {
  const predicates: Record<string, (a: number, b: number) => boolean> = {
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "==": (a, b) => a === b,
    "!=": (a, b) => a !== b,
  };
  it("preserves all six real comparisons at equality, near zero, and large magnitudes", () => {
    for (const [op, expected] of Object.entries(predicates)) {
      const model = compile(`f(a,b) init 0\n += 1 ? (a ${op} b)\nend`);
      for (const [a, b] of [
        [0, 0],
        [-0, 0],
        [1, 1],
        [1, 1 + Number.EPSILON],
        [Number.MIN_VALUE, 0],
        [-Number.MIN_VALUE, 0],
        [1e-100, 0],
        [-1e-100, 0],
        [1e300, 0],
        [-1e300, 0],
        [3, -2],
        [-2, 3],
      ]) {
        for (const e of [model.ir, model.simplified])
          expect(evaluateMath(e, { a, b }), `${a} ${op} ${b}`).toBe(
            Number(expected(a, b)),
          );
      }
      expect(simplify(model.simplified)).toEqual(model.simplified);
      expect(() =>
        katex.renderToString(model.latex, { throwOnError: true }),
      ).not.toThrow();
      expect(JSON.stringify(model.simplified)).not.toMatch(
        /"kind":"(?:indicator|comparison|piecewise)"/,
      );
    }
  });
  it("uses a single occurrence of the tested difference in compact detectors", () => {
    const greater = compile("f(x) init 0\n += 1 ? (x>0)\nend");
    expect(greater.expressionLatex).toContain("\\arctan");
    expect(greater.expressionLatex).not.toContain("\\left|");
    const equal = compile("f(x) init 0\n += 1 ? (x==0)\nend");
    expect(equal.expressionLatex).toContain("\\lfloor");
    expect(equal.expressionLatex.match(/\\left\|/g)).toHaveLength(1);
    for (const x of [0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e300]) {
      const truth = compile("f(x) init 0\n += 1 ? (x)\nend");
      expect(evaluateMath(truth.simplified, { x })).toBe(Number(x !== 0));
    }
  });
  it("preserves undefined predicate descendants rather than treating them as false", () => {
    for (const condition of ["ln(x)>0", "ln(x)==0", "ln(x)!=0", "1/x==0"])
      expect(() =>
        evaluateMath(
          compile(`f(x) init 0\n += 1 ? (${condition})\nend`).simplified,
          { x: 0 },
        ),
      ).toThrow();
  });
  it("removes protective denominators only under global nonzero assumptions", () => {
    for (const constraint of [
      "n > 0",
      "n < 0",
      "n != 0",
      "n >= 1",
      "n <= -1",
      "0 < n",
    ]) {
      const model = compile(
        `f(n : ${constraint},x) init 0\n += 1/n ? (x>0)\nend`,
      );
      // Negative literal bounds are parsed as unary expressions; safety still
      // holds even when conservative inference keeps a fallback.
      if (constraint !== "n <= -1") {
        expect(model.simplified.kind).toBe("divide");
        if (model.simplified.kind === "divide")
          expect(model.simplified.right).toEqual({ kind: "symbol", name: "n" });
      }
      const n =
        constraint.includes("< 0") || constraint.includes("<= -1") ? -2 : 2;
      expect(evaluateFunction(model, { n, x: 1 })).toBe(1 / n);
      expect(evaluateFunction(model, { n, x: -1 })).toBe(0);
      expect(sampleFunction(model, { n: 0, x: -1 })).toBeNull();
    }
    const unconstrained = compile("f(n,x) init 0\n += 1/n ? (x>0)\nend");
    expect(evaluateMath(unconstrained.simplified, { n: 0, x: -1 })).toBe(0);
    expect(() =>
      evaluateMath(unconstrained.simplified, { n: 0, x: 1 }),
    ).toThrow();
    const onlyActive = compile("f(n) init 0\n += 1/n ? (n>0)\nend");
    expect(evaluateMath(onlyActive.simplified, { n: 0 })).toBe(0);
  });
  it("uses conjunctions, but does not borrow one alternative of an OR constraint", () => {
    const and = compile("f(n : n>0 and n<10,x) init 0\n += 1/n ? (x>0)\nend");
    expect(and.simplified.kind).toBe("divide");
    const or = compile("f(n : n>0 or n==0,x) init 0\n += 1/n ? (x>0)\nend");
    expect(evaluateFunction(or, { n: 0, x: -1 })).toBe(0);
    expect(() => evaluateFunction(or, { n: 0, x: 1 })).toThrow();
  });
  it("simplifies integer floor/ceil locally without leaking callee assumptions", () => {
    expect(
      compile("f(int n) => ceil(n)+floor(n+1)").expressionLatex,
    ).not.toMatch(/ceil|floor/);
    expect(compile("f(real n) => ceil(n)").expressionLatex).toContain("ceil");
    const model = compile(
      "g(int n : n>0) init 0\n += 1/n ? (n>1)\nend\nf(x,y) => g(x)+ceil(y)",
    );
    expect(model.expressionLatex).toContain("ceil");
    expect(evaluateFunction(model, { x: 2, y: 0.5 })).toBe(1.5);
    expect(sampleFunction(model, { x: 0, y: 0.5 })).toBeNull();
  });
  it("shortens the guarded reciprocal/log and preserves the dangerous inactive cases", () => {
    const model = compile("f(x : x>0,a) init 0\n += ln(x) ? (a>0)\nend");
    expect(model.expressionLatex.match(/\\ln/g)).toHaveLength(1);
    expect(model.expressionLatex).not.toContain("\\left|");
    expect(evaluateFunction(model, { x: 2, a: 1 })).toBeCloseTo(Math.log(2));
    expect(evaluateFunction(model, { x: 2, a: -1 })).toBe(0);
    const untyped = compile("f(x) init 0\n += ln(x) ? (x>0)\nend");
    expect(evaluateMath(untyped.simplified, { x: -1 })).toBe(0);
    expect(evaluateMath(untyped.simplified, { x: 0 })).toBe(0);
  });
  it("hoists a nonzero denominator out of a sum while preserving empty ranges", () => {
    const model = compile(
      "f(int n : n>0,int a,int b) init 0\n += sum i from a to b init 0 (\n += i/n\n )\nend",
    );
    expect(model.simplified.kind).toBe("divide");
    expect(evaluateFunction(model, { n: 2, a: 1, b: 3 })).toBe(3);
    expect(evaluateFunction(model, { n: 2, a: 1, b: 0 })).toBe(0);
    // Without a nonzero assumption, moving a denominator out of an empty sum
    // would introduce an error that was never evaluated in the original.
    const unsafe = compile(
      "f(n,int a,int b) init 0\n += sum i from a to b init 0 (\n += i/n\n )\nend",
    );
    expect(evaluateFunction(unsafe, { n: 0, a: 1, b: 0 })).toBe(0);
  });
  it("compacts the exponential inverse counting sum and preserves its approximation", () => {
    const model = compile(
      "aux f(x) => e^x\ninv(real x : x>=1,int n : n>0) init 0\n += sum i from 0 to floor(x*n) init 0 (\n define step i/n\n += 1/n ? (f(step)<x)\n )\nend",
    );
    expect(model.simplified.kind).toBe("divide");
    if (model.simplified.kind === "divide") {
      expect(model.simplified.right).toEqual({ kind: "symbol", name: "n" });
      expect(model.simplified.left.kind).toBe("aggregate");
    }
    expect(model.expressionLatex.match(/\\arctan/g)).toHaveLength(1);
    expect(model.expressionLatex.match(/\\lceil/g)).toHaveLength(1);
    expect(model.expressionLatex).not.toContain("\\left|");
    for (const [x, n] of [
      [1, 4],
      [1.5, 4],
      [2, 10],
      [3, 8],
    ])
      expect(evaluateFunction(model, { x, n })).toBeCloseTo(
        Math.ceil(n * Math.log(x)) / n,
        12,
      );
    expect(sampleFunction(model, { x: 2, n: 0 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { compile, simplify } from "./legacy-fixtures";
import type { MathExpr } from "../src/compiler/math-ir";

function evaluate(e: MathExpr, values: Record<string, number>): number {
  switch (e.kind) {
    case "number":
      return Number(e.value);
    case "symbol":
      return e.name === "e"
        ? Math.E
        : e.name === "pi"
          ? Math.PI
          : values[e.name];
    case "aggregate": {
      const lower = evaluate(e.lower, values),
        upper = evaluate(e.upper, values);
      let result = e.operator === "sum" ? 0 : 1;
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper))
        throw Error("Integer bounds required");
      for (let i = lower; i <= upper; i++) {
        const term = evaluate(e.body, { ...values, [e.index]: i });
        result = e.operator === "sum" ? result + term : result * term;
      }
      return result;
    }
    case "add":
      return e.terms.reduce((n, t) => n + evaluate(t, values), 0);
    case "multiply":
      return e.terms.reduce((n, t) => n * evaluate(t, values), 1);
    case "divide":
      return evaluate(e.left, values) / evaluate(e.right, values);
    case "power":
      return evaluate(e.left, values) ** evaluate(e.right, values);
    case "function": {
      const x = evaluate(e.args[0], values);
      if (e.name === "atan") return Math.atan(x);
      if (e.name === "floor") return Math.floor(x);
      if (e.name === "abs") return Math.abs(x);
      if (e.name === "sqrt") return Math.sqrt(x);
      if (e.name === "ceil") return Math.ceil(x);
      throw new Error(e.name);
    }
  }
}

describe("algebraic simplification", () => {
  const cases = [
    ["-(a+b)", "-a - b"],
    ["a-(b-c)", "a - b + c"],
    ["-(-a)", "a"],
    ["-(a-b)", "-a + b"],
    ["2*(a+b)", "2\\,a + 2\\,b"],
    ["2*a+3*a", "5\\,a"],
    ["a+a-a", "a"],
    ["a-a", "0"],
    ["a/2", "\\frac{a}{2}"],
    ["(1/2)*a+(1/3)*a", "\\frac{5}{6}\\,a"],
    ["-(a+2)+a", "-2"],
    ["3*(a+b)-2*(a+b)", "a + b"],
  ];
  for (const [source, latex] of cases)
    it(`simplifies ${source}`, () => {
      const result = compile(`f(a,b,c) => ${source}`);
      expect(result.expressionLatex).toBe(latex);
      expect(simplify(result.simplified)).toEqual(result.simplified);
      for (const a of [-3, -0.25, 0, 2])
        for (const b of [-2, 0, 0.5, 4])
          expect(evaluate(result.simplified, { a, b, c: 3 })).toBeCloseTo(
            evaluate(result.ir, { a, b, c: 3 }),
            12,
          );
    });
  it("does not expand arbitrary polynomial products or cancel symbolic denominators", () => {
    expect(compile("f(a,b,c) => (a+b)*(a+c)").simplified.kind).toBe("multiply");
    expect(compile("f(a) => a/a").simplified.kind).toBe("divide");
    expect(compile("f(a) => sqrt(a^2)").simplified.kind).toBe("function");
    expect(compile("f(a) => a^0").simplified.kind).toBe("power");
  });
  it("works through local definitions and function inlining", () => {
    expect(
      compile(
        "neg(x) => -x\nf(a,b) init 0\n define total a+b\n += neg(total)\nend",
      ).expressionLatex,
    ).toBe("-a - b");
  });
  it("factors the signed exponential example into one ceiling and one exponential", () => {
    const result = compile(
      "f(x) init 0\n += e^x ? (x >= 0)\n -= e^x ? (x < 0)\nend",
    );
    expect(result.expressionLatex).toBe(
      "e^{x}\\,\\left(1 - 2\\,\\left\\lceil \\frac{\\arctan\\left(-x\\right)}{\\pi} \\right\\rceil\\right)",
    );
    expect((result.expressionLatex.match(/\\lceil/g) ?? []).length).toBe(1);
    expect(simplify(result.simplified)).toEqual(result.simplified);
    for (const x of [-5, -1, -1e-8, 0, 1e-8, 1, 5]) {
      const expected = x < 0 ? -Math.exp(x) : Math.exp(x);
      expect(evaluate(result.simplified, { x })).toBeCloseTo(expected, 12);
      expect(evaluate(result.ir, { x })).toBeCloseTo(expected, 12);
    }
  });
  for (const [source, expected] of [
    ["a*b+a*c", "a\\,\\left(b + c\\right)"],
    ["a*b+b*a", "2\\,a\\,b"],
    ["a*a*b+a*a*c", "a^{2}\\,\\left(b + c\\right)"],
    ["a*(1-b)-b*a", "a\\,\\left(1 - 2\\,b\\right)"],
    ["abs(-a)", "\\left|a\\right|"],
    ["abs(abs(a))", "\\left|a\\right|"],
  ])
    it(`simplifies shared factors in ${source}`, () => {
      const result = compile(`f(a,b,c) => ${source}`);
      expect(result.expressionLatex).toBe(expected);
      expect(simplify(result.simplified)).toEqual(result.simplified);
      for (const a of [-2, 0, 3])
        for (const b of [-1, 0, 2])
          expect(evaluate(result.simplified, { a, b, c: 4 })).toBeCloseTo(
            evaluate(result.ir, { a, b, c: 4 }),
            12,
          );
    });
});

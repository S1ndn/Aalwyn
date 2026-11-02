import { describe, expect, it } from "vitest";
import { compile, evaluateMath, simplify } from "./legacy-fixtures";
import { latex } from "../src/compiler/latex";
import { compactLatex } from "../src/compiler/compact-latex";
import { num, type MathExpr } from "../src/compiler/math-ir";
import katex from "katex";

describe("guard-aware compact domain protection", () => {
  it("shortens the reciprocal/log example without changing either branch or zero", () => {
    const result = compile(
      "r(x) init 0\n += (-1/x) ? (x<0)\n += ln(x) ? (x>0)\nend",
    );
    expect((result.expressionLatex.match(/\\lceil/g) ?? []).length).toBe(4);
    expect(result.simplified.kind).toBe("add");
    expect(simplify(result.simplified)).toEqual(result.simplified);
    for (const x of [-10, -1, -0.001, 0, 0.001, 0.5, 1, 10]) {
      const expected = x < 0 ? -1 / x : x > 0 ? Math.log(x) : 0;
      expect(
        Math.abs(evaluateMath(result.simplified, { x }) - expected),
      ).toBeLessThanOrEqual(2e-12 * Math.max(1, Math.abs(expected)));
    }
    expect(result.abbreviations).toHaveLength(1);
    expect(() =>
      katex.renderToString(result.compactLatex, {
        throwOnError: true,
        strict: "error",
      }),
    ).not.toThrow();
  });
  it("uses sign facts only where they follow from the whole guard", () => {
    const positive = compile("f(x) init 0\n += ln(x) ? (0<x)\nend");
    expect(evaluateMath(positive.simplified, { x: -2 })).toBe(0);
    expect(evaluateMath(positive.simplified, { x: 2 })).toBeCloseTo(
      Math.log(2),
      12,
    );
    const conjunction = compile(
      "f(x,a) init 0\n += ln(x) ? (x>0) and (a>0)\nend",
    );
    expect(evaluateMath(conjunction.simplified, { x: -1, a: 0 })).toBe(0);
    const disjunction = compile(
      "f(x,a) init 0\n += ln(x) ? (x>0) or (a>0)\nend",
    );
    expect(() =>
      evaluateMath(disjunction.simplified, { x: -1, a: 1 }),
    ).toThrow();
    expect(() =>
      evaluateMath(compile("f(x) init 0\n += ln(x) ? (x>=0)\nend").simplified, {
        x: 0,
      }),
    ).toThrow();
  });
  it("handles negative denominators and nonnegative square-root arguments safely", () => {
    for (const source of [
      "f(x) init 0\n += 2/x ? (x<0)\nend",
      "f(x) init 0\n += sqrt(x) ? (x>=0)\nend",
    ]) {
      const result = compile(source);
      expect(evaluateMath(result.simplified, { x: 0 })).toBe(0);
    }
    expect(
      evaluateMath(compile("f(x) init 0\n += 2/x ? (x<0)\nend").simplified, {
        x: -2,
      }),
    ).toBe(-1);
  });
  it("does not cancel the domain of a reciprocal product", () => {
    const result = compile("f(x,a) => a*(1/x)");
    expect(result.simplified.kind).toBe("divide");
    expect(() => evaluateMath(result.simplified, { x: 0, a: 0 })).toThrow();
  });
});

describe("explicit mathematical abbreviations", () => {
  it("leaves the compiled expression unchanged and fully expands every definition", () => {
    const result = compile(
      "r(x) init 0\n += (-1/x) ? (x<0)\n += ln(x) ? (x>0)\nend",
    );
    const before = JSON.stringify(result.simplified);
    compactLatex(result.simplified, "r(x)");
    expect(JSON.stringify(result.simplified)).toBe(before);
    expect(result.latex).not.toContain("u_{");
    for (const definition of result.abbreviations) {
      expect(latex(definition.expression)).not.toContain("u_{");
      expect(result.compactLatex).toContain(`${definition.name} &=`);
    }
  });
  it("does not introduce abbreviations for simple expressions", () => {
    const result = compile("f(x) => x^2");
    expect(result.abbreviations).toEqual([]);
    expect(result.compactLatex).toBe(result.latex);
  });
  it("represents repeated expressions with exact definitions, not opaque predicates", () => {
    const expression: MathExpr = {
      kind: "function",
      name: "ceil",
      args: [
        {
          kind: "divide",
          left: { kind: "symbol", name: "x" },
          right: {
            kind: "add",
            terms: [
              num(1),
              {
                kind: "function",
                name: "abs",
                args: [{ kind: "symbol", name: "x" }],
              },
            ],
          },
        },
      ],
    };
    const tree: MathExpr = {
      kind: "add",
      terms: [expression, { kind: "power", left: expression, right: num(2) }],
    };
    const compact = compactLatex(tree, "f(x)");
    expect(compact.abbreviations).toHaveLength(1);
    expect(compact.abbreviations[0].expression).toEqual(expression);
    const value = evaluateMath(compact.abbreviations[0].expression, { x: 2 });
    expect(evaluateMath(tree, { x: 2 })).toBe(value + value ** 2);
  });
});

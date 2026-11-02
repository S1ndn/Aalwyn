import { describe, expect, it } from "vitest";
import { compile } from "./legacy-fixtures";
import { evaluateMath, sampleMath } from "../src/compiler/evaluate";
import { builtinSpecs } from "../src/compiler/builtins";
import type { MathExpr } from "../src/compiler/math-ir";
import { samplePlot } from "../src/playground/graph";

describe("compiled math evaluation", () => {
  it("evaluates standalone math IR without Aalwyn source", () => {
    const expression: MathExpr = {
      kind: "add",
      terms: [
        {
          kind: "power",
          left: { kind: "symbol", name: "x" },
          right: { kind: "number", value: "2" },
        },
        { kind: "number", value: "1" },
      ],
    };
    expect(evaluateMath(expression, { x: 3 })).toBe(10);
  });
  it("evaluates the actual simplified domain-safe expression at negative, zero and positive inputs", () => {
    const result = compile(
      "r(x) init 0\n += (-1/x) ? (x < 0)\n += ln(x) ? (x > 0)\nend",
    );
    for (const x of [-2, -1, 0, 0.5, 1, 2])
      expect(
        evaluateMath(result.simplified, { x }, result.helpers),
      ).toBeCloseTo(x < 0 ? -1 / x : x > 0 ? Math.log(x) : 0, 12);
  });
  it("uses compiled aux bodies, preserving nested named calls", () => {
    const result = compile(
      "aux inner(x) => x^2\naux outer(x) => inner(x)+1\nf(x) => outer(x)",
    );
    expect(result.simplified).toMatchObject({
      kind: "function",
      name: "outer",
    });
    expect(evaluateMath(result.simplified, { x: 3 }, result.helpers)).toBe(10);
  });
  it("binds aux arguments locally instead of capturing main-function variables", () => {
    const result = compile("aux h(x) => x+1\nf(x,y) => h(y)+x");
    expect(
      evaluateMath(result.simplified, { x: 10, y: 2 }, result.helpers),
    ).toBe(13);
  });
  it("implements every registered builtin and its safe fallback", () => {
    for (const [name, spec] of Object.entries(builtinSpecs)) {
      const args =
        spec.safety.kind === "partial"
          ? [...spec.safety.inactive]
          : Array.from(
              { length: Math.abs(spec.arity) },
              () => ({ kind: "number", value: ".5" }) as MathExpr,
            );
      expect(
        () => evaluateMath({ kind: "function", name, args }, {}),
        name,
      ).not.toThrow();
    }
  });
  it("checks real domains rather than accepting misleading finite JS results", () => {
    for (const source of [
      "ln(-1)",
      "log(2,0)",
      "log(1,2)",
      "sqrt(-1)",
      "0^0",
      "1/0",
      "atanh(1)",
      "asech(0)",
      "acoth(1)",
      "root(0,2)",
      "root(2,-1)",
      "root(1.5,2)",
      "tan(pi/2)",
      "sec(pi/2)",
      "csc(pi)",
      "cot(0)",
      "asin(2)",
      "acos(2)",
      "acsc(0)",
      "asec(0)",
      "csch(0)",
      "coth(0)",
      "acosh(0)",
      "acsch(0)",
    ])
      expect(
        sampleMath(compile(`f() => ${source}`).simplified, {}),
        source,
      ).toBeNull();
  });
  it("does not short-circuit zero times an undefined expression", () => {
    expect(
      sampleMath(compile("f(x) => 0*ln(x)").simplified, { x: -1 }),
    ).toBeNull();
  });
  it("supports real odd roots and exact rational powers of negative bases", () => {
    expect(
      evaluateMath(compile("f() => root(3,-8)").simplified, {}),
    ).toBeCloseTo(-2, 12);
    expect(
      evaluateMath(compile("f() => (-8)^(1/3)").simplified, {}),
    ).toBeCloseTo(-2, 12);
    expect(
      evaluateMath(compile("f() => (-8)^(2/3)").simplified, {}),
    ).toBeCloseTo(4, 12);
    expect(sampleMath(compile("f() => (-8)^(1/2)").simplified, {})).toBeNull();
  });
  it("reports missing symbols/helpers and numeric overflow", () => {
    expect(() => evaluateMath({ kind: "symbol", name: "missing" }, {})).toThrow(
      "Missing value",
    );
    expect(() =>
      evaluateMath({ kind: "function", name: "unknown", args: [] }, {}),
    ).toThrow("Missing compiled aux");
    expect(sampleMath(compile("f() => exp(1000)").simplified, {})).toBeNull();
  });
});

describe("sampling compiled functions", () => {
  it("rejects invalid ranges and unbounded sample counts", () => {
    const model = compile("f(x) => x");
    expect(() => samplePlot(model, "x", {}, 1, -1, 10)).toThrow();
    expect(() => samplePlot(model, "x", {}, -1, 1, 10, 0)).toThrow();
    expect(() => samplePlot(model, "x", {}, -1e308, 1e308, 10)).toThrow();
  });
  it("makes gaps at reciprocal poles and logarithm domain boundaries", () => {
    const reciprocal = samplePlot(
      compile("f(x) => 1/x"),
      "x",
      {},
      -1,
      1,
      10,
      100,
    );
    expect(reciprocal.find((p) => p.x === 0)?.y).toBeNull();
    expect(reciprocal.find((p) => p.x > 0)?.connect).toBe(false);
    expect(
      samplePlot(compile("f(x) => ln(x)"), "x", {}, -1, 1, 10, 100)
        .filter((p) => p.x <= 0)
        .every((p) => p.y === null),
    ).toBe(true);
  });
  it("does not draw a line across the signed-exponential jump at zero", () => {
    const points = samplePlot(
      compile("f(x) init 0\n += e^x ? (x>=0)\n -= e^x ? (x<0)\nend"),
      "x",
      {},
      -1,
      1,
      10,
      100,
    );
    expect(points.find((p) => p.x === 0)).toMatchObject({
      y: 1,
      connect: false,
    });
  });
  it("samples exact zero even when an evenly spaced grid would miss it", () => {
    const points = samplePlot(
      compile("f(x) init 0\n += 1 ? (x==0)\nend"),
      "x",
      {},
      -0.3,
      0.8,
      2,
      100,
    );
    expect(points.find((p) => p.x === 0)?.y).toBe(1);
  });
  it("supports fixed parameters and constant functions", () => {
    const points = samplePlot(
      compile("f(x,a) => a*x"),
      "x",
      { a: 2 },
      -1,
      1,
      10,
      20,
    );
    expect(points.at(-1)?.y).toBe(2);
    expect(
      samplePlot(compile("f() => 3"), "", {}, -1, 1, 10, 20).every(
        (p) => p.y === 3,
      ),
    ).toBe(true);
  });
});

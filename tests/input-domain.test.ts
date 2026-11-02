import { describe, expect, it } from "vitest";
import {
  compile,
  evaluateFunction,
  sampleFunction,
  parse,
} from "./legacy-fixtures";
import { samplePlot } from "../src/playground/graph";
import { highlight } from "../src/playground/highlight";

describe("declared parameter domains", () => {
  it("supports default real, real, integer and zero-inclusive natural inputs without casts", () => {
    const model = compile("f(int a, real b, natural c, d) => a+b+c+d");
    expect(model.params).toEqual(["a", "b", "c", "d"]);
    expect(model.parameterTypes).toEqual({
      a: "int",
      b: "real",
      c: "natural",
      d: "real",
    });
    expect(evaluateFunction(model, { a: -2, b: 0.5, c: 0, d: 1 })).toBe(-0.5);
    expect(() => evaluateFunction(model, { a: 0.5, b: 1, c: 0, d: 1 })).toThrow(
      "integer",
    );
    expect(() => evaluateFunction(model, { a: 1, b: 1, c: -1, d: 1 })).toThrow(
      "natural",
    );
    expect(() =>
      evaluateFunction(model, { a: 1, b: Infinity, c: 0, d: 1 }),
    ).toThrow("finite");
    expect(() => evaluateFunction(model, { a: 1, b: 0, c: 0 })).toThrow(
      "finite",
    );
    expect(evaluateFunction(compile("f(natural n) => n"), { n: 1e20 })).toBe(
      1e20,
    );
    expect(compile("f(int x) => x^2").expressionLatex).toBe(
      compile("f(x) => x^2").expressionLatex,
    );
  });
  it("combines types with constraints, including cross-parameter and logical conditions", () => {
    const model = compile("f(int z : z > 0) => z^2");
    expect(evaluateFunction(model, { z: 3 })).toBe(9);
    for (const z of [-1, 0, 1.5])
      expect(sampleFunction(model, { z })).toBeNull();
    const grouped = compile("f(real x : (x+1) > 0 and (x < 1 or x > 2)) => x");
    for (const x of [-0.5, 0, 3])
      expect(evaluateFunction(grouped, { x })).toBe(x);
    for (const x of [-2, 1, 2])
      expect(sampleFunction(grouped, { x })).toBeNull();
    const cross = compile("f(a : a < b, int b : b <= 5) => b-a");
    expect(evaluateFunction(cross, { a: 1, b: 3 })).toBe(2);
    expect(sampleFunction(cross, { a: 4, b: 3 })).toBeNull();
    expect(sampleFunction(cross, { a: 1, b: 6 })).toBeNull();
    const precedence = compile("f(x : x < 0 or x > 1 and x < 3) => x");
    expect(evaluateFunction(precedence, { x: -5 })).toBe(-5);
    expect(sampleFunction(precedence, { x: 5 })).toBeNull();
    expect(sampleFunction(compile("f(x : x != 0) => x"), { x: 0 })).toBeNull();
    expect(evaluateFunction(compile("f(x : x >= 0) => x"), { x: 1e20 })).toBe(
      1e20,
    );
  });
  it("propagates inlined, aux and apply contracts even through value simplification", () => {
    for (const prefix of ["", "aux "]) {
      const model = compile(`${prefix}g(natural n : n > 0) => 0\nf(x) => g(x)`);
      expect(evaluateFunction(model, { x: 2 })).toBe(0);
      for (const x of [-1, 0, 0.5])
        expect(sampleFunction(model, { x })).toBeNull();
    }
    const applied = compile("g(int n) => n+1\nf(x) init x\n apply g\nend");
    expect(sampleFunction(applied, { x: 0.5 })).toBeNull();
    expect(evaluateFunction(applied, { x: 2 })).toBe(3);
    const shifted = compile("g(int n : n > 0) => n\nf(x) => g(x+1)");
    expect(evaluateFunction(shifted, { x: 0 })).toBe(1);
    expect(sampleFunction(shifted, { x: -1 })).toBeNull();
  });
  it("only enforces guarded call contracts on active branches", () => {
    const model = compile(
      "g(natural n : n > 0) => n\nf(x) init 7\n += g(ln(x)) ? (x > 1)\nend",
    );
    for (const x of [-2, 0, 1]) expect(evaluateFunction(model, { x })).toBe(7);
    expect(sampleFunction(model, { x: 2 })).toBeNull();
    expect(evaluateFunction(model, { x: Math.E })).toBe(8);
    const guardCall = compile(
      "g(int n) => n\nf(x) init 0\n += 1 ? (g(x) > 0)\nend",
    );
    expect(sampleFunction(guardCall, { x: 0.5 })).toBeNull();
  });
  it("binds contracts inside aggregates and skips empty ranges", () => {
    const model = compile(
      "g(int n : n > 0) => n\nf(int a, int b) init 0\n += sum i from a to b init 0 (\n += g(i)\n )\nend",
    );
    expect(evaluateFunction(model, { a: 1, b: 3 })).toBe(6);
    expect(sampleFunction(model, { a: 0, b: 3 })).toBeNull();
    expect(evaluateFunction(model, { a: 1, b: 0 })).toBe(0);
    const nested = compile(
      "g(int n : n > 0) => n\nf(int n) init 0\n += sum i from 1 to n init 0 (\n += sum j from 1 to i init 0 (\n += g(j)\n )\n )\nend",
    );
    expect(evaluateFunction(nested, { n: 3 })).toBe(10);
  });
  it("reports declaration errors even in unused functions", () => {
    for (const source of [
      "f(int z : q > 0) => z",
      "f(z : me > 0) => z",
      "f(z : k > 0) init 0\n define k z\nend",
      "f(z : missing(z) > 0) => z",
      "f(real x, int x) => x",
      "f(int) => 0",
      "f(z : z >) => z",
      "f(z : z) => z",
      "f(int x : x > 0 and) => x",
    ])
      expect(() => compile(source + "\nvalid(x) => x")).toThrow();
    for (const keyword of ["int", "real", "natural"])
      expect(() => compile(`${keyword}(x) => x`)).toThrow("reserved");
    expect(() => compile("f(x : f(x) > 0) => x")).toThrow("Recursive");
  });
  it("keeps contracts separate from the definitive expression and colors the new keywords", () => {
    const model = compile("f(int z : z > 0) => z+1");
    expect(model.domainText).toBe("z ∈ ℤ; z > 0");
    expect(JSON.stringify(model.domain)).not.toMatch(
      /"kind":"(?:piecewise|comparison|indicator)"/,
    );
    expect(parse("f(natural z) => z").functions[0].parameterTypes.z).toBe(
      "natural",
    );
    expect(
      highlight("int real natural integer reality")
        .filter((t) => t.style === "keyword")
        .map((t) => t.text),
    ).toEqual(["int", "real", "natural"]);
  });
  it("preserves graph gaps and isolated samples for declared domains", () => {
    const model = compile("f(natural n : n > 0) => n^2");
    const points = samplePlot(model, "n", {}, -1, 3, 20, 20);
    for (const p of points) {
      if (Number.isInteger(p.x) && p.x > 0) expect(p.y).toBe(p.x ** 2);
      else expect(p.y).toBeNull();
      expect(p.connect).toBe(false);
    }
  });
});

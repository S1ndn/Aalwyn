import { expect, it } from "vitest";
import { compile, evaluateMath } from "./legacy-fixtures";

const value = (source: string, values: Record<string, number> = {}) => {
  const result = compile(source);
  return evaluateMath(result.simplified, values, result.helpers);
};
it("evaluates real Gamma on both sides of zero and its recurrence", () => {
  expect(value("f(x) => gamma(x)", { x: 0.5 })).toBeCloseTo(
    Math.sqrt(Math.PI),
    12,
  );
  expect(value("f(x) => gamma(x)", { x: -0.5 })).toBeCloseTo(
    -2 * Math.sqrt(Math.PI),
    12,
  );
  for (const x of [-3.2, -1.7, 0.3, 4.2, 30.1]) {
    const next = value("f(x) => gamma(x+1)", { x });
    expect(next / value("f(x) => gamma(x)", { x })).toBeCloseTo(x, 10);
  }
  expect(compile("f() => gamma(6)").expressionLatex).toBe("120");
  expect(compile("f(x) => gamma(x)").expressionLatex).toContain("\\Gamma");
});
it("preserves Gamma poles and safeguards inactive nested operations", () => {
  for (const x of [0, -1, -2]) {
    expect(() => value("f(x) => gamma(x)", { x })).toThrow();
    expect(value("f(x) init 7\n += gamma(ln(x)) ? (x > 0)\nend", { x })).toBe(
      7,
    );
  }
  expect(() => value("f(x) => gamma(x)", { x: 180 })).toThrow();
});
it("raises a chosen base to the entire accumulator", () => {
  const source = "f(x) init x\n += 1\n >> 5^me\nend";
  expect(value(source, { x: 2 })).toBe(125);
  expect(compile(source).simplified.kind).toBe("power");
  expect(value("f(x,b) init x\n >> (b+1)^me\nend", { x: 3, b: 4 })).toBe(
    125,
  );
  expect(value("f(x) init x\n >> 5^me\nend", { x: 3 })).toBe(125);
  expect(value("f(x) => (-8)^(1/3)", { x: 0 })).toBeCloseTo(-2);
  expect(value("f(x) init 0\n += 0^(-1) ? (0)\nend", { x: 0 })).toBe(0);
  expect(() => compile("f(x) init x\n apply raise\nend")).toThrow();
  expect(() => compile("f(x) => raise(x)")).toThrow("Undefined function");
});
it("evaluates compiled helpers with multiple parameter values", () => {
  expect(
    value("aux h(x) => gamma(x)\nf(a,b) => h(a)+b", { a: 0.5, b: 2 }),
  ).toBeCloseTo(Math.sqrt(Math.PI) + 2);
});

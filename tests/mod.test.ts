import { describe, expect, it } from "vitest";
import {
  compile,
  parse,
  evaluateMath,
  sampleMath,
  tokenize,
} from "./legacy-fixtures";
import { highlight } from "../src/playground/highlight";
import katex from "katex";

const result = (expression: string) => compile(`f(x,m) => ${expression}`);
describe("floor-based modulo", () => {
  it("recognizes % and gives it multiplication/division precedence and left associativity", () => {
    expect(tokenize("x % 2")[1]).toMatchObject({
      text: "%",
      kind: "symbol",
      line: 1,
      column: 3,
    });
    const evaluate = (source: string) =>
      evaluateMath(compile(`f() => ${source}`).simplified, {});
    expect(evaluate("5+7%3*2")).toBe(7);
    expect(evaluate("20%6%3")).toBe(2);
    expect(evaluate("2*5%3")).toBe(1);
    expect(evaluate("10%2^2")).toBe(2);
    expect(evaluate("-5%3")).toBe(1);
    expect(parse("f(x) => x%2").functions[0].init).toMatchObject({
      kind: "binary",
      op: "%",
    });
  });
  it("lowers infix syntax to the same mathematical function as mod(x,m)", () => {
    expect(result("x%m").ir).toEqual(result("mod(x,m)").ir);
    expect(result("x%m").expressionLatex).toBe(
      "\\operatorname{mod}\\left(x, m\\right)",
    );
    expect(() =>
      katex.renderToString(result("x%m").latex, { throwOnError: true }),
    ).not.toThrow();
  });
  for (const [x, m, expected] of [
    [5, 3, 2],
    [-5, 3, 1],
    [5, -3, -1],
    [-5, -3, -2],
    [6, 3, 0],
    [-6, 3, 0],
    [0, 3, 0],
    [5.5, 2, 1.5],
  ])
    it(`evaluates ${x} % ${m} as ${expected}`, () => {
      const compiled = result("x%m");
      expect(evaluateMath(compiled.simplified, { x, m })).toBe(expected);
      expect(
        evaluateMath(compile(`f() => mod(${x},${m})`).simplified, {}),
      ).toBe(expected);
    });
  it("folds constants exactly, including decimals and rational operands", () => {
    expect(compile("f() => 0.3 % 0.2").expressionLatex).toBe("\\frac{1}{10}");
    expect(compile("f() => (-1/2) % (1/3)").expressionLatex).toBe(
      "\\frac{1}{6}",
    );
    expect(compile("f() => 5 % -3").expressionLatex).toBe("-1");
    expect(compile("f() => 1e100 % 3").expressionLatex).toBe("1");
  });
  it("supports explicit apply with either argument receiving the accumulator", () => {
    const a = compile("f(x) init x\n apply mod(me,3)\nend");
    expect(evaluateMath(a.simplified, { x: 5 })).toBe(2);
    const b = compile("f(x) init x\n apply mod(5,me)\nend");
    expect(evaluateMath(b.simplified, { x: 3 })).toBe(2);
  });
  it("supports divisibility conditions and ordinary operands", () => {
    const compiled = compile(
      "f(x) init 0\n += x % 2\n += 10 ? (x % 3 == 0)\nend",
    );
    for (const x of [-6, -5, 0, 3, 4, 6])
      expect(evaluateMath(compiled.simplified, { x })).toBe(
        x - 2 * Math.floor(x / 2) + (x % 3 === 0 ? 10 : 0),
      );
  });
  it("protects inactive zero divisors and nested invalid operands, but not active errors", () => {
    for (const expression of ["x%0", "mod(ln(x),0)", "mod(x,ln(x))"]) {
      const inactive = compile(`f(x) init 7\n += ${expression} ? (0)\nend`);
      expect(evaluateMath(inactive.ir, { x: -1 })).toBe(7);
      expect(evaluateMath(inactive.simplified, { x: -1 })).toBe(7);
    }
    expect(sampleMath(result("x%0").simplified, { x: 2, m: 0 })).toBeNull();
    expect(
      sampleMath(compile("f(x) init 0\n += x ? (x%0==0)\nend").simplified, {
        x: 2,
      }),
    ).toBeNull();
    expect(
      sampleMath(compile("f(x) => 0*mod(x,0)").simplified, { x: 1 }),
    ).toBeNull();
  });
  it("requires a divisor and preserves strict apply me rules", () => {
    for (const source of [
      "f(x) => mod(x)",
      "f(x) init x\n apply mod\nend",
      "f(x) => mod()",
      "f(x) => mod(x,2,3)",
    ])
      expect(() => compile(source)).toThrow("expects 2 argument");
    expect(() => compile("f(x) init x\n apply mod(x,2)\nend")).toThrow(
      "reference",
    );
    expect(() => compile("mod(x) => x")).toThrow("reserved");
    expect(() => compile("f(mod) => mod")).toThrow("reserved");
  });
  it("highlights the builtin and infix operator", () => {
    const tokens = highlight("mod(x,2) + x%3");
    expect(tokens.find((t) => t.text === "mod")?.style).toBe("builtin");
    expect(tokens.find((t) => t.text === "%")?.style).toBe("operator");
  });
});

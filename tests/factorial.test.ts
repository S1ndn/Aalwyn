import { describe, expect, it } from "vitest";
import {
  compile,
  parse,
  tokenize,
  evaluateMath,
  sampleMath,
  simplify,
} from "./legacy-fixtures";
import { highlight } from "../src/playground/highlight";
import katex from "katex";

const value = (expression: string) =>
  evaluateMath(compile(`f() => ${expression}`).simplified, {});
describe("factorial function and postfix notation", () => {
  it("lowers factorial(x) and x! to the same math operation", () => {
    expect(compile("f(x) => x!").ir).toEqual(
      compile("f(x) => factorial(x)").ir,
    );
    expect(parse("f(x) => x!").functions[0].init).toMatchObject({
      kind: "call",
      name: "factorial",
    });
    expect(compile("f(x) => x!").expressionLatex).toBe("x!");
    expect(compile("f(x,a) => (x+a)!").expressionLatex).toBe(
      "\\left(x + a\\right)!",
    );
  });
  it("supports both apply forms and parenthesized expressions", () => {
    for (const form of ["apply factorial", "apply factorial(me)"]) {
      const result = compile(`f(x) init x\n ${form}\nend`);
      expect(result.expressionLatex).toBe("x!");
      expect(evaluateMath(result.simplified, { x: 5 })).toBe(120);
    }
    expect(
      evaluateMath(compile("f(x,a) => (x+a)!").simplified, { x: 2, a: 3 }),
    ).toBe(120);
  });
  it("uses standard postfix precedence without changing != comparisons", () => {
    expect(value("2^3!")).toBe(64);
    expect(value("3!^2")).toBe(36);
    expect(value("(2^3)!")).toBe(40320);
    expect(value("-3!")).toBe(-6);
    expect(value("3!%4")).toBe(2);
    expect(value("2*3!+1")).toBe(13);
    expect(tokenize("x!=0").map((t) => t.text)).toContain("!=");
    const result = compile("f(x) init 0\n += x! ? (x!=0)\nend");
    expect(evaluateMath(result.simplified, { x: 0 })).toBe(0);
    expect(evaluateMath(result.simplified, { x: 3 })).toBe(6);
  });
  it("folds small factorials exactly without numerical approximation", () => {
    expect(value("0!")).toBe(1);
    expect(compile("f() => 20!").expressionLatex).toBe("2432902008176640000");
    expect(compile("f() => factorial(6/2)").expressionLatex).toBe("6");
    expect(compile("f() => 201!").simplified).toMatchObject({
      kind: "function",
      name: "factorial",
    });
  });
  it("keeps negative/fractional arguments undefined and reports numerical overflow", () => {
    for (const expression of ["(-1)!", "factorial(-2)", "(1/2)!"])
      expect(
        sampleMath(compile(`f() => ${expression}`).simplified, {}),
      ).toBeNull();
    const result = compile("f(x) => x!");
    expect(sampleMath(result.simplified, { x: 0.5 })).toBeNull();
    expect(Number.isFinite(evaluateMath(result.simplified, { x: 170 }))).toBe(
      true,
    );
    expect(sampleMath(result.simplified, { x: 171 })).toBeNull();
  });
  it("protects inactive invalid factorial operands for all updates", () => {
    for (const op of ["+=", "-=", "*=", "/=", "^="]) {
      const result = compile(`f(x) init 7\n ${op} x! ? (0)\nend`);
      for (const tree of [result.ir, result.simplified])
        expect(evaluateMath(tree, { x: -1 })).toBe(7);
    }
    expect(
      sampleMath(compile("f(x) init 0\n += x! ? (1)\nend").simplified, {
        x: -1,
      }),
    ).toBeNull();
    expect(
      sampleMath(compile("f(x) => 0*x!").simplified, { x: -1 }),
    ).toBeNull();
  });
  it("works in aggregation terms, guards and compiled helpers", () => {
    expect(value("(sum i from 1 to 3 init i (\n += 0\n))!")).toBe(720);
    expect(value("sum i from 0 to 3 init 0 (\n += i!\n)")).toBe(10);
    const result = compile("aux h(x) => x!\nf(x) => h(x)");
    expect(evaluateMath(result.simplified, { x: 5 }, result.helpers)).toBe(120);
    expect(
      evaluateMath(compile("f(x) init 0\n += 1 ? (x! == 6)\nend").simplified, {
        x: 3,
      }),
    ).toBe(1);
  });
  it("renders nested factorials unambiguously without introducing double factorial", () => {
    const result = compile("f(x) => (x!)!");
    expect(result.expressionLatex).toBe("\\left(x!\\right)!");
    expect(() =>
      katex.renderToString(result.latex, {
        throwOnError: true,
        strict: "error",
      }),
    ).not.toThrow();
    expect(value("(3!)!")).toBe(720);
    expect(() => compile("f(x) => x!!")).toThrow("Double factorial");
    expect(() => compile("f(x) => !x")).toThrow(
      "Expected a mathematical expression",
    );
  });
  it("validates arity, reserved names and explicit apply rules", () => {
    for (const source of ["f() => factorial()", "f(x) => factorial(x,2)"])
      expect(() => compile(source)).toThrow("expects 1 argument");
    expect(() => compile("factorial(x) => x")).toThrow("reserved");
    expect(() => compile("f(x) init x\n apply factorial(3)\nend")).toThrow(
      "reference",
    );
  });
  it("highlights ! as an operator and factorial as a builtin", () => {
    const tokens = highlight("factorial(x) + (x+1)! // comment");
    expect(tokens.find((t) => t.text === "factorial")?.style).toBe("builtin");
    expect(tokens.find((t) => t.text === "!")?.style).toBe("operator");
    expect(simplify(compile("f(x) => x!").simplified)).toEqual(
      compile("f(x) => x!").simplified,
    );
  });
});

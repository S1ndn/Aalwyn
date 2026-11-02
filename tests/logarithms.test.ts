import { expect, it } from "vitest";
import katex from "katex";
import { compile, evaluateFunction } from "../src/compiler/compiler";
const value = (source: string, x: number) => evaluateFunction(compile(source), {x});
it("supports named logarithms in direct calls, apply and chains", () => {
  for (const [name, input, expected] of [["ln", Math.E, 1], ["log2", 8, 3], ["log10", 1000, 3]] as const) {
    expect(value(`fn f(x) => ${name}(x)`,input)).toBeCloseTo(expected);
    expect(value(`fn f(x) = x\n >> ${name}\nend`,input)).toBeCloseTo(expected);
    expect(value(`fn f(x) = x\n >> ${name}(me)\nend`,input)).toBeCloseTo(expected);
  }
  expect(value("fn f(x) = x\n >> me^2 >> log2\nend",8)).toBe(6);
});
it("uses base-first variable logarithms with correct LaTeX", () => {
  expect(value("fn f(x) => log(2,x)",8)).toBeCloseTo(3);
  expect(value("fn f(x) = x\n >> log(10,me)\nend",100)).toBeCloseTo(2);
  for (const [expr,fragment] of [["log(2,x)","\\log_{2}"],["log2(x)","\\log_{2}"],["log10(x)","\\log_{10}"]]) {
    const result=compile(`fn f(x) => ${expr}`);
    expect(result.expressionLatex).toContain(fragment);
    expect(() => katex.renderToString(result.latex,{throwOnError:true,strict:"error"})).not.toThrow();
  }
});
it("protects inactive logarithms and rejects active invalid bases or arguments", () => {
  for (const expression of ["log2(x)","log10(x)","log(2,x)","log(x,2)"]) {
    expect(value(`fn f(x)\n = ${expression} ? (x>1) else 5\nend`,-1)).toBe(5);
    expect(() => value(`fn f(x) => ${expression}`,-1)).toThrow();
  }
  for (const expression of ["log(1,x)","log(0,x)","log(-2,x)","log2(0)","log10(-1)"])
    expect(() => value(`fn f(x) => ${expression}`,2)).toThrow();
  for (const expression of ["log2(x,2)","log10()","log(x)"])
    expect(() => compile(`fn f(x) => ${expression}`)).toThrow();
});

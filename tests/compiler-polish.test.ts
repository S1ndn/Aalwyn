import { expect, it } from "vitest";
import katex from "katex";
import { compile, simplify, evaluateMath } from "../src/compiler/compiler";
import { latex } from "../src/compiler/latex";
import { num } from "../src/compiler/math-ir";
const model = (expression: string) => compile(`fn f(x,y,z) => ${expression}`);
it("collects repeated factors, integer powers, fractional coefficients and commuted terms", () => {
  for (const [source, expected] of [
    ["x*x*x", "x^{3}"],
    ["x^2*x^3", "x^{5}"],
    ["x*y+y*x", "2\\,x\\,y"],
    ["x/2+x/3", "\\frac{5}{6}\\,x"],
    ["(x+y)*z+z*(y+x)", "2\\,\\left(x + y\\right)\\,z"],
    ["x^2*y+x*z", "x\\,\\left(x\\,y + z\\right)"],
    ["x^2*y+x^3*z", "x^{2}\\,\\left(y + x\\,z\\right)"],
  ]) {
    const result = model(source);
    expect(result.expressionLatex, source).toBe(expected);
    expect(simplify(result.simplified), source).toEqual(result.simplified);
    for (const x of [-3,-0.5,0,2]) {
      const values = {x,y:2,z:-1};
      expect(evaluateMath(result.simplified,values),source).toBeCloseTo(evaluateMath(result.ir,values),12);
    }
  }
});
it("renders negative fractions as subtraction and juxtaposes algebraic products", () => {
  expect(model("x + -1/2").expressionLatex).toBe("x - \\frac{1}{2}");
  expect(model("x + (-y/2)").expressionLatex).toBe("x - \\frac{y}{2}");
  expect(model("x-y/2-y/3").expressionLatex).toBe("x - \\frac{5}{6}\\,y");
  expect(model("x*y").expressionLatex).toBe("x\\,y");
  expect(latex({kind:"multiply",terms:[num(2),num(3)]})).toBe("2 \\cdot 3");
  for (const source of ["x + -1/2", "x + -y/2", "2*x*(x+y)", "sin(x)*cos(x)"])
    expect(() => katex.renderToString(model(source).latex,{throwOnError:true,strict:"error"})).not.toThrow();
});
it("preserves partial domains, fractional power branches and zero singularities", () => {
  for (const source of ["ln(x)*ln(x)", "sqrt(x)*sqrt(x)", "x^0.5*x^0.5", "x^0*x^0", "(1/x)*(1/x)", "ln(x)-ln(x)", "1/x-1/x", "0*ln(x)"]) {
    const result = model(source);
    for (const x of [-1,0,0.5,2]) {
      const values = {x,y:1,z:1};
      let original: number;
      try { original = evaluateMath(result.ir,values); }
      catch { expect(() => evaluateMath(result.simplified,values),source).toThrow(); continue; }
      expect(evaluateMath(result.simplified,values),source).toBeCloseTo(original,12);
    }
    expect(simplify(result.simplified),source).toEqual(result.simplified);
  }
});

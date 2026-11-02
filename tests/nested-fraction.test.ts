import { expect, it } from "vitest";
import { compile, simplify, evaluateMath, evaluateFunction } from "../src/compiler/compiler";
it("flattens repeated numerator division and collects denominator factors", () => {
  for (const [source, expected] of [
    ["(a/b)/c", "\\frac{a}{b\\,c}"],
    ["((a/b)/c)/d", "\\frac{a}{b\\,c\\,d}"],
    ["(a/b)/b", "\\frac{a}{b^{2}}"],
    ["(a/2)/3", "\\frac{a}{6}"],
  ]) {
    const result=compile(`fn f(a,b,c,d) => ${source}`);
    expect(result.expressionLatex,source).toBe(expected);
    expect(simplify(result.simplified),source).toEqual(result.simplified);
    for (const b of [-2,0,2]) for (const c of [-3,0,3]) {
      const values={a:5,b,c,d:2};
      let original: number;
      try { original=evaluateMath(result.ir,values); }
      catch { expect(()=>evaluateMath(result.simplified,values),source).toThrow(); continue; }
      expect(evaluateMath(result.simplified,values),source).toBeCloseTo(original,12);
    }
  }
});
it("does not drop denominator domains or invert partial denominator quotients", () => {
  for (const source of ["(a/b)/b", "(a/ln(b))/c", "(0/b)/c", "a/(b/c)"]) {
    const result=compile(`fn f(a,b,c) => ${source}`);
    for (const values of [{a:0,b:0,c:2},{a:1,b:2,c:0},{a:1,b:-1,c:2}]) {
      let original: number;
      try { original=evaluateMath(result.ir,values); }
      catch { expect(()=>evaluateMath(result.simplified,values),source).toThrow(); continue; }
      expect(evaluateMath(result.simplified,values),source).toBeCloseTo(original,12);
    }
  }
});

it("collects multiplied quotient factors before flattening further division", () => {
  const result = compile("fn f(a,b,c,d) => (a/b)*c/d");
  expect(result.expressionLatex).toBe("\\frac{a\\,c}{b\\,d}");
  expect(simplify(result.simplified)).toEqual(result.simplified);
  expect(() => evaluateMath(result.simplified,{a:0,b:0,c:2,d:3})).toThrow();
  expect(() => evaluateMath(result.simplified,{a:1,b:2,c:3,d:0})).toThrow();
});
it("flattens the actual arcsine series summand into one fraction", () => {
  const source = `fn arcsin(real x ? (x >= -1) and (x <= 1), int n ? n >= 0)
    = sum k from 0 to n (
        = (2*k)!
        /= (4^k)*(k!)^2
        define a 2*k+1
        *= x^a
        /= a
    )
end`;
  const result = compile(source);
  expect((result.expressionLatex.match(/\\frac/g) ?? []).length).toBe(1);
  expect(result.simplified.kind).toBe("aggregate");
  if (result.simplified.kind === "aggregate") {
    expect(result.simplified.body.kind).toBe("divide");
    if (result.simplified.body.kind === "divide") expect(result.simplified.body.left.kind).toBe("multiply");
  }
  expect(simplify(result.simplified)).toEqual(result.simplified);
  for (const x of [-1,-0.5,0,0.5,1]) for (const n of [0,1,3,8]) {
    const expected = evaluateMath(result.ir,{x,n});
    expect(evaluateFunction(result,{x,n})).toBeCloseTo(expected,12);
  }
});

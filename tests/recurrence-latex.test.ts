import { expect, it } from "vitest";
import katex from "katex";
import { compile, evaluateFunction } from "../src/compiler/compiler";
const source="recursive seq fib(natural n)\n case 0 = 0\n case 1 = 1\n = fib[n-1]+fib[n-2]\nend\nfn fibonacci(natural n) => fib[n]";
it("renders the Fibonacci recurrence and initial values without detector scaffolding", () => {
 const result=compile(source);
 const auxiliary=result.auxiliaryExports[0];
 expect(auxiliary.expressionLatex).toBe("\\operatorname{fib}_{n - 1} + \\operatorname{fib}_{n - 2}");
 for (const text of [result.latex,result.compactLatex]) {
  expect(text).toContain("n \\ge 2");
  expect(text).toContain("\\operatorname{fib}_{0} = 0");
  expect(text).toContain("\\operatorname{fib}_{1} = 1");
  expect(text).not.toMatch(/\\lfloor|\\sum|\\begin\{cases\}/);
  expect(()=>katex.renderToString(text,{throwOnError:true,strict:"error"})).not.toThrow();
 }
 expect(JSON.stringify(result.helpers.fib.expression)).toContain("aggregate");
 for (const [n,value] of [[0,0],[1,1],[10,55],[30,832040]]) expect(evaluateFunction(result,{n})).toBe(value);
});
it("also renders the selected sequence with its initial values", () => {
 const selected=compile(source,"fib");
 expect(selected.latex).toContain("\\operatorname{fib}_{0} = 0");
 expect(selected.expressionLatex).not.toContain("\\sum");
 expect(evaluateFunction(selected,{n:10})).toBe(55);
});
it("excludes noncontiguous case indices and substitutes the base index in values", () => {
 const result=compile("recursive seq a(natural n)\n case 0 = n+2\n case 2 = n^2\n = a[n-1]+1\nend");
 expect(result.latex).toContain("n \\notin \\left\\{0, 2\\right\\}");
 expect(result.latex).toContain("a_{0} = 2");
 expect(result.latex).toContain("a_{2} = 4");
 expect(evaluateFunction(result,{n:3})).toBe(5);
 expect(()=>katex.renderToString(result.latex,{throwOnError:true,strict:"error"})).not.toThrow();
});

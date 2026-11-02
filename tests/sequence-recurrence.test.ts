import { expect, it } from "vitest";
import katex from "katex";
import { compile, evaluateFunction } from "../src/compiler/compiler";
import { formatAalwyn } from "../src/playground/format";
it("rejects auxiliary modifiers on sequences", () => {
  for (const source of ["aux seq a(n) => n", "helper seq a(n) => n"])
    expect(()=>compile(source)).toThrow("do not mark a seq as aux");
});
it("evaluates factorial recurrence with an explicit base case", () => {
  const source = "recursive seq a(natural n) = 1\n case 0 = 1\n *= n*a[n-1] ? (n>0)\nend\nfn f(natural n) => a[n]";
  const model=compile(source);
  for (const [n, expected] of [[0,1],[1,1],[2,2],[5,120],[8,40320]])
    expect(evaluateFunction(model,{n})).toBe(expected);
  expect(model.latex).toContain("a_{");
  expect(()=>katex.renderToString(model.latex,{throwOnError:true,strict:"error"})).not.toThrow();
  expect(evaluateFunction(compile(formatAalwyn(source)),{n:5})).toBe(120);
});
it("evaluates Fibonacci with memoization and protects inactive earlier indices", () => {
  const source="recursive seq fib(natural n)\n case 0 = 0\n case 1 = 1\n = fib[n-1]+fib[n-2] ? (n>1) else n\nend\nfn f(natural n) => fib[n]";
  const model=compile(source);
  for (const [n,expected] of [[0,0],[1,1],[2,1],[10,55],[30,832040]])
    expect(evaluateFunction(model,{n})).toBe(expected);
});
it("rejects fractional, same, forward, and mutual recursive indices", () => {
  for (const index of ["n-0.5","n","n+1"])
    expect(()=>compile(`recursive seq a(natural n) = 1\n case 0 = 1\n += a[${index}] ? (n>0)\nend`)).toThrow(/integer|earlier/);
  expect(()=>compile("seq a(n) => b[n-1]\nseq b(n) => a[n-1]")).toThrow("Recursive");
  const missing=compile("recursive seq a(natural n)\n case 10 = 1\n = a[n-1]\nend\nfn f() => a[2]");
  expect(()=>evaluateFunction(missing,{})).toThrow();
});

it("supports decreasing computed integer indices and checks unproved decreases at runtime", () => {
  const source="recursive seq depth(natural n) = 0\n case 0 = 0\n += 1+depth[floor(n/2)] ? (n>0)\nend\nfn f() => depth[8]";
  expect(evaluateFunction(compile(source),{})).toBe(4);
  const invalid=compile("recursive seq a(natural n) = 1\n case 0 = 1\n += a[floor(n/2)+1] ? (n>0)\nend\nfn f(natural x) => a[x]");
  expect(()=>evaluateFunction(invalid,{x:1})).toThrow(/earlier|domain/);
});
it("protects recursive sequence calls in outside inactive branches", () => {
  const model=compile("recursive seq fact(natural n) = 1\n case 0 = 1\n *= n*fact[n-1] ? (n>0)\nend\nfn f(int j)\n = fact[j] ? (j>=0) else 5\nend");
  expect(evaluateFunction(model,{j:-2})).toBe(5);
  expect(evaluateFunction(model,{j:4})).toBe(24);
  expect(model.expressionLatex).toContain("j_{1}");
});

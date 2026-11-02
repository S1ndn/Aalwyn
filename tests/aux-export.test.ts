import { expect, it } from "vitest";
import katex from "katex";
import { compile } from "../src/compiler/compiler";
it("exports referenced auxiliary definitions and their own domains", () => {
  const result = compile("aux fn response(real t) => 1+t^2\naux fn unused(x) => x\nfn score(real x, int n ? n>=1) => response(x/n)");
  expect(result.auxiliaryExports.map(f=>f.name)).toEqual(["response"]);
  expect(result.latex).toContain("\\operatorname{response}\\left(t\\right) = 1 + t^{2}");
  expect(result.latex).toContain("t \\in \\mathbb{R}");
  expect(result.latex).toContain("n \\ge 1");
  expect(result.latex).not.toContain("unused");
  for (const text of [result.latex,result.compactLatex])
    expect(() => katex.renderToString(text,{throwOnError:true,strict:"error"})).not.toThrow();
});
it("includes transitive auxiliaries once with domains and honors selected functions", () => {
  const source = "aux fn inner(int k ? k>=1) => k^2\naux fn outer(int n ? n>=1) => inner(n)+inner(n+1)\nfn f(int x ? x>=1) => outer(x)+inner(x)\nfn unrelated(x) => x";
  const result = compile(source,"f");
  expect(result.auxiliaryExports.map(f=>f.name)).toEqual(["inner","outer"]);
  expect(result.auxiliaryExports[0].domainLatex).toContain("k \\in \\mathbb{Z}");
  expect(result.auxiliaryExports[0].domainLatex).toContain("k \\ge 1");
  expect(compile(source,"outer").auxiliaryExports.map(f=>f.name)).toEqual(["inner"]);
  expect(compile(source,"unrelated").auxiliaryExports).toEqual([]);
});
it("includes auxiliary calls from guards and expanded ordinary functions", () => {
  const result = compile("aux fn h(x) => x^2\nfn normal(x) => h(x)\nfn f(x) = 0\n += 1 ? (normal(x)>1)\nend");
  expect(result.auxiliaryExports.map(f=>f.name)).toEqual(["h"]);
  expect(result.compactLatex).toContain(result.auxiliaryExports[0].latex);
});

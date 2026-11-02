import { expect, it } from "vitest";
import katex from "katex";
import { compile } from "../src/compiler/compiler";
it("renders parameter sets and correctly grouped logical requirements", () => {
  const result = compile("fn f(int n ? (n > 1 or n < 1) and n < 5 and n > 2) => n");
  expect(result.domainLatex).toContain("n \\in \\mathbb{Z}");
  expect(result.domainLatex).toContain("\\left(n > 1 \\lor n < 1\\right)");
  expect(result.domainLatex).toContain("\\land n < 5");
  for (const latex of [result.domainLatex, result.latex, result.compactLatex])
    expect(() => katex.renderToString(latex, {throwOnError:true, strict:"error"})).not.toThrow();
  expect(result.latex).toContain(result.domainLatex);
  expect(result.compactLatex).toContain(result.domainLatex);
});
it("handles real, natural, comparisons, and parameterless functions", () => {
  expect(compile("fn f(real x, natural n ? x != n and n >= 0 and x <= 5) => x").domainLatex).toContain("\\mathbb{N}_{0}");
  const result = compile("fn f(x ? x != 0) => x");
  expect(result.domainLatex).toContain("x \\ne 0");
  expect(compile("fn f() => 1").domainLatex).toBe("");
});

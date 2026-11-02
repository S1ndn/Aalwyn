import { expect, it } from "vitest";
import katex from "katex";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { formatAalwyn, lineIndentation, foldingRanges } from "../src/playground/format";
import { migrateLegacySource } from "../src/compiler/migrate";
import { diagnoseSource } from "../src/playground/diagnostics";
const fib="recursive seq fib(natural n)\n case 0 = 0\n case 1 = 1\n = fib[n-1]+fib[n-2]\nend\nfn f(natural n) => fib[n]";
it("uses explicit Fibonacci base cases in preference to the recurrence", () => {
 const result=compile(fib);
 for(const [n,value] of [[0,0],[1,1],[2,1],[10,55],[30,832040]]) expect(evaluateFunction(result,{n})).toBe(value);
 expect(()=>katex.renderToString(result.latex,{throwOnError:true,strict:"error"})).not.toThrow();
 expect(result.auxiliaryExports[0].domainLatex).toBe("n \\in \\mathbb{N}_{0}");
 expect(diagnoseSource(fib)).toEqual([]);
});
it("supports factorial and negative integer base indices", () => {
 expect(evaluateFunction(compile("recursive seq fact(natural n)\n case 0 = 1\n = n*fact[n-1]\nend\nfn f() => fact[5]"),{})).toBe(120);
 expect(evaluateFunction(compile("recursive seq a(n ? n>=-1)\n case -1 = 2\n = a[n-1]+1\nend\nfn f() => a[2]"),{})).toBe(5);
});
it("requires explicit recursive intent and validates base declarations", () => {
 for (const source of ["seq a(n) => a[n-1]", "recursive seq a(n)\n = a[n-1]\nend", "seq a(n)\n case 0 = 1\n = n\nend", "recursive seq a(n)\n case 0 = 1\n case 0 = 2\n = a[n-1]\nend", "recursive seq a(n)\n case 0.5 = 1\n = a[n-1]\nend", "recursive seq a(n)\n case 0 = a[-1]\n = a[n-1]\nend", "recursive fn f(n) => n"])
  expect(()=>compile(source)).toThrow();
 expect(()=>parse("recursive seq a(n)\n = 1\n case 0 = 2\nend")).toThrow("before the recurrence");
});
it("formats and folds recursive declarations", () => {
 expect(evaluateFunction(compile(formatAalwyn(fib)),{n:10})).toBe(55);
 expect(lineIndentation("recursive seq a(n)\n",1)).toBe(4);
 expect(foldingRanges("recursive seq a(n)\n case 0 = 1\n = a[n-1]\nend")).toHaveLength(1);
});

it("recovers errors independently and preserves explicit bases during legacy migration", () => {
  const errors=diagnoseSource("recursive seq a(natural n)\n case 0 = 1\n = missing\nend\nrecursive seq b(natural n)\n case 0 = 1\n = other\nend").filter(p=>p.severity!=="warning");
  expect(errors.map(p=>p.line)).toEqual([3,7]);
  const old=fib.replace("= fib[n-1]+fib[n-2]", "= fib[n-1]+fib[n-2]; >> sin & cos");
  const migrated=migrateLegacySource(old);
  expect(migrated).toContain("recursive seq fib");
  expect(migrated).toContain("case 0 = 0");
  expect(migrated).toContain("case 1 = 1");
  expect(migrated).not.toContain("&");
  expect(evaluateFunction(compile(migrated),{n:0})).toBe(0);
  expect(evaluateFunction(compile(migrated),{n:2})).toBeCloseTo(Math.sin(Math.cos(1)),12);
});

it("uses case, releases base as an ordinary name, and migrates former declarations", () => {
  const old="recursive seq a(natural n)\n base 0 = 1\n = a[n-1]+1\nend\nfn f() => a[3]";
  expect(()=>parse(old)).toThrow();
  const updated=migrateLegacySource(old);
  expect(updated).toContain("case 0 = 1");
  expect(evaluateFunction(compile(updated),{})).toBe(4);
  expect(evaluateFunction(compile("fn f(real base) => base+1"),{base: 2})).toBe(3);
});

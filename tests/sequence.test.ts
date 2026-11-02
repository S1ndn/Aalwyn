import { expect, it } from "vitest";
import katex from "katex";
import { compile, evaluateFunction } from "../src/compiler/compiler";
import { formatAalwyn, lineIndentation, foldingRanges } from "../src/playground/format";
import { diagnoseSource } from "../src/playground/diagnostics";
import { migrateLegacySource } from "../src/compiler/migrate";
const geometric = `seq w(k) = 1
    += 1 ? (k % 2 != 0)
end
fn g(int n ? n >= 1)
    define p using (
        = prod k from 1 to n (
            = k^w[k]
        )
    )
    define s sum k from 1 to n (
        = w[k]
    )
    = p
    ^= 1/s
end`;
it("computes the weighted geometric mean using named sequences", () => {
  const result=compile(geometric);
  const original=compile(geometric.replace("seq w(k)", "aux fn w(int k)").replaceAll("w[k]", "w(k)"));
  for (const [n, expected] of [[1,1],[2,2**(1/3)],[3,18**(1/5)],[4,72**(1/6)]])
    {
      expect(evaluateFunction(result,{n})).toBeCloseTo(expected,12);
      expect(evaluateFunction(original,{n})).toBeCloseTo(expected,12);
    }
  expect(result.expressionLatex).toContain("w_{k}");
  expect(result.auxiliaryExports.map(f=>f.name)).toEqual(["w"]);
  expect(result.auxiliaryExports[0].domainLatex).toContain("k \\in \\mathbb{Z}");
  expect(()=>katex.renderToString(result.latex,{throwOnError:true,strict:"error"})).not.toThrow();
  expect(diagnoseSource(geometric)).toEqual([]);
});
it("supports direct sequences and enforces index domains and bracket notation", () => {
  expect(evaluateFunction(compile("seq squares(k) => k^2\nfn f() => squares[-3]"),{})).toBe(9);
  expect(evaluateFunction(compile("seq a(natural k ? k>0) => k+1\nfn f() => a[2]"),{})).toBe(3);
  for (const source of ["seq a(real k) => k", "seq a(k,j) => k+j", "seq a() => 1", "seq a(k) => k\nfn f() => a(2)", "fn a(x) => x\nfn f() => a[2]", "seq a(k) => a[k]"])
    expect(()=>compile(source)).toThrow();
  expect(()=>evaluateFunction(compile("seq a(k) => k\nfn f() => a[1.5]"),{})).toThrow();
  expect(()=>evaluateFunction(compile("seq a(natural k) => k\nfn f() => a[-1]"),{})).toThrow();
});
it("formats, folds, migrates and diagnoses sequences", () => {
  const formatted=formatAalwyn(geometric);
  expect(formatted).toContain("w[k]");
  expect(evaluateFunction(compile(formatted),{n:4})).toBeCloseTo(72**(1/6),12);
  expect(lineIndentation("seq a(k)\n",1)).toBe(4);
  expect(foldingRanges("seq a(k)\n = k\nend")).toHaveLength(1);
  expect(diagnoseSource("seq a(k) => missing\nseq b(k) => other").filter(p=>p.severity!=="warning").map(p=>p.line)).toEqual([1,2]);
  const old="seq a(k) => k\nfn f(x) = a[2]\n >> sin & cos\nend";
  expect(evaluateFunction(compile(migrateLegacySource(old)),{x:0})).toBeCloseTo(Math.sin(Math.cos(2)),12);
});

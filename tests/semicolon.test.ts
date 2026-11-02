import { expect, it } from "vitest";
import { compile, evaluateFunction, parse, tokenize } from "../src/compiler/compiler";
import { formatAalwyn, lineIndentation } from "../src/playground/format";
import { diagnoseSource } from "../src/playground/diagnostics";
it("accepts semicolons between all complete declarations and instructions", () => {
  const source = ";;aux fn twice(x) => 2*x; fn f(x); define offset 2; = x; += offset; *= 3; >> twice >> me+1; end;;";
  expect(evaluateFunction(compile(source),{x: 4})).toBe(37);
  expect(compile(source).simplified).toEqual(compile(source.replaceAll(";","\n")).simplified);
  expect(diagnoseSource(source)).toEqual([]);
});
it("supports aggregate and using blocks, conditionals, and mixed line breaks", () => {
  const source = "fn f(natural n); define a using (; define b 2; = b; *= 3; );\n = sum i from 1 to n (; = i ? (i>1) else 0; ); += prod j from 1 to n (; = j; ); += a; end";
  expect(evaluateFunction(compile(source),{n: 3})).toBe(17);
  expect(evaluateFunction(compile(formatAalwyn(source)),{n: 3})).toBe(17);
  expect(formatAalwyn(source)).toContain("define a using (\n        define b 2");
  expect(formatAalwyn(formatAalwyn(source))).toBe(formatAalwyn(source));
});
it("does not treat comment semicolons as separators", () => {
  const source = "fn f(); // ; = missing; end\n = 3; // comment; remains\n += 2; end";
  expect(evaluateFunction(compile(source),{})).toBe(5);
  const formatted=formatAalwyn(source);
  expect(formatted).toContain("// ; = missing; end");
  expect(formatted).toContain("// comment; remains");
  expect(evaluateFunction(compile(formatted),{})).toBe(5);
});
it("preserves physical line and column locations for tokens and recovered errors", () => {
  const source="fn f() = 0; += missing; end; fn g() = 0; += other; end";
  const errors=diagnoseSource(source).filter(p=>p.severity!=="warning");
  expect(errors.map(p=>source.slice(p.from,p.to))).toEqual(["missing","other"]);
  expect(errors.map(p=>[p.line,p.column])).toEqual([[1,source.indexOf("missing")+1],[1,source.indexOf("other")+1]]);
  const tokens=tokenize("a;b\nc");
  expect(tokens.find(t=>t.text==="b")).toMatchObject({line:1,column:3});
  expect(tokens.find(t=>t.text==="c")).toMatchObject({line:2,column:1});
});
it("keeps initialization order and rejects unfinished expressions or missing separators", () => {
  for (const source of ["fn f(); += 1; = 2; end", "fn f(); = 1+; += 2; end", "fn f(); = 1; += 2 *= 3; end", "fn f(x; y) => x"])
    expect(()=>parse(source)).toThrow();
});

it("indents subsequent physical lines according to semicolon-delimited blocks", () => {
  expect(lineIndentation("fn f(); = 1; end\n",1)).toBe(0);
  expect(lineIndentation("fn f(); define a using (; = 1; );\n",1)).toBe(4);
});

import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { migrateLegacySource } from "../src/compiler/migrate";
import { formatAalwyn } from "../src/playground/format";
it("accepts independently grouped conditions with and before or", () => {
  const source = "fn f(condition,foo,bar,baz)\n = 5 ? (condition) and (foo) or ((bar) and (baz)) else 2\nend";
  const result = compile(source);
  for (let mask=0; mask<16; mask++) {
    const [condition,foo,bar,baz] = [0,1,2,3].map(i=>(mask>>i)&1);
    expect(evaluateFunction(result,{condition,foo,bar,baz})).toBe((condition && foo) || (bar && baz) ? 5 : 2);
  }
  expect(compile(formatAalwyn(source)).simplified).toEqual(result.simplified);
});
it("supports the new syntax in headers, updates and aggregation starts", () => {
  expect(evaluateFunction(compile("fn f(x) = ln(x) ? (x>0) else sqrt(-x)\nend"), {x:-4})).toBe(2);
  expect(evaluateFunction(compile("fn f(x) = 0\n += 1 ? (x>0) and (x<3) else 2\nend"), {x:4})).toBe(2);
  expect(evaluateFunction(compile("fn f() => sum i from 1 to 3 (\n = i ? (i>1) and (i<3) else 0\n)"), {})).toBe(2);
  expect(() => parse("fn f(x)\n = 1 ? (x>0) and (x<3)\nend")).toThrow("requires 'else'");
});
it("migrates previous else-inside-parentheses syntax", () => {
  const old = "fn f(x)\n = 5 ? (x>0 else 2)\nend";
  expect(() => parse(old)).toThrow();
  const upgraded = migrateLegacySource(old);
  expect(upgraded).toContain("? (x > 0) else 2");
  expect(evaluateFunction(compile(upgraded),{x:-1})).toBe(2);
  expect(migrateLegacySource(upgraded)).toBe(upgraded);
});

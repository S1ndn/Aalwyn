import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { formatAalwyn } from "../src/playground/format";
import { diagnoseSource } from "../src/playground/diagnostics";
const value = (source: string, x: number) => evaluateFunction(compile(source), {x});
it("supports conditional starts in headers and bodies with equivalent results", () => {
  const body = "fn f(x)\n define k 5\n = k ? (x > 0) else 2\n += 1\nend";
  expect(value(body, 1)).toBe(6);
  expect(value(body, -1)).toBe(3);
  expect(diagnoseSource(body)).toEqual([]);
  const header = "fn f(x) = 5 ? (x > 0) else 2\n += 1\nend";
  for (const x of [-1,0,1]) expect(value(header,x)).toBe(value(body,x));
  expect(value(formatAalwyn(header), -1)).toBe(3);
});
it("requires else only for conditional starting assignments", () => {
  for (const source of ["fn f(x) = 1 ? (x>0)\nend", "fn f(x)\n = 1 ? (x>0)\nend", "fn f() => sum i from 1 to 3 (\n = i ? (i>1)\n)"])
    expect(() => parse(source)).toThrow("requires 'else'");
  expect(() => parse("fn f(x)\n += 1 ? (x>0)\nend")).not.toThrow();
  expect(() => parse("fn f(x) = 1\n = 2 ? (x>0) else 3\nend")).toThrow("first statement");
});
it("protects inactive branch domains and preserves active domain failures", () => {
  const source = "fn f(x)\n = ln(x) ? (x>0) else sqrt(-x)\nend";
  expect(value(source,-4)).toBe(2);
  expect(value(source,0)).toBe(0);
  expect(value(source,Math.E)).toBeCloseTo(1);
  expect(() => value("fn f(x) = 1/x ? (x>=0) else 1\nend",0)).toThrow();
  expect(() => compile("fn f(x) = me ? (x>0) else 1\nend")).toThrow();
});
it("supports conditional starts in sum and product terms", () => {
  for (const kind of ["sum","prod"]) {
    const source = `fn f() => ${kind} i from 1 to 3 (\n define a i+1\n = a ? (i>1) else 1\n)`;
    expect(evaluateFunction(compile(source),{})).toBe(kind === "sum" ? 8 : 12);
  }
});

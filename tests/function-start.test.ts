import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { formatAalwyn, foldingRanges, lineIndentation } from "../src/playground/format";
import { diagnoseSource } from "../src/playground/diagnostics";
const value = (source: string, inputs: Record<string, number> = {}) => evaluateFunction(compile(source), inputs);

it("starts function blocks at an optional expression", () => {
  expect(value("fn f(x) = 1\n *= x\n += 5\nend", {x: 3})).toBe(8);
  expect(value("fn f(x) = x+1\nend", {x: 3})).toBe(4);
  expect(value("fn f()\nend")).toBe(0);
  expect(value("fn f(x) => x+1", {x: 3})).toBe(4);
  expect(value("aux fn start(x) => x^2\nfn f(x) = start(x)\n += 1\nend", {x: 3})).toBe(10);
});
it("validates and protects the start expression's domain", () => {
  expect(() => compile("fn f() = me\nend")).toThrow("only valid");
  expect(() => compile("fn f(x) = missing\nend")).toThrow();
  expect(() => value("fn f(x) = 1/x\n *= 0\nend", {x: 0})).toThrow();
  expect(value("aux fn f(real x ? x > 0) = ln(x)\n >> exp\nend", {x: 2})).toBeCloseTo(2);
});
it("uses product identity starts and rejects aggregate header seeds", () => {
  expect(value("fn f() = 2\n *= prod i from 1 to 3 (\n += 5\n)\nend")).toBe(432);
  expect(() => parse("fn f() => prod i from 1 to 3 = 1 (\n *= i\n)")).toThrow();
});
it("formats, folds and recovers seeded declarations", () => {
  const source = "aux fn f(x)=x+1\n>>sin\nend";
  expect(value(formatAalwyn(source), {x: 1})).toBeCloseTo(Math.sin(2));
  expect(lineIndentation(source, 1)).toBe(4);
  expect(foldingRanges(source)).toHaveLength(1);
  expect(diagnoseSource("aux fn f(x) = missing\n += x\nend\nfn g(x) = unknown\nend").map(p=>p.line)).toEqual([1,4]);
});

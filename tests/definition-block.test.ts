import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { diagnoseSource } from "../src/playground/diagnostics";
import { formatAalwyn, foldingRanges, lineIndentation } from "../src/playground/format";
import { migrateLegacySource } from "../src/compiler/migrate";
it("computes definition blocks without mutating the enclosing accumulator", () => {
  const source = "fn f(x) = 5\n define a using (\n define offset 2\n = x+offset\n >> me^2\n )\n *= a\nend";
  expect(evaluateFunction(compile(source),{x: 3})).toBe(125);
  expect(diagnoseSource(source)).toEqual([]);
});
it("supports nesting, local scopes and aggregation terms", () => {
  const source = "fn f()\n define a using (\n define b using (\n = 2\n >> me+1\n )\n = b\n )\n = sum i from 1 to 3 (\n define term using (\n = i*a\n )\n = term\n )\nend";
  expect(evaluateFunction(compile(source),{})).toBe(18);
  expect(() => compile("fn f()\n define a using (\n define secret 3\n = secret\n )\n = secret\nend")).toThrow("Undefined name");
  expect(() => compile("fn f()\n define a using (\n define b 1\n define b 2\n )\n = a\nend")).toThrow("Duplicate");
});
it("keeps conditional starts protected and enforces block initialization rules", () => {
  const source = "fn f(x)\n define a using (\n = ln(x) ? (x>0) else sqrt(-x)\n )\n = a\nend";
  expect(evaluateFunction(compile(source),{x:-4})).toBe(2);
  expect(() => parse("fn f()\n define a using (\n += 1\n = 2\n )\nend")).toThrow("first statement");
  expect(() => parse("fn f(x)\n define a using (\n = 1 ? (x>0)\n )\nend")).toThrow("requires 'else'");
  expect(() => compile("fn f()\n define a using (\n = me\n )\n = a\nend")).toThrow();
  expect(() => parse("fn f()\n define a using (\n = 1\nend")).toThrow("Missing ')'");
});
it("formats, folds, highlights default-start warnings, and migrates definition blocks", () => {
  const source = "fn f()\n define a using (\n += 2\n )\n = a\nend";
  expect(diagnoseSource(source).map(p=>p.line)).toEqual([2]);
  expect(lineIndentation(source,2)).toBe(8);
  expect(foldingRanges(source)).toHaveLength(2);
  expect(formatAalwyn(source)).toContain("define a using (");
  expect(evaluateFunction(compile(formatAalwyn(source)),{})).toBe(2);
  expect(evaluateFunction(compile(migrateLegacySource(source.replace("fn f", "let f"))),{})).toBe(2);
});

import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { migrateLegacySource } from "../src/compiler/migrate";
import {
  formatAalwyn,
  lineIndentation,
  foldingRanges,
} from "../src/playground/format";
import { diagnoseSource } from "../src/playground/diagnostics";
import { highlight } from "../src/playground/highlight";
const value = (source: string, values: Record<string, number> = {}) =>
  evaluateFunction(compile(source), values);

it("requires fn and accepts direct, block and auxiliary declarations", () => {
  expect(value("fn f(x) => x^2", { x: 3 })).toBe(9);
  expect(value("fn f(x)\n += x\n >> sin\nend", { x: 1 })).toBeCloseTo(
    Math.sin(1),
  );
  const model = compile(
    "aux fn square(x) => x^2\nfn f(x)\n += square(x)\nend",
  );
  expect(model.expressionLatex).toContain("square");
  expect(evaluateFunction(model, { x: 3 })).toBe(9);
  expect(() => parse("f(x) => x")).toThrow("'fn'");
  expect(() => parse("fn f(x) init 0\nend")).toThrow("Blocks start at zero");
  expect(highlight("fn f(x) => x")[0]).toEqual({
    text: "fn",
    style: "keyword",
  });
});

it("defaults functions to zero and products to one and retains empty-fold identities", () => {
  expect(value("fn f()\nend")).toBe(0);
  expect(value("fn f()\n *= 5\nend")).toBe(0);
  expect(value("fn f()\n >> exp\nend")).toBe(1);
  expect(value("fn f(n) => prod i from 1 to n (\n += 5\n)", { n: 3 })).toBe(216);
  expect(value("fn f(n) => prod i from 1 to n (\n *= 5\n)", { n: 3 })).toBe(125);
  expect(
    value("fn f(n) => prod i from 1 to n (\n = 1\n *= i\n)", { n: 4 }),
  ).toBe(24);
  expect(value("fn f(n) => prod i from 1 to n (\n += 1/0\n)", { n: 0 })).toBe(1);
  expect(value("fn f(n) => sum i from 1 to n (\n += 1/0\n)", { n: 0 })).toBe(0);
});

it("keeps question-mark domains, else branches, and contextual me in the fn grammar", () => {
  const source =
    "fn f(real x ? x != 0)\n += x\n >> abs(me^2-5)\n += 1 ? (x > 0) else 2\nend";
  expect(value(source, { x: 2 })).toBe(2);
  expect(value(source, { x: -2 })).toBe(3);
  expect(() => compile("fn f()\n += me\nend")).toThrow("only valid");
  expect(compile(formatAalwyn(source)).simplified).toEqual(
    compile(source).simplified,
  );
});

it("supports indentation, folding and independent diagnostics with fn headers", () => {
  const source = "fn f(n)\n    += sum i from 1 to n (\n        += i\n    )\nend";
  expect([0, 1, 2, 3, 4].map((i) => lineIndentation(source, i))).toEqual([
    0, 4, 8, 4, 0,
  ]);
  expect(foldingRanges(source)).toHaveLength(2);
  const errors = diagnoseSource(
    "aux fn f(x) => unknown\n\nfn g(x)\n += missing\nend",
  );
  expect(errors.filter(p => p.severity !== "warning").map((p) => p.line)).toEqual([1, 4]);
});

it("preserves existing nonzero function and product seeds when migrating", () => {
  const migrated = migrateLegacySource(
    "f(n) init 2\n *= prod i from 1 to n (\n *= i\n )\nend",
  );
  expect(migrated).toContain("fn f");
  expect(migrated).not.toContain(" init ");
  expect(value(migrated, { n: 4 })).toBe(48);
  expect(migrateLegacySource(migrated)).toBe(migrated);
  const otherwise = migrateLegacySource(
    "f(x) init 0\n += 1 ? (x>0) else 2\nend",
  );
  expect(value(otherwise, { x: -1 })).toBe(2);
});


it("migrates let headers preserving comments with current product defaults", () => {
  const old = "// let stays in comments\nlet f(n)\n    += prod i from 1 to n (\n        += 5\n    )\nend";
  const upgraded = migrateLegacySource(old);
  expect(upgraded).toBe(old.replace("\nlet f", "\nfn f"));
  expect(value(upgraded, { n: 3 })).toBe(216);
  expect(migrateLegacySource(upgraded)).toBe(upgraded);
  expect(() => parse("let f(x) => x")).toThrow("'fn'");
  const incomplete = "let f(x)\n += ";
  expect(migrateLegacySource(incomplete)).toBe(incomplete);
});


it("places modifiers before fn and migrates the former ordering", () => {
  const source = "aux fn square(x) => x^2\nfn f(x) => square(x)";
  expect(value(source, { x: 3 })).toBe(9);
  expect(() => parse("fn aux f(x) => x")).toThrow("before 'fn'");
  for (const old of ["fn aux f(x) => x", "let aux f(x) => x"]) {
    expect(migrateLegacySource(old)).toBe("aux fn f(x) => x");
  }
  expect(lineIndentation("aux fn f(x)\n", 1)).toBe(4);
  expect(foldingRanges("aux fn f(x)\n    += x\nend")).toHaveLength(1);
});

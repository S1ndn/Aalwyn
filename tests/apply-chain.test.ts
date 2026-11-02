import { expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { formatAalwyn } from "../src/playground/format";
import { highlight } from "../src/playground/highlight";
import { migrateLegacySource } from "../src/compiler/migrate";
const value = (source: string, x = 2) => evaluateFunction(compile(source), {x});
it("applies stages left to right with or without an initial >>", () => {
  const source = "fn f(x) = x\n >> me^2+1 >> cos >> sin\nend";
  expect(value(source)).toBeCloseTo(Math.sin(Math.cos(5)));
  const expanded = "fn f(x) = x\n >> me^2+1\n >> cos\n >> sin\nend";
  expect(compile(source).simplified).toEqual(compile(expanded).simplified);
  expect(value("fn f(x) = x\n me+1 >> me*3\nend")).toBe(9);
  expect(value("fn f(x) = x\n >> me*3 >> me+1\nend")).toBe(7);
  expect(value("fn f(x) = x\n >> me^2 >> me+me\nend")).toBe(8);
  expect(value("fn f(x) = x\n sin >> cos\nend")).toBeCloseTo(Math.cos(Math.sin(2)));
});
it("supports auxiliary pipelines, explicit calls, and aggregate bodies", () => {
  expect(value("aux fn shift(x) => x+1\nfn f(x) = x\n >> -me >> abs(me) >> shift\nend")).toBe(3);
  expect(value("fn f()\n += sum i from 1 to 3 (\n += i\n me+1 >> me*2\n )\nend")).toBe(18);
  expect(value("fn f(x) = x\n >> me^2 >> log(2,me)\nend")).toBeCloseTo(2);
  const source="aux fn f(x) => x+1\naux fn g(x) => 2*x\naux fn a(x) => x-1\nfn result(x) = x\n f >> g >> a >> me^2+1 >> log(3,me)\nend";
  expect(value(source)).toBeCloseTo(Math.log(26)/Math.log(3));
});
it("validates each stage, forbids legacy &, and preserves active domains", () => {
  expect(() => value("fn f(x) = x\n >> sin >> 3 >> me\nend")).toThrow();
  expect(() => value("fn f(x) = x\n unknown >> me\nend")).toThrow();
  expect(() => value("fn f(x) = x\n ln >> exp\nend",-1)).toThrow();
  for (const chain of [">> sin", "sin >>", "sin >>>> cos", "sin & cos"])
    expect(() => parse(`fn f(x) = x\n >> ${chain}\nend`)).toThrow();
  expect(() => parse("fn f(x) => sin(x) >> cos")).toThrow();
  expect(() => parse("fn f(x)\n sin >> cos\n = 1\nend")).toThrow("first statement");
});
it("formats new chains and migrates old right-to-left composition safely", () => {
  const source="fn f(x)=x\n>>me^2+1>>cos>>sin // composition\nend";
  const formatted=formatAalwyn(source);
  expect(formatted).toContain("me ^ 2 + 1 >> cos >> sin");
  expect(value(formatted)).toBeCloseTo(value(source));
  expect(highlight(source).filter(t=>t.text===">>").map(t=>t.style)).toEqual(["apply","apply","apply"]);
  const old="fn f(x) = x\n >> sin & cos & me^2+1\nend";
  expect(() => parse(old)).toThrow("Composition now uses");
  const migrated=migrateLegacySource(old);
  expect(migrated).not.toContain("&");
  expect(value(migrated)).toBeCloseTo(value(source));
  expect(migrateLegacySource(migrated)).toBe(migrated);
});

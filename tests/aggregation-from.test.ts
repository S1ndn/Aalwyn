import { expect, it } from "vitest";
import { compile, parse, evaluateFunction } from "../src/compiler/compiler";
import { migrateLegacySource } from "../src/compiler/migrate";
import { aggregationSnippet } from "../src/playground/autocomplete";
it("uses from for both binders and reserves equals for term initialization", () => {
  const source = "fn f(n)\n += sum i from 1 to n (\n += i\n )\n += prod j from 1 to n (\n = 1\n *= j\n )\nend";
  expect(evaluateFunction(compile(source), {n: 4})).toBe(34);
  expect(() => parse("fn f() => sum i = 1 to 3 (\n += i\n)")).toThrow("from");
  const old = source.replace("sum i from", "sum i =").replace("prod j from", "prod j =");
  expect(migrateLegacySource(old)).toBe(source);
  for (const kind of ["sum", "prod"] as const) {
    const snippet = aggregationSnippet("", {kind, start: 0, end: 0}).text;
    expect(snippet).toContain(`${kind} i from 1 to 10`);
    expect(snippet).toContain("\n    = i\n");
    expect(evaluateFunction(compile(`fn f() => ${snippet}`), {})).toBe(kind === "sum" ? 55 : 3628800);
  }
});

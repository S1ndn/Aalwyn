import { describe, expect, it } from "vitest";
import {
  compile,
  evaluateMath,
  parse,
  sampleMath,
  tokenize,
  simplify,
} from "./legacy-fixtures";
import { highlight } from "../src/playground/highlight";
import {
  aggregationSnippet,
  completionAt,
} from "../src/playground/autocomplete";
import katex from "katex";
import { samplePlot } from "../src/playground/graph";

const numeric = (source: string, values: Record<string, number> = {}) => {
  const result = compile(source);
  return evaluateMath(result.simplified, values, result.helpers);
};
describe("finite sums and products", () => {
  it("implements the requested term-building sum", () => {
    const result = compile(
      "f(a,b) init 0\n += sum i from a to b init 0 (\n += i^2\n -= a ? (i<2)\n // etc.\n )\nend",
    );
    expect(result.ir.kind).toBe("add");
    expect(result.expressionLatex).toContain("\\sum_{i=a}^{b}");
    expect(evaluateMath(result.simplified, { a: 1, b: 3 })).toBe(13);
    expect(evaluateMath(result.ir, { a: 0, b: 3 })).toBe(14);
    expect(() =>
      katex.renderToString(result.latex, {
        throwOnError: true,
        strict: "error",
      }),
    ).not.toThrow();
  });
  it("multiplies independently initialized product terms", () => {
    const source =
      "productRange(n) init 1\n *= prod i from 1 to n init 1 (\n *= i\n )\nend";
    expect(numeric(source, { n: 5 })).toBe(120);
    expect(numeric(source, { n: 0 })).toBe(1);
    expect(compile(source).expressionLatex).toContain("\\prod_{i=1}^{n}");
  });
  it("supports direct aggregate expressions, variable initializers, locals and apply", () => {
    expect(
      numeric(
        "f(a,b) => sum i from a to b init i (\n define t i+1\n *= t\n apply abs\n)",
        { a: 1, b: 3 },
      ),
    ).toBe(20);
    expect(numeric("f(a) => sum i from 1 to 3 init a (\n += i\n)", { a: 2 })).toBe(
      12,
    );
  });
  it("supports aggregation arithmetic and nested dependent bounds", () => {
    const source =
      "f(n) => sum i from 1 to n init 0 (\n += sum j from 1 to i init 0 (\n += j\n )\n)";
    expect(numeric(source, { n: 3 })).toBe(10);
    expect(numeric("f() => 2*(sum i from 1 to 3 init 0 (\n += i\n))+1")).toBe(13);
  });
  it("scopes the index to the body and allows hygienic index shadowing", () => {
    expect(numeric("f(i) => sum i from 1 to i init i (\n += 0\n)", { i: 3 })).toBe(
      6,
    );
    expect(
      numeric(
        "f() => sum i from 1 to 2 init 0 (\n += sum i from 1 to 3 init 0 (\n += i\n )\n)",
      ),
    ).toBe(12);
    expect(() =>
      compile(
        "f() init 0\n += sum i from 1 to 2 init i (\n define t i\n )\n += t\nend",
      ),
    ).toThrow("Undefined name 't'");
    expect(() => compile("f() => sum i from i to 3 init 0 (\n += i\n)")).toThrow(
      "Undefined name 'i'",
    );
  });
  it("avoids capture when inlining a function into an aggregation or vice versa", () => {
    const result = compile(
      "g(x) => sum i from 1 to 2 init x (\n += i\n)\nf(i) => g(i)",
    );
    expect(evaluateMath(result.simplified, { i: 10 })).toBe(23);
    expect(result.expressionLatex).toContain("i_{1}");
    expect(
      numeric("g(x) => x+1\nf() => sum i from 1 to 3 init 0 (\n += g(i)\n)"),
    ).toBe(9);
  });
  it("preserves compiled aux calls inside aggregation terms", () => {
    const result = compile(
      "aux square(x) => x^2\nf(n) => sum i from 1 to n init 0 (\n += square(i)\n)",
    );
    expect(JSON.stringify(result.simplified)).toContain('"name":"square"');
    expect(evaluateMath(result.simplified, { n: 3 }, result.helpers)).toBe(14);
  });
  it("uses empty-range identities without evaluating undefined terms", () => {
    for (const [operator, identity] of [
      ["sum", 0],
      ["prod", 1],
    ] as const) {
      const result = compile(
        `f() => ${operator} i = 2 to 1 init ln(-1) (\n += 1/0\n)`,
      );
      expect(evaluateMath(result.ir, {})).toBe(identity);
      expect(result.simplified).toEqual({
        kind: "number",
        value: String(identity),
      });
    }
  });
  it("reduces a singleton without capturing nested indices", () => {
    const result = compile(
      "f() => sum i from 2 to 2 init i (\n += sum i from 1 to 2 init i (\n += 0\n)\n)",
    );
    expect(evaluateMath(result.simplified, {})).toBe(5);
    expect(simplify(result.simplified)).toEqual(result.simplified);
  });
  it("protects inactive aggregation bounds and skips their bodies", () => {
    for (const op of ["sum", "prod"]) {
      const result = compile(
        `f(x) init 7\n += ${op} i = ln(x) to 1/x init ln(-1) (\n += 1/0\n) ? (0)\nend`,
      );
      expect(evaluateMath(result.ir, { x: 0 })).toBe(7);
      expect(evaluateMath(result.simplified, { x: 0 })).toBe(7);
    }
  });
  it("preserves term-domain errors for active nonempty ranges, even in a zero product", () => {
    expect(
      sampleMath(
        compile("f() => sum i from 1 to 2 init ln(-1) (\n += 0\n)").simplified,
        {},
      ),
    ).toBeNull();
    expect(
      sampleMath(
        compile("f() => prod i from 0 to 1 init 0 (\n += 1/i\n)").simplified,
        {},
      ),
    ).toBeNull();
    expect(
      sampleMath(
        compile("f() => prod i from 0 to 1 init 0 (\n += 1/(i-1) ? (i>0)\n)")
          .simplified,
        {},
      ),
    ).toBeNull();
  });
  it("rejects noninteger numerical bounds and caps total work in nested aggregates", () => {
    const expression = compile(
      "f(n) => sum i from 1 to n init i (\n += 0\n)",
    ).simplified;
    expect(sampleMath(expression, { n: 2.5 })).toBeNull();
    expect(sampleMath(expression, { n: 10001 })).toBeNull();
  });
  it("does not hoist bound term expressions into top-level abbreviations", () => {
    const result = compile(
      "f(n) => sum i from 1 to n init 0 (\n += ln(1+i^2)\n += ln(1+i^2)^2\n)",
    );
    expect(result.abbreviations).toEqual([]);
  });
  it("does not capture generated display abbreviations in an aggregation binder", () => {
    const result = compile(
      "f(x,n) init 0\n += ln(1+x^2)\n += ln(1+x^2)^2\n += sum u_1 from 1 to n init 0 (\n += u_1\n )\nend",
    );
    expect(result.abbreviations.some((a) => a.name === "u_{1}")).toBe(false);
    expect(evaluateMath(result.simplified, { x: 0, n: 3 })).toBe(6);
  });
  it("retains integer graph points for parameterized finite products", () => {
    const result = compile("f(n) => prod i from 1 to n init i (\n *= 1\n)");
    expect(
      samplePlot(result, "n", {}, -0.3, 6.7, 100, 100).find((p) => p.x === 4)
        ?.y,
    ).toBe(24);
  });
  it("supports explicit apply contexts without confusing a nested apply me binding", () => {
    const result = compile(
      "f(x) init x\n apply abs(sum i from 1 to 2 init me (\n apply abs(me)\n += i\n))\nend",
    );
    expect(evaluateMath(result.simplified, { x: -3 })).toBe(9);
  });
  const invalid = [
    ["f() => sum i from 1 to 3 init 0 (\n += i\n", "Missing ')'"],
    ["f() => sum i 1 to 3 init 0 (\n += i\n)", "Expected 'from'"],
    ["f() => sum pi from 1 to 2 init 0 (\n += pi\n)", "reserved"],
    ["f() => sum i from 1 to 2 init 0 (\n define i 3\n)", "Duplicate local"],
    [
      "f() => sum i from 1 to 2 init 0 (\n define t 1\n define t 2\n)",
      "Duplicate local",
    ],
    ["f() => sum i from 1 to 2 init 0 (\n += unknown(i)\n)", "Undefined function"],
    ["f(x) => sum i from 1 to 2 init 0 (\n += f(i)\n)", "Recursive"],
    ["f() => sum i from 1 to 2 init me (\n += i\n)", "only valid"],
  ];
  for (const [source, message] of invalid)
    it(`rejects ${message}`, () =>
      expect(() => compile(source)).toThrow(message));
});

describe("line comments and aggregation completion", () => {
  it("supports standalone, trailing and EOF comments without changing line numbers", () => {
    expect(
      numeric("// hello\r\nf(x) => x/2 // division not a comment\r\n// EOF", {
        x: 6,
      }),
    ).toBe(3);
    expect(() =>
      compile("// first\nf(x) init 0\n // more\n += missing\nend"),
    ).toThrow("Undefined name 'missing'");
    expect(tokenize("// x\nf() => 1")[1]).toMatchObject({
      text: "f",
      line: 2,
      column: 1,
    });
  });
  it("colors comments and aggregation keywords without interpreting comment contents", () => {
    const tokens = highlight("sum i from 1 to n init 0 ( // prod invalid @\n)");
    expect(tokens.find((t) => t.text.startsWith("//"))?.style).toBe("comment");
    expect(tokens.find((t) => t.text === "sum")?.style).toBe("keyword");
    expect(tokens.find((t) => t.text === "to")?.style).toBe("keyword");
  });
  it("offers sum/prod prefixes and explicit Ctrl+Space completion", () => {
    expect(completionAt("    += su", 9).map((c) => c.kind)).toEqual(["sum"]);
    expect(completionAt("    *= pr", 9).map((c) => c.kind)).toEqual(["prod"]);
    expect(completionAt("    += ", 7, true).map((c) => c.kind)).toEqual([
      "sum",
      "prod",
    ]);
    expect(completionAt("// sum", 6, true)).toEqual([]);
  });
  it("inserts a valid indented snippet with a fresh index name", () => {
    const source = "f(i) init 0\n    += su",
      completion = completionAt(source, source.length)[0];
    const snippet = aggregationSnippet(source, completion);
    expect(snippet.text).toContain("sum j from 1 to 10");
    expect(snippet.text).toContain("\n        = j\n    )");
    expect(
      numeric(source.slice(0, completion.start) + snippet.text + "\nend", {
        i: 0,
      }),
    ).toBe(55);
  });
});

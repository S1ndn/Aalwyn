import { describe, it, expect } from "vitest";
import { compile, parse, tokenize } from "./legacy-fixtures";
import { builtins } from "../src/compiler/semantic";
import type { MathExpr } from "../src/compiler/math-ir";
import katex from "katex";
function evaluate(e: MathExpr, x: Record<string, number>): number {
  switch (e.kind) {
    case "number":
      return Number(e.value);
    case "symbol":
      return e.name === "pi" ? Math.PI : x[e.name];
    case "aggregate": {
      const lower = evaluate(e.lower, x),
        upper = evaluate(e.upper, x);
      let result = e.operator === "sum" ? 0 : 1;
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper))
        throw Error("Integer bounds required");
      for (let i = lower; i <= upper; i++) {
        const term = evaluate(e.body, { ...x, [e.index]: i });
        result = e.operator === "sum" ? result + term : result * term;
      }
      return result;
    }
    case "add":
      return e.terms.reduce((n, t) => n + evaluate(t, x), 0);
    case "multiply":
      return e.terms.reduce((n, t) => n * evaluate(t, x), 1);
    case "divide":
      return evaluate(e.left, x) / evaluate(e.right, x);
    case "power":
      return evaluate(e.left, x) ** evaluate(e.right, x);
    case "function": {
      const a = e.args.map((t) => evaluate(t, x));
      if (e.name === "sqrt") return Math.sqrt(a[0]);
      if (e.name === "log") return Math.log(a[1]) / Math.log(a[0]);
      if (e.name === "root") return Math.cbrt(a[1]);
      if (e.name === "abs") return Math.abs(a[0]);
      if (e.name === "atan") return Math.atan(a[0]);
      if (e.name === "ceil") return Math.ceil(a[0]);
      if (e.name === "floor") return Math.floor(a[0]);
      throw Error(e.name);
    }
  }
}
const run = (s: string, x: Record<string, number> = {}) =>
  evaluate(compile(s).simplified, x) + 0;
describe("reference programs", () => {
  it("A: sequential accumulator", () =>
    expect(run("f(x) init 1\n += x\n *= 2\nend", { x: 3 })).toBe(8));
  it("B: direct square", () =>
    expect(compile("square(x) => x^2").expressionLatex).toBe("x^{2}"));
  it("C: distance and immutable locals", () => {
    const s =
      "distance(ax, ay, bx, by) init 0\n define dx bx - ax\n define dy by - ay\n += dx^2\n += dy^2\n apply sqrt\nend";
    expect(run(s, { ax: 1, ay: 2, bx: 4, by: 6 })).toBe(5);
    expect(compile(s).expressionLatex).toContain("\\sqrt{");
  });
  it("D: forward referenced declarations compile", () =>
    expect(
      compile(
        "f(a,b) init 0\n += square(a)\n += square(b)\n apply sqrt\nend\nsquare(x) => x^2",
        "f",
      ).expressionLatex,
    ).toBe("\\sqrt{a^{2} + b^{2}}"));
  it("D: selects composed function", () => {
    const r = compile(
      "f(a,b) => sqrt(square(a)+square(b))\nsquare(x) => x^2",
      "f",
    );
    expect(evaluate(r.simplified, { a: 3, b: 4 })).toBe(5);
    expect(JSON.stringify(r.ir)).not.toContain('"name":"square"');
  });
  it("E: logarithm apply", () =>
    expect(run("f(x) init x\n apply log(10, me)\nend", { x: 100 })).toBe(2));
  it("F: conditional addition", () => {
    for (const x of [-3, 0, 3])
      expect(run("f(x) init 0\n += x^2 ? (x > 0)\nend", { x })).toBe(
        x > 0 ? x * x : 0,
      );
  });
  it("G: conditional multiplication", () => {
    for (const x of [-3, 0, 3])
      expect(run("f(x) init 2\n *= x ? (x > 0)\nend", { x })).toBe(
        x > 0 ? 2 * x : 2,
      );
  });
  it("H: chained conditions", () => {
    for (const x of [-1, 0, 5, 10, 15])
      expect(run("f(x) init 0\n += x ? (x > 0) and (x < 10)\nend", { x })).toBe(
        x > 0 && x < 10 ? x : 0,
      );
  });
});
describe("language and mathematics", () => {
  it("uses right associative powers and conventional unary precedence", () => {
    expect(run("f() => 2^3^2")).toBe(512);
    expect(run("f() => -2^2")).toBe(-4);
    expect(run("f() => 2^-2")).toBe(0.25);
  });
  it("all updates deactivate with their correct identity", () => {
    for (const op of ["+=", "-=", "*=", "/=", "^="])
      expect(run(`f(x) init 7\n ${op} x ? (0)\nend`, { x: 3 })).toBe(7);
  });
  it("logical operators fold left to right", () =>
    expect(run("f() init 0\n += 7 ? (1) or (0) and (0)\nend")).toBe(0));
  it("numeric predicates use nonzero truth", () =>
    expect(run("f() init 0\n += 3 ? (-2)\nend")).toBe(3));
  it("substitution avoids name capture", () =>
    expect(
      run("g(x) => x+1\nf(x) init x\n define y 2\n apply g(me+y)\nend", {
        x: 5,
      }),
    ).toBe(8));
  it("root order and multiple expression arguments", () => {
    expect(compile("f(x) init x\n apply root(3,me)\nend").expressionLatex).toBe(
      "\\sqrt[3]{x}",
    );
    expect(run("f(x) init x\n apply root(3,me)\nend", { x: 8 })).toBe(2);
  });
  it("folds constants exactly without decimal approximation", () => {
    expect(compile("f() => 0.1+0.2").expressionLatex).toBe("\\frac{3}{10}");
    expect(compile("f() => 1/3+1/6").expressionLatex).toBe("\\frac{1}{2}");
  });
  it("preserves domain-sensitive expressions", () => {
    for (const s of ["sqrt(x^2)", "x/x", "x^0", "0^0", "1/0"])
      expect(compile(`f(x) => ${s}`).simplified.kind).not.toBe("number");
  });
  it("supports each builtin and renders valid KaTeX", () => {
    for (const [name, n] of Object.entries(builtins)) {
      const args = Array.from({ length: Math.abs(n) }, (_, i) =>
        i ? "2" : "x",
      ).join(",");
      const r = compile(`f(x) => ${name}(${args})`);
      expect(() =>
        katex.renderToString(r.latex, { throwOnError: true, strict: "error" }),
      ).not.toThrow();
    }
  });
  it("renders nested powers, subtraction, fractions and escaped names", () => {
    for (const expression of [
      "(x^2)^3",
      "x-(x+2)",
      "(-2)^x",
      "x/(x+1)",
      "pi+e+phi",
    ])
      expect(() =>
        katex.renderToString(compile(`f_name(x) => ${expression}`).latex, {
          throwOnError: true,
        }),
      ).not.toThrow();
    expect(compile("f(x) => (x^2)^3").expressionLatex).toContain(
      "\\left(x^{2}\\right)^{3}",
    );
  });
  it("tokens retain positions", () =>
    expect(tokenize("f(x) => x\n")[0]).toMatchObject({
      text: "f",
      line: 1,
      column: 1,
    }));
  it("parser creates a language AST before lowering", () =>
    expect(parse("f(x) => x+0").functions[0].init.kind).toBe("binary"));
  it("ordinary names do not inherit object properties", () => {
    expect(compile("f(constructor) => constructor").expressionLatex).toBe(
      "\\operatorname{constructor}",
    );
    expect(() => compile("f(x) => x constructor")).toThrow("end of line");
  });
});
describe("closed mathematical conditionals", () => {
  const comparisons: Record<string, (a: number, b: number) => boolean> = {
    "==": (a, b) => a === b,
    "!=": (a, b) => a !== b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
  };
  for (const [op, expected] of Object.entries(comparisons)) {
    it(`eliminates ${op} correctly at, below and above equality`, () => {
      const result = compile(`f(a,b) init 0\n += 1 ? (a ${op} b)\nend`);
      for (const a of [-100, -1, -1e-10, 0, 1e-10, 1, 100])
        for (const b of [-100, -1, -1e-10, 0, 1e-10, 1, 100]) {
          for (const expression of [result.ir, result.simplified])
            expect(evaluate(expression, { a, b }) + 0).toBe(
              Number(expected(a, b)),
            );
        }
      for (const expression of [result.ir, result.simplified])
        expect(JSON.stringify(expression)).not.toMatch(
          /"kind":"(?:indicator|comparison|truth|logical|piecewise)"/,
        );
      expect(result.expressionLatex).not.toMatch(
        /\\mathbf|\\begin\{cases\}|\\land|\\lor/,
      );
      expect(() =>
        katex.renderToString(result.latex, {
          throwOnError: true,
          strict: "error",
        }),
      ).not.toThrow();
    });
  }
  it("equality is an explicit absolute-value and floor expression", () => {
    const result = compile("equal(a,b) init 0\n += 1 ? (a == b)\nend");
    expect(result.expressionLatex).toContain("\\left|");
    expect(result.expressionLatex).toContain("\\lfloor");
    expect(result.expressionLatex).toContain("\\frac");
  });
  it("preserves logical truth tables and left-to-right mixed grouping", () => {
    for (const a of [0, 1])
      for (const b of [0, 1])
        for (const c of [0, 1]) {
          expect(
            run("f(a,b,c) init 0\n += 1 ? (a) or (b) and (c)\nend", {
              a,
              b,
              c,
            }),
          ).toBe(Number(Boolean((a || b) && c)));
          expect(
            run("f(a,b,c) init 0\n += 1 ? (a) and (b) or (c)\nend", {
              a,
              b,
              c,
            }),
          ).toBe(Number(Boolean((a && b) || c)));
        }
  });
  it("all five updates activate and deactivate with arithmetic guards", () => {
    for (const [op, active] of [
      ["+=", 10],
      ["-=", 4],
      ["*=", 21],
      ["/=", 7 / 3],
      ["^=", 343],
    ] as const) {
      expect(run(`f(x) init 7\n ${op} 3 ? (x == 2)\nend`, { x: 2 })).toBe(
        active,
      );
      expect(run(`f(x) init 7\n ${op} 3 ? (x == 2)\nend`, { x: 0 })).toBe(7);
    }
  });
  it("folds constant guards exactly, including beyond floating-point range", () => {
    for (const value of ["1e-1000", "-1e-1000", "1e1000", "-1e1000"]) {
      const expectedPositive = !value.startsWith("-");
      for (const [op, expected] of [
        ["==", 0],
        ["!=", 1],
        [">", Number(expectedPositive)],
        ["<", Number(!expectedPositive)],
      ] as const)
        expect(
          compile(`f() init 0\n += 1 ? (${value} ${op} 0)\nend`).simplified,
        ).toEqual({ kind: "number", value: String(expected) });
    }
    expect(
      compile("f() init 0\n += 1 ? (0.1+0.2 == 0.3)\nend").simplified,
    ).toEqual({ kind: "number", value: "1" });
  });
  it("rounds negative rationals mathematically and keeps undefined input explicit", () => {
    for (const [expression, expected] of [
      ["floor(-1/3)", "-1"],
      ["ceil(-1/3)", "0"],
      ["floor(1/3)", "0"],
      ["ceil(1/3)", "1"],
      ["abs(-2/3)", "\\frac{2}{3}"],
    ] as const)
      expect(compile(`f() => ${expression}`).expressionLatex).toBe(expected);
    expect(compile("f() => ceil(1/0)").simplified.kind).toBe("function");
  });
});

describe("diagnostics", () => {
  const invalid = [
    ["f(x) => y", "Undefined name"],
    ["f(x) => nope(x)", "Undefined function"],
    ["f(x) => sin(x,1)", "expects"],
    ["f(x) => min(x)", "at least"],
    ["f(x) => x\nf(x) => x", "Duplicate function"],
    ["f(x,x) => x", "Duplicate parameter"],
    ["sin(x) => x", "reserved"],
    ["f(pi) => pi", "reserved"],
    ["f(x) init x\n define x 3\nend", "Duplicate local"],
    ["f(x) init x\n define y 2\n define y 3\nend", "Duplicate local"],
    ["f(x) init x\n define y y\nend", "Undefined name"],
    ["f(x) => g(x)\ng(x) => f(x)", "Recursive"],
    ["f(x) => me", "only valid"],
    ["f(x) init x\n define y me\nend", "only valid"],
    ["f(x) init x\n += me\nend", "only valid"],
    ["f(x) init x\n apply log(x,10)\nend", "reference"],
    ["f(x) init x\n apply log\nend", "expects"],
    ["f(x) init x\n apply sqrt ? (x>0)\nend", "end of line"],
    ["f(x) init 0\n += x ? x>0\nend", "Expected '('"],
    ["f(x) init x", "Missing 'end'"],
    ["f(x) => @", "Unexpected character"],
    ["f(x) => x ? (x>0)", "end of line"],
    ["f(x) => 2 3", "end of line"],
    ["f(x) => x\nbad(x) => missing(x)", "Undefined function"],
    ["f(x) =>", "Unexpected end of source"],
    ["f(x) => sqrt(", "Unexpected end of source"],
    ["f(x) => x+", "Unexpected end of source"],
  ];
  for (const [source, message] of invalid)
    it(`rejects ${source.replaceAll("\n", " / ")}`, () =>
      expect(() => compile(source)).toThrow(message));
  it("reports line and column", () => {
    try {
      compile("fn f(x)\n += missing\nend");
      expect.fail();
    } catch (e) {
      expect(e).toMatchObject({ line: 2, column: 5 });
    }
  });
});

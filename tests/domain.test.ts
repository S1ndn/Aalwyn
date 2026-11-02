import { describe, expect, it } from "vitest";
import { compile, simplify } from "./legacy-fixtures";
import type { MathExpr } from "../src/compiler/math-ir";
import { builtins } from "../src/compiler/semantic";
import {
  arithmeticSpecs,
  builtinSpecs,
  type BuiltinName,
} from "../src/compiler/builtins";
import { protectInactive } from "../src/compiler/domain";

type PartialBuiltinName = {
  [K in BuiltinName]: (typeof builtinSpecs)[K]["safety"] extends {
    kind: "partial";
  }
    ? K
    : never;
}[BuiltinName];
// Independent test oracle. Keeping this separate from production policies
// catches invalid fallback tuples and domain boundaries that JS Math can hide
// (e.g. log(x,0) can evaluate to finite -0 despite having no real log base).
const realDomains: Record<PartialBuiltinName, (args: number[]) => boolean> = {
  gamma: ([x]) => !(x <= 0 && Number.isInteger(x)),
  factorial: ([n]) => Number.isInteger(n) && n >= 0,
  ln: ([x]) => x > 0,
  log2: ([x]) => x > 0,
  log10: ([x]) => x > 0,
  log: ([b, x]) => x > 0 && b > 0 && b !== 1,
  mod: ([, m]) => m !== 0,
  sqrt: ([x]) => x >= 0,
  root: ([n, x]) =>
    Number.isInteger(n) &&
    n !== 0 &&
    (n % 2 !== 0 || x >= 0) &&
    (n > 0 || x !== 0),
  tan: ([x]) => !Number.isInteger(x / Math.PI - 0.5),
  sec: ([x]) => !Number.isInteger(x / Math.PI - 0.5),
  csc: ([x]) => !Number.isInteger(x / Math.PI),
  cot: ([x]) => !Number.isInteger(x / Math.PI),
  asin: ([x]) => Math.abs(x) <= 1,
  acos: ([x]) => Math.abs(x) <= 1,
  acsc: ([x]) => Math.abs(x) >= 1,
  asec: ([x]) => Math.abs(x) >= 1,
  csch: ([x]) => x !== 0,
  coth: ([x]) => x !== 0,
  acosh: ([x]) => x >= 1,
  atanh: ([x]) => Math.abs(x) < 1,
  acsch: ([x]) => x !== 0,
  asech: ([x]) => x > 0 && x <= 1,
  acoth: ([x]) => Math.abs(x) > 1,
};

// Strict real arithmetic: every intermediate must be defined. In particular,
// this deliberately rejects 0 * NaN and 0 * Infinity rather than hiding them.
function evaluate(e: MathExpr, values: Record<string, number>): number {
  let result: number;
  switch (e.kind) {
    case "aggregate": {
      const lower = evaluate(e.lower, values),
        upper = evaluate(e.upper, values);
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper))
        throw Error("Undefined aggregate bounds");
      result = e.operator === "sum" ? 0 : 1;
      for (let i = lower; i <= upper; i++) {
        const term = evaluate(e.body, { ...values, [e.index]: i });
        result = e.operator === "sum" ? result + term : result * term;
      }
      break;
    }
    case "number":
      result = Number(e.value);
      break;
    case "symbol":
      result =
        (
          { e: Math.E, pi: Math.PI, phi: (1 + Math.sqrt(5)) / 2 } as Record<
            string,
            number
          >
        )[e.name] ?? values[e.name];
      break;
    case "add":
      result = e.terms.reduce((n, t) => n + evaluate(t, values), 0);
      break;
    case "multiply":
      result = e.terms.reduce((n, t) => n * evaluate(t, values), 1);
      break;
    case "divide":
      result = evaluate(e.left, values) / evaluate(e.right, values);
      break;
    case "power": {
      const base = evaluate(e.left, values),
        exponent = evaluate(e.right, values);
      result = base === 0 && exponent === 0 ? NaN : base ** exponent;
      break;
    }
    case "function": {
      const a = e.args.map((arg) => evaluate(arg, values));
      if (
        Object.hasOwn(realDomains, e.name) &&
        !realDomains[e.name as PartialBuiltinName](a)
      )
        throw new Error(`Undefined ${e.name}`);
      const unary: Record<string, (x: number) => number> = {
        abs: Math.abs,
        sign: Math.sign,
        floor: Math.floor,
        ceil: Math.ceil,
        sqrt: Math.sqrt,
        ln: Math.log,
        log2: Math.log2,
        log10: Math.log10,
        exp: Math.exp,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        csc: (x) => 1 / Math.sin(x),
        sec: (x) => 1 / Math.cos(x),
        cot: (x) => Math.cos(x) / Math.sin(x),
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        acsc: (x) => Math.asin(1 / x),
        asec: (x) => Math.acos(1 / x),
        acot: (x) => Math.PI / 2 - Math.atan(x),
        sinh: Math.sinh,
        cosh: Math.cosh,
        tanh: Math.tanh,
        csch: (x) => 1 / Math.sinh(x),
        sech: (x) => 1 / Math.cosh(x),
        coth: (x) => 1 / Math.tanh(x),
        asinh: Math.asinh,
        acosh: Math.acosh,
        atanh: Math.atanh,
        acsch: (x) => Math.asinh(1 / x),
        asech: (x) => Math.acosh(1 / x),
        acoth: (x) => Math.atanh(1 / x),
      };
      if (e.name === "log") result = Math.log(a[1]) / Math.log(a[0]);
      else if (e.name === "raise") result = a[0] ** a[1];
      else if (e.name === "gamma") {
        result = 1;
        for (let i = 2; i < a[0]; i++) result *= i;
      } else if (e.name === "factorial") {
        result = 1;
        for (let i = 2; i <= a[0]; i++) result *= i;
      } else if (e.name === "mod")
        result = a[0] - a[1] * Math.floor(a[0] / a[1]);
      else if (e.name === "square") result = a[0] ** 2;
      else if (e.name === "root")
        result =
          a[0] === 0
            ? NaN
            : a[1] < 0 && Number.isInteger(a[0]) && a[0] % 2 !== 0
              ? -((-a[1]) ** (1 / a[0]))
              : a[1] ** (1 / a[0]);
      else if (e.name === "min") result = Math.min(...a);
      else if (e.name === "max") result = Math.max(...a);
      else result = unary[e.name](a[0]);
    }
  }
  if (!Number.isFinite(result)) throw new Error(`Undefined ${e.kind}`);
  return result;
}

describe("domain-safe guarded updates", () => {
  const source = "r(x) init 0\n += (-1/x) ? (x < 0)\n += ln(x) ? (x > 0)\nend";
  it("protects the logarithm and reciprocal on inactive branches, including zero", () => {
    const result = compile(source);
    for (const x of [-10, -1, -0.1, 0, 0.1, 1, 10]) {
      const expected = x < 0 ? -1 / x : x > 0 ? Math.log(x) : 0;
      expect(evaluate(result.ir, { x })).toBeCloseTo(expected, 12);
      expect(evaluate(result.simplified, { x })).toBeCloseTo(expected, 12);
    }
    expect(simplify(result.simplified)).toEqual(result.simplified);
    expect(JSON.stringify(result.simplified)).not.toMatch(
      /"kind":"(?:piecewise|indicator)"/,
    );
  });
  for (const expression of [
    "1/x",
    "ln(x)",
    "sqrt(x)",
    "x^(-1)",
    "x^(1/2)",
    "ln(sqrt(x))",
    "1/ln(x)",
    "ln(1/x)",
    "log(x,x)",
    "root(x,x)",
    "asin(x)",
    "acos(x)",
    "acsc(x)",
    "asec(x)",
    "acosh(x)",
    "atanh(x)",
    "acsch(x)",
    "asech(x)",
    "acoth(x)",
    "csc(x)",
    "cot(x)",
    "csch(x)",
    "coth(x)",
  ])
    it(`safely deactivates ${expression} recursively`, () => {
      const result = compile(`f(x) init 7\n += ${expression} ? (x > 0)\nend`);
      for (const x of [-2, -1, 0])
        for (const tree of [result.ir, result.simplified])
          expect(evaluate(tree, { x })).toBe(7);
    });
  for (const [op, neutral] of [
    ["+=", 7],
    ["-=", 7],
    ["*=", 7],
    ["/=", 7],
    ["^=", 7],
  ] as const)
    it(`protects the operand of ${op}`, () => {
      const result = compile(`f(x) init 7\n ${op} ln(x) ? (x > 0)\nend`);
      for (const tree of [result.ir, result.simplified])
        expect(evaluate(tree, { x: -1 })).toBe(neutral);
    });
  it("preserves invalid domains when the branch is active", () => {
    const result = compile("f(x) init 0\n += ln(x) ? (x < 0)\nend");
    expect(() => evaluate(result.ir, { x: -1 })).toThrow("Undefined");
    expect(() => evaluate(result.simplified, { x: -1 })).toThrow("Undefined");
  });
  it("protects inlined definitions and previously defined local expressions", () => {
    const result = compile(
      "logarithm(x) => ln(x)\nf(x) init 0\n define q logarithm(x)\n += q ? (x > 0)\nend",
    );
    expect(evaluate(result.simplified, { x: -1 })).toBeCloseTo(0, 12);
    expect(evaluate(result.simplified, { x: Math.E })).toBeCloseTo(1, 12);
  });
  it("keeps total aux calls named and diagnoses unsupported partial helpers", () => {
    const total = compile(
      "aux square(x) => x^2\nf(x) init 0\n += square(x) ? (x > 0)\nend",
    );
    expect(JSON.stringify(total.simplified)).toContain('"name":"square"');
    expect(() =>
      compile("aux h(x) => ln(x)\nf(x) init 0\n += h(x) ? (x > 0)\nend"),
    ).toThrow("Cannot prove that aux 'h'");
    expect(
      compile("aux h(x) => ln(x)\nf(x) init 0\n += h(1) ? (x > 0)\nend")
        .expressionLatex,
    ).toContain("h\\left(1\\right)");
    const partialArgument = compile(
      "aux square(x) => x^2\nf(x) init 0\n += square(ln(x)) ? (x > 0)\nend",
    );
    expect(JSON.stringify(partialArgument.simplified)).toContain(
      '"name":"square"',
    );
    expect(evaluate(partialArgument.simplified, { x: -1 })).toBeCloseTo(0, 12);
    expect(evaluate(partialArgument.simplified, { x: Math.E })).toBeCloseTo(
      1,
      12,
    );
  });
  it("has a defined inactive representation for every registered builtin", () => {
    for (const [name, arity] of Object.entries(builtins)) {
      const args = Array.from({ length: Math.abs(arity) }, () => "x").join(",");
      const result = compile(`f(x) init 7\n += ${name}(${args}) ? (0)\nend`);
      for (const tree of [result.ir, result.simplified])
        expect(evaluate(tree, { x: 0 }), name).toBe(7);
    }
  });
  it("does not mask domain errors in the guard or the existing accumulator", () => {
    expect(() =>
      evaluate(compile("f(x) init 0\n += 1 ? (ln(x)>0)\nend").simplified, {
        x: -1,
      }),
    ).toThrow("Undefined");
    expect(() =>
      evaluate(compile("f(x) init ln(x)\n += 1 ? (0)\nend").simplified, {
        x: -1,
      }),
    ).toThrow("Undefined");
  });
  it("protects literal invalid operations when inactive, but preserves active errors", () => {
    for (const expression of ["1/0", "ln(-1)", "sqrt(-1)", "0^0", "ln(1/0)"]) {
      const inactive = compile(`f() init 7\n += ${expression} ? (0)\nend`);
      expect(evaluate(inactive.ir, {})).toBe(7);
      expect(evaluate(inactive.simplified, {})).toBe(7);
      const active = compile(`f() init 7\n += ${expression} ? (1)\nend`);
      expect(() => evaluate(active.simplified, {})).toThrow("Undefined");
    }
  });
  it("does not erase undefined active expressions through zero multiplication or cancellation", () => {
    for (const expression of ["0*ln(x)", "ln(x)-ln(x)", "0*(1/x)", "1/x-1/x"]) {
      const result = compile(`f(x) => ${expression}`);
      const x = expression.includes("ln") ? -1 : 0;
      expect(() => evaluate(result.ir, { x })).toThrow("Undefined");
      expect(() => evaluate(result.simplified, { x })).toThrow("Undefined");
    }
  });
});

describe("exhaustive builtin domain contracts", () => {
  it("recognition and arity come from the same mandatory safety registry", () => {
    expect(Object.keys(builtins).sort()).toEqual(
      Object.keys(builtinSpecs).sort(),
    );
    const partial = Object.entries(builtinSpecs)
      .filter(([, spec]) => spec.safety.kind === "partial")
      .map(([name]) => name);
    expect(partial.sort()).toEqual(Object.keys(realDomains).sort());
    for (const [name, spec] of Object.entries(builtinSpecs)) {
      expect(builtins[name]).toBe(spec.arity);
      expect(spec.domain.trim()).not.toBe("");
      expect(["total", "partial"]).toContain(spec.safety.kind);
      if (spec.safety.kind === "partial") {
        const inactiveArgs = spec.safety.inactive;
        expect(inactiveArgs.length).toBe(spec.arity);
        const args = inactiveArgs.map((arg) => evaluate(arg, {}));
        expect(realDomains[name as PartialBuiltinName](args), name).toBe(true);
        expect(
          () =>
            evaluate({ kind: "function", name, args: [...inactiveArgs] }, {}),
          name,
        ).not.toThrow();
      }
    }
    expect(Object.keys(arithmeticSpecs).sort()).toEqual(
      ["+", "-", "*", "/", "%", "^"].sort(),
    );
    expect(arithmeticSpecs["/"].safety.inactive[1]).toEqual({
      kind: "number",
      value: "1",
    });
    expect(arithmeticSpecs["^"].safety.inactive[0]).toEqual({
      kind: "number",
      value: "1",
    });
  });

  const boundaries = {
    factorial: { valid: [[0], [1], [5]], invalid: [[-1], [0.5], [-2]] },
    gamma: { valid: [[1], [2], [6]], invalid: [[0], [-1], [-2]] },
    mod: {
      valid: [
        [5, 3],
        [-5, 3],
        [5, -3],
        [-5, -3],
      ],
      invalid: [
        [1, 0],
        [0, 0],
      ],
    },
    ln: { valid: [[1], [2]], invalid: [[0], [-1]] },
    log2: { valid: [[1], [2]], invalid: [[0], [-1]] },
    log10: { valid: [[1], [10]], invalid: [[0], [-1]] },
    log: {
      valid: [[2, 1], [10, 2]],
      invalid: [[2, 0], [0, 2], [1, 2], [2, -1], [-2, 2]],
    },
    sqrt: { valid: [[0], [4]], invalid: [[-1]] },
    root: {
      valid: [
        [2, 4],
        [3, -8],
        [-3, -8],
      ],
      invalid: [
        [0, 2],
        [2, -1],
        [-2, 0],
        [1.5, 4],
      ],
    },
    tan: { valid: [[0], [1]], invalid: [[Math.PI / 2], [-Math.PI / 2]] },
    sec: { valid: [[0], [1]], invalid: [[Math.PI / 2], [-Math.PI / 2]] },
    csc: { valid: [[Math.PI / 2]], invalid: [[0], [Math.PI]] },
    cot: { valid: [[Math.PI / 2]], invalid: [[0], [Math.PI]] },
    asin: { valid: [[-1], [0], [1]], invalid: [[-2], [2]] },
    acos: { valid: [[-1], [0], [1]], invalid: [[-2], [2]] },
    acsc: { valid: [[-1], [1], [2]], invalid: [[0], [0.5]] },
    asec: { valid: [[-1], [1], [2]], invalid: [[0], [0.5]] },
    csch: { valid: [[-1], [1]], invalid: [[0]] },
    coth: { valid: [[-1], [1]], invalid: [[0]] },
    acosh: { valid: [[1], [2]], invalid: [[0], [-1]] },
    atanh: { valid: [[0], [0.5]], invalid: [[-1], [1], [2]] },
    acsch: { valid: [[-1], [1]], invalid: [[0]] },
    asech: { valid: [[1], [0.5]], invalid: [[0], [-1], [2]] },
    acoth: { valid: [[-2], [2]], invalid: [[-1], [0], [1]] },
  } satisfies Record<
    PartialBuiltinName,
    { valid: number[][]; invalid: number[][] }
  >;

  for (const [name, cases] of Object.entries(boundaries)) {
    it(`preserves active ${name} domains and deactivates invalid boundary inputs`, () => {
      const params = Array.from(
        { length: builtinSpecs[name as PartialBuiltinName].arity },
        (_, i) => `a${i}`,
      );
      const active = compile(
        `f(${params.join(",")}) init 0\n += ${name}(${params.join(",")}) ? (1)\nend`,
      );
      const inactive = compile(
        `f(${params.join(",")}) init 7\n += ${name}(${params.join(",")}) ? (0)\nend`,
      );
      for (const args of cases.valid) {
        const values = Object.fromEntries(
          params.map((param, i) => [param, args[i]]),
        );
        const expected = evaluate(
          {
            kind: "function",
            name,
            args: args.map((value) => ({
              kind: "number",
              value: String(value),
            })),
          },
          {},
        );
        for (const tree of [active.ir, active.simplified])
          expect(evaluate(tree, values)).toBeCloseTo(expected, 12);
      }
      for (const args of cases.invalid) {
        const values = Object.fromEntries(
          params.map((param, i) => [param, args[i]]),
        );
        for (const tree of [active.ir, active.simplified])
          expect(() => evaluate(tree, values)).toThrow("Undefined");
        for (const tree of [inactive.ir, inactive.simplified])
          expect(evaluate(tree, values)).toBe(7);
      }
    });
  }
  it("fails closed for an unknown function without a safety proof", () => {
    expect(() =>
      protectInactive(
        {
          kind: "function",
          name: "unknown",
          args: [{ kind: "symbol", name: "x" }],
        },
        { kind: "number", value: "0" },
        () => undefined,
        (name) => {
          throw new Error(`No domain contract: ${name}`);
        },
      ),
    ).toThrow("No domain contract: unknown");
  });
  it("protects nested partial arguments for every builtin and all five update operators", () => {
    for (const [name, spec] of Object.entries(builtinSpecs))
      for (const op of ["+=", "-=", "*=", "/=", "^="]) {
        const args = Array.from(
          { length: Math.abs(spec.arity) },
          () => "ln(x)",
        ).join(",");
        const result = compile(
          `f(x) init 7\n ${op} ${name}(${args}) ? (0)\nend`,
        );
        for (const tree of [result.ir, result.simplified])
          expect(evaluate(tree, { x: -1 }), `${name} under ${op}`).toBe(7);
      }
  });
});

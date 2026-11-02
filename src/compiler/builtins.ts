import { binary, num, type MathExpr } from "./math-ir";

type Total = { kind: "total" };
type Unary = {
  arity: 1;
  domain: string;
  safety: Total | { kind: "partial"; inactive: readonly [MathExpr] };
};
type Binary = {
  arity: 2;
  domain: string;
  safety: Total | { kind: "partial"; inactive: readonly [MathExpr, MathExpr] };
};
type Variadic = { arity: -2; domain: string; safety: Total };
export type BuiltinSpec = Unary | Binary | Variadic;
const total = { kind: "total" } as const;
const partial = (value: MathExpr) =>
  ({ kind: "partial", inactive: [value] }) as const;
const halfPi = binary("/", { kind: "symbol", name: "pi" }, num(2));

/** The single source of truth for recognition, arity and real-domain safety.
 * A partial builtin cannot be registered without an arity-matched safe tuple.
 * Domain descriptions are contracts, not executable predicates in the output.
 */
export const builtinSpecs = {
  gamma: {
    arity: 1,
    domain: "Real x excluding nonpositive integers",
    safety: partial(num(1)),
  },
  abs: { arity: 1, domain: "All real x", safety: total },
  sign: { arity: 1, domain: "All real x", safety: total },
  floor: { arity: 1, domain: "All real x", safety: total },
  ceil: { arity: 1, domain: "All real x", safety: total },
  exp: { arity: 1, domain: "All real x", safety: total },
  factorial: {
    arity: 1,
    domain: "Nonnegative integers n; 0! = 1; no Gamma extension",
    safety: partial(num(0)),
  },
  ln: { arity: 1, domain: "x > 0", safety: partial(num(1)) },
  log2: { arity: 1, domain: "x > 0", safety: partial(num(1)) },
  log10: { arity: 1, domain: "x > 0", safety: partial(num(1)) },
  log: {
    arity: 2,
    domain: "b > 0, b != 1 and x > 0; log(b, x)",
    safety: { kind: "partial", inactive: [num(2), num(1)] },
  },
  mod: {
    arity: 2,
    domain: "Real x and nonzero real m; x - m*floor(x/m)",
    safety: { kind: "partial", inactive: [num(0), num(1)] },
  },
  sqrt: {
    arity: 1,
    domain: "x >= 0; nonnegative real root",
    safety: partial(num(0)),
  },
  root: {
    arity: 2,
    domain:
      "Integer n != 0; x >= 0 for even n; x != 0 for negative n; real nth root",
    safety: { kind: "partial", inactive: [num(1), num(1)] },
  },
  min: { arity: -2, domain: "At least two real arguments", safety: total },
  max: { arity: -2, domain: "At least two real arguments", safety: total },
  sin: { arity: 1, domain: "All real x", safety: total },
  cos: { arity: 1, domain: "All real x", safety: total },
  tan: { arity: 1, domain: "cos(x) != 0", safety: partial(num(0)) },
  sec: { arity: 1, domain: "cos(x) != 0", safety: partial(num(0)) },
  csc: { arity: 1, domain: "sin(x) != 0", safety: partial(halfPi) },
  cot: { arity: 1, domain: "sin(x) != 0", safety: partial(halfPi) },
  asin: {
    arity: 1,
    domain: "-1 <= x <= 1; principal real inverse",
    safety: partial(num(0)),
  },
  acos: {
    arity: 1,
    domain: "-1 <= x <= 1; principal real inverse",
    safety: partial(num(0)),
  },
  atan: {
    arity: 1,
    domain: "All real x; principal real inverse",
    safety: total,
  },
  acot: {
    arity: 1,
    domain: "All real x; inverse range (0, pi)",
    safety: total,
  },
  acsc: {
    arity: 1,
    domain: "abs(x) >= 1; principal real inverse",
    safety: partial(num(1)),
  },
  asec: {
    arity: 1,
    domain: "abs(x) >= 1; principal real inverse",
    safety: partial(num(1)),
  },
  sinh: { arity: 1, domain: "All real x", safety: total },
  cosh: { arity: 1, domain: "All real x", safety: total },
  tanh: { arity: 1, domain: "All real x", safety: total },
  sech: { arity: 1, domain: "All real x", safety: total },
  csch: { arity: 1, domain: "x != 0", safety: partial(num(1)) },
  coth: { arity: 1, domain: "x != 0", safety: partial(num(1)) },
  asinh: { arity: 1, domain: "All real x", safety: total },
  acosh: { arity: 1, domain: "x >= 1", safety: partial(num(1)) },
  atanh: { arity: 1, domain: "-1 < x < 1", safety: partial(num(0)) },
  acsch: { arity: 1, domain: "x != 0", safety: partial(num(1)) },
  asech: { arity: 1, domain: "0 < x <= 1", safety: partial(num(1)) },
  acoth: { arity: 1, domain: "abs(x) > 1", safety: partial(num(2)) },
} satisfies Record<string, BuiltinSpec>;

export type BuiltinName = keyof typeof builtinSpecs;
export function builtinSpec(name: string): BuiltinSpec | undefined {
  return Object.hasOwn(builtinSpecs, name)
    ? builtinSpecs[name as BuiltinName]
    : undefined;
}

export const arithmeticSpecs = {
  "+": { arity: 2, domain: "All real a,b", safety: total },
  "-": { arity: 2, domain: "All real a,b", safety: total },
  "*": { arity: 2, domain: "All real a,b", safety: total },
  "/": {
    arity: 2,
    domain: "b != 0",
    safety: { kind: "partial", inactive: [num(0), num(1)] },
  },
  "%": {
    arity: 2,
    domain: "Nonzero divisor m; floor-based modulo, identical to mod(x,m)",
    safety: { kind: "partial", inactive: [num(0), num(1)] },
  },
  "^": {
    arity: 2,
    domain: "Real power exists; 0^0 is undefined; no complex branch chosen",
    safety: { kind: "partial", inactive: [num(1), num(1)] },
  },
} satisfies Record<"+" | "-" | "*" | "/" | "%" | "^", Binary>;

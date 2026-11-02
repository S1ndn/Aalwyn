import { builtinSpec, type BuiltinName } from "./builtins";
import type { MathDefinition, MathExpr } from "./math-ir";
import { rational } from "./simplify";

export class MathEvaluationError extends Error {}
const invalid = (message = "Undefined over the reals"): never => {
  throw new MathEvaluationError(message);
};
const requireDomain = (condition: boolean) => {
  if (!condition) invalid();
};
const trigPole = (x: number, offset: number) =>
  Number.isInteger(x / Math.PI - offset);
const reciprocal = (x: number) => {
  requireDomain(x !== 0);
  return 1 / x;
};

// Lanczos approximation (g = 7), evaluated in log space to avoid intermediate
// overflow. Reflection extends it across the negative real intervals.
function logGammaPositive(x: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  const z = x - 1;
  let series = 0.9999999999998099;
  coefficients.forEach((c, i) => {
    series += c / (z + i + 1);
  });
  const t = z + 7.5;
  return (
    Math.log(2 * Math.PI) / 2 + (z + 0.5) * Math.log(t) - t + Math.log(series)
  );
}
function gamma(x: number): number {
  requireDomain(!(x <= 0 && Number.isInteger(x)));
  if (x >= 0.5) return Math.exp(logGammaPositive(x));
  // Reduce before sin to retain accuracy next to large negative integers.
  const reduced = x % 2;
  const sine = Math.sin(
    Math.PI *
      (reduced > 1 ? reduced - 2 : reduced < -1 ? reduced + 2 : reduced),
  );
  return (
    Math.sign(sine) *
    Math.exp(
      Math.log(Math.PI) - Math.log(Math.abs(sine)) - logGammaPositive(1 - x),
    )
  );
}

// Complete checked dispatch: adding a builtin requires a numeric implementation.
const functions = {
  gamma: ([x]) => gamma(x),
  factorial: ([n]) => {
    requireDomain(Number.isInteger(n) && n >= 0);
    if (n > 170)
      return invalid("Factorial is outside numerical range above 170!");
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },
  abs: ([x]) => Math.abs(x),
  sign: ([x]) => Math.sign(x),
  floor: ([x]) => Math.floor(x),
  ceil: ([x]) => Math.ceil(x),
  exp: ([x]) => Math.exp(x),
  ln: ([x]) => {
    requireDomain(x > 0);
    return Math.log(x);
  },
  log2: ([x]) => {
    requireDomain(x > 0);
    return Math.log2(x);
  },
  log10: ([x]) => {
    requireDomain(x > 0);
    return Math.log10(x);
  },
  log: ([b, x]) => {
    requireDomain(x > 0 && b > 0 && b !== 1);
    return Math.log(x) / Math.log(b);
  },
  mod: ([x, m]) => {
    requireDomain(m !== 0);
    // JS % is truncation-based remainder. Adjust its sign to floor modulo.
    const remainder = x % m;
    return remainder === 0
      ? 0
      : remainder > 0 === m > 0
        ? remainder
        : remainder + m;
  },
  sqrt: ([x]) => {
    requireDomain(x >= 0);
    return Math.sqrt(x);
  },
  root: ([n, x]) => {
    requireDomain(
      Number.isInteger(n) &&
        n !== 0 &&
        (x >= 0 || n % 2 !== 0) &&
        (n > 0 || x !== 0),
    );
    return x < 0 ? -((-x) ** (1 / n)) : x ** (1 / n);
  },
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  sin: ([x]) => Math.sin(x),
  cos: ([x]) => Math.cos(x),
  tan: ([x]) => {
    requireDomain(!trigPole(x, 0.5));
    return Math.tan(x);
  },
  sec: ([x]) => {
    requireDomain(!trigPole(x, 0.5));
    return reciprocal(Math.cos(x));
  },
  csc: ([x]) => {
    requireDomain(!trigPole(x, 0));
    return reciprocal(Math.sin(x));
  },
  cot: ([x]) => {
    requireDomain(!trigPole(x, 0));
    return Math.cos(x) / Math.sin(x);
  },
  asin: ([x]) => {
    requireDomain(Math.abs(x) <= 1);
    return Math.asin(x);
  },
  acos: ([x]) => {
    requireDomain(Math.abs(x) <= 1);
    return Math.acos(x);
  },
  atan: ([x]) => Math.atan(x),
  acot: ([x]) => Math.PI / 2 - Math.atan(x),
  acsc: ([x]) => {
    requireDomain(Math.abs(x) >= 1);
    return Math.asin(1 / x);
  },
  asec: ([x]) => {
    requireDomain(Math.abs(x) >= 1);
    return Math.acos(1 / x);
  },
  sinh: ([x]) => Math.sinh(x),
  cosh: ([x]) => Math.cosh(x),
  tanh: ([x]) => Math.tanh(x),
  sech: ([x]) => 1 / Math.cosh(x),
  csch: ([x]) => {
    requireDomain(x !== 0);
    return 1 / Math.sinh(x);
  },
  coth: ([x]) => {
    requireDomain(x !== 0);
    return 1 / Math.tanh(x);
  },
  asinh: ([x]) => Math.asinh(x),
  acosh: ([x]) => {
    requireDomain(x >= 1);
    return Math.acosh(x);
  },
  atanh: ([x]) => {
    requireDomain(Math.abs(x) < 1);
    return Math.atanh(x);
  },
  acsch: ([x]) => {
    requireDomain(x !== 0);
    return Math.asinh(1 / x);
  },
  asech: ([x]) => {
    requireDomain(x > 0 && x <= 1);
    return Math.acosh(1 / x);
  },
  acoth: ([x]) => {
    requireDomain(Math.abs(x) > 1);
    return Math.atanh(1 / x);
  },
} satisfies Record<BuiltinName, (args: number[]) => number>;

/** Evaluate math IR only. No source-language AST, parser, eval or generated JS.
 * Every child is evaluated strictly, so 0*undefined remains undefined.
 */
export function evaluateMath(
  expression: MathExpr,
  values: Readonly<Record<string, number>>,
  helpers: Readonly<Record<string, MathDefinition>> = {},
): number {
  let iterations = 0;
  const sequenceCache = new Map<string, number>();
  const sequenceStack: {name: string; index: number; key: string}[] = [];
  const activeSequenceKeys = new Set<string>();
  let sequenceTerms = 0;
  function visit(
    e: MathExpr,
    env: Readonly<Record<string, number>>,
    depth: number,
  ): number {
    if (depth > 512)
      return invalid("Expression too deep for numerical preview");
    const child = (value: MathExpr) => visit(value, env, depth + 1);
    let result: number;
    switch (e.kind) {
      case "number":
        result = Number(e.value);
        break;
      case "symbol": {
        const constant = new Map([
          ["pi", Math.PI],
          ["e", Math.E],
          ["phi", (1 + Math.sqrt(5)) / 2],
        ]).get(e.name);
        result =
          constant ??
          (Object.hasOwn(env, e.name)
            ? env[e.name]
            : invalid(`Missing value for '${e.name}'`));
        break;
      }
      case "aggregate": {
        const lower = child(e.lower),
          upper = child(e.upper);
        requireDomain(
          Number.isSafeInteger(lower) && Number.isSafeInteger(upper),
        );
        result = e.operator === "sum" ? 0 : 1;
        for (let index = lower; index <= upper; index++) {
          if (++iterations > 10000)
            return invalid(
              "Numerical preview is limited to 10000 aggregate terms per point",
            );
          const term = visit(e.body, { ...env, [e.index]: index }, depth + 1);
          result = e.operator === "sum" ? result + term : result * term;
          if (!Number.isFinite(result))
            return invalid("Outside numerical range");
        }
        break;
      }
      case "add":
        result = e.terms.reduce((sum, term) => sum + child(term), 0);
        break;
      case "multiply":
        result = e.terms.reduce((product, term) => product * child(term), 1);
        break;
      case "divide": {
        const a = child(e.left),
          b = child(e.right);
        requireDomain(b !== 0);
        result = a / b;
        break;
      }
      case "power": {
        const base = child(e.left),
          exponent = child(e.right);
        requireDomain(!(base === 0 && exponent <= 0));
        if (base < 0 && !Number.isInteger(exponent)) {
          const ratio = rational(e.right);
          if (!ratio) return invalid();
          let [n, d] = ratio;
          if (d < 0n) {
            n = -n;
            d = -d;
          }
          // Reduce before deciding whether an exact rational has an odd denominator.
          const gcd = (a: bigint, b: bigint): bigint =>
            b ? gcd(b, a % b) : a < 0n ? -a : a;
          const g = gcd(n, d);
          n /= g;
          d /= g;
          requireDomain(d % 2n !== 0n);
          result = (n % 2n === 0n ? 1 : -1) * (-base) ** exponent;
        } else result = base ** exponent;
        break;
      }
      case "function": {
        // Evaluate these exact identities without losing their boundary to
        // rounding (1+tiny becomes 1; atan(tiny)/pi can underflow to zero).
        // The expression remains ordinary math IR, including for user-written
        // instances of the same identities. Partial descendants stay strict.
        const argument = e.args.length === 1 ? e.args[0] : undefined;
        if (
          e.name === "ceil" &&
          argument?.kind === "divide" &&
          argument.right.kind === "symbol" &&
          argument.right.name === "pi" &&
          argument.left.kind === "function" &&
          argument.left.name === "atan" &&
          argument.left.args.length === 1
        )
          return child(argument.left.args[0]) > 0 ? 1 : 0;
        if (
          e.name === "floor" &&
          argument?.kind === "divide" &&
          argument.left.kind === "number" &&
          argument.left.value === "1" &&
          argument.right.kind === "add" &&
          argument.right.terms.length === 2
        ) {
          const terms = argument.right.terms;
          const one = terms.find((t) => t.kind === "number" && t.value === "1");
          const magnitude = terms.find(
            (t) =>
              t.kind === "function" && t.name === "abs" && t.args.length === 1,
          );
          if (one && magnitude?.kind === "function")
            return child(magnitude.args[0]) === 0 ? 1 : 0;
        }
        const args = e.args.map(child),
          spec = builtinSpec(e.name);
        if (spec) {
          requireDomain(
            spec.arity < 0
              ? args.length >= -spec.arity
              : args.length === spec.arity,
          );
          result = functions[e.name as BuiltinName](args);
        } else {
          if (!Object.hasOwn(helpers, e.name))
            return invalid(`Missing compiled aux '${e.name}'`);
          const definition = helpers[e.name];
          requireDomain(args.length === definition.params.length);
          const scope = Object.fromEntries(definition.params.map((name, i) => [name, args[i]]));
          if (definition.sequence) {
            const index = args[0];
            if (!Number.isSafeInteger(index)) return invalid(`Sequence '${e.name}' requires a safe integer index.`);
            const caller = sequenceStack.at(-1);
            if (caller?.name === e.name && index >= caller.index)
              return invalid(`Sequence '${e.name}' must reference a strictly earlier index.`);
            const key = JSON.stringify([e.name, index]);
            if (activeSequenceKeys.has(key)) return invalid(`Sequence '${e.name}' has no terminating base case.`);
            const cached = sequenceCache.get(key);
            if (cached !== undefined) { result = cached; break; }
            if (++sequenceTerms > 10000) return invalid("Numerical preview is limited to 10000 distinct sequence terms.");
            activeSequenceKeys.add(key);
            sequenceStack.push({name: e.name, index, key});
            try {
              if (definition.domain && visit(definition.domain, scope, depth + 1) !== 1)
                return invalid(`Sequence '${e.name}' index ${index} violates its domain; check the base cases.`);
              result = visit(definition.expression, scope, depth + 1);
              sequenceCache.set(key, result);
            } finally {
              sequenceStack.pop();
              activeSequenceKeys.delete(key);
            }
          } else result = visit(definition.expression, scope, depth + 1);
        }
      }
    }
    if (!Number.isFinite(result))
      return invalid("Undefined or outside numerical range");
    return result === 0 ? 0 : result;
  }
  return visit(expression, values, 0);
}

export function sampleMath(
  expression: MathExpr,
  values: Record<string, number>,
  helpers: Record<string, MathDefinition> = {},
): number | null {
  try {
    return evaluateMath(expression, values, helpers);
  } catch (e) {
    if (e instanceof MathEvaluationError) return null;
    throw e;
  }
}

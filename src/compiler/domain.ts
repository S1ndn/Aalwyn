import { binary, num, type MathExpr } from "./math-ir";
import { arithmeticSpecs, builtinSpec } from "./builtins";
import type { GuardFacts } from "./guard-facts";

export type HelperDefinition = (
  name: string,
  args: MathExpr[],
) => MathExpr | undefined;

const positiveNumber = (e: MathExpr) =>
  e.kind === "number" && Number(e.value) > 0;
const positiveInteger = (
  e: MathExpr,
): e is Extract<MathExpr, { kind: "number" }> =>
  e.kind === "number" && /^\d+$/.test(e.value) && BigInt(e.value) > 0n;

function nonnegative(e: MathExpr, facts: GuardFacts = new Map()): boolean {
  return (
    facts.get(JSON.stringify(e))?.has("nonnegative") ||
    positive(e, facts) ||
    (e.kind === "number" &&
      Number(e.value) === 0 &&
      !/[1-9]/.test(e.value.split(/[eE]/)[0])) ||
    (e.kind === "function" && e.name === "abs") ||
    (e.kind === "power" &&
      positiveInteger(e.right) &&
      BigInt(e.right.value) % 2n === 0n) ||
    (e.kind === "add" && e.terms.every((t) => nonnegative(t, facts)))
  );
}
function positive(e: MathExpr, facts: GuardFacts = new Map()): boolean {
  return (
    facts.get(JSON.stringify(e))?.has("positive") ||
    positiveNumber(e) ||
    (e.kind === "symbol" && ["e", "pi", "phi"].includes(e.name)) ||
    (e.kind === "function" && ["exp", "cosh"].includes(e.name)) ||
    (e.kind === "power" && positive(e.left, facts)) ||
    (e.kind === "add" &&
      e.terms.every((t) => nonnegative(t, facts)) &&
      e.terms.some((t) => positive(t, facts))) ||
    (e.kind === "multiply" &&
      e.terms.length > 0 &&
      e.terms.every((t) => positive(t, facts)))
  );
}
export function knownNonzero(
  e: MathExpr,
  facts: GuardFacts = new Map(),
): boolean {
  const sign = facts.get(JSON.stringify(e));
  return Boolean(
    sign?.has("negative") ||
    sign?.has("nonzero") ||
    positive(e, facts) ||
    (e.kind === "number" && Number(e.value) < 0),
  );
}

/** Conservative proof that an expression is defined for every real input.
 * This is not a numerical evaluator or a complete domain solver.
 */
export function isTotal(
  e: MathExpr,
  helper: HelperDefinition = () => undefined,
  facts: GuardFacts = new Map(),
): boolean {
  switch (e.kind) {
    case "number":
    case "symbol":
      return true;
    case "add":
    case "multiply":
      return e.terms.every((t) => isTotal(t, helper, facts));
    case "divide":
      return (
        isTotal(e.left, helper, facts) &&
        isTotal(e.right, helper, facts) &&
        knownNonzero(e.right, facts)
      );
    case "power":
      return (
        isTotal(e.left, helper, facts) &&
        isTotal(e.right, helper, facts) &&
        (positive(e.left, facts) || positiveInteger(e.right))
      );
    case "function": {
      if (!e.args.every((a) => isTotal(a, helper, facts))) return false;
      if (builtinSpec(e.name)?.safety.kind === "total") return true;
      if (e.name === "gamma") return positive(e.args[0], facts);
      if (["ln", "log2", "log10"].includes(e.name)) return positive(e.args[0], facts);
      if (e.name === "sqrt") return nonnegative(e.args[0], facts);
      if (e.name === "mod") return knownNonzero(e.args[1], facts);
      if (e.name === "factorial")
        return e.args[0].kind === "number" && /^\d+$/.test(e.args[0].value);
      const body = helper(e.name, e.args);
      return body !== undefined && isTotal(body, helper, facts);
    }
    case "aggregate": {
      const integer = (e: MathExpr) =>
        e.kind === "number" && /^-?\d+$/.test(e.value)
          ? BigInt(e.value)
          : undefined;
      const lower = integer(e.lower),
        upper = integer(e.upper);
      return (
        lower !== undefined &&
        upper !== undefined &&
        (lower > upper || isTotal(e.body, helper, facts))
      );
    }
  }
}

/** Produce an expression equal to value when guard=1, and defined when
 * guard=0. All partial descendants must be protected before any masking.
 * The guard itself is required to be defined and exactly zero or one.
 */
export function protectInactive(
  value: MathExpr,
  guard: MathExpr,
  helper: HelperDefinition,
  unsupported: (name: string) => never,
  facts: GuardFacts = new Map(),
  assumptions: GuardFacts = new Map(),
): MathExpr {
  // An empty finite sum safely suppresses an inactive sequence lookup without
  // evaluating its index or recursing through its base case. This remains an
  // ordinary mathematical sum, not a piecewise or lazy source-language node.
  if (value.kind === "function" && value.sequence) {
    const occupied = new Set<string>();
    const labels = (expression: MathExpr): void => {
      if (expression.kind === "symbol") occupied.add(expression.label ?? expression.name);
      else if (expression.kind === "function") expression.args.forEach(labels);
      else if (expression.kind === "add" || expression.kind === "multiply") expression.terms.forEach(labels);
      else if (expression.kind === "power" || expression.kind === "divide") { labels(expression.left); labels(expression.right); }
      else if (expression.kind === "aggregate") {
        occupied.add(expression.displayIndex);
        labels(expression.lower); labels(expression.upper); labels(expression.body);
      }
    };
    labels(value); labels(guard);
    let displayIndex = "j", suffix = 1;
    while (occupied.has(displayIndex)) displayIndex = `j_${suffix++}`;
    return {kind: "aggregate", operator: "sum", index: "@sequenceGate", displayIndex,
      lower: num(1), upper: guard, body: value};
  }
  if (isTotal(value, helper, assumptions)) return value;
  const walk = (e: MathExpr): MathExpr =>
    protectInactive(e, guard, helper, unsupported, facts, assumptions);
  const absolute = (e: MathExpr): MathExpr => ({
    kind: "function",
    name: "abs",
    args: [e],
  });
  const signOf = (e: MathExpr) => facts.get(JSON.stringify(e));
  const safeMagnitude = (e: MathExpr) =>
    binary("+", absolute(e), binary("-", num(1), guard));
  const select = (active: MathExpr, fallback: MathExpr) =>
    binary(
      "+",
      binary("*", guard, active),
      binary("*", binary("-", num(1), guard), fallback),
    );
  switch (value.kind) {
    case "number":
    case "symbol":
      return value;
    case "add":
    case "multiply":
      return { ...value, terms: value.terms.map(walk) };
    case "divide": {
      const sign = signOf(value.right);
      if (sign?.has("positive") || sign?.has("negative"))
        return {
          ...value,
          left: sign.has("negative")
            ? binary("*", num(-1), walk(value.left))
            : walk(value.left),
          right: safeMagnitude(walk(value.right)),
        };
      return {
        ...value,
        left: walk(value.left),
        right: select(
          walk(value.right),
          arithmeticSpecs["/"].safety.inactive[1],
        ),
      };
    }
    case "power": {
      const left = walk(value.left),
        right = walk(value.right);
      // Only the base needs a fallback once the exponent is defined: 1^y
      // exists for every real y, including zero and negative exponents.
      return {
        ...value,
        left: select(left, arithmeticSpecs["^"].safety.inactive[0]),
        right,
      };
    }
    case "function": {
      const args = value.args.map(walk);
      const sign = value.args.length === 1 ? signOf(value.args[0]) : undefined;
      if (["ln", "log2", "log10"].includes(value.name) && sign?.has("positive"))
        return { ...value, args: [safeMagnitude(args[0])] };
      if (value.name === "sqrt" && sign?.has("nonnegative"))
        return { ...value, args: [absolute(args[0])] };
      const spec = builtinSpec(value.name);
      if (spec?.safety.kind === "total") return { ...value, args };
      if (spec?.safety.kind === "partial") {
        const inactive = spec.safety.inactive;
        if (args.length !== inactive.length) return unsupported(value.name);
        return {
          ...value,
          args: args.map((arg, i) => select(arg, inactive[i])),
        };
      }
      // A helper must remain a named call. Its substituted body is inspected
      // for proof only, never substituted into the emitted expression.
      const template = helper(
        value.name,
        args.map((_, i) => ({ kind: "symbol", name: `__argument${i}` })),
      );
      if (template && isTotal(template, helper, assumptions))
        return { ...value, args };
      if (isTotal({ ...value, args }, helper, assumptions))
        return { ...value, args };
      return unsupported(value.name);
    }
    case "aggregate":
      return {
        ...value,
        // An inactive aggregation becomes an empty range. Its body is never
        // evaluated, so invalid terms need no artificial values.
        lower: select(walk(value.lower), num(1)),
        upper: select(walk(value.upper), num(0)),
      };
  }
}

/** Structural substitution used solely for proving named helper domains. */
export function substitute(
  e: MathExpr,
  env: ReadonlyMap<string, MathExpr>,
): MathExpr {
  switch (e.kind) {
    case "number":
      return e;
    case "symbol":
      return env.get(e.name) ?? e;
    case "add":
    case "multiply":
      return { ...e, terms: e.terms.map((t) => substitute(t, env)) };
    case "divide":
    case "power":
      return {
        ...e,
        left: substitute(e.left, env),
        right: substitute(e.right, env),
      };
    case "function":
      return { ...e, args: e.args.map((a) => substitute(a, env)) };
    case "aggregate": {
      const inner = new Map(env);
      inner.delete(e.index);
      return {
        ...e,
        lower: substitute(e.lower, env),
        upper: substitute(e.upper, env),
        body: substitute(e.body, inner),
      };
    }
  }
}

import type { Expr, Predicate } from "./ast";
import { binary, num, type MathExpr } from "./math-ir";

const absolute = (value: MathExpr): MathExpr => ({
  kind: "function",
  name: "abs",
  args: [value],
});
const ceiling = (value: MathExpr): MathExpr => ({
  kind: "function",
  name: "ceil",
  args: [value],
});
const complement = (value: MathExpr) => binary("-", num(1), value);

// atan(d)/pi is strictly between -1/2 and 1/2, with the same sign as d.
// Its ceiling is exactly the strict-positive detector, including zero.
function positive(value: MathExpr): MathExpr {
  return ceiling(
    binary(
      "/",
      { kind: "function", name: "atan", args: [value] },
      { kind: "symbol", name: "pi" },
    ),
  );
}

// 1/(1+|d|) is 1 exactly at zero, and strictly between 0 and 1 elsewhere.
function zero(value: MathExpr): MathExpr {
  return {
    kind: "function",
    name: "floor",
    args: [binary("/", num(1), binary("+", num(1), absolute(value)))],
  };
}

/** Eliminate source predicates into ordinary mathematical operations.
 * No predicate, comparison, indicator, or branch node enters the math IR.
 * Inputs must be real and defined; these are exact symbolic formulas.
 */
export function lowerPredicate(
  predicate: Predicate,
  resolve: (expression: Expr) => MathExpr,
  compare = lowerComparison,
): MathExpr {
  if (predicate.kind === "truth")
    return complement(zero(resolve(predicate.value)));
  if (predicate.kind === "logical") {
    const left = lowerPredicate(predicate.left, resolve, compare);
    const right = lowerPredicate(predicate.right, resolve, compare);
    // For p,q in {0,1}: AND = pq; OR = 1 - (1-p)(1-q).
    // The source AST already preserves the required left-to-right grouping.
    return predicate.op === "and"
      ? binary("*", left, right)
      : complement(binary("*", complement(left), complement(right)));
  }
  return compare(
    predicate.op,
    resolve(predicate.left),
    resolve(predicate.right),
  );
}

// Domain metadata uses sign-based comparisons, avoiding a rounded ratio of 1
// for large finite values in numerical acceptance checks.
export function lowerDomainComparison(
  op: string,
  left: MathExpr,
  right: MathExpr,
): MathExpr {
  const sign: MathExpr = {
    kind: "function",
    name: "sign",
    args: [binary("-", left, right)],
  };
  const magnitude = absolute(sign);
  const positive = binary("/", binary("+", magnitude, sign), num(2));
  const negative = binary("/", binary("-", magnitude, sign), num(2));
  return op === "=="
    ? complement(magnitude)
    : op === "!="
      ? magnitude
      : op === ">"
        ? positive
        : op === "<"
          ? negative
          : op === ">="
            ? complement(negative)
            : complement(positive);
}

export function lowerComparison(
  op: string,
  left: MathExpr,
  right: MathExpr,
): MathExpr {
  const difference = binary("-", left, right);
  switch (op) {
    case "==":
      return zero(difference);
    case "!=":
      return complement(zero(difference));
    case ">":
      return positive(difference);
    case "<":
      return positive(binary("*", num(-1), difference));
    case ">=":
      return complement(positive(binary("*", num(-1), difference)));
    case "<=":
      return complement(positive(difference));
    default:
      throw new Error(`Unsupported comparison '${op}'.`);
  }
}

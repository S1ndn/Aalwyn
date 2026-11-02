import type { Expr, Predicate } from "./ast";
import type { MathExpr } from "./math-ir";

export type SignFact =
  "positive" | "negative" | "nonnegative" | "nonpositive" | "nonzero";
export type GuardFacts = ReadonlyMap<string, ReadonlySet<SignFact>>;

/** Facts hold on the active branch only. OR retains the intersection;
 * AND combines facts. Never infer facts from a merely plausible domain.
 */
export function guardFacts(
  p: Predicate,
  resolve: (e: Expr) => MathExpr,
): GuardFacts {
  if (p.kind === "truth") return new Map();
  if (p.kind === "logical") {
    const left = guardFacts(p.left, resolve),
      right = guardFacts(p.right, resolve);
    const merged = new Map<string, Set<SignFact>>();
    for (const key of new Set([...left.keys(), ...right.keys()])) {
      const a = left.get(key) ?? new Set<SignFact>(),
        b = right.get(key) ?? new Set<SignFact>();
      const facts =
        p.op === "and"
          ? new Set([...a, ...b])
          : new Set([...a].filter((fact) => b.has(fact)));
      if (facts.size) merged.set(key, facts);
    }
    return merged;
  }
  const left = resolve(p.left),
    right = resolve(p.right);
  let value: MathExpr,
    op = p.op,
    bound: number;
  if (right.kind === "number" && Number.isFinite(Number(right.value))) {
    value = left;
    bound = Number(right.value);
  } else if (left.kind === "number" && Number.isFinite(Number(left.value))) {
    value = right;
    bound = Number(left.value);
    op =
      (
        { "<": ">", ">": "<", "<=": ">=", ">=": "<=" } as Record<string, string>
      )[op] ?? op;
  } else return new Map();
  const facts: SignFact[] =
    (op === ">" && bound >= 0) ||
    (op === ">=" && bound > 0) ||
    (op === "==" && bound > 0)
      ? ["positive", "nonnegative", "nonzero"]
      : (op === "<" && bound <= 0) ||
          (op === "<=" && bound < 0) ||
          (op === "==" && bound < 0)
        ? ["negative", "nonpositive", "nonzero"]
        : op === ">=" && bound === 0
          ? ["nonnegative"]
          : op === "<=" && bound === 0
            ? ["nonpositive"]
            : op === "!=" && bound === 0
              ? ["nonzero"]
              : [];
  return facts.length
    ? new Map([[JSON.stringify(value), new Set(facts)]])
    : new Map();
}

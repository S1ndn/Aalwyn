import type { MathExpr } from "./math-ir";
import type { GuardFacts, SignFact } from "./guard-facts";

export function mergeFacts(
  ...sources: GuardFacts[]
): Map<string, Set<SignFact>> {
  const result = new Map<string, Set<SignFact>>();
  for (const source of sources)
    for (const [key, values] of source)
      result.set(key, new Set([...(result.get(key) ?? []), ...values]));
  return result;
}

export function integerExpression(
  e: MathExpr,
  integers: ReadonlySet<string>,
): boolean {
  if (integers.has(JSON.stringify(e))) return true;
  switch (e.kind) {
    case "number":
      return /^-?\d+$/.test(e.value);
    case "add":
    case "multiply":
      return e.terms.every((t) => integerExpression(t, integers));
    case "function":
      return ["floor", "ceil", "factorial", "sign"].includes(e.name);
    case "power":
      return (
        integerExpression(e.left, integers) &&
        e.right.kind === "number" &&
        /^\d+$/.test(e.right.value)
      );
    default:
      return false;
  }
}

export function containsSymbol(e: MathExpr, name: string): boolean {
  switch (e.kind) {
    case "symbol":
      return e.name === name;
    case "number":
      return false;
    case "add":
    case "multiply":
      return e.terms.some((t) => containsSymbol(t, name));
    case "divide":
    case "power":
      return containsSymbol(e.left, name) || containsSymbol(e.right, name);
    case "function":
      return e.args.some((a) => containsSymbol(a, name));
    case "aggregate":
      return (
        containsSymbol(e.lower, name) ||
        containsSymbol(e.upper, name) ||
        (e.index !== name && containsSymbol(e.body, name))
      );
  }
}

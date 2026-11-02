import { latex } from "./latex";
import type { MathExpr } from "./math-ir";

function children(e: MathExpr): MathExpr[] {
  switch (e.kind) {
    case "number":
    case "symbol":
      return [];
    case "add":
    case "multiply":
      return e.terms;
    case "divide":
    case "power":
      return [e.left, e.right];
    case "function":
      return e.args;
    // Never hoist a term out of its binder or make an empty range evaluate it.
    case "aggregate":
      return [e.lower, e.upper];
  }
}
export interface Abbreviation {
  name: string;
  expression: MathExpr;
}

/** Presentation-only common-subexpression extraction. Every abbreviation has
 * a complete explicit definition; the compiled math tree stays untouched.
 */
export function compactLatex(
  expression: MathExpr,
  signature: string,
): { latex: string; abbreviations: Abbreviation[] } {
  const entries = new Map<
    string,
    { expression: MathExpr; count: number; size: number }
  >();
  function collect(e: MathExpr): number {
    const size =
        1 + children(e).reduce((sum, child) => sum + collect(child), 0),
      key = JSON.stringify(e);
    const previous = entries.get(key);
    if (previous) previous.count++;
    else entries.set(key, { expression: e, count: 1, size });
    return size;
  }
  collect(expression);
  const candidates = [...entries.entries()]
    .filter(([, entry]) => entry.count > 1 && entry.size >= 7)
    .sort(
      ([, a], [, b]) =>
        (b.size - 1) * (b.count - 1) - (a.size - 1) * (a.count - 1),
    );
  const selected: [string, MathExpr][] = [];
  const contains = (e: MathExpr, key: string): boolean =>
    JSON.stringify(e) === key ||
    children(e).some((child) => contains(child, key));
  for (const [key, entry] of candidates) {
    if (
      selected.some(
        ([other, tree]) =>
          contains(tree, key) || contains(entry.expression, other),
      )
    )
      continue;
    selected.push([key, entry.expression]);
    if (selected.length === 3) break;
  }
  const occupied = new Set<string>();
  function labels(e: MathExpr): void {
    if (e.kind === "symbol") occupied.add(e.label ?? e.name);
    if (e.kind === "aggregate") {
      occupied.add(e.displayIndex);
      labels(e.body);
    }
    children(e).forEach(labels);
  }
  labels(expression);
  let suffix = 1;
  const abbreviations = selected.map(([, tree]) => {
    while (occupied.has(`u_${suffix}`)) suffix++;
    return { name: `u_{${suffix++}}`, expression: tree };
  });
  const aliases = new Map(
    selected.map(([key], i) => [key, abbreviations[i].name]),
  );
  const result = abbreviations.length
    ? `\\begin{aligned}${signature} &= ${latex(expression, 0, aliases)}\\\\${abbreviations.map((def) => `${def.name} &= ${latex(def.expression)}`).join("\\\\")}\\end{aligned}`
    : `${signature} = ${latex(expression)}`;
  return { latex: result, abbreviations };
}

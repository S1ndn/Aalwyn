export type MathExpr =
  | { kind: "number"; value: string }
  | { kind: "symbol"; name: string; label?: string }
  | { kind: "add"; terms: MathExpr[] }
  | { kind: "multiply"; terms: MathExpr[] }
  | { kind: "power"; left: MathExpr; right: MathExpr }
  | { kind: "divide"; left: MathExpr; right: MathExpr }
  | { kind: "function"; name: string; args: MathExpr[]; sequence?: boolean }
  | {
      kind: "aggregate";
      operator: "sum" | "prod";
      index: string;
      displayIndex: string;
      lower: MathExpr;
      upper: MathExpr;
      body: MathExpr;
    };
export const num = (value: number | string): MathExpr => ({
  kind: "number",
  value: String(value),
});
export interface MathDefinition {
  params: string[];
  expression: MathExpr;
  sequence?: boolean;
  domain?: MathExpr;
}
export function binary(op: string, left: MathExpr, right: MathExpr): MathExpr {
  if (op === "%") return { kind: "function", name: "mod", args: [left, right] };
  if (op === "+" || op === "*")
    return { kind: op === "+" ? "add" : "multiply", terms: [left, right] };
  if (op === "-") return binary("+", left, binary("*", num(-1), right));
  return { kind: op === "/" ? "divide" : "power", left, right };
}

export interface Position {
  line: number;
  column: number;
}
export type Expr = (
  | { kind: "number"; value: string }
  | { kind: "name"; name: string }
  | { kind: "unary"; operand: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[]; indexed?: boolean }
  | { kind: "block"; init: Expr; statements: Statement[] }
  | {
      kind: "aggregate";
      operator: "sum" | "prod";
      index: string;
      lower: Expr;
      upper: Expr;
      init: Expr;
      statements: Statement[];
    }
) &
  Position;
export type Predicate =
  | { kind: "comparison"; op: string; left: Expr; right: Expr }
  | { kind: "truth"; value: Expr }
  | { kind: "logical"; op: "and" | "or"; left: Predicate; right: Predicate };
export type Statement = (
  | { kind: "define"; name: string; value: Expr }
  | {
      kind: "update";
      op: string;
      value: Expr;
      guard?: Predicate;
      otherwise?: Expr;
    }
  | { kind: "apply"; value: Expr }
) &
  Position;
export interface Declaration extends Position {
  name: string;
  helper: boolean;
  sequence?: boolean;
  recursive?: boolean;
  bases?: {index: Expr; value: Expr}[];
  params: string[];
  parameterTypes: Record<string, "real" | "int" | "natural">;
  constraints: Predicate[];
  constraintTexts: string[];
  init: Expr;
  statements: Statement[];
}
export interface Program {
  kind: "program";
  functions: Declaration[];
}

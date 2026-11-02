import type { Expr, Predicate, Position, Program, Statement } from "./ast";
import { AalwynError } from "./lexer";
import { builtinSpecs } from "./builtins";
export const builtins: Record<string, number> = Object.fromEntries(
  Object.entries(builtinSpecs).map(([name, spec]) => [name, spec.arity]),
);
export const constants = ["pi", "e", "phi"];
const reserved = new Set([
  ...Object.keys(builtins),
  ...constants,
  "init",
  "fn",
  "seq",
  "recursive",
  "case",
  "helper",
  "aux",
  "end",
  "define",
  "using",
  "apply",
  "me",
  "and",
  "or",
  "else",
  "sum",
  "prod",
  "to",
  "from",
  "int",
  "real",
  "natural",
]);
export function error(message: string, p: Position): never {
  throw new AalwynError(message, p.line, p.column);
}
export function validateName(name: string, p: Position): void {
  if (reserved.has(name)) error(`'${name}' is reserved.`, p);
}
export function validate(program: Program): void {
  function predicate(p: Predicate): void {
    if (p.kind === "truth") expression(p.value);
    else if (p.kind === "comparison") {
      expression(p.left);
      expression(p.right);
    } else {
      predicate(p.left);
      predicate(p.right);
    }
  }
  function expression(e: Expr): void {
    if (e.kind === "unary") expression(e.operand);
    else if (e.kind === "binary") {
      expression(e.left);
      expression(e.right);
    } else if (e.kind === "call") e.args.forEach(expression);
    else if (e.kind === "block") {
      expression(e.init);
      statements(e.statements, new Set());
    } else if (e.kind === "aggregate") {
      validateName(e.index, e);
      expression(e.lower);
      expression(e.upper);
      expression(e.init);
      statements(e.statements, new Set([e.index]));
    }
  }
  function statements(body: Statement[], locals: Set<string>): void {
    for (const s of body) {
      if (s.kind === "define") {
        validateName(s.name, s);
        if (locals.has(s.name))
          error(`Duplicate local definition '${s.name}'.`, s);
        locals.add(s.name);
        expression(s.value);
      } else if (s.kind === "update") {
        expression(s.value);
        if (s.guard) predicate(s.guard);
        if (s.otherwise) expression(s.otherwise);
      } else expression(s.value);
    }
  }
  const names = new Set<string>();
  for (const f of program.functions) {
    validateName(f.name, f);
    if (f.sequence && (f.params.length !== 1 || f.parameterTypes[f.params[0]] === "real"))
      error("A sequence requires exactly one integer or natural index.", f);
    const baseIndices = new Set<string>();
    for (const base of f.bases ?? []) {
      const literal = base.index.kind === "number" ? base.index.value
        : base.index.kind === "unary" && base.index.operand.kind === "number" ? "-" + base.index.operand.value : "";
      if (!/^-?\d+$/.test(literal)) error("Base case indices must be integer literals.", base.index);
      const key = String(BigInt(literal));
      if (baseIndices.has(key)) error(`Duplicate base case at index ${key}.`, base.index);
      if (f.parameterTypes[f.params[0]] === "natural" && BigInt(key) < 0n)
        error("A natural-indexed sequence cannot have a negative base case.", base.index);
      baseIndices.add(key);
      const selfReference = (value: unknown): boolean => {
        if (!value || typeof value !== "object") return false;
        const node = value as Record<string, unknown>;
        return (node.kind === "call" && node.name === f.name) || Object.values(node).some(selfReference);
      };
      if (selfReference(base.value)) error("A base case must give a value without referencing the sequence itself.", base.value);
      expression(base.value);
    }
    if (names.has(f.name)) error(`Duplicate function '${f.name}'.`, f);
    names.add(f.name);
    const locals = new Set<string>();
    for (const p of f.params) {
      validateName(p, f);
      if (locals.has(p)) error(`Duplicate parameter '${p}'.`, f);
      locals.add(p);
    }
    expression(f.init);
    f.constraints.forEach(predicate);
    statements(f.statements, locals);
  }
}

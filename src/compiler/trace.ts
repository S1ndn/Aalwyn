import type { Position, Statement } from "./ast";
import { compile } from "./compiler";
import { latex } from "./latex";
import { tokenize, AalwynError } from "./lexer";
import { lower } from "./lowering";
import type { MathExpr } from "./math-ir";
import { simplify } from "./simplify";

export interface TraceStep {
  kind: "start" | "define" | "update" | "apply" | "simplify";
  line: number;
  endLine: number;
  source: string;
  title: string;
  before: MathExpr;
  after: MathExpr;
  beforeLatex: string;
  afterLatex: string;
  definition?: { name: string; expression: MathExpr; latex: string };
}

/** Symbolic, top-level construction steps, lowered by the real compiler.
 * Aggregates and using blocks are completed symbolically, not numerically unrolled.
 */
export function trace(source: string, selected?: string) {
  source = source.replace(/\r\n?/g, "\n");
  const compiled = compile(source, selected);
  const program = compiled.ast;
  const owner = program.functions.find(f => f.name === compiled.name)!;
  if (owner.recursive)
    throw new AalwynError("Trace an ordinary function that calls the recursive sequence; recurrence-body tracing is not supported yet.", owner.line, owner.column);
  const lines = source.split("\n");
  const tokens = tokenize(source);
  const span = (position: Position) => {
    let index = tokens.findIndex(t => t.line === position.line && t.column === position.column);
    let endLine = position.line, depth = 0;
    for (let i = Math.max(0, index); i < tokens.length; i++) {
      const token = tokens[i];
      if (token.kind === "eof" || (token.kind === "newline" && depth === 0)) break;
      if (i > index && token.text === ">>" && depth === 0) break;
      if (token.text === "(" || token.text === "[") depth++;
      if (token.text === ")" || token.text === "]") depth--;
      endLine = token.line;
    }
    return {line: position.line, endLine, source: lines.slice(position.line - 1, endLine).join("\n")};
  };
  const lowerOwner = (statements: Statement[]) => lower({
    ...program,
    functions: program.functions.map(f => f === owner ? {...f, statements} : f),
  }, owner.name);
  const definitionValue = (statement: Extract<Statement, {kind: "define"}>, prefix: Statement[]) => {
    const definitions = prefix.filter(s => s.kind === "define");
    return simplify(lowerOwner([...definitions, {
      kind: "update", op: "=", value: {kind: "name", name: statement.name, line: statement.line, column: statement.column},
      line: statement.line, column: statement.column,
    }]));
  };
  const steps: TraceStep[] = [];
  let previous = lowerOwner([]);
  if (!owner.statements.length) {
    steps.push({kind: "start", ...span(owner.init), title: "Define the expression",
      before: previous, after: previous, beforeLatex: latex(previous), afterLatex: latex(previous)});
  }
  owner.statements.forEach((statement, index) => {
    const prefix = owner.statements.slice(0, index + 1);
    const after = lowerOwner(prefix);
    let title: string;
    const names: Record<string, string> = {"=": "Set the starting value", "+": "Add to the expression", "-": "Subtract from the expression", "*": "Multiply the expression", "/": "Divide the expression", "^": "Raise the expression to a power"};
    if (statement.kind === "define") title = `Define ${statement.name}`;
    else if (statement.kind === "apply") title = "Apply a transformation";
    else title = names[statement.op] + (statement.guard ? " conditionally" : "");
    const definition = statement.kind === "define" ? definitionValue(statement, prefix) : undefined;
    steps.push({
      kind: statement.kind === "update" && statement.op === "=" ? "start" : statement.kind,
      ...span(statement), title, before: previous, after,
      beforeLatex: latex(previous), afterLatex: latex(after),
      ...(statement.kind === "define" && definition ? {definition: {name: statement.name, expression: definition, latex: latex(definition)}} : {}),
    });
    previous = after;
  });
  const finalLatex = latex(compiled.simplified);
  if (latex(previous) !== finalLatex) {
    steps.push({kind: "simplify", line: owner.line, endLine: owner.line, source: "",
      title: "Simplify the completed expression", before: previous, after: compiled.simplified,
      beforeLatex: latex(previous), afterLatex: finalLatex});
  }
  return {
    version: 1, source, name: compiled.name, params: compiled.params,
    domainLatex: compiled.domainLatex, auxiliaryExports: compiled.auxiliaryExports,
    steps, finalLatex, latex: compiled.latex,
  };
}

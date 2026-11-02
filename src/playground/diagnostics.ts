import { normalizeSeparators } from "../compiler/lexer";
import type { Expr, Statement, Position } from "../compiler/ast";
import { lower, parse, AalwynError } from "../compiler/compiler";

export interface SourceProblem {
  from: number;
  to: number;
  line: number;
  column: number;
  message: string;
  category: "Syntax" | "Declaration" | "Warning";
  severity?: "error" | "warning";
  code?: "implicit-start" | "zero-update";
}

export function sourceProblem(
  source: string,
  error: AalwynError,
  category: SourceProblem["category"],
): SourceProblem {
  const lines = source.split("\n");
  const line = Math.min(Math.max(1, error.line), lines.length);
  const lineStart = lines
    .slice(0, line - 1)
    .reduce((n, s) => n + s.length + 1, 0);
  const from = Math.min(
    source.length,
    lineStart + Math.max(0, error.column - 1),
  );
  const token = /^[A-Za-z_][A-Za-z_0-9]*|^\S/.exec(source.slice(from));
  return {
    from,
    to: Math.min(source.length, from + (token?.[0].length ?? 0)),
    line,
    column: from - lineStart + 1,
    message: error.message,
    category,
  };
}

/** Recover by stubbing only the failed declaration. Other declarations retain
 * their signatures and source lines, avoiding phantom undefined-call errors.
 * An invalid signature cannot be safely recovered and stops this pass.
 */
export function diagnoseSource(source: string): SourceProblem[] {
  const normalized = normalizeSeparators(source);
  return diagnoseLines(normalized).map(problem => {
    const prefix = source.slice(0, problem.from);
    const line = prefix.split("\n").length;
    const column = problem.from - prefix.lastIndexOf("\n");
    return {...problem, line, column};
  });
}
function diagnoseLines(source: string): SourceProblem[] {
  if (!source.trim()) return [];
  const problems: SourceProblem[] = [];
  const lines = source.split("\n");
  const starts = lines.flatMap((line, i) =>
    /^\s*(?:(?:aux|helper|recursive)\s+)?(?:fn|seq)\s+[A-Za-z_][A-Za-z_0-9]*\s*\(/.test(line)
      ? [i]
      : [],
  );
  try {
    const original = parse(source);
    problems.push(...implicitZeroWarnings(source, original.functions));
  } catch { /* Recover syntax failures below before collecting valid blocks. */ }
  let working = source;
  const recovered = new Set<number>();
  for (let attempt = 0; attempt < 10; attempt++) {
    let category: SourceProblem["category"] = "Syntax";
    try {
      const program = parse(working);
      category = "Declaration";
      // Validate all bodies without building LaTeX, helper exports or graph
      // models on every typing pause.
      lower(program, program.functions.at(-1)!.name);
      const retainedFunctions = program.functions.filter(f => !recovered.has(f.line - 1));
      for (const warning of implicitZeroWarnings(source, retainedFunctions))
        if (!problems.some(p => p.from === warning.from && p.code === warning.code)) problems.push(warning);
      break;
    } catch (error) {
      if (!(error instanceof AalwynError)) throw error;
      if (
        !problems.some(
          (p) =>
            p.line === error.line &&
            p.column === error.column &&
            p.message === error.message,
        )
      )
        problems.push(sourceProblem(source, error, category));
      const start = starts.filter((i) => i < error.line).at(-1);
      if (start === undefined || recovered.has(start)) break;
      const end = starts.find((i) => i > start!) ?? lines.length;
      const header =
        /^(\s*(?:(?:aux|helper|recursive)\s+)?(?:fn|seq)\s+[A-Za-z_][A-Za-z_0-9]*\s*\(.*\))\s*(?:=>|=(?!=)|$)/.exec(
          lines[start],
        );
      if (!header) break;
      const stub = header[1].replace(/^(\s*)recursive\s+seq\b/, "$1seq") + " => 0";
      try {
        parse(stub);
      } catch {
        break;
      }
      const replacement = working.split("\n");
      replacement[start] = stub;
      for (let i = start + 1; i < end; i++) replacement[i] = "";
      working = replacement.join("\n");
      recovered.add(start);
    }
  }
  return problems.sort((a, b) => a.from - b.from);
}


function implicitZeroWarnings(source: string, functions: {init: Expr; statements: Statement[]; line: number; column: number}[]): SourceProblem[] {
  const warnings: SourceProblem[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    if (node.kind === "aggregate" || node.kind === "block") {
      visit(node.lower);
      visit(node.upper);
      block(value as Expr & {init: Expr; statements: Statement[]});
    }
    else Object.values(node).forEach(visit);
  }
  function block(node: {init: Expr; statements: Statement[]} & Position): void {
    const implicitStart = node.init.line === node.line && node.init.column === node.column
      && node.init.kind === "number";
    let implicitZero = implicitStart && node.init.kind === "number" && node.init.value === "0";
    const firstMutation = node.statements.find(statement => statement.kind !== "define");
    const bodyStart = firstMutation?.kind === "update" && firstMutation.op === "=";
    if (implicitStart && !bodyStart) {
      const warning = sourceProblem(source, new AalwynError(
        `No starting value was set using '='; assuming ${node.init.kind === "number" ? node.init.value : "0"}.`, node.line, node.column), "Warning");
      warnings.push({...warning, severity: "warning", code: "implicit-start"});
    }
    visit(node.init);
    for (const statement of node.statements) {
      if (implicitZero && statement.kind === "update" && ["*", "/"].includes(statement.op)) {
        const warning = sourceProblem(source, new AalwynError(
          `${statement.op}= leaves the implicit zero accumulator at zero when the operand is defined${statement.op === "/" ? " and nonzero" : ""}. Set a first '= value' or add a value before this update.`,
          statement.line, statement.column), "Warning");
        warnings.push({...warning, severity: "warning", code: "zero-update"});
      } else if (statement.kind !== "define") implicitZero = false;
      visit(statement);
    }
  }
  functions.forEach(block);
  return warnings;
}

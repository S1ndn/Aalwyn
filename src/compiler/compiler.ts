import { parse } from "./parser";
import { lower } from "./lowering";
import { simplify } from "./simplify";
import { identifier, latex } from "./latex";
import type { Declaration, Expr, Predicate } from "./ast";
import type { MathDefinition, MathExpr } from "./math-ir";
import { substitute } from "./domain";
import { compactLatex } from "./compact-latex";
export { parse, lower, simplify, latex };
export { evaluateMath, sampleMath, MathEvaluationError } from "./evaluate";
export { evaluateFunction, sampleFunction } from "./input-domain";
export { tokenize, AalwynError } from "./lexer";
export type { Program } from "./ast";
export type { MathExpr } from "./math-ir";
export function compile(source: string, selected?: string) {
  const ast = parse(source),
    name = selected ?? ast.functions.at(-1)!.name;
  const ir = lower(ast, name),
    simplified = simplify(ir),
    f = ast.functions.find((f) => f.name === name)!;
  const presentationExpression = f.recursive ? simplify(lower(ast, name, "recurrence")) : simplified;
  const expressionLatex = latex(presentationExpression);
  const domain = simplify(lower(ast, name, "domain"));
  const parameterTypes = f.parameterTypes;
  const sets = { real: "ℝ", int: "ℤ", natural: "ℕ₀" };
  const domainText =
    [
      ...f.params.map((p) => `${p} ∈ ${sets[parameterTypes[p]]}`),
      ...f.constraintTexts,
    ].join("; ") || "No parameters";
  const mathematicalSets = { real: "\\mathbb{R}", int: "\\mathbb{Z}", natural: "\\mathbb{N}_{0}" };
  function declarationDomainLatex(owner: Declaration): string {
    const constraintExpression = (value: Expr): string => latex(simplify(lower({
      ...ast,
      functions: ast.functions.map(declaration => declaration === owner
        ? { ...declaration, recursive: false, bases: undefined, constraints: [], constraintTexts: [], init: value, statements: [] }
        : declaration),
    }, owner.name)));
    const predicateLatex = (predicate: Predicate): string => {
      if (predicate.kind === "logical")
        return `\\left(${predicateLatex(predicate.left)} ${predicate.op === "and" ? "\\land" : "\\lor"} ${predicateLatex(predicate.right)}\\right)`;
      if (predicate.kind === "truth") return `${constraintExpression(predicate.value)} \\ne 0`;
      const comparisons: Record<string, string> = { "==": "=", "!=": "\\ne", ">=": "\\ge", "<=": "\\le", ">": ">", "<": "<" };
      return `${constraintExpression(predicate.left)} ${comparisons[predicate.op]} ${constraintExpression(predicate.right)}`;
    };
    return [
      ...owner.params.map(p => `${identifier(p)} \\in ${mathematicalSets[owner.parameterTypes[p]]}`),
      ...owner.constraints.map(predicateLatex),
    ].join(" \\land ");
  }
  const domainLatex = declarationDomainLatex(f);
  const withDomain = (formula: string, requirements = domainLatex) => requirements
    ? `\\begin{gathered}${formula}\\\\ \\text{for } ${requirements}\\end{gathered}`
    : formula;
  const signatureFor = (declaration: Declaration) => declaration.sequence
    ? `${identifier(declaration.name)}_{${declaration.params.map(identifier).join(", ")}}`
    : `${identifier(declaration.name)}\\left(${declaration.params.map(identifier).join(", ")}\\right)`;
  const signature = signatureFor(f);
  const compact = compactLatex(presentationExpression, signature);
  function recursiveLatex(owner: Declaration, formula: string): string {
    const requirements = declarationDomainLatex(owner);
    const cases = (owner.bases ?? []).map(base => {
      const literal = base.index.kind === "number" ? base.index.value
        : base.index.kind === "unary" && base.index.operand.kind === "number" ? "-" + base.index.operand.value : "0";
      const index = {kind: "number" as const, value: String(BigInt(literal))};
      const baseProgram = {...ast, functions: ast.functions.map(declaration => declaration === owner
        ? {...declaration, recursive: false, bases: undefined, init: base.value, statements: [], constraints: [], constraintTexts: []}
        : declaration)};
      const value = simplify(substitute(lower(baseProgram, owner.name), new Map([[owner.params[0], index]])));
      return {index, value, latex: `${identifier(owner.name)}_{${latex(index)}} = ${latex(value)}`};
    });
    const indices = cases.map(base => BigInt(base.index.value)).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
    const contiguousNaturals = owner.parameterTypes[owner.params[0]] === "natural" && indices.every((value,index) => value === BigInt(index));
    const exclusion = contiguousNaturals
      ? `${identifier(owner.params[0])} \\ge ${indices.length}`
      : `${identifier(owner.params[0])} \\notin \\left\\{${cases.map(base => latex(base.index)).join(", ")}\\right\\}`;
    return `\\begin{gathered}${withDomain(formula, [requirements, exclusion].filter(Boolean).join(" \\land "))}\\\\[0.5em]${cases.map(base => base.latex).join("\\qquad ")}\\end{gathered}`;
  }
  const helpers: Record<string, MathDefinition> = Object.fromEntries(
    ast.functions
      .filter((f) => f.helper)
      .map((f) => [
        f.name,
        {
          params: f.params,
          expression: simplify(lower(ast, f.name)),
          ...(f.sequence ? {sequence: true, domain: simplify(lower(ast, f.name, "domain"))} : {}),
        },
      ]),
  );
  const auxiliaryExports: {name: string; params: string[]; expressionLatex: string; domainLatex: string; latex: string}[] = [];
  const visited = new Set<string>([name]);
  function visitDependencies(expression: MathExpr): void {
    if (expression.kind === "function") {
      expression.args.forEach(visitDependencies);
      const declaration = ast.functions.find(f => f.helper && f.name === expression.name);
      if (declaration && !visited.has(declaration.name)) {
        visited.add(declaration.name);
        const body = helpers[declaration.name].expression;
        const requirements = lower(ast, declaration.name, "domain");
        visitDependencies(body);
        visitDependencies(requirements);
        const auxiliaryDomain = declarationDomainLatex(declaration);
        const auxiliarySignature = signatureFor(declaration);
        const expressionLatex = declaration.recursive ? latex(simplify(lower(ast, declaration.name, "recurrence"))) : latex(body);
        auxiliaryExports.push({name: declaration.name, params: declaration.params, expressionLatex, domainLatex: auxiliaryDomain,
          latex: declaration.recursive ? recursiveLatex(declaration, `${auxiliarySignature} = ${expressionLatex}`) : withDomain(`${auxiliarySignature} = ${expressionLatex}`, auxiliaryDomain)});
      }
    } else if (expression.kind === "add" || expression.kind === "multiply") expression.terms.forEach(visitDependencies);
    else if (expression.kind === "divide" || expression.kind === "power") {
      visitDependencies(expression.left); visitDependencies(expression.right);
    } else if (expression.kind === "aggregate") {
      visitDependencies(expression.lower); visitDependencies(expression.upper); visitDependencies(expression.body);
    }
  }
  visitDependencies(ir);
  visitDependencies(domain);
  const mainLatex = (formula: string) => f.recursive ? recursiveLatex(f, formula) : withDomain(formula);
  const bundle = (formula: string) => auxiliaryExports.length
    ? `\\begin{gathered}${[mainLatex(formula), ...auxiliaryExports.map(aux => aux.latex)].join("\\\\[1em]")}\\end{gathered}`
    : mainLatex(formula);
  return {
    ast,
    ir,
    simplified,
    name,
    params: f.params,
    parameterTypes,
    domain,
    domainText,
    domainLatex,
    expressionLatex,
    auxiliaryExports,
    compactLatex: bundle(compact.latex),
    abbreviations: compact.abbreviations,
    helpers,
    latex: bundle(`${signature} = ${expressionLatex}`),
  };
}

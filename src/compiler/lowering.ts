import type { Expr, Program, Position, Statement, Predicate } from "./ast";
import { binary, num, type MathExpr } from "./math-ir";
import { lowerDomainComparison, lowerPredicate } from "./predicates";
import { protectInactive, substitute, isTotal, knownNonzero } from "./domain";
import { guardFacts, type GuardFacts } from "./guard-facts";
import { mergeFacts, integerExpression, containsSymbol } from "./assumptions";
import { rational } from "./simplify";
import { simplify } from "./simplify";
import { builtins, constants, error, validate } from "./semantic";
export function lower(
  program: Program,
  selected: string,
  mode: "expression" | "domain" | "recurrence" = "expression",
): MathExpr {
  validate(program);
  const declarations = new Map(program.functions.map((f) => [f.name, f]));
  let bindingId = 0;
  // Validate through helper boundaries so opaque output cannot hide errors
  // or recursion. The final lowering pass retains helper calls instead.
  let validating = true;
  const checkedBodies = new Map<string, MathExpr>();
  const requirements: MathExpr[] = [];
  const collect = () => mode === "domain" && !validating;
  const all = (items: MathExpr[]): MathExpr => ({
    kind: "multiply",
    terms: [num(1), ...items],
  });
  const helperBody = (name: string, args: MathExpr[]): MathExpr | undefined => {
    const definition = declarations.get(name),
      body = checkedBodies.get(name);
    return definition && body && !definition.sequence
      ? substitute(
          body,
          new Map(definition.params.map((param, i) => [param, args[i]])),
        )
      : undefined;
  };
  function call(
    name: string,
    args: MathExpr[],
    stack: string[],
    pos: Position,
    expandBody = false,
    inheritedFacts: GuardFacts = new Map(),
    inheritedIntegers: ReadonlySet<string> = new Set(),
    callerSequence?: {name: string; index: MathExpr},
  ): MathExpr {
    const sourceCall = pos as Expr;
    if (sourceCall.kind === "call") {
      const indexed = Boolean(sourceCall.indexed);
      const sequence = Boolean(declarations.get(name)?.sequence);
      if (indexed && !sequence) error(`'${name}' is not a sequence; use function-call parentheses.`, pos);
      if (sequence && !indexed) error(`Sequence '${name}' uses bracket indexing: ${name}[index].`, pos);
    }
    if (Object.hasOwn(builtins, name)) {
      const n = builtins[name];
      if (n >= 0 ? args.length !== n : args.length < -n)
        error(
          `'${name}' expects ${n < 0 ? "at least " + -n : n} argument(s), received ${args.length}.`,
          pos,
        );
      if (
        ["floor", "ceil"].includes(name) &&
        integerExpression(args[0], inheritedIntegers)
      )
        return args[0];
      return { kind: "function", name, args };
    }
    const f = declarations.get(name);
    if (!f) return error(`Undefined function '${name}'.`, pos);
    if (args.length !== f.params.length)
      error(
        `'${name}' expects ${f.params.length} argument(s), received ${args.length}.`,
        pos,
      );
    if (stack.includes(name)) {
      if (f.sequence && !f.recursive && callerSequence?.name === name && stack.at(-1) === name) error("Self-references require 'recursive seq' and explicit base cases.", pos);
      if (!f.sequence || callerSequence?.name !== name || stack.at(-1) !== name)
        error(`Recursive function cycle: ${[...stack, name].join(" → ")}.`, pos);
      if (!integerExpression(simplify(args[0]), inheritedIntegers))
        error("A recursive sequence index must be provably integer. Use an integer expression such as n-1.", pos);
      const distance = rational(simplify(binary("-", callerSequence.index, args[0])));
      if (distance && (distance[1] !== 1n || distance[0] <= 0n))
        error("A recursive sequence lookup must use a strictly earlier integer index.", pos);
      return {kind: "function", name, args, sequence: true};
    }
    if (f.helper && !validating && !expandBody) {
      // Keep the value as a named call, but propagate its input requirements.
      if (collect())
        call(name, args, stack, pos, true, inheritedFacts, inheritedIntegers);
      return { kind: "function", name, args, ...(f.sequence ? {sequence: true} : {}) };
    }
    const next = [...stack, name],
      env = new Map(f.params.map((p, i) => [p, args[i]]));
    let assumptions = mergeFacts(inheritedFacts);
    let integers = new Set(inheritedIntegers);
    const sequenceContext = f.sequence ? {name: f.name, index: env.get(f.params[0])!} : undefined;
    function expr(e: Expr, me?: MathExpr, scope = env): MathExpr {
      switch (e.kind) {
        case "number":
          return num(e.value);
        case "name":
          if (e.name === "me")
            return me ?? error("'me' is only valid inside a >> expression.", e);
          return (
            scope.get(e.name) ??
            (constants.includes(e.name)
              ? { kind: "symbol", name: e.name }
              : error(
                  `Undefined name '${e.name}'. Definitions must refer to earlier values.`,
                  e,
                ))
          );
        case "unary":
          return binary("*", num(-1), expr(e.operand, me, scope));
        case "binary":
          return binary(
            e.op,
            expr(e.left, me, scope),
            expr(e.right, me, scope),
          );
        case "call":
          return call(
            e.name,
            e.args.map((a) => expr(a, me, scope)),
            next,
            e,
            false,
            assumptions,
            integers,
            sequenceContext,
          );
        case "block": {
          return statements(expr(e.init, undefined, scope), e.statements, new Map(scope));
        }
        case "aggregate": {
          const lower = expr(e.lower, me, scope),
            upper = expr(e.upper, me, scope);
          const occupied = new Set<string>();
          for (const value of scope.values()) freeLabels(value, occupied);
          let displayIndex = e.index,
            suffix = 1;
          while (occupied.has(displayIndex))
            displayIndex = `${e.index}_${suffix++}`;
          // Internal identities cannot be spelled by any source identifier.
          const index = `@index:${bindingId++}`,
            inner = new Map(scope);
          inner.set(e.index, {
            kind: "symbol",
            name: index,
            label: displayIndex,
          });
          const outerFacts = assumptions,
            outerIntegers = integers;
          integers = new Set(integers).add(JSON.stringify(inner.get(e.index)!));
          const requirementStart = requirements.length;
          const body = statements(
            expr(e.init, me, inner),
            e.statements,
            inner,
            me,
          );
          const bodyRequirements = requirements.splice(requirementStart);
          assumptions = outerFacts;
          integers = outerIntegers;
          if (bodyRequirements.length)
            requirements.push({
              kind: "aggregate",
              operator: "prod",
              index,
              displayIndex,
              lower,
              upper,
              body: all(bodyRequirements),
            });
          const aggregate: MathExpr = {
            kind: "aggregate",
            operator: e.operator,
            index,
            displayIndex,
            lower,
            upper,
            body,
          };
          // Pull a defined, nonzero, index-independent denominator outside a
          // sum. Preserve empty ranges and never hoist a partial denominator.
          const reduced = simplify(body);
          if (
            e.operator === "sum" &&
            reduced.kind === "divide" &&
            !containsSymbol(reduced.right, index) &&
            isTotal(reduced.right, helperBody, assumptions) &&
            knownNonzero(reduced.right, assumptions)
          )
            return binary(
              "/",
              { ...aggregate, body: reduced.left },
              reduced.right,
            );
          return aggregate;
        }
      }
    }
    function statements(
      seed: MathExpr,
      body: Statement[],
      scope: Map<string, MathExpr>,
      context?: MathExpr,
    ): MathExpr {
      let acc = seed;
      for (const s of body) {
        const resolve = (e: Expr) => expr(e, context, scope);
        if (s.kind === "define") scope.set(s.name, resolve(s.value));
        else if (s.kind === "apply") {
          if (countMe(s.value) === 0)
            error(
              "An explicit >> expression must reference 'me'. Use >> functionName for an implicit function call.",
              s,
            );
          acc = expr(s.value, acc, scope);
        } else {
          const requirementStart = requirements.length;
          let value = resolve(s.value);
          const valueRequirements = requirements.splice(requirementStart);
          const elseStart = requirements.length;
          let alternative = s.otherwise ? resolve(s.otherwise) : undefined;
          const elseRequirements = requirements.splice(elseStart);
          if (s.guard) {
            const resolved = new Map<Expr, MathExpr>();
            const resolveGuard = (e: Expr) => {
              if (!resolved.has(e)) resolved.set(e, resolve(e));
              return resolved.get(e)!;
            };
            const indicator = lowerPredicate(s.guard, resolveGuard);
            const complement = binary("-", num(1), indicator);
            const protect = (
              value: MathExpr,
              mask: MathExpr,
              facts = new Map(),
            ): MathExpr =>
              protectInactive(
                value,
                mask,
                helperBody,
                (name) =>
                  error(
                    `Cannot prove that aux '${name}' is defined on the inactive branch. Use an ordinary function here so its partial operations can be protected.`,
                    s,
                  ),
                facts,
                assumptions,
              );
            for (const [mask, branchRequirements] of [
              [indicator, valueRequirements],
              [complement, elseRequirements],
            ] as const)
              for (const requirement of branchRequirements) {
                const safe = protectInactive(
                  requirement,
                  mask,
                  helperBody,
                  (name) =>
                    error(`Cannot protect the domain of aux '${name}'.`, s),
                  new Map(),
                  assumptions,
                );
                requirements.push(
                  binary(
                    "+",
                    binary("-", num(1), mask),
                    binary("*", mask, safe),
                  ),
                );
              }
            value = protectInactive(
              value,
              indicator,
              helperBody,
              (name) =>
                error(
                  `Cannot prove that aux '${name}' is defined on the inactive branch. Use an ordinary function here so its partial operations can be protected.`,
                  s,
                ),
              guardFacts(s.guard, resolveGuard),
              assumptions,
            );
            if (alternative) {
              alternative = protect(alternative, complement);
              value = binary(
                "+",
                binary("*", indicator, value),
                binary("*", complement, alternative),
              );
            } else
              value = ["+", "-"].includes(s.op)
                ? binary("*", indicator, value)
                : binary(
                    "+",
                    num(1),
                    binary("*", indicator, binary("-", value, num(1))),
                  );
          } else requirements.push(...valueRequirements);
          acc = s.op === "=" ? value : binary(s.op, acc, value);
        }
      }
      return acc;
    }
    // Constraints are checked in the parameter scope, before any body locals.
    for (const p of f.params) {
      const value = env.get(p)!;
      const type = f.parameterTypes[p];
      if (type === "int" || type === "natural")
        integers.add(JSON.stringify(value));
      if (type === "natural")
        assumptions = mergeFacts(
          assumptions,
          new Map([[JSON.stringify(value), new Set(["nonnegative" as const])]]),
        );
      if (collect() && (type === "int" || type === "natural")) {
        requirements.push(
          lowerDomainComparison("==", value, {
            kind: "function",
            name: "floor",
            args: [value],
          }),
        );
        if (type === "natural")
          requirements.push(lowerDomainComparison(">=", value, num(0)));
      }
    }
    for (const condition of f.constraints) {
      const resolved = new Map<Expr, MathExpr>();
      const resolve = (e: Expr) => {
        if (!resolved.has(e)) resolved.set(e, expr(e));
        return resolved.get(e)!;
      };
      const requirement = lowerPredicate(
        condition,
        resolve,
        lowerDomainComparison,
      );
      if (collect()) requirements.push(requirement);
      assumptions = mergeFacts(assumptions, guardFacts(condition, resolve));
    }
    if (f.recursive && f.bases?.length && (mode !== "recurrence" || f.name !== selected)) {
      let definition: Expr = {kind: "block", init: f.init, statements: f.statements, line: f.line, column: f.column};
      for (const base of [...f.bases].reverse()) {
        definition = {kind: "block", init: {kind: "number", value: "0", line: f.line, column: f.column},
          statements: [{kind: "update", op: "=", value: base.value,
            guard: {kind: "comparison", op: "==", left: {kind: "name", name: f.params[0], line: f.line, column: f.column}, right: base.index},
            otherwise: definition, line: base.value.line, column: base.value.column}], line: f.line, column: f.column};
      }
      return expr(definition);
    }
    return statements(expr(f.init), f.statements, env);
  }
  // Validate every declaration, including unused functions, before returning the selection.
  for (const f of program.functions)
    checkedBodies.set(
      f.name,
      call(
        f.name,
        f.params.map((name) => ({ kind: "symbol", name })),
        [],
        f,
      ),
    );
  validating = false;
  const f = declarations.get(selected);
  if (!f)
    return error(`Unknown selected function '${selected}'.`, {
      line: 1,
      column: 1,
    });
  const result = call(
    selected,
    f.params.map((name) => ({ kind: "symbol", name })),
    [],
    f,
    true,
  );
  return mode === "domain" ? all(requirements) : result;
}
function countMe(e: Expr): number {
  switch (e.kind) {
    case "name":
      return Number(e.name === "me");
    case "number":
      return 0;
    case "unary":
      return countMe(e.operand);
    case "binary":
      return countMe(e.left) + countMe(e.right);
    case "call":
      return e.args.reduce((n, a) => n + countMe(a), 0);
    case "block":
    case "aggregate":
      return (
        (e.kind === "aggregate" ? countMe(e.lower) + countMe(e.upper) : 0) +
        countMe(e.init) +
        e.statements.reduce(
          (n, s) =>
            n +
            (s.kind === "define"
              ? countMe(s.value)
              : s.kind === "update"
                ? countMe(s.value) +
                  (s.guard ? predicateMe(s.guard) : 0) +
                  (s.otherwise ? countMe(s.otherwise) : 0)
                : 0),
          0,
        )
      );
  }
}
function predicateMe(p: Predicate): number {
  return p.kind === "truth"
    ? countMe(p.value)
    : p.kind === "comparison"
      ? countMe(p.left) + countMe(p.right)
      : predicateMe(p.left) + predicateMe(p.right);
}
function freeLabels(
  e: MathExpr,
  names: Set<string>,
  bound = new Set<string>(),
): void {
  switch (e.kind) {
    case "number":
      return;
    case "symbol":
      if (!bound.has(e.name)) names.add(e.label ?? e.name);
      return;
    case "add":
    case "multiply":
      e.terms.forEach((t) => freeLabels(t, names, bound));
      return;
    case "divide":
    case "power":
      freeLabels(e.left, names, bound);
      freeLabels(e.right, names, bound);
      return;
    case "function":
      e.args.forEach((a) => freeLabels(a, names, bound));
      return;
    case "aggregate":
      freeLabels(e.lower, names, bound);
      freeLabels(e.upper, names, bound);
      freeLabels(e.body, names, new Set([...bound, e.index]));
      return;
  }
}

import type { Expr, Predicate, Program, Statement } from "./ast";
import { AalwynError, tokenize, type Token } from "./lexer";
export function parse(source: string, legacy = false): Program {
  const ts = tokenize(source);
  let i = 0;
  const peek = () => ts[i];
  const fail = (message: string): never => {
    throw new AalwynError(message, peek().line, peek().column);
  };
  const take = (text?: string): Token => {
    if (peek().kind === "eof")
      fail(`Unexpected end of source${text ? `; expected '${text}'` : ""}.`);
    if (text !== undefined && peek().text !== text)
      fail(`Expected '${text}', found '${peek().text || "end of source"}'.`);
    return ts[i++];
  };
  const name = () => {
    if (peek().kind !== "identifier") fail("Expected an identifier.");
    return take();
  };
  function expression(min = 0, aggregateInit = false): Expr {
    const t = take();
    let left: Expr;
    if (t.kind === "number")
      left = { kind: "number", value: t.text, line: t.line, column: t.column };
    else if (t.text === "-")
      left = {
        kind: "unary",
        operand: expression(25, aggregateInit),
        line: t.line,
        column: t.column,
      };
    else if (t.text === "(") {
      left = expression(0, aggregateInit);
      take(")");
    } else if (t.text === "sum" || t.text === "prod") {
      const index = name();
      if (legacy && peek().text === "=") take("=");
      else take("from");
      const lower = expression();
      take("to");
      const upper = expression(0, true);
      let init: Expr = {
        kind: "number",
        value: t.text === "prod" ? "1" : "0",
        line: t.line,
        column: t.column,
      };
      if (peek().text === "init") {
        if (!legacy)
          fail(
            "Sums and products choose their identity automatically; remove 'init' or add a first update inside the body.",
          );
        take();
        init = expression(0, true);
      }
      take("(");
      skip();
      const statements: Statement[] = [];
      while (peek().text !== ")") {
        if (peek().kind === "eof" || peek().text === "end")
          fail(`Missing ')' for ${t.text} aggregation.`);
        if (peek().text === "=" && statements.some(statement => statement.kind !== "define"))
          fail("'=' is allowed only as the first statement that mutates a block.");
        const parsed = statement();
        statements.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        eol(")");
        skip();
      }
      take(")");
      left = {
        kind: "aggregate",
        operator: t.text,
        index: index.text,
        lower,
        upper,
        init,
        statements,
        line: t.line,
        column: t.column,
      };
    } else if (t.kind === "identifier") {
      const bodyOpening =
        aggregateInit &&
        peek().text === "(" &&
        (ts[i + 1].kind === "newline" ||
          (ts[i + 1].text === ")" &&
            !["(", "+", "-", "*", "/", "%", "^"].includes(ts[i + 2].text)) ||
          ["=", "+=", "-=", "*=", "/=", "^=", "define", "apply", ">>"].includes(
            ts[i + 1].text,
          ));
      if ((peek().text === "(" && !bodyOpening) || peek().text === "[") {
        const indexed = take().text === "[";
        const args = argumentsList(indexed ? "]" : ")");
        left = {
          kind: "call",
          name: t.text,
          args,
          ...(indexed ? {indexed: true} : {}),
          line: t.line,
          column: t.column,
        };
      } else
        left = { kind: "name", name: t.text, line: t.line, column: t.column };
    } else return fail("Expected a mathematical expression.");
    while (true) {
      if (peek().text === "!" && 40 >= min) {
        const operator = take("!");
        left = {
          kind: "call",
          name: "factorial",
          args: [left],
          line: operator.line,
          column: operator.column,
        };
        if (peek().text === "!")
          fail(
            "Double factorial '!!' is not supported. Use (x!)! for repeated factorial.",
          );
        continue;
      }
      const op = peek().text,
        precedence = new Map([
          ["+", 10],
          ["-", 10],
          ["*", 20],
          ["/", 20],
          ["%", 20],
          ["^", 30],
        ]).get(op);
      if (precedence === undefined || precedence < min) break;
      take();
      left = {
        kind: "binary",
        op,
        left,
        right: expression(precedence + (op === "^" ? 0 : 1), aggregateInit),
        line: t.line,
        column: t.column,
      };
    }
    return left;
  }
  function argumentsList(closing = ")"): Expr[] {
    const args: Expr[] = [];
    if (peek().text !== closing) {
      do {
        args.push(expression());
        if (peek().text !== ",") break;
        take(",");
      } while (true);
    }
    take(closing);
    return args;
  }
  function clause(): Predicate {
    take("(");
    const left = expression();
    let p: Predicate = { kind: "truth", value: left };
    if (["==", "!=", ">", "<", ">=", "<="].includes(peek().text)) {
      const op = take().text;
      p = { kind: "comparison", op, left, right: expression() };
    }
    take(")");
    return p;
  }
  function guard(): Predicate {
    let p = clause();
    while (peek().text === "and" || peek().text === "or") {
      const op = take().text as "and" | "or";
      p = { kind: "logical", op, left: p, right: clause() };
    }
    return p;
  }
  // Colon constraints accept comparisons and grouped logical conditions.
  // Try arithmetic parentheses first, then predicate parentheses.
  function constraintAtom(allowTruth = false): Predicate {
    const start = i;
    try {
      const left = expression();
      if (!["==", "!=", ">", "<", ">=", "<="].includes(peek().text)) {
        if (allowTruth) return { kind: "truth", value: left };
        fail("Expected a comparison in the parameter constraint.");
      }
      const op = take().text;
      return { kind: "comparison", op, left, right: expression() };
    } catch (e) {
      i = start;
      if (peek().text !== "(") throw e;
      take("(");
      const result = constraint(allowTruth);
      take(")");
      return result;
    }
  }
  function constraintAnd(allowTruth = false): Predicate {
    let result = constraintAtom(allowTruth);
    while (peek().text === "and") {
      take();
      result = {
        kind: "logical",
        op: "and",
        left: result,
        right: constraintAtom(allowTruth),
      };
    }
    return result;
  }
  function constraint(allowTruth = false): Predicate {
    let result = constraintAnd(allowTruth);
    while (peek().text === "or") {
      take();
      result = {
        kind: "logical",
        op: "or",
        left: result,
        right: constraintAnd(allowTruth),
      };
    }
    return result;
  }
  const eol = (terminator?: string) => {
    if (terminator && peek().text === terminator) return;
    if (peek().kind !== "newline" && peek().kind !== "eof")
      fail("Expected end of line or ';' between instructions.");
    if (peek().kind === "newline") take();
  };
  const skip = () => {
    while (peek().kind === "newline") take();
  };
  function statement(): Statement | Statement[] {
    const s = take();
    if (s.text === "define") {
      const n = name();
      let value: Expr;
      if (peek().text === "using") {
        const opening = take("using");
        take("(");
        skip();
        const body: Statement[] = [];
        while (peek().text !== ")") {
          if (peek().kind === "eof" || peek().text === "end") fail("Missing ')' for definition using block.");
          if (peek().text === "=" && body.some(statement => statement.kind !== "define"))
            fail("'=' is allowed only as the first statement that mutates a block.");
          const parsed = statement();
          body.push(...(Array.isArray(parsed) ? parsed : [parsed]));
          eol(")");
          skip();
        }
        take(")");
        value = {kind: "block", init: {kind: "number", value: "0", line: opening.line, column: opening.column}, statements: body, line: opening.line, column: opening.column};
      } else value = expression();
      return {
        kind: "define",
        name: n.text,
        value,
        line: n.line,
        column: n.column,
      };
    }
    if (["=", "+=", "-=", "*=", "/=", "^="].includes(s.text)) {
      const value = expression();
      let condition: Predicate | undefined;
      let otherwise: Expr | undefined;
      if (peek().text === "?") {
        take();
        if (!legacy) {
          condition = constraint(true);
          if (peek().text === "else") {
            take();
            otherwise = expression();
          }
        } else {
          let previousGuard = false;
          const start = i;
          try {
            condition = guard();
            previousGuard = true;
          } catch {
            i = start;
          }
          if (!previousGuard) {
            take("(");
            condition = constraint(true);
            if (peek().text === "else") {
              take();
              otherwise = expression();
            }
            take(")");
          }
          if (peek().text === "else") {
            take();
            otherwise = expression();
          }
        }
      }
      if (s.text === "=" && condition && !otherwise)
        fail("A conditional starting assignment requires 'else' with an alternative value.");
      return {
        kind: "update",
        op: s.text[0],
        value,
        guard: condition,
        otherwise,
        line: s.line,
        column: s.column,
      };
    }
    if (s.text === ">>" || (legacy && s.text === "apply")) {
      let value: Expr;
      if (legacy && peek().text === "raise" && ts[i + 1].text !== "(") {
        take();
        const base = expression();
        value = {
          kind: "binary",
          op: "^",
          left: base,
          right: { kind: "name", name: "me", line: s.line, column: s.column },
          line: s.line,
          column: s.column,
        };
      } else value = expression();
      return applyChain(value);
    }

    if (s.text === "apply") fail("The apply instruction is now written '>>'.");
    if (s.kind === "identifier" || s.text === "(" || s.text === "-") {
      i--;
      const value = expression();
      if (peek().text === ">>") return applyChain(value);
    }
    return fail(`Unknown instruction '${s.text}'.`);
  }
  function applyChain(value: Expr): Statement[] {
    const stages = [value];
    const oldComposition = legacy && peek().text === "&";
    const separator = oldComposition ? "&" : ">>";
    while (peek().text === separator) {
      take(separator);
      stages.push(expression());
    }
    if (peek().text === "&") fail("Composition now uses '>>', evaluated left to right; replace '&' and reverse the former stages.");
    if (oldComposition) stages.reverse();
    return stages.map((stage): Statement => ({
        kind: "apply",
        value: stage.kind === "name" && stage.name !== "me"
          ? {
              kind: "call", name: stage.name,
              args: [{ kind: "name", name: "me", line: stage.line, column: stage.column }],
              line: stage.line, column: stage.column,
            }
          : stage,
        line: stage.line,
        column: stage.column,
      }));
  }
  const functions: Program["functions"] = [];
  skip();
  while (peek().kind !== "eof") {
    let helper = peek().text === "aux" || peek().text === "helper";
    if (helper) take();
    const recursive = peek().text === "recursive";
    if (recursive) take("recursive");
    const sequence = peek().text === "seq";
    if (recursive && !sequence) fail("'recursive' is a sequence modifier; use 'recursive seq'.");
    if (sequence) {
      if (helper) fail("Sequences are already kept as named indexed values; do not mark a seq as aux.");
      take("seq"); helper = true;
    }
    else if (peek().text === "fn") take("fn");
    else if (!legacy) fail("Begin each function declaration with 'fn', placing modifiers before it (for example, 'aux fn').");
    if (legacy && !helper && ["aux", "helper"].includes(peek().text)) {
      helper = true;
      take();
    }
    if (!legacy && ["aux", "helper"].includes(peek().text))
      fail("Place declaration modifiers before 'fn'; use 'aux fn'.");
    const t = name();
    take("(");
    const params: string[] = [];
    const parameterTypes: Program["functions"][number]["parameterTypes"] = {};
    const constraints: Predicate[] = [],
      constraintTexts: string[] = [];
    if (peek().text !== ")") {
      do {
        let type: "real" | "int" | "natural" = sequence ? "int" : "real";
        if (["real", "int", "natural"].includes(peek().text))
          type = take().text as typeof type;
        const parameter = name();
        params.push(parameter.text);
        Object.defineProperty(parameterTypes, parameter.text, {
          value: type,
          enumerable: true,
          configurable: true,
        });
        if (peek().text === "?" || (legacy && peek().text === ":")) {
          take();
          const start = i;
          constraints.push(constraint());
          constraintTexts.push(
            ts
              .slice(start, i)
              .map((t) => t.text)
              .join(" "),
          );
        }
        if (peek().text !== ",") break;
        take(",");
      } while (true);
    }
    take(")");
    const statements: Statement[] = [];
    const bases: {index: Expr; value: Expr}[] = [];
    let init: Expr;
    if (peek().text === "=>") {
      take();
      init = expression();
      eol();
    } else {
      init = { kind: "number", value: "0", line: t.line, column: t.column };
      const headerStart = peek().text === "=" || peek().text === "init";
      if (peek().text === "=") {
        const parsed = statement();
        statements.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } else if (peek().text === "init") {
        if (!legacy)
          fail(
            "Blocks start at zero by default; write '= value' after the function signature to choose a start value.",
          );
        take("init");
        init = expression();
      }
      eol();
      skip();
      let bodyStarted = false;
      while (peek().text !== "end") {
        if ((peek().text === "case" || (legacy && peek().text === "base"))) {
          if (!recursive) fail("Base cases require a 'recursive seq' declaration.");
          if (bodyStarted) fail("Declare base cases before the recurrence body.");
          take();
          const index = expression();
          take("=");
          const value = expression();
          bases.push({index, value});
          eol(); skip(); continue;
        }
        bodyStarted = true;
        if (peek().kind === "eof") fail(`Missing 'end' for ${t.text}.`);
        if (peek().text === "=" && (headerStart || statements.some(statement => statement.kind !== "define")))
          fail("'=' is allowed only as the first statement that mutates a block.");
        const parsed = statement();
        statements.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        eol();
        skip();
      }
      take("end");
      eol();
    }
    if (recursive && !bases.length) fail("A recursive sequence requires at least one explicit 'case index = value' case.");
    functions.push({
      name: t.text,
      helper,
      ...(sequence ? {sequence: true} : {}),
      ...(recursive ? {recursive: true, bases} : {}),
      params,
      parameterTypes,
      constraints,
      constraintTexts,
      init,
      statements,
      line: t.line,
      column: t.column,
    });
    skip();
  }
  if (!functions.length) fail("Declare at least one function.");
  return { kind: "program", functions };
}

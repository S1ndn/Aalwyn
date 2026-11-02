import { parse } from "./parser";
import type { Expr, Predicate, Statement } from "./ast";

/** Upgrade old saved files, never reinterpret an incomplete/invalid program.
 * Arbitrary old aggregate seeds become the first update from the identity.
 */
export function migrateLegacySource(source: string): string {
  // The previous introducer used the same zero-start semantics. Replace only
  // declaration headers and validate before upgrading, preserving source layout.
  const renamed = source.replace(/^(\s*)let(?=\s+(?:(?:aux|helper)\s+)?[A-Za-z_][A-Za-z_0-9]*\s*\()/gm, "$1fn").replace(/^(\s*)fn[ \t]+(aux|helper)(?=[ \t]+[A-Za-z_][A-Za-z_0-9]*\s*\()/gm, "$1$2 fn").split("\n").map(line => {
    const comment = line.indexOf("//");
    const code = comment < 0 ? line : line.slice(0, comment);
    return code.replace(/\b(sum|prod)[ \t]+([A-Za-z_][A-Za-z_0-9]*)[ \t]*=[ \t]*/g, "$1 $2 from ")
      + (comment < 0 ? "" : line.slice(comment));
  }).join("\n");
  if (renamed !== source) {
    try {
      parse(renamed);
      return migrateLegacySource(renamed);
    } catch {
      // Earlier grammars still need the full legacy migration below.
    }
  }
  let program;
  try {
    program = parse(source);
    // A removed builtin call is syntactically a normal call. Upgrade it unless
    // the program deliberately declares its own function with that name.
    if (
      !/\braise\s*\(/.test(source) ||
      program.functions.some((f) => f.name === "raise")
    )
      return source;
  } catch {
    try {
      program = parse(source, true);
    } catch {
      return source;
    }
  }
  const pad = (n: number) => "    ".repeat(n);
  const predicate = (p: Predicate): string =>
    p.kind === "comparison"
      ? `${expression(p.left)} ${p.op} ${expression(p.right)}`
      : p.kind === "truth"
        ? expression(p.value)
        : `(${predicate(p.left)}) ${p.op} (${predicate(p.right)})`;
  function expression(e: Expr, depth = 0): string {
    switch (e.kind) {
      case "number":
        return e.value;
      case "name":
        return e.name;
      case "unary":
        return `(-(${expression(e.operand, depth)}))`;
      case "binary":
        return `(${expression(e.left, depth)} ${e.op} ${expression(e.right, depth)})`;
      case "call":
        return e.name === "raise" && e.args.length === 2
          ? `(${expression(e.args[0], depth)} ^ ${expression(e.args[1], depth)})`
          : `${e.name}${e.indexed ? "[" : "("}${e.args.map((a) => expression(a, depth)).join(", ")}${e.indexed ? "]" : ")"}`;
      case "block":
        return `using (\n${e.statements.map(s => statement(s, depth + 1)).join("\n")}\n${pad(depth)})`;
      case "aggregate": {
        const identity = e.operator === "prod" ? "1" : "0";
        const seed =
          e.init.kind === "number" && e.init.value === identity
            ? []
            : [`${pad(depth + 1)}= ${expression(e.init, depth + 1)}`];
        return `${e.operator} ${e.index} from ${expression(e.lower, depth)} to ${expression(e.upper, depth)} (\n${[...seed, ...e.statements.map((s) => statement(s, depth + 1))].join("\n")}\n${pad(depth)})`;
      }
    }
  }
  function statement(s: Statement, depth: number): string {
    let result =
      s.kind === "define"
        ? `define ${s.name} ${expression(s.value, depth)}`
        : s.kind === "apply"
          ? `>> ${expression(s.value, depth)}`
          : `${s.op === "=" ? "=" : s.op + "="} ${expression(s.value, depth)}${s.guard ? ` ? (${predicate(s.guard)})${s.otherwise ? ` else ${expression(s.otherwise, depth)}` : ""}` : ""}`;
    return pad(depth) + result;
  }
  const comments = source
    .split(/\r?\n/)
    .flatMap((line) =>
      line.includes("//") ? [line.slice(line.indexOf("//"))] : [],
    );
  const result =
    [
      ...comments,
      ...program.functions.map((f) => {
        const params = f.params
          .map(
            (p, i) =>
              `${f.parameterTypes[p]} ${p}${i === f.params.length - 1 && f.constraints.length ? ` ? ${f.constraints.map((c) => (f.constraints.length === 1 ? predicate(c) : `(${predicate(c)})`)).join(" and ")}` : ""}`,
          )
          .join(", ");
        const header = `${f.sequence ? (f.recursive ? "recursive seq" : "seq") : (f.helper ? "aux fn" : "fn")} ${f.name}(${params})`;
        const seed =
          f.init.kind === "number" && f.init.value === "0"
            ? []
            : [`    += ${expression(f.init, 1)}`];
        return f.statements.length || f.bases?.length
          ? `${header}\n${[...(f.bases ?? []).map(base => `    case ${expression(base.index)} = ${expression(base.value)}`), ...seed, ...f.statements.map((s) => statement(s, 1))].join("\n")}\nend`
          : `${header} => ${expression(f.init)}`;
      }),
    ].join("\n\n") + "\n";
  try {
    parse(result);
    return result;
  } catch {
    return source;
  }
}

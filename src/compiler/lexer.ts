import type { Position } from "./ast";
export interface Token extends Position {
  text: string;
  kind: "number" | "identifier" | "symbol" | "newline" | "eof";
}
export class AalwynError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(message);
    this.name = "AalwynError";
  }
}
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0,
    line = 1,
    column = 1;
  while (i < source.length) {
    const rest = source.slice(i),
      ch = source[i];
    if (ch === "\r" || ch === " " || ch === "\t") {
      i++;
      column++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ text: "\n", kind: "newline", line, column });
      i++;
      column++;
      continue;
    }
    if (ch === "\n") {
      tokens.push({ text: "\n", kind: "newline", line, column });
      i++;
      line++;
      column = 1;
      continue;
    }
    if (rest.startsWith("//")) {
      const length = rest.search(/[\r\n]/);
      const count = length < 0 ? rest.length : length;
      i += count;
      column += count;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    const ident = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    const symbol =
      /^(?:>>|=>|\+=|-=|\*=|\/=|\^=|==|!=|>=|<=|[\[\]&!:=+\-*/%^(),?<>])/.exec(rest);
    const match = number ?? ident ?? symbol;
    if (!match)
      throw new AalwynError(`Unexpected character '${ch}'.`, line, column);
    tokens.push({
      text: match[0],
      kind: number ? "number" : ident ? "identifier" : "symbol",
      line,
      column,
    });
    i += match[0].length;
    column += match[0].length;
  }
  tokens.push({ text: "", kind: "eof", line, column });
  return tokens;
}


/** Replace explicit separators without changing offsets or touching comments. */
export function normalizeSeparators(source: string): string {
  return source.split("\n").map(line => {
    const comment = line.indexOf("//");
    const code = comment < 0 ? line : line.slice(0, comment);
    return code.replaceAll(";", "\n") + (comment < 0 ? "" : line.slice(comment));
  }).join("\n");
}

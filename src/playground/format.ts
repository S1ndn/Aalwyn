import { normalizeSeparators } from "../compiler/lexer";
import { parse } from "../compiler/parser";
import { migrateLegacySource } from "../compiler/migrate";

export function lineTokens(line: string): string[] {
  return (
    line
      .split("//", 1)[0]
      .match(
        /[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|>>|=>|\+=|-=|\*=|\/=|\^=|==|!=|>=|<=|\S/g,
      ) ?? []
  );
}

function declarationBlock(tokens: string[]): boolean {
  return (["fn", "seq"].includes(tokens[0]) || (["aux", "helper"].includes(tokens[0]) && tokens[1] === "fn") || (tokens[0] === "recursive" && tokens[1] === "seq")) && !tokens.includes("=>");
}

/** Tolerant structural indentation also works while a document is incomplete. */
function indentationLevels(source: string): number[] {
  const levels: number[] = [];
  let level = 0;
  const lines = source.split("\n");
  for (const line of lines) {
    const fragments = normalizeSeparators(line).split("\n");
    fragments.forEach((fragment, index) => {
      const tokens = lineTokens(fragment);
      let closing = 0;
      while (tokens[closing] === ")") closing++;
      if (tokens[0] === "end") closing++;
      if (index === 0) levels.push(Math.max(0, level - closing) * 4);
      level += Number(declarationBlock(tokens)) - Number(tokens[0] === "end");
      level += tokens.filter(t => t === "(").length - tokens.filter(t => t === ")").length;
      level = Math.max(0, level);
    });
  }
  return levels;
}

export function lineIndentation(source: string, target: number): number {
  return indentationLevels(source)[target] ?? 0;
}

function formatCode(tokens: string[]): string {
  let result = "";
  const binary = new Set([
    "+",
    "-",
    "*",
    "/",
    "%",
    "^",
    "=",
    "==",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "+=",
    "-=",
    "*=",
    "/=",
    "^=",
    "=>",
    "?",
    ">>",
    "else",
    "and",
    "or",
  ]);
  let unary = false;
  tokens.forEach((token, i) => {
    const previous = tokens[i - 1];
    const minus =
      token === "-" &&
      (i === 0 ||
        binary.has(previous) ||
        ["(", ",", ":", "init", "define", "to", "raise"].includes(previous));
    if (token === ",") result = result.trimEnd() + ", ";
    else if (token === ":") result = result.trimEnd() + " : ";
    else if (token === ")" || token === "]" || token === "!") result = result.trimEnd() + token;
    else if (token === "(") {
      const call =
        previous &&
        /^[A-Za-z_]/.test(previous) &&
        !["init", "to", "from", "using", "and", "or", "else"].includes(previous);
      const body =
        i === tokens.length - 1 &&
        tokens.some((t) => t === "sum" || t === "prod");
      result = result.trimEnd() + (result && (!call || body) ? " " : "") + "(";
    } else if (token === "[") result = result.trimEnd() + "[";
    else if (minus) result += "-";
    else if (binary.has(token)) result = result.trimEnd() + " " + token + " ";
    else {
      if (result && !/[\s(\[]$/.test(result) && !unary) result += " ";
      result += token;
    }
    unary = minus;
  });
  return result.trim();
}

function semantic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantic);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["line", "column"].includes(k))
        .map(([k, v]) => [k, semantic(v)]),
    );
  return value;
}

/** Preserve comments and verify the parsed meaning before replacing text. */
export function formatAalwyn(source: string): string {
  source = migrateLegacySource(source);
  const before = parse(source);
  const lines = normalizeSeparators(source).replace(/\r\n?/g, "\n").split("\n");
  const levels = indentationLevels(lines.join("\n"));
  const formatted =
    lines
      .map((line, i) => {
        const at = line.indexOf("//");
        const code = formatCode(lineTokens(line));
        const comment = at < 0 ? "" : line.slice(at).trimEnd();
        if (!code && !comment) return "";
        return (
          " ".repeat(levels[i]) + code + (code && comment ? "  " : "") + comment
        );
      })
      .join("\n")
      .trimEnd() + "\n";
  if (
    JSON.stringify(semantic(before)) !==
    JSON.stringify(semantic(parse(formatted)))
  )
    throw new Error(
      "Formatting would change the program; the original text has been kept.",
    );
  return formatted;
}

export function foldingRanges(source: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [],
    parens: { offset: number; line: number }[] = [];
  let offset = 0,
    block: { offset: number; line: number } | undefined;
  source.split("\n").forEach((line, lineNumber) => {
    const code = line.split("//", 1)[0];
    const tokens = lineTokens(code);
    if (declarationBlock(tokens))
      block = { offset: offset + line.length, line: lineNumber };
    if (tokens[0] === "end" && block) {
      if (lineNumber > block.line)
        ranges.push({ from: block.offset, to: offset });
      block = undefined;
    }
    for (let i = 0; i < code.length; i++) {
      if (code[i] === "(")
        parens.push({ offset: offset + i + 1, line: lineNumber });
      if (code[i] === ")") {
        const open = parens.pop();
        if (open && open.line < lineNumber)
          ranges.push({ from: open.offset, to: offset + i });
      }
    }
    offset += line.length + 1;
  });
  return ranges;
}

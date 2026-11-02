import { builtins, constants } from "../compiler/semantic";

export interface HighlightToken {
  text: string;
  style?: string;
}
const keywords = new Set([
  "helper",
  "aux",
  "fn",
  "seq",
  "recursive",
  "case",
  "end",
  "define",
  "using",
  "else",
  "and",
  "or",
  "sum",
  "prod",
  "to",
  "from",
  "int",
  "real",
  "natural",
]);

/** Tolerant lexical coloring: incomplete/invalid code remains editable.
 * Return text segments, never source-derived HTML.
 */
export function highlight(source: string): HighlightToken[] {
  const pattern =
    /\/\/[^\r\n]*|[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|>>|=>|\+=|-=|\*=|\/=|\^=|==|!=|>=|<=|[!=+\-*/%^?<>]|\s+|./g;
  return Array.from(source.matchAll(pattern), (match) => {
    const text = match[0];
    let style: string | undefined;
    if (text.startsWith("//")) style = "comment";
    else if ((text === ">>" || text === "=" || text === "?")) style = "apply";
    else if (["+=", "-=", "*=", "/=", "^="].includes(text)) style = "mutator";
    else if (keywords.has(text)) style = "keyword";
    else if (text === "me") style = "context";
    else if (constants.includes(text)) style = "constant";
    else if (Object.hasOwn(builtins, text)) style = "builtin";
    else if (
      /^[A-Za-z_]/.test(text) &&
      /^\s*[\[(]/.test(source.slice(match.index! + text.length))
    )
      style = "function";
    else if (/^(?:\d|\.\d)/.test(text)) style = "number";
    else if (/^[+\-*/%^?=<>!;]/.test(text)) style = "operator";
    return { text, style };
  });
}

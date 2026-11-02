import { describe, expect, it } from "vitest";
import { highlight } from "../src/playground/highlight";

describe("syntax highlighting", () => {
  it("distinguishes mutators from arithmetic, comparison and comment tokens", () => {
    const source = "+= -= *= /= ^= + - * / ^ == != >= <= => // += ignored\n";
    const tokens = highlight(source);
    expect(
      tokens.filter((t) => t.style === "mutator").map((t) => t.text),
    ).toEqual(["+=", "-=", "*=", "/=", "^="]);
    expect(tokens.find((t) => t.text === "// += ignored")?.style).toBe(
      "comment",
    );
    expect(tokens.map((t) => t.text).join("")).toBe(source);
    for (const text of ["+", "-", "*", "/", "^", "==", "!=", ">=", "<=", "=>"])
      expect(tokens.find((t) => t.text === text)?.style).toBe("operator");
  });
  it("colors complete keyword tokens without coloring identifier prefixes", () => {
    const tokens = highlight(
      "fn end define else and or initialize defined me meter",
    );
    expect(
      tokens.filter((t) => t.style === "keyword").map((t) => t.text),
    ).toEqual(["fn", "end", "define", "else", "and", "or"]);
    expect(tokens.find((t) => t.text === "me")?.style).toBe("context");
    for (const name of ["initialize", "defined", "meter"])
      expect(tokens.find((t) => t.text === name)?.style).toBeUndefined();
  });
  it("recognizes builtin calls, constants, function names and scientific literals", () => {
    const tokens = highlight("f(x) => sqrt(x) + pi + 1.25e-3");
    for (const [text, style] of [
      ["f", "function"],
      ["sqrt", "builtin"],
      ["pi", "constant"],
      ["1.25e-3", "number"],
      ["=>", "operator"],
    ])
      expect(tokens.find((t) => t.text === text)?.style).toBe(style);
  });
  it("preserves all text, including incomplete expressions and markup", () => {
    for (const source of [
      "f(x) init x\n\t+= .5\nend\n",
      "f(x) => sqrt(",
      "<img src=x onerror=alert(1)>\r\n",
      "@🙂",
    ]) {
      expect(
        highlight(source)
          .map((t) => t.text)
          .join(""),
      ).toBe(source);
    }
  });
});

import { describe, expect, it } from "vitest";
import { compile, parse } from "./legacy-fixtures";
import { highlight } from "../src/playground/highlight";
import katex from "katex";

describe("aux declarations", () => {
  it("records the modifier on direct and block declarations", () => {
    const ast = parse(
      "aux h(x) => x+1\naux g(x) init x\n += 1\nend\nf(x) => x",
    );
    expect(ast.functions.map((f) => f.helper)).toEqual([true, true, false]);
  });
  it("retains named aux calls while ordinary functions inline", () => {
    const result = compile(
      "aux square(x) => x^2\nnormal(x) => x+1\nf(x) => square(normal(x))",
    );
    expect(result.simplified).toEqual({
      kind: "function",
      name: "square",
      args: [
        {
          kind: "add",
          terms: [
            { kind: "number", value: "1" },
            { kind: "symbol", name: "x" },
          ],
        },
      ],
    });
    expect(result.expressionLatex).toBe(
      "\\operatorname{square}\\left(1 + x\\right)",
    );
    expect(() =>
      katex.renderToString(result.latex, { throwOnError: true }),
    ).not.toThrow();
  });
  it("supports forward references and block helpers", () => {
    const result = compile("f(x) => h(x)\naux h(x) init x\n += 2\nend", "f");
    expect(result.simplified).toEqual({
      kind: "function",
      name: "h",
      args: [{ kind: "symbol", name: "x" }],
    });
  });
  it("selecting a aux compiles its body and preserves nested helpers", () => {
    expect(compile("aux h(x) => x^2", "h").expressionLatex).toBe("x^{2}");
    expect(
      compile("aux h(x) => g(x)\naux g(x) => x^2", "h").expressionLatex,
    ).toBe("g\\left(x\\right)");
  });
  it("supports implicit and explicit apply", () => {
    expect(
      compile("aux h(x) => x^2\nf(x) init x\n apply h\nend").expressionLatex,
    ).toBe("h\\left(x\\right)");
    expect(
      compile("aux h(a,b) => a+b\nf(x) init x\n apply h(me,2+3)\nend")
        .expressionLatex,
    ).toBe("h\\left(x, 5\\right)");
  });
  it("preserves helpers through ordinary wrapper expansion", () => {
    expect(
      compile("aux h(x) => x^2\nwrap(x) => h(x)\nf(x) => wrap(x)")
        .expressionLatex,
    ).toBe("h\\left(x\\right)");
  });
  it("preserves calls in guards without introducing predicate nodes", () => {
    const result = compile(
      "aux h(x) => x^2\nf(x) init 0\n += h(x) ? (h(x)>0)\nend",
    );
    expect(JSON.stringify(result.simplified)).toContain('"name":"h"');
    expect(JSON.stringify(result.simplified)).not.toContain(
      '"kind":"indicator"',
    );
  });
  const invalid = [
    ["aux h(x) => missing(x)\nf(x) => x", "Undefined function"],
    ["aux h(x) => y\nf(x) => h(x)", "Undefined name"],
    ["aux h(x) => x\nf(x) => h(x,2)", "expects"],
    ["aux h(x) => x\nf(x) init x\n apply h(me,2)\nend", "expects"],
    ["aux h(x) => h(x)", "Recursive"],
    ["aux h(x) => g(x)\naux g(x) => h(x)", "Recursive"],
    ["aux h(x) => g(x)\ng(x) => h(x)", "Recursive"],
    ["aux h(x) => x\nh(x) => x", "Duplicate function"],
    ["f(aux) => aux", "reserved"],
    ["f(x) init x\n define aux 1\nend", "reserved"],
    ["aux aux f(x) => x", "Expected '('"],
  ];
  for (const [source, message] of invalid)
    it(`rejects ${source.replaceAll("\n", " / ")}`, () => {
      expect(() => compile(source)).toThrow(message);
    });
  it("highlights aux as a keyword", () => {
    expect(highlight("aux f(x) => x")[0]).toEqual({
      text: "aux",
      style: "keyword",
    });
    expect(highlight("auxValue")[0].style).toBeUndefined();
  });
});

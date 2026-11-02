import { describe, expect, it } from "vitest";
import { compile } from "./legacy-fixtures";
import { examples } from "../src/playground/examples";
import {
  formatAalwyn,
  foldingRanges,
  lineIndentation,
} from "../src/playground/format";
import { diagnoseSource as currentDiagnoseSource } from "../src/playground/diagnostics";
import {
  closeDocument,
  fileName,
  initialWorkspace,
  newDocument,
  reopenDocument,
  restoreWorkspace,
} from "../src/playground/documents";

describe("Aalwyn document formatting", () => {
  for (const [name, source] of Object.entries(examples))
    it(`preserves ${name}, its comments and mathematical result`, () => {
      const formatted = formatAalwyn(source);
      expect(formatAalwyn(formatted)).toBe(formatted);
      expect(compile(formatted).simplified).toEqual(compile(source).simplified);
      expect(compile(formatted).domain).toEqual(compile(source).domain);
      for (const comment of source.match(/\/\/[^\r\n]*/g) ?? [])
        expect(formatted).toContain(comment.trimEnd());
    });
  it("formats nested aggregates, unary operators, postfix factorial and comments without changing meaning", () => {
    const source =
      "// keep this\r\nfn f(int n?n>0)\r\n+=sum i from 1 to n (\r\n+=sum j from 1 to i (\r\n+=(-j+1)! // keep this too\r\n)\r\n)\r\nend";
    const formatted = formatAalwyn(source);
    expect(formatted).toContain("        += sum j");
    expect(formatted).toContain("            += (-j + 1)!  // keep this too");
    expect(formatted).not.toContain("\r");
    expect(compile(formatted).simplified).toEqual(compile(source).simplified);
  });
  it("refuses invalid source and preserves arithmetic grouping", () => {
    expect(() => formatAalwyn("f(x) => (x+")).toThrow();
    for (const expression of [
      "x- -x",
      "-(x+1)",
      "x^(-2)",
      "(x!)!",
      "1e-12+x",
      "x/(x+1)",
    ]) {
      const source = `f(x) => ${expression}`;
      expect(compile(formatAalwyn(source)).simplified).toEqual(
        compile(source).simplified,
      );
    }
  });
  it("computes folding and indentation without treating comments as code", () => {
    const source =
      "fn f(n)\n    // ( init end\n    += sum i from 1 to n init 0 (\n        += i\n    )\nend";
    expect([0, 1, 2, 3, 4, 5].map((i) => lineIndentation(source, i))).toEqual([
      0, 4, 4, 8, 4, 0,
    ]);
    expect(foldingRanges(source)).toHaveLength(2);
    expect(lineIndentation("fn f(x)\n", 1)).toBe(4);
    expect(lineIndentation("fn f(x) => x\n", 1)).toBe(0);
  });
});

const diagnoseSource = (source: string) =>
  currentDiagnoseSource(
    source
      .replace(/(^|\n)(?=(?:aux\s+)?[A-Za-z_]\w*\()/g, "$1fn ")
      .replace(/ init 0(?=\n)/g, ""),
  );

describe("inline diagnostics and recovery", () => {
  it("reports errors from independent declarations without introducing undefined references", () => {
    const source =
      "fn f(x)\n += missing\nend\n\nfn g(x)\n += other\nend\n\nfn h(x) => f(x)+g(x)";
    const problems = diagnoseSource(source).filter(p => p.severity !== "warning");
    expect(problems).toHaveLength(2);
    expect(problems.map((p) => p.line)).toEqual([2, 6]);
    expect(problems.map((p) => source.slice(p.from, p.to))).toEqual([
      "missing",
      "other",
    ]);
    expect(problems.every((p) => p.category === "Declaration")).toBe(true);
  });
  it("recovers independent syntax failures while retaining source locations", () => {
    const problems = diagnoseSource(
      "f(x) init 0\n += (x+\nend\n\ng(x) => unknown(x)",
    );
    expect(problems).toHaveLength(2);
    expect(problems[0].category).toBe("Syntax");
    expect(problems[1].line).toBe(5);
    expect(problems[1].message).toContain("unknown");
  });
  it("handles incomplete signatures and empty documents without looping", () => {
    expect(diagnoseSource("f(x")).toHaveLength(1);
    expect(diagnoseSource("")).toEqual([]);
    expect(diagnoseSource("f(x)=>x")).toEqual([]);
    expect(diagnoseSource("f(x)=>x\ng(x)=>f(x,1)")[0].message).toContain(
      "expects 1",
    );
  });
});

describe("saved workspace documents", () => {
  it("round trips source, export markers, active tab, selected function, position and settings", () => {
    const workspace = initialWorkspace("f(x) => x");
    const document = newDocument("my function", "g(x)=>x+1", true);
    Object.assign(document, {
      selectedFunction: "g",
      anchor: 2,
      head: 3,
      scrollTop: 100,
    });
    workspace.documents.push(document);
    workspace.activeId = document.id;
    workspace.settings.fontSize = 16;
    workspace.settings.wrap = true;
    expect(
      restoreWorkspace(JSON.stringify(workspace), initialWorkspace("fallback")),
    ).toEqual(workspace);
  });
  it("keeps closed unsaved documents recoverable, including the final tab", () => {
    const workspace = initialWorkspace("work in progress");
    const document = workspace.documents[0];
    closeDocument(workspace, document.id);
    expect(workspace.documents).toHaveLength(1);
    expect(workspace.documents[0].source).toBe("");
    expect(reopenDocument(workspace)).toEqual(document);
    expect(workspace.activeId).toBe(document.id);
    expect(workspace.documents.find((d) => d.id === document.id)?.source).toBe(
      "work in progress",
    );
  });
  it("falls back safely for damaged storage and invalid cursor positions", () => {
    const fallback = initialWorkspace("fallback");
    for (const serialized of [
      "broken",
      "null",
      "{}",
      JSON.stringify({ ...fallback, activeId: "missing" }),
      JSON.stringify({
        ...fallback,
        documents: [{ ...fallback.documents[0], head: 99999 }],
      }),
    ])
      expect(restoreWorkspace(serialized, fallback)).toBe(fallback);
    const copy = JSON.parse(JSON.stringify(fallback));
    copy.settings = {
      fontSize: 99,
      wrap: "true",
      compileKey: "bad",
      formatKey: "bad",
    };
    expect(restoreWorkspace(JSON.stringify(copy), fallback).settings).toEqual({
      fontSize: 13,
      wrap: false,
      compileKey: "Mod-Enter",
      formatKey: "Mod-Shift-f",
    });
  });
  it("normalizes safe file names and limits the recoverable closed-tab history", () => {
    expect(fileName("  a/b:c  ")).toBe("a_b_c.aal");
    expect(fileName("demo.AAL")).toBe("demo.AAL");
    const workspace = initialWorkspace("");
    for (let i = 0; i < 15; i++) closeDocument(workspace, workspace.activeId);
    expect(workspace.closed).toHaveLength(10);
  });
});

import { expect, it } from "vitest";
import { indentationEdit } from "../src/playground/indentation";

function apply(source: string, start: number, end = start, unindent = false) {
  const edit = indentationEdit(source, start, end, unindent);
  return {
    source: source.slice(0, edit.start) + edit.text + source.slice(edit.end),
    start: edit.selectionStart,
    end: edit.selectionEnd,
  };
}
it("inserts exactly four spaces at the caret, including empty source and before a newline", () => {
  expect(apply("", 0)).toEqual({ source: "    ", start: 4, end: 4 });
  expect(apply("+= x", 2)).toEqual({ source: "+=     x", start: 6, end: 6 });
  expect(apply("\nend", 0)).toEqual({ source: "    \nend", start: 4, end: 4 });
});
it("indents selected lines without changing their selected text or the following unselected line", () => {
  const source = "f(x) init 0\n+= x\n-= 1\nend";
  const start = source.indexOf("+="),
    end = source.indexOf("end");
  const result = apply(source, start, end);
  expect(result.source).toBe("f(x) init 0\n    += x\n    -= 1\nend");
  expect(result.start).toBe(start + 4);
  expect(result.end).toBe(end + 8);
  expect(apply(result.source, result.start, result.end, true)).toEqual({
    source,
    start,
    end,
  });
});
it("unindents up to four spaces or one literal tab, without deleting code", () => {
  expect(apply("  += x", 1, 1, true)).toEqual({
    source: "+= x",
    start: 0,
    end: 0,
  });
  expect(apply("\t+= x", 3, 3, true)).toEqual({
    source: "+= x",
    start: 2,
    end: 2,
  });
  expect(apply("+= x", 2, 2, true)).toEqual({
    source: "+= x",
    start: 2,
    end: 2,
  });
});
it("preserves CRLF line endings and blank lines in a selected block", () => {
  const source = "a\r\n\r\nb";
  const result = apply(source, 0, source.length);
  expect(result.source).toBe("    a\r\n    \r\n    b");
  expect(apply(result.source, result.start, result.end, true).source).toBe(
    source,
  );
});
it("handles selections in a single line and a final empty line", () => {
  expect(apply("abc", 1, 2)).toEqual({ source: "    abc", start: 5, end: 6 });
  expect(apply("\n", 1, 1, true)).toEqual({ source: "\n", start: 1, end: 1 });
  expect(apply("\n", 0, 0, true)).toEqual({ source: "\n", start: 0, end: 0 });
});

const indent = "    ";

/** Compute one editor replacement, preserving selected text and line endings. */
export function indentationEdit(
  source: string,
  start: number,
  end: number,
  unindent = false,
) {
  if (!unindent && start === end)
    return {
      start,
      end,
      text: indent,
      selectionStart: start + 4,
      selectionEnd: start + 4,
    };
  const first = start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;
  // A selection ending at the next line's start does not include that line.
  const last = end > start && source[end - 1] === "\n" ? end - 1 : end;
  const newline = source.indexOf("\n", last);
  const limit = newline < 0 ? source.length : newline;
  let offset = first,
    selectionStart = start,
    selectionEnd = end;
  const lines = source.slice(first, limit).split("\n");
  const text = lines
    .map((line) => {
      const removed = unindent
        ? (/^(?: {1,4}|\t)/.exec(line)?.[0].length ?? 0)
        : 0;
      const added = unindent ? "" : indent;
      const map = (position: number) =>
        position < offset
          ? 0
          : added.length - Math.min(removed, position - offset);
      selectionStart += map(start);
      selectionEnd += map(end);
      offset += line.length + 1;
      return added + line.slice(removed);
    })
    .join("\n");
  return { start: first, end: limit, text, selectionStart, selectionEnd };
}

export function installIndentation(editor: HTMLTextAreaElement): void {
  editor.addEventListener("keydown", (event) => {
    // An open completion menu gets first choice of unmodified Tab.
    if (
      event.defaultPrevented ||
      event.key !== "Tab" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const edit = indentationEdit(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
      event.shiftKey,
    );
    if (editor.value.slice(edit.start, edit.end) === edit.text) return;
    const direction = editor.selectionDirection;
    const top = editor.scrollTop,
      left = editor.scrollLeft;
    editor.setSelectionRange(edit.start, edit.end);
    // Native insertion keeps the browser's undo history. Fall back for hosts
    // that do not implement textarea insertText.
    if (!document.execCommand("insertText", false, edit.text)) {
      editor.setRangeText(edit.text, edit.start, edit.end, "end");
    }
    editor.setSelectionRange(edit.selectionStart, edit.selectionEnd, direction);
    editor.scrollTop = top;
    editor.scrollLeft = left;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("scroll"));
  });
}

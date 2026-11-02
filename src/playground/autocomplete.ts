export interface Completion {
  kind: "sum" | "prod";
  start: number;
  end: number;
}

export function completionAt(
  source: string,
  caret: number,
  force = false,
): Completion[] {
  const lineStart = source.lastIndexOf("\n", caret - 1) + 1,
    line = source.slice(lineStart, caret);
  if (line.includes("//")) return [];
  const match = /[A-Za-z_][A-Za-z_0-9]*$/.exec(line),
    prefix = match?.[0] ?? "";
  if (!prefix && !force) return [];
  return (["sum", "prod"] as const)
    .filter((kind) => kind.startsWith(prefix))
    .map((kind) => ({ kind, start: caret - prefix.length, end: caret }));
}

export function aggregationSnippet(
  source: string,
  completion: Completion,
): { text: string; selection: number } {
  const lineStart = source.lastIndexOf("\n", completion.start - 1) + 1,
    indent = /^[ \t]*/.exec(source.slice(lineStart))![0];
  const names = new Set(source.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []);
  let index = "i",
    suffix = 1;
  for (const candidate of ["i", "j", "k"])
    if (!names.has(candidate)) {
      index = candidate;
      break;
    }
  while (names.has(index)) index = `i${suffix++}`;
  const text = `${completion.kind} ${index} from 1 to 10 (\n${indent}    = ${index}\n${indent})`;
  return { text, selection: text.indexOf("1 to") };
}

export function installAutocomplete(editor: HTMLTextAreaElement): void {
  const menu = document.createElement("div");
  menu.className = "completion-menu";
  menu.id = "aggregation-completion";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Aggregation suggestions");
  menu.hidden = true;
  editor.parentElement!.append(menu);
  editor.setAttribute("aria-autocomplete", "list");
  editor.setAttribute("aria-controls", menu.id);
  let matches: Completion[] = [],
    selected = 0;
  function close() {
    matches = [];
    menu.hidden = true;
    editor.removeAttribute("aria-activedescendant");
    editor.setAttribute("aria-expanded", "false");
  }
  function accept() {
    const completion = matches[selected];
    if (!completion) return;
    const snippet = aggregationSnippet(editor.value, completion);
    editor.setRangeText(snippet.text, completion.start, completion.end, "end");
    const position = completion.start + snippet.selection;
    close();
    editor.focus();
    editor.setSelectionRange(position, position + 1);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function render() {
    menu.replaceChildren();
    matches.forEach((match, i) => {
      const option = document.createElement("div");
      option.id = `aggregation-option-${i}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(i === selected));
      const title = document.createElement("strong");
      title.textContent = match.kind;
      const hint = document.createElement("span");
      hint.textContent =
        match.kind === "sum"
          ? "Sum over an integer range"
          : "Product over an integer range";
      option.append(title, hint);
      option.onmousedown = (event) => {
        event.preventDefault();
        selected = i;
        accept();
      };
      menu.append(option);
    });
    const style = getComputedStyle(editor),
      lineHeight = parseFloat(style.lineHeight),
      padding = parseFloat(style.paddingLeft),
      fontSize = parseFloat(style.fontSize);
    const before = editor.value.slice(0, editor.selectionStart),
      lines = before.split("\n"),
      column = lines.at(-1)!.replaceAll("\t", "    ").length;
    menu.style.left = `${Math.max(0, Math.min(editor.clientWidth - 260, padding + column * fontSize * 0.61 - editor.scrollLeft))}px`;
    menu.style.top = `${Math.max(0, Math.min(editor.clientHeight - 90, parseFloat(style.paddingTop) + lines.length * lineHeight - editor.scrollTop))}px`;
    menu.hidden = false;
    editor.setAttribute("aria-expanded", "true");
    editor.setAttribute(
      "aria-activedescendant",
      `aggregation-option-${selected}`,
    );
  }
  function update(force = false) {
    if (editor.selectionStart !== editor.selectionEnd) {
      close();
      return;
    }
    matches = completionAt(editor.value, editor.selectionStart, force);
    selected = 0;
    if (matches.length) render();
    else close();
  }
  editor.addEventListener("input", () => update());
  editor.addEventListener("click", () => update());
  editor.addEventListener("blur", close);
  editor.addEventListener("scroll", close);
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      update(true);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || !matches.length)
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
        matches.length;
      render();
    } else if (event.key === "Tab" && event.shiftKey) {
      close();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      accept();
    } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      close();
  });
}

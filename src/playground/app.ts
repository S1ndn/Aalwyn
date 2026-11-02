import katex from "katex";
import "katex/dist/katex.min.css";
import "./styles.css";
import { compile, parse, AalwynError } from "../compiler/compiler";
import { createEditor } from "./editor";
import { createFunctionInput } from "./function-input";
import { createGraph } from "./graph";
import { formatAalwyn } from "./format";
import { diagnoseSource, type SourceProblem } from "./diagnostics";
import {
  closeDocument,
  fileName,
  initialWorkspace,
  newDocument,
  reopenDocument,
  restoreWorkspace,
  workspaceKey,
  type SourceDocument,
} from "./documents";
import { examples } from "./examples";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a class="brand" href="./">Aalwyn</a><span class="tag">Mathematical IDE</span><span class="header-note">One expression · No piecewise definitions</span></header>
<main><div class="workspace">
<section class="source" aria-label="Source workspace">
  <div class="panel-title"><h1>Workspace</h1><label>Examples <select id="example" aria-label="Example program"><option value="">Open example…</option></select></label></div>
  <div id="tabs" class="document-tabs" role="tablist" aria-label="Open documents"></div>
  <div class="file-tools"><button id="new" class="quiet">New</button><button id="open" class="quiet">Open</button><button id="export" class="quiet" title="Export .aal (Ctrl+S)">Export .aal</button><button id="format" class="quiet">Format</button><button id="reset-warning-suppression" title="Show ignored warnings again">Reset ignored warnings</button><button id="reopen" class="quiet" title="Reopen the last closed tab">Reopen tab</button>
    <details id="settings"><summary>Editor settings</summary><div class="settings-body"><label>Font size <select id="font-size" aria-label="Editor font size"></select></label><label><input id="wrap" type="checkbox" aria-label="Wrap long lines"> Wrap long lines</label><label>Compile shortcut <select id="compile-key" aria-label="Compile shortcut"><option value="Mod-Enter">Ctrl / Cmd + Enter</option><option value="F5">F5</option></select></label><label>Format shortcut <select id="format-key" aria-label="Format shortcut"><option value="Mod-Shift-f">Ctrl / Cmd + Shift + F</option><option value="Alt-Shift-f">Alt + Shift + F</option></select></label><p>Tab: four spaces · Shift+Tab: unindent<br>Ctrl/Cmd+F: search and replace<br>Ctrl/Cmd+Space: sum/product snippets<br>Esc, then Tab: leave the editor</p></div></details>
  </div>
  <div class="document-name"><label>Document <input id="document-name" aria-label="Document name" spellcheck="false"></label><span id="export-status"></span></div>
  <div id="editor" class="editor" role="tabpanel" aria-label="Active source document"></div>
  <details id="problems" class="problems" open hidden><summary id="problem-count">Errors</summary><div id="problem-list" role="list" aria-label="Errors"></div></details>
  <details id="warnings" class="problems warnings" open hidden><summary id="warning-count">Warnings</summary><div id="warning-list" role="list" aria-label="Warnings"></div></details>
  <div class="toolbar"><div><span id="save-status" role="status">Saved locally</span><span id="cursor">Ln 1, Col 1</span></div><button id="compile">Compile</button></div>
</section>
<section class="result" aria-label="Compiled result">
  <div class="panel-title"><h2>Result</h2><label>Function <select id="function" aria-label="Selected function"></select></label></div>
  <div id="status" role="status">Compile a function to begin.</div>
  <div class="formula-heading"><h3>Mathematical function</h3><label><input id="compact" type="checkbox" checked> Compact</label><button id="copy-latex" class="quiet" disabled>Copy LaTeX</button></div>
  <div id="math" aria-label="Compiled mathematical expression"><p class="empty-result">Your compiled function will appear here.</p></div>
  <div class="domain-panel"><h3>Input domain</h3><p id="domain-text" aria-label="Declared input domain">Compile to inspect accepted inputs.</p><p id="domain-note"></p></div>
  <div id="function-input" hidden></div><div id="graph" hidden></div>
  <details class="latex-export"><summary>LaTeX for export</summary><pre id="latex"></pre></details>
  <details class="developer-tools"><summary>Developer tools</summary><p>Compiler structures for debugging.</p><details><summary>Source AST</summary><pre id="ast"></pre></details><details><summary>Mathematical IR</summary><pre id="ir"></pre></details><details><summary>Simplified expression</summary><pre id="simplified"></pre></details></details>
</section></div><footer><span>Documents autosave in this browser · Export .aal for a file copy</span><span>Aalwyn 0.1</span></footer></main>
<input id="file-input" type="file" accept=".aal,text/plain" multiple hidden>`;

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const selection = element<HTMLSelectElement>("function"),
  status = element<HTMLDivElement>("status"),
  compact = element<HTMLInputElement>("compact"),
  nameInput = element<HTMLInputElement>("document-name"),
  saveStatus = element<HTMLSpanElement>("save-status"),
  graphHost = element<HTMLDivElement>("graph");
const graph = createGraph(graphHost),
  functionInput = createFunctionInput(element("function-input"));
let storageFailed = false,
  recoveryWarning = "";
const fallback = initialWorkspace(examples.Arithmetic);
let workspace = fallback;
try {
  const saved = localStorage.getItem(workspaceKey);
  workspace = restoreWorkspace(saved, fallback);
  if (saved && workspace === fallback) {
    localStorage.setItem(workspaceKey + ".recovery", saved);
    recoveryWarning =
      "Previous workspace could not be restored; its data was kept for recovery.";
  }
} catch {
  storageFailed = true;
}
const active = () =>
  workspace.documents.find((d) => d.id === workspace.activeId)!;
let current: ReturnType<typeof compile> | undefined,
  diagnosticTimer = 0,
  saveTimer = 0;
let problems: SourceProblem[] = [];

function persist() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    storageFailed = false;
    saveStatus.className = "";
    saveStatus.textContent = recoveryWarning || "Saved locally";
  } catch {
    storageFailed = true;
    saveStatus.className = "error";
    saveStatus.textContent =
      "Autosave unavailable · Export .aal to keep your work";
  }
}
function scheduleSave() {
  saveStatus.textContent = "Saving locally…";
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 250);
}
function updateTabs() {
  const tabs = element("tabs");
  tabs.replaceChildren();
  for (const document of workspace.documents) {
    const wrapper = documentNode("div", "document-tab"),
      tab = documentNode("button");
    tab.id = "tab-" + document.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute(
      "aria-selected",
      String(document.id === workspace.activeId),
    );
    tab.setAttribute("aria-controls", "editor");
    tab.tabIndex = document.id === workspace.activeId ? 0 : -1;
    tab.textContent =
      document.name + (document.source !== document.exportedSource ? " •" : "");
    tab.title =
      document.name +
      (document.source !== document.exportedSource
        ? " · Changes since last import/export"
        : "");
    tab.onclick = () => showDocument(document.id);
    tab.ondblclick = () => {
      nameInput.focus();
      nameInput.select();
    };
    tab.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const index = workspace.documents.indexOf(document);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? workspace.documents.length - 1
            : (index +
                (event.key === "ArrowRight" ? 1 : -1) +
                workspace.documents.length) %
              workspace.documents.length;
      showDocument(workspace.documents[next].id);
      element("tab-" + workspace.activeId).focus();
    };
    const close = documentNode("button", "close-tab");
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${document.name}`);
    close.onclick = () => {
      closeDocument(workspace, document.id);
      showDocument(workspace.activeId);
    };
    wrapper.append(tab, close);
    tabs.append(wrapper);
  }
  element<HTMLButtonElement>("reopen").disabled = !workspace.closed.length;
  element("editor").setAttribute(
    "aria-labelledby",
    "tab-" + workspace.activeId,
  );
  nameInput.value = active().name;
  element("export-status").textContent =
    active().source !== active().exportedSource
      ? "Changes since import/export"
      : "Matches imported/exported copy";
}
function documentNode<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
function clearResult(message = "Source changed · Compile to update") {
  current = undefined;
  graph.clear();
  graphHost.hidden = true;
  functionInput.clear();
  element("math").replaceChildren();
  const empty = documentNode("p", "empty-result");
  empty.textContent = "Compile to see the current function.";
  element("math").append(empty);
  element("domain-text").textContent = "Compile to inspect accepted inputs.";
  element("domain-note").textContent = "";
  for (const key of ["latex", "ast", "ir", "simplified"])
    element(key).textContent = "";
  element<HTMLButtonElement>("copy-latex").disabled = true;
  compact.disabled = true;
  status.className = "";
  status.textContent = message;
}
const dismissedWarnings = new Set<string>();
const ignoredWarningTypes = new Set<string>((() => {
  try { const saved = JSON.parse(localStorage.getItem("aalwyn.ignoredWarnings.v1") ?? "[]"); return Array.isArray(saved) ? saved.filter(x => typeof x === "string") : []; }
  catch { return []; }
})());
element("reset-warning-suppression").onclick = () => {
  dismissedWarnings.clear();
  ignoredWarningTypes.clear();
  try { localStorage.removeItem("aalwyn.ignoredWarnings.v1"); } catch { /* Session reset still works. */ }
  diagnose();
};
const warningKey = (p: SourceProblem) => JSON.stringify([active().id, active().source, p.line, p.column, p.code, p.message]);
function suppressWarning(problem: SourceProblem, allOfType: boolean) {
  if (allOfType) {
    ignoredWarningTypes.add(problem.code ?? problem.message);
    try { localStorage.setItem("aalwyn.ignoredWarnings.v1", JSON.stringify([...ignoredWarningTypes])); } catch { /* Session suppression remains available. */ }
  } else dismissedWarnings.add(warningKey(problem));
  renderProblems(problems);
}
function renderProblems(next: SourceProblem[]) {
  problems = next;
  next = next.filter(p => p.severity !== "warning" || (!ignoredWarningTypes.has(p.code ?? p.message) && !dismissedWarnings.has(warningKey(p))));
  editor.diagnostics(next);
  for (const [panel, count, listId, label, entries] of [
    ["problems", "problem-count", "problem-list", "Errors", next.filter(p => p.severity !== "warning")],
    ["warnings", "warning-count", "warning-list", "Warnings", next.filter(p => p.severity === "warning")],
  ] as const) {
    element(panel).hidden = !entries.length;
    element(count).textContent = `${label} (${entries.length})`;
    const list = element(listId);
    list.replaceChildren();
    for (const problem of entries) {
      const item = documentNode("div");
      item.setAttribute("role", "listitem");
      const button = documentNode("button", "problem-link");
      button.textContent = `${problem.category} · ${problem.line}:${problem.column} — ${problem.message}`;
      button.onclick = () => editor.focus(problem.from, problem.to);
      if (problem.severity === "warning") {
        const dismiss = documentNode("button", "warning-dismiss");
        dismiss.textContent = "⚠";
        dismiss.title = "Ignore this warning";
        dismiss.setAttribute("aria-label", `Ignore warning on line ${problem.line}`);
        dismiss.onclick = () => suppressWarning(problem, false);
        const ignore = documentNode("button", "warning-ignore-type");
        ignore.textContent = "Ignore warning";
        ignore.onclick = () => suppressWarning(problem, false);
        const ignoreType = documentNode("button", "warning-ignore-type");
        ignoreType.textContent = "Ignore all of this type";
        ignoreType.onclick = () => suppressWarning(problem, true);
        item.append(dismiss, button, ignore, ignoreType);
      } else item.append(button);
      list.append(item);
    }
  }
}
function diagnose() {
  clearTimeout(diagnosticTimer);
  try {
    renderProblems(diagnoseSource(active().source));
  } catch {
    status.className = "error";
    status.textContent =
      "Diagnostics could not finish. Compile to inspect the error.";
  }
}
function showDocument(id: string) {
  clearTimeout(diagnosticTimer);
  workspace.activeId = id;
  editor.show(active());
  updateTabs();
  clearResult("Compile this document to see its result.");
  updateCursor();
  selection.replaceChildren();
  refreshFunctions();
  diagnose();
  persist();
}
function updateCursor() {
  const document = active(),
    before = document.source.slice(0, document.head).split("\n");
  element("cursor").textContent =
    `Ln ${before.length}, Col ${before.at(-1)!.length + 1}`;
}
function addDocument(document: SourceDocument) {
  workspace.documents.push(document);
  showDocument(document.id);
  editor.focus();
}
function makeDocument() {
  let suffix = 1;
  while (workspace.documents.some((d) => d.name === `Untitled ${suffix}.aal`))
    suffix++;
  addDocument(newDocument(`Untitled ${suffix}.aal`));
}
function reopen() {
  if (reopenDocument(workspace)) {
    showDocument(workspace.activeId);
    editor.focus();
  }
}
function exportDocument() {
  const document = active();
  const url = URL.createObjectURL(
    new Blob([document.source], { type: "text/plain;charset=utf-8" }),
  );
  const link = documentNode("a");
  link.href = url;
  link.download = document.name;
  link.hidden = true;
  window.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.exportedSource = document.source;
  updateTabs();
  persist();
}
function formatDocument() {
  if (!active().source.trim()) {
    status.className = "";
    status.textContent = "Write a function before formatting.";
    return;
  }
  try {
    const formatted = formatAalwyn(active().source);
    if (formatted !== active().source) editor.replace(formatted);
    diagnose();
    status.className = "";
    status.textContent = "Document formatted · Compile to update the result";
  } catch (error) {
    diagnose();
    status.className = "error";
    status.textContent =
      error instanceof AalwynError
        ? `Fix the syntax at ${error.line}:${error.column} before formatting.`
        : String(error);
  }
}
function refreshFunctions() {
  const previous = active().selectedFunction;
  selection.replaceChildren();
  try {
    for (const f of parse(active().source).functions)
      selection.add(new Option(f.name, f.name));
    selection.value = [...selection.options].some((o) => o.value === previous)
      ? previous
      : (selection.options[selection.options.length - 1]?.value ?? "");
    active().selectedFunction = selection.value;
  } catch {
    /* Positioned errors are rendered by the diagnostics pass. */
  }
}
function renderMath(result: ReturnType<typeof compile>) {
  compact.disabled = !result.abbreviations.length;
  katex.render(
    compact.checked ? result.compactLatex : result.latex,
    element("math"),
    { displayMode: true, throwOnError: true, strict: "error", trust: false },
  );
}
function run() {
  clearTimeout(diagnosticTimer);
  refreshFunctions();
  if (!active().source.trim()) {
    clearResult("Write an Aalwyn function to begin.");
    renderProblems([]);
    return;
  }
  try {
    const result = compile(active().source, selection.value || undefined);
    renderMath(result);
    current = result;
    renderProblems(diagnoseSource(active().source));
    for (const key of ["latex", "ast", "ir", "simplified"] as const)
      element(key).textContent =
        key === "latex" ? result.latex : JSON.stringify(result[key], null, 2);
    if (result.domainLatex) {
      katex.render(result.domainLatex, element("domain-text"), {
        throwOnError: true, strict: "error", trust: false,
      });
    } else element("domain-text").textContent = result.domainText;
    element("domain-note").textContent =
      "Declared restrictions and requirements from called functions are checked when evaluating.";
    status.className = "success";
    status.textContent = "Compiled successfully";
    element<HTMLButtonElement>("copy-latex").disabled = false;
    graphHost.hidden = false;
    graph.update(result);
    functionInput.update(result);
    persist();
  } catch (error) {
    clearResult();
    diagnose();
    status.className = "error";
    status.textContent =
      error instanceof AalwynError
        ? `Cannot compile · ${problems.length || 1} problem${problems.length === 1 ? "" : "s"} in source`
        : String(error);
  }
}
const editor = createEditor(
  element("editor"),
  {
    suppressWarning,
    change(source) {
      active().source = source;
      updateTabs();
      clearResult();
      renderProblems([]);
      clearTimeout(diagnosticTimer);
      diagnosticTimer = window.setTimeout(diagnose, 400);
      scheduleSave();
    },
    position(anchor, head, scrollTop) {
      const document = active();
      document.anchor = anchor;
      document.head = head;
      document.scrollTop = scrollTop;
      updateCursor();
      scheduleSave();
    },
    compile: run,
    format: formatDocument,
    save: exportDocument,
    newDocument: makeDocument,
    reopen,
  },
  workspace.settings,
);

element<HTMLButtonElement>("new").onclick = makeDocument;
element<HTMLButtonElement>("reopen").onclick = reopen;
element<HTMLButtonElement>("export").onclick = exportDocument;
element<HTMLButtonElement>("format").onclick = formatDocument;
element<HTMLButtonElement>("compile").onclick = run;
const fileInput = element<HTMLInputElement>("file-input");
element<HTMLButtonElement>("open").onclick = () => fileInput.click();
fileInput.onchange = async () => {
  for (const file of Array.from(fileInput.files ?? [])) {
    try {
      addDocument(newDocument(file.name, await file.text(), true));
    } catch {
      status.className = "error";
      status.textContent = `Could not open ${file.name}. Your other documents are unchanged.`;
    }
  }
  fileInput.value = "";
};
function renameDocument() {
  active().name = fileName(nameInput.value);
  updateTabs();
  persist();
}
nameInput.onchange = renameDocument;
nameInput.onblur = renameDocument;
nameInput.onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    renameDocument();
    nameInput.blur();
    editor.focus();
  }
};
selection.onchange = () => {
  active().selectedFunction = selection.value;
  run();
};
compact.onchange = () => {
  if (current) renderMath(current);
};
element<HTMLButtonElement>("copy-latex").onclick = async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.latex);
    status.textContent = "LaTeX copied";
  } catch {
    element<HTMLDetailsElement>("latex").parentElement!.setAttribute(
      "open",
      "",
    );
    status.textContent = "Select the LaTeX below to copy it.";
  }
};
const example = element<HTMLSelectElement>("example");
for (const name of Object.keys(examples)) example.add(new Option(name, name));
example.onchange = () => {
  if (example.value) {
    addDocument(newDocument(example.value + ".aal", examples[example.value]));
    example.value = "";
    run();
  }
};
const fontSize = element<HTMLSelectElement>("font-size");
for (let size = 11; size <= 20; size++)
  fontSize.add(new Option(String(size), String(size)));
fontSize.value = String(workspace.settings.fontSize);
element<HTMLInputElement>("wrap").checked = workspace.settings.wrap;
element<HTMLSelectElement>("compile-key").value = workspace.settings.compileKey;
element<HTMLSelectElement>("format-key").value = workspace.settings.formatKey;
for (const id of ["font-size", "wrap", "compile-key", "format-key"])
  element(id).addEventListener("change", () => {
    workspace.settings.fontSize = Number(fontSize.value);
    workspace.settings.wrap = element<HTMLInputElement>("wrap").checked;
    workspace.settings.compileKey = element<HTMLSelectElement>("compile-key")
      .value as "Mod-Enter" | "F5";
    workspace.settings.formatKey = element<HTMLSelectElement>("format-key")
      .value as "Mod-Shift-f" | "Alt-Shift-f";
    editor.configure(workspace.settings);
    persist();
  });
window.addEventListener("pagehide", persist);
window.addEventListener("beforeunload", (event) => {
  persist();
  if (
    storageFailed &&
    workspace.documents.some((d) => d.source !== d.exportedSource)
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
showDocument(workspace.activeId);
run();

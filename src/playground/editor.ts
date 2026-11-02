import { basicSetup } from "codemirror";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentLess, indentMore, isolateHistory } from "@codemirror/commands";
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
  indentUnit,
  indentService,
  foldService,
} from "@codemirror/language";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { tags } from "@lezer/highlight";
import { builtins, constants } from "../compiler/semantic";
import { aggregationSnippet, completionAt } from "./autocomplete";
import { lineIndentation, foldingRanges } from "./format";
import type { SourceDocument, EditorSettings } from "./documents";
import type { SourceProblem } from "./diagnostics";

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
  "natural",
  "real",
]);
const inputTypes = new Set(["int", "natural", "real"]);
const controlKeywords = new Set([
  "end", "case", "using", "else", "and", "or", "sum", "prod", "from", "to",
]);
export const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/))
      return "number";
    const identifier = stream.match(/[A-Za-z_][A-Za-z_0-9]*/);
    if (identifier) {
      const name = (identifier as RegExpMatchArray)[0];
      if (inputTypes.has(name)) return "typeName";
      if (controlKeywords.has(name)) return "controlKeyword";
      if (keywords.has(name)) return "keyword";
      if (name === "me" || constants.includes(name)) return "context";
      if (Object.hasOwn(builtins, name)) return "aalwynBuiltin";
      return stream.match(/^\s*[\[(]/, false) ? "function" : "variableName";
    }
    if (stream.match(">>")) return "applyOperator";
    if (stream.match(/(?:\+=|-=|\*=|\/=|\^=)/)) return "mutator";
    if (stream.match(/(?:=>|==|!=|>=|<=)/)) return "operator";
    if (stream.match("=") || stream.match("?")) return "applyOperator";
    if (stream.match(/[+\-*/%^?<>!:;]/)) return "operator";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "["] },
    indentOnInput: /^\s*(?:end|\))$/,
  },
  tokenTable: {
    controlKeyword: tags.controlKeyword,
    mutator: tags.updateOperator,
    applyOperator: tags.controlOperator,
    aalwynBuiltin: tags.standard(tags.function(tags.variableName)),
    context: tags.constant(tags.variableName),
    function: tags.function(tags.variableName),
  },
});
// VS Code Dark Modern inherits its syntax palette from Dark+.
export const colors = HighlightStyle.define([
  { tag: tags.keyword, color: "#569cd6" },
  { tag: tags.controlKeyword, color: "#c586c0" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.variableName, color: "#9cdcfe" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.comment, color: "#6a9955" },
  { tag: tags.function(tags.variableName), color: "#dcdcaa" },
  { tag: tags.standard(tags.function(tags.variableName)), color: "#dcdcaa" },
  { tag: tags.constant(tags.variableName), color: "#4fc1ff" },
  { tag: tags.operator, color: "#d4d4d4" },
  { tag: tags.updateOperator, color: "#9cdcfe" },
  { tag: tags.controlOperator, color: "#c586c0" },
]);

export function createEditor(
  host: HTMLElement,
  callbacks: {
    change(source: string): void;
    position(anchor: number, head: number, scrollTop: number): void;
    compile(): void;
    format(): void;
    save(): void;
    newDocument(): void;
    reopen(): void;
    suppressWarning(problem: SourceProblem, allOfType: boolean): void;
  },
  initialSettings: EditorSettings,
) {
  let settings = initialSettings;
  let shownProblems: SourceProblem[] = [];
  const config = new Compartment();
  const states = new Map<string, EditorState>();
  let activeId = "";
  let foldDocument: EditorState["doc"] | undefined;
  let foldCache = new Map<number, { from: number; to: number }[]>();
  const settingsExtension = (): Extension => [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          backgroundColor: "#1f1f1f",
          color: "#cccccc",
          fontSize: `${settings.fontSize}px`,
        },
        ".cm-scroller": {
          fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
          fontVariantLigatures: "common-ligatures contextual",
          fontFeatureSettings: '"calt" 1, "liga" 1',
          letterSpacing: "normal",
          lineHeight: "1.65",
          overflow: "auto",
        },
        ".cm-content": { padding: "14px 0", caretColor: "#cccccc" },
        ".cm-line": { padding: "0 16px 0 8px" },
        ".cm-gutters": {
          backgroundColor: "#1f1f1f",
          color: "#6e7681",
          borderRight: "1px solid #2b2b2b",
        },
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#282828" },
        ".cm-activeLineGutter": { color: "#cccccc" },
        ".cm-selectionMatch": { backgroundColor: "#add6ff26" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
          { backgroundColor: "#264f78 !important" },
        ".cm-cursor": { borderLeftColor: "#cccccc" },
        ".cm-panels, .cm-tooltip": {
          backgroundColor: "#202020",
          color: "#cccccc",
          borderColor: "#454545",
        },
        ".cm-searchMatch": { backgroundColor: "#9e6a0366" },
        ".cm-matchingBracket": {
          backgroundColor: "#3a3d41",
          outline: "1px solid #0078d4",
        },
        ".cm-foldPlaceholder": {
          backgroundColor: "#2b2b2b",
          color: "#cccccc",
          borderColor: "#454545",
        },
        ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
          backgroundColor: "#04395e",
          color: "#ffffff",
        },
      },
      { dark: true },
    ),
    settings.wrap ? EditorView.lineWrapping : [],
    Prec.highest(
      keymap.of([
        {
          key: settings.compileKey,
          run: () => {
            callbacks.compile();
            return true;
          },
        },
        {
          key: settings.formatKey,
          run: () => {
            callbacks.format();
            return true;
          },
        },
        {
          key: "Mod-s",
          run: () => {
            callbacks.save();
            return true;
          },
        },
        {
          key: "Mod-Alt-n",
          run: () => {
            callbacks.newDocument();
            return true;
          },
        },
        {
          key: "Mod-Shift-t",
          run: () => {
            callbacks.reopen();
            return true;
          },
        },
        { key: "Tab", run: acceptCompletion },
        {
          key: "Tab",
          run: (view) => {
            if (view.state.selection.ranges.some((r) => !r.empty))
              return indentMore(view);
            view.dispatch(view.state.replaceSelection("    "), {
              userEvent: "input.indent",
            });
            return true;
          },
        },
        { key: "Shift-Tab", run: indentLess },
      ]),
    ),
  ];
  const extensions: Extension[] = [
    basicSetup,
    config.of(settingsExtension()),
    language,
    syntaxHighlighting(colors),
    indentUnit.of("    "),
    EditorState.tabSize.of(4),
    EditorView.contentAttributes.of({
      "aria-label": "Aalwyn source code",
      spellcheck: "false",
      autocapitalize: "off",
    }),
    indentService.of((context, pos) => {
      let source = context.state.doc.toString(),
        target = context.state.doc.lineAt(pos).number - 1;
      if (context.simulatedBreak !== null) {
        const at = context.simulatedBreak;
        source = source.slice(0, at) + "\n" + source.slice(at);
        target = source.slice(0, at + 1).split("\n").length - 1;
      }
      return lineIndentation(source, target);
    }),
    foldService.of((state, start, end) => {
      if (foldDocument !== state.doc) {
        foldDocument = state.doc;
        foldCache = new Map();
        for (const range of foldingRanges(state.doc.toString())) {
          const line = state.doc.lineAt(range.from).number;
          foldCache.set(line, [...(foldCache.get(line) ?? []), range]);
        }
      }
      const ranges = (
        foldCache.get(state.doc.lineAt(start).number) ?? []
      ).filter((r) => r.from >= start && r.from <= end);
      return ranges.sort((a, b) => b.to - a.to)[0] ?? null;
    }),
    autocompletion({
      interactionDelay: 0,
      override: [
        (context) => {
          const source = context.state.doc.toString();
          const matches = completionAt(source, context.pos, context.explicit);
          if (!matches.length) return null;
          return {
            from: matches[0].start,
            options: matches.map((match) => ({
              label: match.kind,
              type: "keyword",
              detail: "Integer range",
              apply: (view: EditorView) => {
                const snippet = aggregationSnippet(source, match),
                  position = match.start + snippet.selection;
                view.dispatch({
                  changes: {
                    from: match.start,
                    to: match.end,
                    insert: snippet.text,
                  },
                  selection: EditorSelection.range(position, position + 1),
                  userEvent: "input.complete",
                });
              },
            })),
          };
        },
      ],
    }),
    lintGutter(),

    EditorView.updateListener.of((update) => {
      if (activeId) states.set(activeId, update.state);
      if (update.docChanged) callbacks.change(update.state.doc.toString());
      if (update.docChanged || update.selectionSet) {
        const range = update.state.selection.main;
        callbacks.position(
          range.anchor,
          range.head,
          update.view.scrollDOM.scrollTop,
        );
      }
    }),
    EditorView.domEventHandlers({
      scroll: (_event, view) => {
        const range = view.state.selection.main;
        callbacks.position(range.anchor, range.head, view.scrollDOM.scrollTop);
        return false;
      },
    }),
  ];
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ extensions }),
  });
  host.addEventListener("mousedown", event => {
    const target = event.target as HTMLElement;
    if (!target.closest(".cm-lint-marker-warning") || target.closest(".cm-lint-marker-error")) return;
    const marker = target.closest(".cm-gutterElement");
    if (!marker) return;
    const block = view.lineBlockAtHeight(marker.getBoundingClientRect().top - view.documentTop + 2);
    const line = view.state.doc.lineAt(block.from).number;
    const problem = shownProblems.find(p => p.line === line && p.severity === "warning");
    if (!problem) return;
    event.preventDefault();
    event.stopPropagation();
    callbacks.suppressWarning(problem, false);
  }, true);

  return {
    view,
    show(document: SourceDocument) {
      if (activeId) states.set(activeId, view.state);
      activeId = document.id;
      let state = states.get(activeId);
      if (!state || state.doc.toString() !== document.source)
        state = EditorState.create({
          doc: document.source,
          selection: EditorSelection.single(document.anchor, document.head),
          extensions,
        });
      view.setState(state);
      // Settings can have changed while this document's state was inactive.
      view.dispatch({ effects: config.reconfigure(settingsExtension()) });
      view.scrollDOM.scrollTop = document.scrollTop;
    },
    configure(next: EditorSettings) {
      settings = next;
      view.dispatch({ effects: config.reconfigure(settingsExtension()) });
    },
    replace(source: string) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        selection: EditorSelection.cursor(
          Math.min(view.state.selection.main.head, source.length),
        ),
        userEvent: "input.format",
        annotations: isolateHistory.of("full"),
      });
    },
    diagnostics(problems: SourceProblem[]) {
      shownProblems = problems;
      view.dispatch(
        setDiagnostics(
          view.state,
          problems.map((p) => ({
            from: p.from,
            to: p.to,
            severity: p.severity ?? "error",
            source: p.category,
            message: p.message,

          })),
        ),
      );
    },
    focus(from?: number, to?: number) {
      if (from !== undefined)
        view.dispatch({
          selection: { anchor: from, head: to ?? from },
          scrollIntoView: true,
        });
      view.focus();
    },
  };
}

import { migrateLegacySource } from "../compiler/migrate";
export interface SourceDocument {
  id: string;
  name: string;
  source: string;
  exportedSource?: string;
  selectedFunction: string;
  anchor: number;
  head: number;
  scrollTop: number;
}
export interface EditorSettings {
  fontSize: number;
  wrap: boolean;
  compileKey: "Mod-Enter" | "F5";
  formatKey: "Mod-Shift-f" | "Alt-Shift-f";
}
export interface Workspace {
  version: 1;
  activeId: string;
  documents: SourceDocument[];
  closed: SourceDocument[];
  settings: EditorSettings;
}
export const workspaceKey = "aalwyn.workspace.v1";
export const defaultSettings: EditorSettings = {
  fontSize: 13,
  wrap: false,
  compileKey: "Mod-Enter",
  formatKey: "Mod-Shift-f",
};
export function fileName(value: string): string {
  const name =
    value
      .trim()
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .slice(0, 100) || "Untitled";
  return /\.aal$/i.test(name) ? name : name + ".aal";
}
export function newDocument(
  name: string,
  source = "",
  imported = false,
): SourceDocument {
  return {
    id: crypto.randomUUID(),
    name: fileName(name),
    source: migrateLegacySource(source),
    exportedSource: imported ? source : undefined,
    selectedFunction: "",
    anchor: 0,
    head: 0,
    scrollTop: 0,
  };
}
export function initialWorkspace(source: string): Workspace {
  const document = newDocument("Distance.aal", source);
  return {
    version: 1,
    activeId: document.id,
    documents: [document],
    closed: [],
    settings: { ...defaultSettings },
  };
}
function isDocument(value: unknown): value is SourceDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as SourceDocument;
  return (
    typeof d.id === "string" &&
    d.id.length > 0 &&
    typeof d.name === "string" &&
    typeof d.source === "string" &&
    (d.exportedSource === undefined || typeof d.exportedSource === "string") &&
    typeof d.selectedFunction === "string" &&
    [d.anchor, d.head, d.scrollTop].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) &&
    Number.isInteger(d.anchor) &&
    Number.isInteger(d.head) &&
    d.anchor <= d.source.length &&
    d.head <= d.source.length
  );
}
export function restoreWorkspace(
  serialized: string | null,
  fallback: Workspace,
): Workspace {
  if (!serialized) return fallback;
  try {
    const value = JSON.parse(serialized) as Workspace;
    if (
      value.version !== 1 ||
      !Array.isArray(value.documents) ||
      !value.documents.length ||
      !value.documents.every(isDocument) ||
      new Set(value.documents.map((d) => d.id)).size !==
        value.documents.length ||
      !value.documents.some((d) => d.id === value.activeId)
    )
      return fallback;
    const settings = value.settings ?? defaultSettings;
    return {
      ...value,
      documents: value.documents.map((d) => ({
        ...d,
        name: fileName(d.name),
        source: migrateLegacySource(d.source),
        anchor: Math.min(d.anchor, migrateLegacySource(d.source).length),
        head: Math.min(d.head, migrateLegacySource(d.source).length),
      })),
      closed: Array.isArray(value.closed)
        ? value.closed.filter(isDocument).slice(-10)
        : [],
      settings: {
        fontSize:
          Number.isInteger(settings.fontSize) &&
          settings.fontSize >= 11 &&
          settings.fontSize <= 20
            ? settings.fontSize
            : 13,
        wrap: settings.wrap === true,
        compileKey: settings.compileKey === "F5" ? "F5" : "Mod-Enter",
        formatKey:
          settings.formatKey === "Alt-Shift-f" ? "Alt-Shift-f" : "Mod-Shift-f",
      },
    };
  } catch {
    return fallback;
  }
}
export function closeDocument(workspace: Workspace, id: string): void {
  const index = workspace.documents.findIndex((d) => d.id === id);
  if (index < 0) return;
  const [document] = workspace.documents.splice(index, 1);
  workspace.closed.push(document);
  workspace.closed = workspace.closed.slice(-10);
  if (!workspace.documents.length)
    workspace.documents.push(newDocument("Untitled.aal"));
  if (workspace.activeId === id)
    workspace.activeId =
      workspace.documents[Math.min(index, workspace.documents.length - 1)].id;
}
export function reopenDocument(
  workspace: Workspace,
): SourceDocument | undefined {
  const document = workspace.closed.pop();
  if (document) {
    document.source = migrateLegacySource(document.source);
    document.anchor = Math.min(document.anchor, document.source.length);
    document.head = Math.min(document.head, document.source.length);
    workspace.documents.push(document);
    workspace.activeId = document.id;
  }
  return document;
}

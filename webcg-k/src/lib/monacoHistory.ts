export type MonacoHistoryAction = "undo" | "redo";

interface MonacoHistoryEditor {
  focus?: () => void;
  trigger?: (source: string, handlerId: MonacoHistoryAction, payload: null) => void;
}

export function runMonacoHistoryAction(
  editor: MonacoHistoryEditor | null | undefined,
  action: MonacoHistoryAction,
): boolean {
  if (!editor?.trigger) return false;
  editor.focus?.();
  editor.trigger("webcgk-editor-history", action, null);
  return true;
}

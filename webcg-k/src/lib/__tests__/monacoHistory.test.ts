import { describe, expect, it, vi } from "vitest";

import { runMonacoHistoryAction } from "../monacoHistory";

describe("runMonacoHistoryAction", () => {
  it("focuses the editor and triggers a Monaco undo/redo history command", () => {
    const editor = {
      focus: vi.fn(),
      trigger: vi.fn(),
    };

    expect(runMonacoHistoryAction(editor, "undo")).toBe(true);
    expect(editor.focus).toHaveBeenCalledOnce();
    expect(editor.trigger).toHaveBeenCalledWith("webcgk-editor-history", "undo", null);

    expect(runMonacoHistoryAction(editor, "redo")).toBe(true);
    expect(editor.trigger).toHaveBeenLastCalledWith("webcgk-editor-history", "redo", null);
  });

  it("returns false when the editor is not mounted yet", () => {
    expect(runMonacoHistoryAction(null, "undo")).toBe(false);
  });
});

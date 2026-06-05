import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePluginCode } from "../usePluginCode";

describe("usePluginCode history", () => {
  it("undoes and redoes code changes made through setCode", () => {
    const initialCode = { html: "<div>one</div>", css: ".a{color:red}", js: "" };
    const { result } = renderHook(() => usePluginCode(initialCode, null, null));

    act(() => {
      result.current.setCode((prev) => ({ ...prev, css: ".a{color:blue}" }));
    });
    act(() => {
      result.current.setCode((prev) => ({ ...prev, html: "<div>two</div>" }));
    });

    expect(result.current.code).toEqual({ html: "<div>two</div>", css: ".a{color:blue}", js: "" });
    expect(result.current.canUndoCode).toBe(true);
    expect(result.current.canRedoCode).toBe(false);

    act(() => {
      result.current.undoCode();
    });
    expect(result.current.code).toEqual({ html: "<div>one</div>", css: ".a{color:blue}", js: "" });
    expect(result.current.canRedoCode).toBe(true);

    act(() => {
      result.current.undoCode();
    });
    expect(result.current.code).toEqual(initialCode);
    expect(result.current.canUndoCode).toBe(false);

    act(() => {
      result.current.redoCode();
    });
    expect(result.current.code).toEqual({ html: "<div>one</div>", css: ".a{color:blue}", js: "" });
  });

  it("does not add history entries for no-op code updates", () => {
    const initialCode = { html: "<div>one</div>", css: "", js: "" };
    const { result } = renderHook(() => usePluginCode(initialCode, null, null));

    act(() => {
      result.current.setCode((prev) => ({ ...prev }));
    });

    expect(result.current.canUndoCode).toBe(false);
  });
});

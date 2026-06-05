import {
  registerAction,
  getActionsForContext,
  normalizeShortcut,
  matchShortcut,
  dispatchAction,
  type Action,
} from "../actionRegistry";

function makeKeyboardEvent(
  key: string,
  opts: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
    metaKey: opts.meta ?? false,
    bubbles: true,
  });
}

describe("normalizeShortcut", () => {
  it("Ctrl+Z 파싱", () => {
    expect(normalizeShortcut("Ctrl+Z")).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      key: "Z",
    });
  });

  it("Ctrl+Shift+G 파싱", () => {
    expect(normalizeShortcut("Ctrl+Shift+G")).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      key: "G",
    });
  });

  it("Delete 단일 키 파싱", () => {
    expect(normalizeShortcut("Delete")).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      key: "Delete",
    });
  });

  it("Cmd+D (macOS) → Ctrl로 정규화", () => {
    expect(normalizeShortcut("Cmd+D")).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      key: "D",
    });
  });
});

describe("matchShortcut", () => {
  it("Ctrl+Z → KeyboardEvent 매칭", () => {
    const e = makeKeyboardEvent("z", { ctrl: true });
    expect(matchShortcut(e, "Ctrl+Z")).toBe(true);
  });

  it("metaKey도 Ctrl로 처리", () => {
    const e = makeKeyboardEvent("z", { meta: true });
    expect(matchShortcut(e, "Ctrl+Z")).toBe(true);
  });

  it("Shift 없는 이벤트는 Ctrl+Shift+G에 매칭되지 않음", () => {
    const e = makeKeyboardEvent("g", { ctrl: true });
    expect(matchShortcut(e, "Ctrl+Shift+G")).toBe(false);
  });

  it("Delete 키 매칭", () => {
    const e = makeKeyboardEvent("Delete");
    expect(matchShortcut(e, "Delete")).toBe(true);
  });

  it("Backspace는 Delete로 정규화되지 않음 (별도 처리)", () => {
    const e = makeKeyboardEvent("Backspace");
    expect(matchShortcut(e, "Delete")).toBe(false);
  });

  it("대소문자 무시", () => {
    const e = makeKeyboardEvent("G", { ctrl: true, shift: true });
    expect(matchShortcut(e, "Ctrl+Shift+g")).toBe(true);
  });
});

describe("registerAction / getActionsForContext", () => {
  it("등록된 액션이 context로 조회된다", () => {
    const action: Action = {
      id: "test",
      label: "Test",
      shortcut: "Ctrl+T",
      context: "editor",
      execute: () => {},
    };
    const unregister = registerAction(action);
    const actions = getActionsForContext("editor");
    expect(actions).toContainEqual(action);
    unregister();
    expect(getActionsForContext("editor")).toHaveLength(0);
  });

  it("global 액션은 모든 context에서 조회된다", () => {
    const action: Action = {
      id: "devReset",
      label: "Dev Reset",
      shortcut: "Ctrl+Shift+K",
      context: "global",
      execute: () => {},
    };
    const unregister = registerAction(action);
    expect(getActionsForContext("editor")).toContainEqual(action);
    expect(getActionsForContext("controller")).toContainEqual(action);
    unregister();
  });

  it("unregister 후에는 조회되지 않는다", () => {
    const action: Action = {
      id: "temp",
      label: "Temp",
      context: "editor",
      execute: () => {},
    };
    const unregister = registerAction(action);
    unregister();
    expect(getActionsForContext("editor")).toHaveLength(0);
  });
});

describe("dispatchAction", () => {
  it("매칭되는 shortcut의 액션을 실행하고 true 반환", () => {
    let executed = false;
    const unregister = registerAction({
      id: "testDelete",
      label: "Test Delete",
      shortcut: "Delete",
      context: "editor",
      execute: () => {
        executed = true;
      },
    });

    const e = makeKeyboardEvent("Delete");
    const result = dispatchAction(e, "editor");
    expect(result).toBe(true);
    expect(executed).toBe(true);
    unregister();
  });

  it("predicate가 false면 실행하지 않음", () => {
    let executed = false;
    const unregister = registerAction({
      id: "conditionalAction",
      label: "Conditional",
      shortcut: "Ctrl+S",
      context: "editor",
      predicate: () => false,
      execute: () => {
        executed = true;
      },
    });

    const e = makeKeyboardEvent("s", { ctrl: true });
    const result = dispatchAction(e, "editor");
    expect(result).toBe(false);
    expect(executed).toBe(false);
    unregister();
  });

  it("컨텍스트가 맞지 않으면 실행하지 않음", () => {
    let executed = false;
    const unregister = registerAction({
      id: "editorOnly",
      label: "Editor Only",
      shortcut: "Delete",
      context: "editor",
      execute: () => {
        executed = true;
      },
    });

    // controller context → editor action should NOT fire
    const e = makeKeyboardEvent("Delete");
    const result = dispatchAction(e, "controller");
    expect(result).toBe(false);
    expect(executed).toBe(false);
    unregister();
  });
});

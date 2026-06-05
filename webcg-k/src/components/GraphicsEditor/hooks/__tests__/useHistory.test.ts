import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../useHistory";

type TestState = { value: string; count?: number };

describe("useHistory", () => {
  it("초기 상태가 올바르게 설정된다", () => {
    const { result } = renderHook(() => useHistory<TestState>({ value: "A" }));
    expect(result.current.state.value).toBe("A");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("setState 후 undo가 가능해진다", () => {
    const { result } = renderHook(() => useHistory<TestState>({ value: "A" }));
    act(() => {
      result.current.setState((draft) => {
        draft.value = "B";
      });
    });
    expect(result.current.state.value).toBe("B");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo 시 이전 상태로 복원되고 redo가 가능해진다", () => {
    const { result } = renderHook(() => useHistory<TestState>({ value: "A" }));
    act(() => {
      result.current.setState((draft) => {
        draft.value = "B";
      });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.state.value).toBe("A");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo 시 되돌린 상태가 복원된다", () => {
    const { result } = renderHook(() => useHistory<TestState>({ value: "A" }));
    act(() => {
      result.current.setState((draft) => {
        draft.value = "B";
      });
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });
    expect(result.current.state.value).toBe("B");
    expect(result.current.canRedo).toBe(false);
  });

  it("새 상태 설정 시 redo 히스토리(future)가 초기화된다", () => {
    const { result } = renderHook(() => useHistory<string[]>(["A"]));
    act(() => {
      result.current.setState((draft) => {
        draft.push("B");
      });
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.setState((draft) => {
        draft.push("C");
      });
    });
    expect(result.current.state).toEqual(["A", "C"]);
    expect(result.current.canRedo).toBe(false);
  });

  it("동일한 상태를 설정하면 히스토리에 추가되지 않는다", () => {
    const { result } = renderHook(() => useHistory({ x: 1 }));
    act(() => {
      result.current.setState((_draft) => {
        // draft를 변경하지 않음
      });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("히스토리가 50개를 초과하면 가장 오래된 항목이 제거된다", () => {
    const { result } = renderHook(() => useHistory([0]));
    for (let i = 1; i <= 51; i++) {
      act(() => {
        result.current.setState((draft) => {
          draft[0] = i;
        });
      });
    }
    expect(result.current.state[0]).toBe(51);
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => {
        result.current.undo();
      });
      undoCount++;
    }
    expect(undoCount).toBeLessThanOrEqual(50);
  });

  it("resetHistory 시 모든 히스토리가 초기화된다", () => {
    const { result } = renderHook(() => useHistory<TestState>({ value: "A" }));
    act(() => {
      result.current.setState((draft) => {
        draft.value = "B";
      });
    });
    act(() => {
      result.current.setState((draft) => {
        draft.value = "C";
      });
    });
    act(() => {
      result.current.resetHistory({ value: "X" });
    });
    expect(result.current.state.value).toBe("X");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});

/**
 * useHistory - Mutative Patches 기반 Undo/Redo 히스토리 관리 훅
 *
 * Why Mutative Patches > JSON.stringify 전체 비교?
 * 1. Structural Sharing: 변경되지 않은 요소는 동일 참조 유지 → React memo 활용
 * 2. O(변경된 필드) vs O(전체 요소 × 필드): Delta만 저장하므로 메모리/CPU 절감
 * 3. Patch 기반 Undo: 전체 스냅샷이 아닌 역연산만 적용 → 히스토리 깊이 무관 상수 시간
 */

import { useState, useCallback } from "react";
import { create, apply, type Patches } from "mutative";

interface PatchHistory {
  patches: Patches;
  inversePatches: Patches;
}

interface HistoryState<T> {
  past: PatchHistory[];
  present: T;
  future: PatchHistory[];
}

const MAX_HISTORY = 50;

export function useHistory<T>(initialState: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const state = history.present;

  // 상태 업데이트 — draft를 직접 변이하는 recipe 함수를 받음
  const setState = useCallback((recipe: (draft: T) => void) => {
    setHistory((prev) => {
      const [nextState, patches, inversePatches] = create(
        prev.present,
        recipe,
        { enablePatches: true },
      );

      // 변경 사항이 없으면 히스토리에 추가하지 않음
      if (patches.length === 0) {
        return prev;
      }

      return {
        past: [...prev.past.slice(-MAX_HISTORY + 1), { patches, inversePatches }],
        present: nextState,
        future: [],
      };
    });
  }, []);

  // Undo — inversePatches를 현재 상태에 적용하여 이전 상태로 복원
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = [...prev.past];
      const item = newPast.pop()!;

      const newPresent = apply(
        prev.present as object,
        item.inversePatches,
      ) as T;

      return {
        past: newPast,
        present: newPresent,
        future: [item, ...prev.future],
      };
    });
  }, []);

  // Redo — patches를 현재 상태에 적용하여 다음 상태로 전진
  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = [...prev.future];
      const item = newFuture.shift()!;

      const newPresent = apply(
        prev.present as object,
        item.patches,
      ) as T;

      return {
        past: [...prev.past, item],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  // 히스토리 초기화 (새 데이터 로드 시)
  const resetHistory = useCallback((newState: T) => {
    setHistory({
      past: [],
      present: newState,
      future: [],
    });
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return {
    state,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };
}

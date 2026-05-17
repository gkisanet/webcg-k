/**
 * useHistory - Undo/Redo 히스토리 관리 훅
 */

import { useState, useCallback } from "react";

interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

const MAX_HISTORY = 50; // 최대 히스토리 개수

export function useHistory<T>(initialState: T) {
    const [history, setHistory] = useState<HistoryState<T>>({
        past: [],
        present: initialState,
        future: [],
    });

    // 현재 상태
    const state = history.present;

    // 상태 업데이트 (히스토리에 추가)
    const setState = useCallback((newState: T | ((prev: T) => T)) => {
        setHistory((prev) => {
            const resolvedState = typeof newState === "function"
                ? (newState as (prev: T) => T)(prev.present)
                : newState;

            // 이전 상태와 동일하면 히스토리에 추가하지 않음
            if (JSON.stringify(resolvedState) === JSON.stringify(prev.present)) {
                return prev;
            }

            return {
                past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
                present: resolvedState,
                future: [], // 새 상태 추가 시 future 초기화
            };
        });
    }, []);

    // Undo
    const undo = useCallback(() => {
        setHistory((prev) => {
            if (prev.past.length === 0) return prev;

            const newPast = [...prev.past];
            const newPresent = newPast.pop()!;

            return {
                past: newPast,
                present: newPresent,
                future: [prev.present, ...prev.future],
            };
        });
    }, []);

    // Redo
    const redo = useCallback(() => {
        setHistory((prev) => {
            if (prev.future.length === 0) return prev;

            const newFuture = [...prev.future];
            const newPresent = newFuture.shift()!;

            return {
                past: [...prev.past, prev.present],
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

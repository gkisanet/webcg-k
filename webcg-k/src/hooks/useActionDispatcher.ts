/**
 * useActionDispatcher — context 기반 단축키 디스패처 훅
 *
 * 단일 useEffect + addEventListener('keydown')으로
 * 현재 context에 등록된 모든 액션의 단축키를 처리.
 *
 * 기존 13개 분산 핸들러를 이 훅 하나로 대체.
 */

import { useEffect } from "react";
import { dispatchAction, type ActionContext } from "@/lib/actions/actionRegistry";

/**
 * @param context 현재 활성 컨텍스트 ("editor" | "controller" | "global")
 * @param enabled true일 때만 키보드 이벤트 처리 (기본 true)
 */
export function useActionDispatcher(
  context: ActionContext,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // input/textarea 내부에서는 글로벌 단축키만 처리
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInput && context !== "global") return;

      dispatchAction(e, context);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [context, enabled]);
}

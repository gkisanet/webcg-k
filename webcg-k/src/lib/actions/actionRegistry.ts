/**
 * Action Registry — 선언적 단축키 액션 관리
 *
 * 13개 파일에 분산된 addEventListener('keydown')을 단일 레지스트리로 통합.
 * context 기반 필터링으로 단축키 충돌 방지.
 */

export type ActionContext = "editor" | "controller" | "global";

export interface Action {
  /** 고유 식별자 (e.g. "undo", "deleteSelected") */
  id: string;
  /** UI 표시용 레이블 */
  label: string;
  /** 단축키 문자열 (e.g. "Ctrl+Z", "Delete", "Ctrl+Shift+G") */
  shortcut?: string;
  /** 활성 컨텍스트 — 해당 컨텍스트에서만 동작 */
  context: ActionContext;
  /** 실행 가능 조건 (e.g. canUndo, selectedIds.length > 0). 없으면 항상 실행 가능 */
  predicate?: () => boolean;
  /** 실행 로직 */
  execute: () => void;
}

/** action 등록 해제용 토큰 */
let nextToken = 1;

interface RegisteredAction {
  action: Action;
  token: number;
}

const registry: RegisteredAction[] = [];

/** 액션 등록 → 해제 함수 반환 */
export function registerAction(action: Action): () => void {
  const token = nextToken++;
  registry.push({ action, token });
  return () => {
    const idx = registry.findIndex((r) => r.token === token);
    if (idx !== -1) registry.splice(idx, 1);
  };
}

/** 현재 컨텍스트에 등록된 모든 액션 반환 */
export function getActionsForContext(context: ActionContext): Action[] {
  return registry
    .filter((r) => r.action.context === context || r.action.context === "global")
    .map((r) => r.action);
}

/** 단축키 문자열 → 정규화된 표현 */
export function normalizeShortcut(shortcut: string): {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
} {
  const parts = shortcut.split("+").map((s) => s.trim());
  let ctrl = false;
  let shift = false;
  let alt = false;
  let key = "";

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "cmd" || lower === "mod") {
      ctrl = true;
    } else if (lower === "shift") {
      shift = true;
    } else if (lower === "alt") {
      alt = true;
    } else {
      key = part;
    }
  }

  return { ctrl, shift, alt, key };
}

/** KeyboardEvent가 shortcut과 일치하는지 확인 */
export function matchShortcut(
  e: KeyboardEvent,
  shortcut: string,
): boolean {
  const { ctrl, shift, alt, key } = normalizeShortcut(shortcut);

  const ctrlMatch =
    ctrl === (e.ctrlKey || e.metaKey);
  const shiftMatch = shift === e.shiftKey;
  const altMatch = alt === e.altKey;

  // key 매칭: 대소문자 구분 없음
  const eventKey = e.key;
  const shortcutKey = key;

  // 특수 키 매핑
  const keyNormalized: Record<string, string> = {
    del: "Delete",
    delete: "Delete",
    backspace: "Backspace",
    esc: "Escape",
    escape: "Escape",
    " ": "Space",
    space: "Space",
    enter: "Enter",
    return: "Enter",
  };

  const normalizedEventKey =
    keyNormalized[eventKey.toLowerCase()] ?? eventKey;
  const normalizedShortcutKey =
    keyNormalized[shortcutKey.toLowerCase()] ?? shortcutKey;

  return (
    ctrlMatch &&
    shiftMatch &&
    altMatch &&
    normalizedEventKey.toLowerCase() === normalizedShortcutKey.toLowerCase()
  );
}

/**
 * KeyboardEvent에 대해 컨텍스트에 맞는 액션 디스패치
 * @returns true if an action was executed (prevent further propagation)
 */
export function dispatchAction(
  e: KeyboardEvent,
  context: ActionContext,
): boolean {
  const actions = getActionsForContext(context);

  for (const action of actions) {
    if (!action.shortcut) continue;
    if (!matchShortcut(e, action.shortcut)) continue;
    if (action.predicate && !action.predicate()) continue;

    e.preventDefault();
    e.stopPropagation();
    action.execute();
    return true;
  }

  return false;
}

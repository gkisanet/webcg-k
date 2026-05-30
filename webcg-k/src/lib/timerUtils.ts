/**
 * 타이머 replicant 순수 유틸리티 — useOverlayStore 의존성 없음.
 *
 * computeRemaining은 startedAt 기반으로 호출 시점의 정확한 remaining을 반환.
 * 모든 클라이언트가 동일한 startedAt + 현재 시간으로 계산 → 불일치 없음.
 */

export interface TimerReplicant {
  remaining: number;
  running: boolean;
  startedAt: number;
  duration: number;
  [key: string]: unknown;
}

export function computeRemaining(
  replicant: Partial<TimerReplicant>,
  clockOffset = 0,
): number {
  const base = typeof replicant.remaining === "number"
    ? replicant.remaining
    : typeof replicant.duration === "number"
      ? replicant.duration
      : typeof replicant.timerDuration === "number"
        ? replicant.timerDuration
        : 0;
  if (!replicant.running || !replicant.startedAt) {
    return base;
  }
  const now = Date.now() + clockOffset;
  const elapsed = (now - replicant.startedAt) / 1000;
  return Math.max(0, base - elapsed);
}

export function isTimerReplicant(
  data: unknown,
): data is TimerReplicant {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const hasDuration = typeof d.duration === "number" || typeof d.timerDuration === "number";
  return typeof d.remaining === "number" || hasDuration;
}

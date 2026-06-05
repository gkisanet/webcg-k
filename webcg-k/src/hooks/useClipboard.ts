import { useCallback, useRef, useState } from "react";

/**
 * 📋 클립보드 복사 + 피드백 훅
 *
 * Why: 복사 → "복사됨!" 피드백 → 2초 후 리셋 패턴이
 *      BroadcastButton, broadcast.tsx, $sessionId.tsx 등 3곳에서 반복됨.
 *      하나의 훅으로 통합하여 일관된 UX 보장.
 *
 * 🎓 비유: 복사기 옆에 "복사 완료" 표시등을 달아놓는 것.
 *          매번 함수마다 setTimeout을 직접 쓰는 대신,
 *          훅 하나로 "복사 → 표시등 ON → 2초 후 OFF" 자동화.
 *
 * @param resetDelay 피드백 표시 시간 (ms, 기본 2000)
 *
 * @example
 * const { copied, copyToClipboard } = useClipboard();
 * <button onClick={() => copyToClipboard(rendererUrl)}>
 *   {copied ? "✓ 복사됨" : "URL 복사"}
 * </button>
 */
export function useClipboard(resetDelay = 2000) {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const copyToClipboard = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);

				// 이전 타이머가 있으면 취소 (빠르게 연속 클릭 시 깜빡임 방지)
				if (timerRef.current) clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => setCopied(false), resetDelay);
			} catch (err) {
				// Clipboard API 실패 시 (HTTP 환경 등) fallback
				console.warn("[useClipboard] Clipboard API 실패:", err);
			}
		},
		[resetDelay],
	);

	return { copied, copyToClipboard };
}

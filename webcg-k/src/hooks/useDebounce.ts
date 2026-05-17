import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ⏱️ 값 디바운스 훅
 *
 * Why: 검색 입력, 자동 저장 등에서 매 키 입력마다 API를 호출하면
 *      불필요한 네트워크 비용이 발생한다. 일정 시간 입력이 멈추면
 *      한 번만 호출하도록 "흔들림 방지" 처리.
 *
 * 🎓 비유: 엘리베이터 문이 닫히려 할 때 누군가 타면 다시 열리고,
 *          아무도 안 타면 그때서야 닫히는 것과 같다.
 *
 * @param value 디바운스할 값
 * @param delay 디바운스 대기 시간 (ms, 기본 300)
 *
 * @example
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebounce(search, 300);
 *
 * useEffect(() => {
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);

	return debouncedValue;
}

/**
 * 🔄 디바운스된 콜백 훅
 *
 * 값이 아닌 함수 자체를 디바운스하고 싶을 때 사용.
 *
 * @example
 * const debouncedSave = useDebouncedCallback((data) => {
 *   saveToSupabase(data);
 * }, 500);
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
	callback: T,
	delay = 300,
): T {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	return useCallback(
		((...args: any[]) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				callbackRef.current(...args);
			}, delay);
		}) as T,
		[delay],
	);
}

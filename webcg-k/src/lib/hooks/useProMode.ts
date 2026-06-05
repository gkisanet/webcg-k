import { useState, useEffect } from "react";

/**
 * 일반 사용자(스트리머)와 고급 사용자(프로) 모드를 전환하는 훅
 * localStorage와 연동하여 브라우저 새로고침 시에도 유지됨
 */
export function useProMode() {
	const [isProMode, setIsProMode] = useState(false);

	// 초기 로드 시 localStorage에서 값 읽기
	useEffect(() => {
		const saved = localStorage.getItem("webcg_pro_mode");
		if (saved === "true") {
			setIsProMode(true);
		}
	}, []);

	// 값 변경 시 localStorage에 저장
	const toggleProMode = () => {
		setIsProMode((prev) => {
			const next = !prev;
			localStorage.setItem("webcg_pro_mode", String(next));
			return next;
		});
	};

	return { isProMode, toggleProMode };
}

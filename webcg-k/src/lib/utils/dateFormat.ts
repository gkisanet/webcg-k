/**
 * 날짜/시간 포맷 유틸리티
 * 각 라우트 파일에서 중복 정의되던 포맷 함수를 통합
 *
 * Why i18n 적용?
 * - 요일명(일/월/화...)과 상대시간("방금 전", "분 전")이 하드코딩되어 있었음
 * - i18next의 t() 함수를 직접 import하여 React 컴포넌트 밖에서도 번역 가능
 */

import i18n from "../i18n";

// ─── 헬퍼: 현재 언어의 요일 배열 반환 ──────────────────────
const getDayName = (dayIndex: number): string => {
	const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
	return i18n.t(`date.days.${dayKeys[dayIndex]}`, { ns: "common" });
};

/**
 * M/D (요일) 형식 — ex: "2/18 (화)" or "2/18 (Tue)"
 * 사용: dashboard/index.tsx
 */
export const formatDay = (dateStr: string): string => {
	const date = new Date(dateStr);
	return `${date.getMonth() + 1}/${date.getDate()} (${getDayName(date.getDay())})`;
};

/**
 * HH:MM 형식 — ex: "09:30"
 * 사용: dashboard/index.tsx
 */
export const formatTime = (dateStr: string): string => {
	const date = new Date(dateStr);
	return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

/**
 * M/D HH:MM 형식 — ex: "2/18 09:30"
 * 사용: broadcast.tsx
 */
export const formatDateTime = (dateStr: string): string => {
	const d = new Date(dateStr);
	return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

/**
 * 상대 시간 — ex: "방금 전" / "just now", "5분 전" / "5m ago"
 * 24시간 초과 시 formatDateTime으로 fallback
 * 사용: broadcast.tsx
 */
export const formatRelativeTime = (dateStr: string): string => {
	const diffMs = Date.now() - new Date(dateStr).getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	if (diffMins < 1) return i18n.t("date.justNow", { ns: "common" });
	if (diffMins < 60) return i18n.t("date.minutesAgo", { ns: "common", count: diffMins });
	if (diffHours < 24) return i18n.t("date.hoursAgo", { ns: "common", count: diffHours });
	return formatDateTime(dateStr);
};

/**
 * 로케일 인식 날짜 (짧은 형식) — 현재 i18n 언어에 맞게 포맷
 * 사용: characters.tsx
 */
export const formatDateShort = (dateStr: string): string => {
	try {
		const locale = i18n.language === "ko" ? "ko-KR" : "en-US";
		return new Date(dateStr).toLocaleDateString(locale, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
};

/**
 * 로케일 인식 날짜+시간 — 현재 i18n 언어에 맞게 포맷
 * 사용: templates.tsx
 */
export const formatDateWithTime = (dateStr: string): string => {
	const locale = i18n.language === "ko" ? "ko-KR" : "en-US";
	const d = new Date(dateStr);
	return d.toLocaleDateString(locale, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

/**
 * 전체 로그 타임스탬프 — ex: "2026-02-18 09:30:45"
 * 사용: broadcast.tsx (액션 로그)
 */
export const formatLogTime = (dateStr: string): string => {
	const d = new Date(dateStr);
	return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
};

/**
 * Font Registry — 시스템 + DB 폰트 통합 레지스트리
 * 그래픽 편집기, 폰트 관리 페이지 등에서 사용 가능한 폰트 목록 제공
 */

import { useQuery } from "@tanstack/react-query";
import { fetchFonts, type FontItem } from "../services/fontService";

// ─── 시스템 폰트 정의 ─────────────────────────────────────────────

/** 시스템 폰트 엔트리 (로컬 번들링된 폰트) */
export interface SystemFontEntry {
	family: string;
	label: string;
	weights: number[];
	category: "system" | "broadcast" | "custom";
	license: string;
	previewText: string;
	/** 한글 지원 폰트 여부 */
	isKorean: boolean;
}

/** 빌드에 포함된 시스템 폰트 목록 (public/fonts/ 에 번들링) */
export const SYSTEM_FONTS: SystemFontEntry[] = [
	// ─── UI 시스템 폰트 ──────────────────────────────────
	{
		family: "Inter",
		label: "Inter",
		weights: [400, 500, 600, 700],
		category: "system",
		license: "OFL",
		previewText: "The quick brown fox jumps over 1234567890",
		isKorean: false,
	},
	{
		family: "Pretendard",
		label: "프리텐다드",
		weights: [400, 500, 600, 700],
		category: "system",
		license: "OFL",
		previewText: "가나다라마바사 아자차카타파하 0123456789",
		isKorean: true,
	},
	{
		family: "JetBrains Mono",
		label: "JetBrains Mono",
		weights: [400, 700],
		category: "system",
		license: "Apache 2.0",
		previewText: "const fn = () => { return 42; }",
		isKorean: false,
	},
	// ─── 본문/UI용 한글 ─────────────────────────────────
	{
		family: "Spoqa Han Sans Neo",
		label: "스포카 한 산스 네오",
		weights: [400, 500, 700],
		category: "broadcast",
		license: "OFL",
		previewText: "가나다라 ABCDE 12345 ₩100,000",
		isKorean: true,
	},
	{
		family: "SUIT",
		label: "수트 (SUIT)",
		weights: [300, 400, 500, 600, 700, 800, 900],
		category: "broadcast",
		license: "OFL",
		previewText: "단정하고 세련된 한글 고딕 ABCDE",
		isKorean: true,
	},
	{
		family: "Noto Sans KR",
		label: "본고딕 (Noto Sans KR)",
		weights: [400, 500, 600, 700],
		category: "broadcast",
		license: "OFL",
		previewText: "구글 어도비 합작 근본 고딕 ABC 123",
		isKorean: true,
	},
	// ─── 제목/CG용 한글 ──────────────────────────────────
	{
		family: "Gmarket Sans",
		label: "지마켓 산스",
		weights: [300, 500, 700],
		category: "broadcast",
		license: "무료(상업용)",
		previewText: "큰 제목 타이틀 BREAKING NEWS",
		isKorean: true,
	},
	{
		family: "NanumSquare Neo",
		label: "나눔스퀘어 네오",
		weights: [300, 400, 700, 800, 900],
		category: "broadcast",
		license: "OFL",
		previewText: "뉴스 속보 인포그래픽 LIVE 2026",
		isKorean: true,
	},
	{
		family: "S-Core Dream",
		label: "에스코어 드림",
		weights: [300, 400, 500, 600, 700, 800, 900],
		category: "broadcast",
		license: "무료(상업용)",
		previewText: "꽉 찬 제목용 고딕 HEADLINE 뉴스",
		isKorean: true,
	},
	// ─── 영문 추가 폰트 ──────────────────────────────────
	{
		family: "Roboto",
		label: "Roboto",
		weights: [400, 500, 700],
		category: "broadcast",
		license: "Apache 2.0",
		previewText: "Google Material Design ABC 123",
		isKorean: false,
	},
	{
		family: "Roboto Condensed",
		label: "Roboto Condensed",
		weights: [400, 700],
		category: "broadcast",
		license: "Apache 2.0",
		previewText: "CONDENSED NARROW TEXT FOR TABLES",
		isKorean: false,
	},
	{
		family: "Montserrat",
		label: "Montserrat",
		weights: [400, 500, 600, 700],
		category: "broadcast",
		license: "OFL",
		previewText: "MODERN GEOMETRIC TITLE 2026",
		isKorean: false,
	},
	{
		family: "Oswald",
		label: "Oswald",
		weights: [400, 500, 600, 700],
		category: "broadcast",
		license: "OFL",
		previewText: "SPORTS NEWS TICKER LIVE SCORE",
		isKorean: false,
	},
	{
		family: "Poppins",
		label: "Poppins",
		weights: [400, 500, 600, 700],
		category: "broadcast",
		license: "OFL",
		previewText: "Friendly Round Web Graphics 42",
		isKorean: false,
	},
];

// ─── 통합 레지스트리 훅 ────────────────────────────────────────────

/** 사용 가능한 모든 폰트 목록 (시스템 + DB 업로드) */
export interface FontRegistryEntry {
	family: string;
	label: string;
	weights: number[];
	category: "system" | "broadcast" | "custom";
	license: string;
	source: "bundled" | "uploaded";
	previewText: string;
	isKorean: boolean;
}

/** 시스템 폰트 + DB 폰트를 통합하여 반환하는 훅 */
export function useFontRegistry() {
	const { data: dbFonts = [] } = useQuery<FontItem[]>({
		queryKey: ["fonts"],
		queryFn: () => fetchFonts(),
	});

	// 시스템 폰트를 레지스트리 엔트리로 변환
	const systemEntries: FontRegistryEntry[] = SYSTEM_FONTS.map((sf) => ({
		family: sf.family,
		label: sf.label,
		weights: sf.weights,
		category: sf.category,
		license: sf.license,
		source: "bundled" as const,
		previewText: sf.previewText,
		isKorean: sf.isKorean,
	}));

	// DB 폰트를 family별로 그룹핑하여 레지스트리 엔트리로 변환
	const familyMap = new Map<string, FontRegistryEntry>();
	for (const font of dbFonts) {
		const existing = familyMap.get(font.family_name);
		if (existing) {
			if (!existing.weights.includes(font.weight)) {
				existing.weights.push(font.weight);
				existing.weights.sort((a, b) => a - b);
			}
		} else {
			familyMap.set(font.family_name, {
				family: font.family_name,
				label: font.display_name,
				weights: [font.weight],
				category: font.category,
				license: font.license_type,
				source: "uploaded" as const,
				previewText: "가나다라 ABCDE 12345",
				isKorean: false,
			});
		}
	}

	const uploadedEntries = Array.from(familyMap.values());

	return {
		fonts: [...systemEntries, ...uploadedEntries],
		systemFonts: systemEntries,
		uploadedFonts: uploadedEntries,
	};
}

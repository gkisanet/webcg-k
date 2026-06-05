/**
 * 데이터 소스 관리 — 타입/상수/헬퍼
 * datasources.tsx, NrcsPanel.tsx, CustomSourceModal.tsx 에서 공유
 */

// ─── 탭 종류 ────────────────────────────────────────────────────
export type TabType = "live-sources" | "nrcs";

// ─── 빌트인 데이터 소스 카드 정의 ────────────────────────────────
export interface SourceCardDef {
    type: string;
    icon: string;
    title: string;
    provider: string;
    description: string;
    tags: Array<{ label: string; class: string }>;
    accent: string;
    hasCity?: boolean;
    isBuiltIn: true;
}

// ─── 커스텀 소스 폼 ─────────────────────────────────────────────
export interface CustomSourceForm {
    name: string;
    icon: string;
    provider: string;
    description: string;
    endpoint: string;
    method: "GET" | "POST";
    headers: Array<{ key: string; value: string }>;
    query_params: Array<{ key: string; value: string }>;
    auth_type: "none" | "api_key" | "bearer";
    accent: string;
}

// ─── 한국 주요 도시 ─────────────────────────────────────────────
export const KOREA_CITIES = ["서울", "부산", "대구", "인천", "광주", "대전", "제주"];

// ─── 빌트인 데이터 소스 목록 ────────────────────────────────────
export const BUILTIN_SOURCES: SourceCardDef[] = [
    {
        type: "weather",
        icon: "🌤",
        title: "실시간 날씨",
        provider: "Open-Meteo API",
        description: "현재 기온, 날씨 상태, 습도, 풍속 데이터를 실시간으로 가져옵니다.",
        tags: [
            { label: "무료", class: "free" },
            { label: "인증 불필요", class: "free" },
        ],
        accent: "rgba(96, 165, 250, 0.5)",
        hasCity: true,
        isBuiltIn: true,
    },
    {
        type: "earthquake",
        icon: "🌍",
        title: "지진 정보",
        provider: "USGS Earthquake API",
        description: "최근 24시간 동아시아(한반도 근처) M2.5+ 지진 데이터를 조회합니다.",
        tags: [
            { label: "무료", class: "free" },
            { label: "인증 불필요", class: "free" },
        ],
        accent: "rgba(245, 158, 11, 0.5)",
        isBuiltIn: true,
    },
    {
        type: "wildfire",
        icon: "🔥",
        title: "산불 현황",
        provider: "공공데이터 (Mock)",
        description: "전국 산불 발생 현황 및 진화 상태를 표시합니다. 현재 Mock 데이터 사용.",
        tags: [
            { label: "Mock", class: "mock" },
            { label: "추후 연동", class: "" },
        ],
        accent: "rgba(239, 68, 68, 0.5)",
        isBuiltIn: true,
    },
    {
        type: "public_data",
        icon: "📊",
        title: "공공 데이터",
        provider: "JSONPlaceholder (Mock)",
        description: "뉴스/SNS 스타일의 텍스트 게시물 데이터를 조회합니다.",
        tags: [
            { label: "Mock", class: "mock" },
            { label: "테스트용", class: "" },
        ],
        accent: "rgba(139, 92, 246, 0.5)",
        isBuiltIn: true,
    },
];

// ─── 이모지 아이콘 선택지 ───────────────────────────────────────
export const ICON_OPTIONS = ["🔗", "📡", "📊", "🌐", "⚡", "🏢", "📰", "🎯", "💹", "🛰️", "📈", "🗂️"];

// ─── 악센트 컬러 선택지 ─────────────────────────────────────────
export const ACCENT_OPTIONS = [
    "rgba(99, 102, 241, 0.5)",   // 인디고
    "rgba(236, 72, 153, 0.5)",   // 핑크
    "rgba(16, 185, 129, 0.5)",   // 에메랄드
    "rgba(245, 158, 11, 0.5)",   // 앰버
    "rgba(139, 92, 246, 0.5)",   // 바이올렛
    "rgba(6, 182, 212, 0.5)",    // 시안
    "rgba(239, 68, 68, 0.5)",    // 레드
    "rgba(132, 204, 22, 0.5)",   // 라임
];

// ─── 커스텀 소스 폼 초기값 ──────────────────────────────────────
export const EMPTY_FORM: CustomSourceForm = {
    name: "",
    icon: "🔗",
    provider: "",
    description: "",
    endpoint: "",
    method: "GET",
    headers: [{ key: "", value: "" }],
    query_params: [{ key: "", value: "" }],
    auth_type: "none",
    accent: "rgba(99, 102, 241, 0.5)",
};

// ─── 헬퍼 함수 ─────────────────────────────────────────────────

/** key-value 배열 → Record 변환 (빈 항목 제외) */
export function kvToRecord(pairs: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const p of pairs) {
        if (p.key.trim()) result[p.key.trim()] = p.value;
    }
    return result;
}

/** Record → key-value 배열 변환 */
export function recordToKv(record: Record<string, string> | null | undefined): Array<{ key: string; value: string }> {
    if (!record || Object.keys(record).length === 0) return [{ key: "", value: "" }];
    return Object.entries(record).map(([key, value]) => ({ key, value }));
}

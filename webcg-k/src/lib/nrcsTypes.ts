/**
 * NRCS (뉴스룸 컴퓨터 시스템) 타입 정의
 * 방송국 보도정보시스템과의 연동을 위한 데이터 모델
 */

// ─── 총국 (Bureau) ──────────────────────────────────────────────

/** KBS 본사 및 9개 지역 총국 */
export type BureauCode =
	| "HQ"       // 본사 (여의도)
	| "BUSAN"    // 부산총국
	| "DAEGU"    // 대구총국
	| "GWANGJU"  // 광주총국
	| "DAEJEON"  // 대전총국
	| "CHUNCHEON" // 춘천총국
	| "CHEONGJU" // 청주총국
	| "JEONJU"   // 전주총국
	| "CHANGWON" // 창원총국
	| "JEJU";    // 제주총국

export interface Bureau {
	code: BureauCode;
	name: string;
	region: string;
}

/** 전체 총국 목록 */
export const BUREAUS: Bureau[] = [
	{ code: "HQ", name: "KBS 본사", region: "서울" },
	{ code: "BUSAN", name: "부산총국", region: "부산" },
	{ code: "DAEGU", name: "대구총국", region: "대구" },
	{ code: "GWANGJU", name: "광주총국", region: "광주" },
	{ code: "DAEJEON", name: "대전총국", region: "대전" },
	{ code: "CHUNCHEON", name: "춘천총국", region: "강원" },
	{ code: "CHEONGJU", name: "청주총국", region: "충북" },
	{ code: "JEONJU", name: "전주총국", region: "전북" },
	{ code: "CHANGWON", name: "창원총국", region: "경남" },
	{ code: "JEJU", name: "제주총국", region: "제주" },
];

// ─── 뉴스 프로그램 ──────────────────────────────────────────────

export interface NewsProgram {
	id: string;
	name: string;        // "KBS 뉴스 9"
	airTime: string;     // "21:00"
	duration: number;    // 분 단위
	bureau: BureauCode;
	date: string;        // "2026-02-19"
	itemCount: number;   // 기사 수
	status: "editing" | "ready" | "onair" | "done";
}

// ─── CG 텍스트 ─────────────────────────────────────────────────

/** CG 텍스트 유형 — 뉴스에 나갈 그래픽 텍스트의 성격 분류 (13종) */
export type CgTextType =
	| "super"        // 슈퍼 — 인터뷰이 이름/직함 (예: "홍길동 / 서울시 관계자")
	| "source"       // 출처 (예: "KBS 취재", "AP 통신 제공")
	| "band"         // 밴드 — 뉴스 요약 한 줄 (예: "정부, 추경안 국회 제출")
	| "headline"     // 헤드라인 — 큰 제목
	| "subheadline"  // 서브 헤드라인
	| "crawl"        // 크롤(속보 띠) — 화면 하단 스크롤
	| "locator"      // 지역/장소 (예: "서울 여의도")
	| "lowthird"     // 하단 자막 (이름+직함 조합)
	| "fullcg"       // 풀화면 CG (인포그래픽 등)
	| "credit"       // 스태프 크레딧 (예: "촬영기자 이상원 / 영상편집 이상미")
	| "soundbite"    // 사운드바이트 — 인터뷰이 발언 자막
	| "reporter"     // 기자 현장 리포트 (예: "이 시각 서울중앙지방법원 / 황현규")
	| "flash";       // 속보·긴급 대형 헤드라인 (HEADLINE NEWS)

/** CG 텍스트 유형별 라벨 */
export const CG_TYPE_LABELS: Record<CgTextType, string> = {
	super: "슈퍼",
	source: "출처",
	band: "밴드",
	headline: "헤드라인",
	subheadline: "서브 헤드라인",
	crawl: "속보 크롤",
	locator: "지역/장소",
	lowthird: "하단 자막",
	fullcg: "풀CG",
	credit: "크레딧",
	soundbite: "사운드바이트",
	reporter: "기자 리포트",
	flash: "속보 헤드라인",
};

/** CG 텍스트 유형별 색상 */
export const CG_TYPE_COLORS: Record<CgTextType, string> = {
	super: "#f59e0b",
	source: "#6366f1",
	band: "#ef4444",
	headline: "#10b981",
	subheadline: "#14b8a6",
	crawl: "#ec4899",
	locator: "#8b5cf6",
	lowthird: "#3b82f6",
	fullcg: "#f97316",
	credit: "#78716c",
	soundbite: "#06b6d4",
	reporter: "#22d3ee",
	flash: "#dc2626",
};

/** 개별 CG 텍스트 아이템 */
export interface CgTextItem {
	id: string;
	type: CgTextType;
	/** 필드 매핑: 존 콘텐츠에 들어갈 key-value */
	fields: Record<string, string>;
	/** CG 순서 */
	order: number;
}

// ─── 뉴스 아이템 (기사) ─────────────────────────────────────────

/** 기사 유형 */
export type ArticleType =
	| "report"      // 리포트
	| "interview"   // 인터뷰
	| "breaking"    // 속보
	| "anchor"      // 앵커 멘트
	| "package"     // 패키지
	| "live";       // 현장 중계

export const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
	report: "리포트",
	interview: "인터뷰",
	breaking: "속보",
	anchor: "앵커",
	package: "패키지",
	live: "현장",
};

export interface NrcsNewsItem {
	id: string;
	slug: string;           // "PKG-뉴스9-추경안"
	title: string;          // 기사 제목
	articleType: ArticleType;
	reporter: string;       // 기자 이름
	department: string;     // 소속 부서
	duration: number;       // 초 단위
	status: "editing" | "ready" | "approved";
	bodyText: string;       // 기사 원고
	cgTexts: CgTextItem[];  // CG 텍스트 목록
}

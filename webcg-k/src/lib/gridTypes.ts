/**
 * Grid Template System Types
 * FancyZones 스타일 그리드 레이아웃 시스템
 */

// Zone 타입 (기본 6종 + 뉴스 CG 시맨틱 4종)
export type ZoneType =
	| "background" // 배경
	| "logo"       // 로고
	| "lowthird"   // 하단 자막
	| "video"      // 비디오 (PIP, 수어 등)
	| "text"       // 텍스트 박스
	| "graphic"    // 커스텀 그래픽
	| "band"       // 밴드 (뉴스 요약 1줄)
	| "headline"   // 헤드라인 (대형 제목)
	| "crawl"      // 크롤 (횡스크롤 속보 띠)
	| "super";     // 슈퍼 (인물 이름/직함)

// Zone 스타일
export interface ZoneStyle {
	backgroundColor?: string;
	borderColor?: string;
	borderWidth?: number;
	opacity?: number;
	fontSize?: number;
	fontColor?: string;
	fontWeight?: string | number;
	fontFamily?: string;
	textAlign?: "left" | "center" | "right";
	padding?: number;
}

// Zone 콘텐츠
export interface ZoneContent {
	// Low Third
	title?: string;
	subtitle?: string;

	// Logo/Image
	imageUrl?: string;

	// Video
	videoUrl?: string;

	// Text
	text?: string;

	// Graphic (커스텀)
	graphicId?: string;
}

// Zone (영역)
export interface Zone {
	id: string;
	name: string; // "로고 영역", "Low Third" 등
	type: ZoneType;
	bounds: {
		x: number; // 픽셀 단위 (0~1920)
		y: number; // 픽셀 단위 (0~1080)
		width: number;
		height: number;
	};
	content?: ZoneContent; // 실제 콘텐츠 (선택사항)
	style?: ZoneStyle;
	zIndex: number; // 레이어 순서
	visible: boolean; // 가시성
	locked: boolean; // 잠금
}

// Grid Template
export interface GridTemplate {
	id?: string;
	name: string; // "KBS 뉴스 레이아웃"
	description?: string;
	canvas: {
		width: number; // 1920
		height: number; // 1080
	};
	zones: Zone[]; // 영역 목록 (기존 방식)
	splits?: SplitLine[]; // 분할선 목록 (새 방식)
	thumbnail?: string;
}

// 분할선 타입 (FancyZones 스타일)
export interface SplitLine {
	id: string;
	orientation: "horizontal" | "vertical";
	position: number; // 0~100 퍼센트
	start: number;
	end: number;
	parentId: string | null;
}

// Database Row
export interface GridTemplateRow {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	template_data: GridTemplate;
	thumbnail_path: string | null;
	is_public: boolean;
	forked_from: string | null;
	created_at: string;
	updated_at: string;
}

// Zone 기본값 생성 헬퍼
export function createZone(
	type: ZoneType,
	bounds: Zone["bounds"],
	name?: string,
): Zone {
	const defaults: Record<ZoneType, Partial<Zone>> = {
		background: {
			style: { backgroundColor: "#1a1a1a" },
		},
		logo: {
			style: { backgroundColor: "transparent" },
		},
		lowthird: {
			style: {
				backgroundColor: "#000000",
				fontSize: 24,
				fontColor: "#ffffff",
				padding: 20,
			},
		},
		video: {
			style: { backgroundColor: "#000000" },
		},
		text: {
			style: {
				fontSize: 18,
				fontColor: "#ffffff",
				textAlign: "left",
				padding: 10,
			},
		},
		graphic: {
			style: { backgroundColor: "transparent" },
		},
		band: {
			style: {
				backgroundColor: "rgba(200, 30, 30, 0.85)",
				fontSize: 28,
				fontColor: "#ffffff",
				fontWeight: 700,
				padding: 16,
			},
		},
		headline: {
			style: {
				backgroundColor: "rgba(255, 255, 255, 0.95)",
				fontSize: 48,
				fontColor: "#111111",
				fontWeight: 800,
				padding: 24,
			},
		},
		crawl: {
			style: {
				backgroundColor: "rgba(200, 30, 30, 0.90)",
				fontSize: 22,
				fontColor: "#ffffff",
				fontWeight: 600,
				padding: 8,
			},
		},
		super: {
			style: {
				backgroundColor: "rgba(0, 0, 0, 0.75)",
				fontSize: 32,
				fontColor: "#ffffff",
				fontWeight: 700,
				padding: 12,
			},
		},
	};

	return {
		id: crypto.randomUUID(),
		name: name || `${type} 영역`,
		type,
		bounds,
		zIndex: 0,
		visible: true,
		locked: false,
		...defaults[type],
	};
}

// 빈 템플릿 생성
export function createEmptyTemplate(): GridTemplate {
	return {
		name: "새 템플릿",
		canvas: {
			width: 1920,
			height: 1080,
		},
		zones: [],
	};
}

// KBS 뉴스 프리셋
export function createKBSNewsTemplate(): GridTemplate {
	return {
		name: "KBS 뉴스",
		description: "KBS 뉴스 스타일 레이아웃 (로고, Low Third, 수어)",
		canvas: {
			width: 1920,
			height: 1080,
		},
		zones: [
			createZone("background", { x: 0, y: 0, width: 1920, height: 1080 }, "메인 배경"),
			createZone(
				"logo",
				{ x: 1720, y: 20, width: 180, height: 80 },
				"방송사 로고",
			),
			createZone(
				"lowthird",
				{ x: 0, y: 960, width: 1720, height: 120 },
				"하단 자막",
			),
			createZone(
				"video",
				{ x: 1720, y: 880, width: 200, height: 200 },
				"수어 통역",
			),
		],
	};
}

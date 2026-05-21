/**
 * AI SVG 생성 서비스 — Gemini를 활용한 방송 그래픽 SVG 생성
 *
 * ■ Why 별도 서비스?
 *   기존 aiCgService.ts는 GraphicElement[] JSON을 생성하는 오버레이 전용.
 *   SVG는 완전히 다른 출력 포맷(XML 마크업)이므로 별도 모듈로 분리.
 *
 * ■ 2026-05: Gemini OpenAI 호환 엔드포인트로 전환 (네이티브 API 대체)
 *
 * ■ 플로우:
 *   1. 사용자 프롬프트 + viewBox 크기 입력
 *   2. Gemini API 호출 — OpenAI 호환 엔드포인트 (DB api_keys에서 키 조회)
 *   3. SVG 코드 반환 → DOMParser 유효성 검증
 *   4. Blob → File 변환 → Supabase Storage 업로드
 */

import { supabase } from "@/lib/supabase";

// ─── 상수 ─────────────────────────────────────────────────────────

const SVG_MODEL_ID = "gemini-2.5-pro";
const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000;

// ■ Why 이 시스템 프롬프트가 핵심인가?
//   AI는 SVG를 렌더링 결과를 보지 않고 코드만으로 생성한다.
//   "예쁘게 그려줘" 대신 "수학적으로 정확하게 조립하라"고 지시해야
//   형태가 무너지지 않는다. (docs/guide/SVG_GENERATION_GUIDE.md 참조)
const SVG_SYSTEM_PROMPT = `당신은 15년 경력의 UI/UX 아이콘 디자이너이자 수석 프론트엔드 개발자입니다.
사용자의 요청에 맞는 깔끔하고 확장 가능한 SVG 코드를 생성하세요.

## 엄격한 SVG 작성 규칙

### 1. 출력 형식
- <svg> 태그만 반환하세요. 다른 코드, 설명, 마크다운 절대 금지.
- xmlns="http://www.w3.org/2000/svg" 필수.
- viewBox는 사용자가 지정한 크기를 정확히 사용하세요.

### 2. 도형 제한 (가장 중요!)
- 형태가 일그러지는 것을 막기 위해 복잡한 베지에 곡선(<path> 태그) 사용을 엄격히 최소화하세요.
- 반드시 <rect>, <circle>, <ellipse>, <polygon>, <line> 등 기본 기하학적 도형을 위주로 겹치고 조립해서 대상을 표현하세요.
- <rect>의 rx, ry 속성으로 모서리를 둥글게 하는 것은 적극 권장합니다.

### 3. 그룹화 및 주석 (Chain of Thought)
- 각 구성 요소를 <g> 태그로 묶어주세요.
- 반드시 코드 위에 <!-- 🎨 요소명 --> 같은 설계 의도를 명시하는 주석을 달아주세요.
- 주석은 AI 자신이 어디를 그리고 있는지 인지하는 역할을 합니다.

### 4. 렌더링 순서 (Z-index)
- SVG는 코드가 아래에 적힐수록 화면의 맨 앞에 그려집니다.
- 반드시 배경 → 중간 요소 → 전경 디테일 순서로 코드를 작성하세요.

### 5. 색상 및 스타일
- 색상은 hex 값(#RRGGBB) 사용.
- 4가지 이하의 조화로운 솔리드 컬러만 사용하세요.
- 그라데이션은 단순한 linearGradient/radialGradient만 허용. 복잡한 메쉬 그라데이션 금지.
- 텍스트가 필요하면 반드시 <text> 태그를 사용하세요. 절대 path로 글자를 그리지 마세요.

### 6. 캔버스 배치
- 주요 객체는 캔버스의 정중앙을 기준으로 대칭에 맞게 배치하세요.
- 프로페셔널한 방송 품질의 깔끔한 디자인을 만드세요.

## 스타일 가이드
- 뉴스 방송: 깔끔한 라인, 블루/화이트/골드 계열, 기하학적
- 엔터테인먼트: 화려한 그라데이션, 핑크/퍼플/네온 계열
- 스포츠: 다이내믹한 각도, 레드/블랙/화이트 계열
- 날씨: 자연 색상, 그라데이션 배경, 아이콘 중심`;

// ─── SVG 스타일 프리셋 ────────────────────────────────────────────

export const SVG_STYLE_PRESETS = [
	{ id: "news_lower", label: "뉴스 하단자막 배경", description: "깔끔한 하단 바 + 그라데이션" },
	{ id: "news_headline", label: "헤드라인 프레임", description: "속보/헤드라인용 강조 프레임" },
	{ id: "infographic", label: "인포그래픽", description: "차트/도표 배경 요소" },
	{ id: "logo_badge", label: "로고/배지", description: "방송국 로고 또는 프로그램 엠블럼" },
	{ id: "bg_pattern", label: "배경 패턴", description: "반복 패턴 또는 텍스처 배경" },
	{ id: "decoration", label: "장식 요소", description: "스크롤 장식, 프레임 장식" },
	{ id: "icon_set", label: "아이콘 세트", description: "방송 그래픽용 미니 아이콘" },
	{ id: "transition", label: "전환 효과", description: "화면 전환 모양/마스크" },
] as const;

export type SvgStylePreset = typeof SVG_STYLE_PRESETS[number]["id"];

// ─── API 키 조회 ──────────────────────────────────────────────────

/**
 * DB api_keys에서 Gemini SVG용 API 키 조회
 *
 * ■ 키 탐색 순서:
 *   1. service="gemini-svg" 인 키 (전용 키)
 *   2. service="gemini" 인 키 (공용 Gemini 키)
 *   3. 환경변수 VITE_GEMINI_API_KEY (개발용 폴백)
 *
 * ■ 보안 변경 (2026-05):
 *   encrypted_key 컬럼을 직접 SELECT하면 암호화된 blob이 클라이언트로 전송됨.
 *   대신 id만 조회하고, get_decrypted_api_key() SECURITY DEFINER RPC를 통해
 *   DB 서버 내부에서만 복호화 후 평문을 반환받는 방식으로 변경.
 *   → 네트워크 상에서 암호화 키(blob)가 노출되지 않음.
 */
async function getSvgApiKey(): Promise<string> {
	// 1단계: gemini-svg 전용 키 id 조회
	// ■ maybeSingle() 도입: 일치하는 행이 없어도 콘솔에 에러 객체를 뿜지 않게 방어 (개발 가독성 증대)
	const { data: svgKey } = await supabase
		.from("api_keys")
		.select("id")
		.eq("service", "gemini-svg")
		.limit(1)
		.maybeSingle();

	if (svgKey?.id) {
		// ■ pg_crypto로 암호화된 컬럼 복호화: RPC 보안 함수 래핑 호출
		const { data: decrypted } = await supabase
			.rpc("get_decrypted_api_key" as any, { key_id: svgKey.id });
		if (decrypted) return decrypted as any as string;
	}

	// 2단계: 일반 gemini 키 id 조회
	const { data: geminiKey } = await supabase
		.from("api_keys")
		.select("id")
		.eq("service", "gemini")
		.limit(1)
		.maybeSingle();

	if (geminiKey?.id) {
		const { data: decrypted } = await supabase
			.rpc("get_decrypted_api_key" as any, { key_id: geminiKey.id });
		if (decrypted) return decrypted as any as string;
	}

	// 3단계: 환경변수 폴백 (개발용)
	const envKey = import.meta.env.VITE_GEMINI_API_KEY;
	if (envKey) return envKey;

	throw new Error(
		"SVG 생성용 Gemini API 키가 없습니다. 관리자 → API 키 탭에서 'gemini-svg' 서비스로 등록하세요."
	);
}

// ─── Gemini API 호출 (OpenAI 호환 엔드포인트) ──────────────────

async function callGeminiSvg(
	prompt: string,
	apiKey: string,
	retryCount = 0,
): Promise<{ svg: string; usage: unknown }> {
	const url = `${GEMINI_OPENAI_BASE}/chat/completions`;

	const body = {
		model: SVG_MODEL_ID,
		messages: [
			{ role: "system", content: SVG_SYSTEM_PROMPT },
			{ role: "user", content: prompt },
		],
		temperature: 0.8,
		max_tokens: 16384,
		top_p: 0.95,
	};

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});

	// Rate Limit 재시도
	if (res.status === 429 && retryCount < MAX_RETRIES) {
		console.warn(`[AI-SVG] Rate limit, ${RETRY_DELAY_MS / 1000}초 후 재시도`);
		await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
		return callGeminiSvg(prompt, apiKey, retryCount + 1);
	}

	if (!res.ok) {
		const errorBody = await res.text();
		throw new Error(`Gemini SVG API 에러 (${res.status}): ${errorBody}`);
	}

	const json = await res.json();
	const text = json.choices?.[0]?.message?.content;
	if (!text) throw new Error("Gemini 응답에서 SVG를 찾을 수 없습니다.");

	// SVG 태그 추출 (마크다운 코드블록 제거)
	const svgCode = extractSvgFromResponse(text);

	return { svg: svgCode, usage: json.usage };
}

// ─── SVG 추출 + 유효성 검증 ────────────────────────────────────────

/**
 * AI 응답에서 <svg> 코드를 추출하고 유효성 검증
 */
function extractSvgFromResponse(raw: string): string {
	let cleaned = raw.trim();

	// 1. 마크다운 코드블록 제거
	const codeBlockMatch = cleaned.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		cleaned = codeBlockMatch[1].trim();
	}

	// 2. <svg> 태그 추출
	const svgMatch = cleaned.match(/<svg[\s\S]*<\/svg>/i);
	if (!svgMatch) {
		throw new Error("응답에서 유효한 <svg> 태그를 찾을 수 없습니다.");
	}

	let svgCode = svgMatch[0];

	// 3. DOMParser로 유효성 검증 및 호환성 속성 주입
	if (typeof DOMParser !== "undefined") {
		const parser = new DOMParser();
		const doc = parser.parseFromString(svgCode, "image/svg+xml");
		const parseError = doc.querySelector("parsererror");
		if (parseError) {
			throw new Error(`SVG 파싱 에러: ${parseError.textContent?.slice(0, 100)}`);
		}

		// 렌더러 호환성 향상 (Graphics Editor 등 외부 <image> 태그에서 렌더링 안되는 버그 방지)
		const svgElement = doc.documentElement;
		if (!svgElement.hasAttribute("xmlns")) svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		if (!svgElement.hasAttribute("width")) svgElement.setAttribute("width", "100%");
		if (!svgElement.hasAttribute("height")) svgElement.setAttribute("height", "100%");

		svgCode = new XMLSerializer().serializeToString(doc);
	}

	return svgCode;
}

// ─── 사용량 기록 ──────────────────────────────────────────────────

function logSvgUsage(usage: unknown) {
	const u = usage as Record<string, number> | null;
	if (!u) return;

	void (async () => {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			await supabase.from("ai_usage_logs").insert({
				model_id: SVG_MODEL_ID,
				prompt_tokens: u.prompt_tokens ?? u.promptTokenCount ?? 0,
				completion_tokens: u.completion_tokens ?? u.candidatesTokenCount ?? 0,
				total_tokens: u.total_tokens ?? u.totalTokenCount ?? 0,
				request_type: "svg_generation",
				user_id: user?.id ?? null,
			});
		} catch (err) {
			console.warn("[AI-SVG] 사용량 기록 실패:", err);
		}
	})();
}

// ─── Public API ───────────────────────────────────────────────────

export interface SvgGenerationResult {
	svgCode: string;
	/** SVG를 Blob URL로 변환한 프리뷰 URL */
	previewUrl: string;
}

/**
 * AI SVG 생성
 *
 * @param prompt - 사용자 프롬프트 (예: "뉴스 하단자막 배경을 만들어줘")
 * @param width - viewBox 너비 (그리드 에디터에서 선택)
 * @param height - viewBox 높이
 * @param style - 스타일 프리셋 (선택)
 * @returns SVG 코드 + 프리뷰 URL
 */
export async function generateSvg(
	prompt: string,
	width: number,
	height: number,
	style?: SvgStylePreset,
): Promise<SvgGenerationResult> {
	const apiKey = await getSvgApiKey();

	const styleDesc = style
		? SVG_STYLE_PRESETS.find((p) => p.id === style)?.description || ""
		: "";

	// ■ Why 구조화된 프롬프트?
	//   가이드라인에 따라 "건축 설계도"처럼 요청/캔버스/스타일을 분리하면
	//   AI가 맥락을 잃지 않고 정확한 좌표 계산을 수행한다.
	const fullPrompt = `## 요청
${prompt}

## 캔버스
- viewBox="0 0 ${width} ${height}"
- 정중앙: cx="${Math.round(width / 2)}", cy="${Math.round(height / 2)}"
- 주요 객체는 정중앙 기준으로 대칭 배치

${styleDesc ? `## 스타일\n${styleDesc}` : ""}

## 출력 규칙
- <svg> 태그만 반환. xmlns="http://www.w3.org/2000/svg" 필수.
- <path> 최소화, 기본 도형(<rect>, <circle>, <ellipse>, <polygon>) 위주로 조립.
- 각 구성 요소를 <g> 태그로 묶고 <!-- 🎨 요소명 --> 주석 필수.
- 렌더링 순서: 배경(코드 상단) → 전경(코드 하단).`;

	const { svg, usage } = await callGeminiSvg(fullPrompt, apiKey);

	// 사용량 기록
	logSvgUsage(usage);

	// Blob URL 생성 (프리뷰용)
	const blob = new Blob([svg], { type: "image/svg+xml" });
	const previewUrl = URL.createObjectURL(blob);

	return { svgCode: svg, previewUrl };
}

/**
 * SVG를 Supabase Storage에 업로드
 *
 * @param svgCode - SVG 코드 문자열
 * @param name - 파일 이름 (확장자 없이)
 * @param description - 설명
 * @returns 업로드된 이미지 ID
 */
export async function uploadSvgToStorage(
	svgCode: string,
	name: string,
	description: string,
	category: string,
	bounds?: { x: number; y: number; width: number; height: number } | null,
): Promise<string> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error("인증 필요");

	const timestamp = Date.now();
	// Supabase Storage "Invalid key" 에러 방지를 위해 경로에는 한글/특수문자 제외
	const safeAsciiName = name.replace(/[^a-zA-Z0-9.-]/g, "").substring(0, 30) || "ai_svg";
	const storagePath = `${user.id}/svg/${timestamp}_${safeAsciiName}.svg`;

	// 1. Storage에 SVG 파일 업로드
	const blob = new Blob([svgCode], { type: "image/svg+xml" });
	const file = new File([blob], `${safeAsciiName}.svg`, { type: "image/svg+xml" });

	const { error: uploadError } = await supabase.storage
		.from("images")
		.upload(storagePath, file, {
			cacheControl: "3600",
			contentType: "image/svg+xml",
			upsert: false,
		});

	if (uploadError) throw new Error(`SVG 업로드 실패: ${uploadError.message}`);

	// Bounds 정보가 있다면 keywords에 특수 포맷으로 인코딩하여 저장
	let keywords: string[] | null = null;
	if (bounds) {
		keywords = [
			`_posX:${bounds.x}`,
			`_posY:${bounds.y}`,
			`_posW:${bounds.width}`,
			`_posH:${bounds.height}`,
		];
	}

	// 2. DB에 메타데이터 저장
	const { data, error: dbError } = await supabase
		.from("images")
		.insert({
			owner_id: user.id,
			name: name.trim(),
			description: description.trim() || "AI 생성 SVG",
			category: category || "기타",
			storage_path: storagePath,
			storage_path_2k: storagePath,  // SVG는 해상도 무관
			storage_path_4k: storagePath,
			file_size: blob.size,
			mime_type: "image/svg+xml",
			keywords,
		})
		.select("id")
		.single();

	if (dbError) {
		// Storage 정리
		await supabase.storage.from("images").remove([storagePath]);
		throw new Error(`DB 저장 실패: ${dbError.message}`);
	}

	return data.id;
}

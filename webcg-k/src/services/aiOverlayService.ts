/**
 * AI 오버레이 코드 생성 서비스
 *
 * ■ Why 별도 서비스?
 *   aiCgService.ts는 GraphicElement[] JSON을 생성하는 캔버스 그래픽 전용.
 *   오버레이 플러그인은 HTML/CSS/JS + dashboard_schema를 생성해야 하므로
 *   시스템 프롬프트와 출력 파싱이 완전히 다르다.
 *   단, API 호출 인프라는 aiCoreService.ts에서 공유.
 *
 * ■ 플로우:
 *   1. 시스템 프롬프트 (근본 원칙 기반) + 사용자 프롬프트 + Zone bounds
 *   2. callAI() → JSON 파싱 → { html, css, js, dashboard_schema, replicant_defaults, motion }
 *   3. 결과를 PluginEditor의 코드 탭에 삽입
 */

import {
	type GraphicMotionManifest,
	normalizeGraphicMotionManifest,
} from "../lib/graphicMotionManifest";
import { callAI } from "./aiCoreService";

// ─── 시스템 프롬프트 (근본 원칙 기반) ──────────────────────────
// ■ Why 원칙 기반?
//   구현 패턴(How-to)을 나열하면 프롬프트가 비대해지고 AI가
//   새로운 요구사항에 응용력을 상실한다(오버피팅/환각).
//   대신 시스템이 작동하는 근본 원칙(Fundamental Principles)만
//   정의하면 최신 추론 모델은 패턴을 스스로 도출한다.
//
//   3대 근본 철학:
//   1. 상태의 멱등성 (SSOT) — 오버레이는 Stateless 뷰어
//   2. 절대 시간 동기화 — 로컬 타이머 금지, computeTimerRemaining 사용
//   3. 방송 렌더링 물리 제약 — 60fps GPU 가속, WCAG 가독성

export const OVERLAY_SYSTEM_PROMPT = `당신은 WebCG-K 방송 그래픽 오버레이 생성기입니다. 1920x1080 sandbox iframe 위에서 실행될 HTML/CSS/JS를 생성하세요.

출력은 순수 JSON만 허용합니다:
{"html":"...","css":"...","js":"...","dashboard_schema":{"properties":{}},"replicant_defaults":{},"motion":null}

## P0 런타임 계약
- 최상위 요소는 반드시 #overlay.
- 사용자 Zone이 제공되면 #overlay에 해당 left/top/width/height를 정확히 적용.
- 라이브 영상 위 합성이므로 fullscreen 요청이 아니면 배경은 투명.
- body/#overlay overflow:hidden. 긴 텍스트는 nowrap/ellipsis/min-width:0로 방어.
- 애니메이션은 transform/opacity/filter 중심. top/left/width/height/font-size 애니메이션 금지.
- 방송 가독성: 충분한 대비, 텍스트 그림자, 본문 28px+, 제목 52px+.
- HTML 안에 <script> 금지. 외부 CDN/라이브러리/Anime.js/GSAP 삽입 금지. JS는 js 필드에만 작성.

## WebCG-K API
\`\`\`javascript
webcgk.onData(function(data) {});
webcgk.onShow(function() {});
webcgk.onHide(function() {});
webcgk.onReady(function() {});
webcgk.getData();
webcgk.isVisible();
webcgk.computeTimerRemaining(data);
webcgk.sendToParent(type, payload);
\`\`\`

타이머는 로컬 감산 상태를 만들지 말고 항상 \`webcgk.computeTimerRemaining(data)\`에서 계산하세요.

## 데이터 활용 3레이어
- 레이어 1 표시값: \`data-cg-bind="field"\`, \`data-cg-bind="src:field"\`, \`data-cg-class="class:field"\`, \`data-cg-if="field"\`.
- 레이어 2 디자인 토큰: \`webcgk.onData\`에서 \`document.documentElement.style.setProperty("--accent", data.accentColor)\`.
- 레이어 3 로직: 계산/타이머/상태 분기는 \`webcgk.onData(function(data) { if (data.running) { ... } })\`.
- 스키마 키는 3레이어 중 하나에서 쓰이면 됩니다. 모든 키를 data-cg-*에 강제로 넣지 마세요.

## WebCG-K Motion 탭 계약
AI는 그래픽의 정적 구조와 편집 가능한 모션 의도만 만듭니다. SHOW/HIDE lifecycle 애니메이션은 Motion 탭이 소유하므로 HTML/CSS/JS 안에 직접 구현하지 마세요.
- HTML 요소에는 Motion 탭이 찾을 수 있는 안정적인 selector를 부여하세요. 주요 객체에는 id 또는 의미 있는 class를 사용하세요.
- lifecycle 진입/퇴장 모션은 CSS keyframes, JS 타이머, requestAnimationFrame, webcgk.onShow/onHide 내부 코드로 직접 구현하지 마세요.
- motion이 필요하면 JSON의 motion 필드에만 \`webcgk.motion.v2\` manifest를 작성하세요.
- 기본 출력 형태: \`{"schemaVersion":"webcgk.motion.v2","timeline":[{"target":"#selector","in":"slide-up","out":"fade","at":0,"duration":520,"stagger":60}]}\`.
- 지원 preset: fade, lower-third, headline, scoreboard, stat, pop, slide-left, slide-right, slide-up, slide-down, none.
- target은 반드시 실제 HTML selector와 일치해야 합니다. 없는 selector를 만들지 마세요.
- driver는 기본 WAAPI이므로 보통 생략하세요. GSAP CDN/스크립트는 절대 넣지 말고, 사용자가 명시적으로 요구한 경우에만 \`"driver":"gsap"\`를 manifest에 선언하세요.
- 사용자가 모션을 요청하지 않으면 \`"motion": null\`로 출력하세요. 최종 SHOW/HIDE 테스트와 세부 조정은 사용자가 Motion 탭에서 수행합니다.

## 대시보드 스키마
- 모든 조작 변수는 \`dashboard_schema.properties\`에 type/title 포함.
- 타입: string, number, boolean, color, string+enum, array.
- 모든 스키마 키는 \`replicant_defaults\`에 기본값 포함.
- 색상은 type:"color".
- 타이머 컨트롤은 duration(number), running(boolean). startedAt/remaining은 스키마에 넣지 마세요.

## 디자인 품질
- 요청 장르에 맞는 선명한 시각 콘셉트를 먼저 정하고, generic dark rounded card로 수렴하지 마세요.
- 강한 정보 계층, 비대칭 구성, 날카로운 타이포그래피, 절제된 모션을 사용하세요.
- 방송 그래픽답게 한눈에 읽히되, 정적인 박스 나열보다 살아있는 구조를 만드세요.

## JSON 규칙
- 마크다운/설명 금지.
- html/css/js 문자열 내부 줄바꿈은 반드시 \\n으로 이스케이프.
- HTML의 기본 텍스트는 replicant_defaults 값과 일치.
`;

// ─── Public API ──────────────────────────────────────────────────

export interface OverlayCodeResult {
	html: string;
	css: string;
	js: string;
	dashboard_schema: DashboardSchemaLike | null;
	replicant_defaults: Record<string, unknown>;
	motion: GraphicMotionManifest | null;
}

type DashboardSchemaLike = { properties: Record<string, unknown> };

export interface OverlayBindingValidation {
	ok: boolean;
	/** 치명적 오류: HTML에 바인딩이 있지만 스키마에 정의 안 됨 (orphanBindings) */
	errors: string[];
	/** 경고: 스키마 키에 기본값이 없음 (missingDefaults) */
	warnings: string[];
	/** 정보 힌트: 스키마에 있지만 코드에서 감지 안 됨 — AI 의도적 사용 가능 (missingBindings) */
	hints: string[];
	missingBindings: string[];
	orphanBindings: string[];
	missingDefaults: string[];
	scriptTags: string[];
}

/**
 * 기존 코드 컨텍스트 (수정 모드에서 사용)
 *
 * ■ Why Code Context Injection?
 *   Multi-turn 대화 히스토리를 누적하면 생성된 코드(HTML/CSS/JS)가
 *   턴마다 반복 포함되어 토큰이 기하급수적으로 불어난다.
 *   대신 "현재 에디터에 있는 코드 스냅샷"만 매번 전달하면
 *   토큰 사용량이 항상 일정(~5000)하며 맥락 손실도 없다.
 */
export interface ExistingCodeContext {
	html: string;
	css: string;
	js: string;
	dashboard_schema: DashboardSchemaLike | null;
	motion?: GraphicMotionManifest | null;
}

/**
 * AI 오버레이 코드 생성 (신규 생성 & 수정 모드 공용)
 *
 * @param prompt - 사용자 프롬프트 (신규 생성 시 요구사항, 수정 시 수정 지시)
 * @param zones - 선택된 Zone 정보 (선택)
 * @param existingCode - 수정 모드일 때, 현재 에디터의 코드 스냅샷
 */
export async function generateOverlayCode(
	prompt: string,
	zones?: Array<{
		name: string;
		type: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}> | null,
	existingCode?: ExistingCodeContext | null,
	selectedAssets?: Array<{ name: string; url: string }> | null,
): Promise<OverlayCodeResult> {
	// Zone 정보가 있으면 프롬프트에 포함
	const zoneSection =
		zones && zones.length > 0
			? `\n\n## Zone\n#overlay를 아래 좌표 안에만 렌더링하세요. 내부 레이아웃은 %, flex, grid로 부모 크기에 맞추고 스크롤/삐져나옴을 만들지 마세요.\n${zones.map((zone) => `- ${zone.name} (${zone.type}): left:${zone.x}px; top:${zone.y}px; width:${zone.width}px; height:${zone.height}px;`).join("\n")}`
			: "\n\n## Zone\n전체 화면 1920x1080. #overlay는 width:100%; height:100%;";

	// Asset 정보가 있으면 프롬프트에 포함
	const assetSection =
		selectedAssets && selectedAssets.length > 0
			? `\n\n## 사용 가능한 이미지 에셋 목록\n다음 이미지들을 HTML의 <img> src 속성이나 CSS background-image 등에 사용할 수 있습니다:\n${selectedAssets.map((asset) => `- ${asset.name}: ${asset.url}`).join("\n")}`
			: "";

	// ■ 수정 모드 vs 신규 생성 모드 프롬프트 분기
	let fullPrompt: string;

	if (existingCode) {
		const schemaStr = existingCode.dashboard_schema
			? JSON.stringify(existingCode.dashboard_schema, null, 2)
			: "없음";
		const motionStr = existingCode.motion
			? JSON.stringify(existingCode.motion, null, 2)
			: "없음";

		fullPrompt = `## 기존 코드 (현재 에디터에 있는 코드)

### HTML
\`\`\`html
${existingCode.html}
\`\`\`

### CSS
\`\`\`css
${existingCode.css}
\`\`\`

### JS
\`\`\`javascript
${existingCode.js}
\`\`\`

### Dashboard Schema
\`\`\`json
${schemaStr}
\`\`\`

### Motion Manifest
\`\`\`json
${motionStr}
\`\`\`
${zoneSection}${assetSection}

## 수정 요청
${prompt}

위 기존 코드를 수정 요청에 따라 변경하세요. 변경하지 않은 부분은 그대로 유지하세요.
반드시 동일한 JSON 형식(html, css, js, dashboard_schema, replicant_defaults, motion)으로 전체 코드를 출력하세요.`;
	} else {
		fullPrompt = `## 요청\n${prompt}${zoneSection}${assetSection}\n\n위 정보를 바탕으로 webcgk API를 사용하는 HTML/CSS/JS 오버레이 코드를 JSON으로 생성하세요.`;
	}

	const { text } = await callAI(OVERLAY_SYSTEM_PROMPT, fullPrompt, {
		maxOutputTokens: 65536,
		enforceJsonObject: true,
		requestType: "overlay_generation",
	});

	const result = parseOverlayResponse(text);
	const validation = validateOverlayBindings(result);
	if (!validation.ok || validation.missingDefaults.length > 0) {
		console.warn("[AI-Overlay] 바인딩 정합성 경고:", validation.warnings);
	}
	return result;
}

function extractDataCgKeys(html: string): Set<string> {
	const keys = new Set<string>();
	const attrPattern = /data-cg-(bind|class|if)\s*=\s*(["'])(.*?)\2/g;
	for (const match of html.matchAll(attrPattern)) {
		const directive = match[1];
		const value = match[3] || "";
		if (directive === "if") {
			if (value.trim()) keys.add(value.trim());
			continue;
		}

		for (const chunk of value.split(/\s+/)) {
			if (!chunk) continue;
			const colonIdx = chunk.indexOf(":");
			if (directive === "bind") {
				keys.add(colonIdx > 0 ? chunk.slice(colonIdx + 1) : chunk);
			} else if (directive === "class" && colonIdx > 0) {
				keys.add(chunk.slice(colonIdx + 1));
			}
		}
	}
	return keys;
}

/**
 * onData 콜백의 매개변수명을 자동 탐지
 *
 * ■ Why?
 *   AI는 webcgk.onData(function(data) { ... }) 뿐 아니라
 *   webcgk.onData(d => { d.running }) 또는 webcgk.onData(function(incoming) { ... })
 *   등 다양한 매개변수명을 사용한다. 'data'만 검색하면 오탐이 발생한다.
 *   이 함수로 실제 사용된 매개변수명을 모두 수집한 후 extractJsDataKeys에서 활용.
 */
function extractOnDataParamNames(js: string): string[] {
	const params: string[] = ["data"]; // 기본 매개변수명
	const patterns = [
		// webcgk.onData(function(d) { ... })
		/webcgk\.onData\s*\(\s*function\s*\(\s*(\w+)/g,
		// webcgk.onData((d) => { ... }) 또는 webcgk.onData(d => { ... })
		/webcgk\.onData\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>/g,
	];
	for (const p of patterns) {
		for (const m of js.matchAll(p)) {
			if (m[1] && !params.includes(m[1])) params.push(m[1]);
		}
	}
	return params;
}

function extractJsDataKeys(js: string): Set<string> {
	const keys = new Set<string>();
	// 0. onData 콜백 매개변수명 자동 탐지 (data, d, incoming 등)
	const paramNames = extractOnDataParamNames(js);

	for (const paramName of paramNames) {
		// 1. param.xxx 형태 추출 (예: d.running, data.teamName)
		for (const match of js.matchAll(
			new RegExp(`\\b${paramName}\\.([A-Za-z_$][\\w$]*)`, "g"),
		)) {
			keys.add(match[1]);
		}
		// 2. param['xxx'] 또는 param["xxx"] 형태 추출
		for (const match of js.matchAll(
			new RegExp(`\\b${paramName}\\[['"]([^'"]+)['"]\\]`, "g"),
		)) {
			keys.add(match[1]);
		}
		// 3. const { xxx, yyy: zzz } = param; 구조 분해 할당(Destructuring) 추출
		const destructurePattern = new RegExp(
			`(?:const|let|var)\\s*\\{\\s*([^}]+)\\s*\\}\\s*=\\s*${paramName}\\b`,
			"g",
		);
		for (const match of js.matchAll(destructurePattern)) {
			const properties = match[1];
			for (const prop of properties.split(",")) {
				const trimmed = prop.trim();
				if (!trimmed) continue;
				// 별칭(alias)이 있는 경우 (예: duration: dur) 콜론 기준 왼쪽을 원본 키로 채택
				const colonIdx = trimmed.indexOf(":");
				const key = colonIdx > 0 ? trimmed.slice(0, colonIdx).trim() : trimmed;
				// 유효한 JS 변수명 형식일 때만 추가
				if (/^[A-Za-z_$][\w$]*$/.test(key)) {
					keys.add(key);
				}
			}
		}
	}
	return keys;
}

function extractHtmlScriptTags(html: string): string[] {
	return Array.from(html.matchAll(/<script\b[^>]*>/gi), (match) => match[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDashboardSchemaLike(value: unknown): value is DashboardSchemaLike {
	return isRecord(value) && isRecord(value.properties);
}

/**
 * 오버레이 바인딩 정합성 검증 — 3단계 심각도 분리 (Severity Tiers)
 *
 * ■ Why 3단계?
 *   비유: 병원의 트리아주(Triage) 시스템.
 *   - errors (빨강): 즉시 치료 — HTML 바인딩이 스키마에 없으면 런타임 크래시
 *   - warnings (노랑): 주의 관찰 — 기본값이 없으면 대시보드 컨트롤이 초기화 안 됨
 *   - hints (숨김): 참고 정보 — 스키마에 있지만 코드에서 정규식 미탐지는
 *     AI가 클로저, 동적 키, CSS 변수 등으로 의도적으로 사용했을 가능성이 높음
 *
 *   이전에는 모든 경고를 동일 레벨로 표시하여 사용자에게 불필요한 불안감을 줬다.
 *   이제 진짜 문제(errors)만 UI에 노출하여 AI의 창의적 자율성을 존중한다.
 */
export function validateOverlayBindings(
	result: OverlayCodeResult,
): OverlayBindingValidation {
	const errors: string[] = [];
	const warnings: string[] = [];
	const hints: string[] = [];
	const missingBindings: string[] = [];
	const orphanBindings: string[] = [];
	const missingDefaults: string[] = [];
	const scriptTags = extractHtmlScriptTags(result.html || "");

	const schemaKeys = Object.keys(result.dashboard_schema?.properties || {});
	const schemaKeySet = new Set(schemaKeys);
	const bindKeys = extractDataCgKeys(result.html || "");
	const jsKeys = extractJsDataKeys(result.js || "");
	const defaults = result.replicant_defaults || {};

	for (const tag of scriptTags) {
		errors.push(
			`HTML에는 <script>를 넣지 마세요. JS 필드 또는 webcgk.motion 런타임을 사용하세요: ${tag}`,
		);
	}

	for (const key of schemaKeys) {
		// Heuristic Fallback: 정규식 정적 추출에서 놓칠 수 있는
		// JS 내 클로저 참조나 CSS variables 테마 적용을 위한 2차 구제
		const isUsedInJs =
			jsKeys.has(key) ||
			(result.js && new RegExp(`\\b${key}\\b`).test(result.js));
		const isUsedInCss =
			result.css && new RegExp(`\\b${key}\\b`).test(result.css);

		if (!bindKeys.has(key) && !isUsedInJs && !isUsedInCss) {
			missingBindings.push(key);
			// hints로 분류 — AI가 의도적으로 다른 방식(동적 키, 클로저 등)으로 사용했을 가능성이 높음
			hints.push(
				`스키마 키 "${key}"가 정적 분석에서 감지되지 않음 (JS 클로저/동적 키 사용 가능).`,
			);
		}
		if (!Object.hasOwn(defaults, key)) {
			missingDefaults.push(key);
			warnings.push(
				`스키마 키 "${key}"의 replicant_defaults 기본값이 없습니다.`,
			);
		}
	}

	for (const key of bindKeys) {
		if (!schemaKeySet.has(key)) {
			orphanBindings.push(key);
			// errors로 분류 — HTML에 바인딩했지만 스키마가 없으면 런타임에서 값이 주입되지 않음
			errors.push(`HTML 바인딩 "${key}"에 대응하는 스키마 필드가 없습니다.`);
		}
	}

	// [ADR] 3단계 심각도 분리 (2026-05-22)
	// errors: 치명적 (orphanBindings) — 빌드 차단 (ok: false)
	// warnings: 주의 (missingDefaults) — UI에 표시하되 빌드 허용
	// hints: 정보 (missingBindings) — UI에 표시하지 않음 → AI 자율성 극대화
	return {
		ok: orphanBindings.length === 0 && scriptTags.length === 0,
		errors,
		warnings,
		hints,
		missingBindings,
		orphanBindings,
		missingDefaults,
		scriptTags,
	};
}

/**
 * AI 응답에서 오버레이 코드 JSON 추출 및 안전 파싱
 *
 * ■ 잘린 JSON 복구 전략 (Truncated JSON Repair)
 *   복잡한 오버레이(HTML+CSS+JS+Schema)는 토큰 한도를 초과하여
 *   JSON 문자열 중간에서 잘릴 수 있다.
 *   이때 각 필드(html, css, js)를 개별적으로 추출하여
 *   완전한 필드만 사용하고, 잘린 필드는 버린다.
 */
export function parseOverlayResponse(raw: string): OverlayCodeResult {
	let cleaned = raw.trim();

	// 마크다운 코드블록 제거 (잘림 방지 가드: 닫는 빽틱이 없어도 문단 끝까지 추출)
	const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
	if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

	// JSON 객체 시작 지점 찾기 (끝은 잘려 있을 수 있으므로 lastBrace에 의존하지 않음)
	const firstBrace = cleaned.indexOf("{");
	if (firstBrace !== -1) {
		cleaned = cleaned.slice(firstBrace);
	}

	// 1단계: 직접 파싱 시도 (잘리지 않은 정상 응답)
	try {
		const parsed = JSON.parse(cleaned);
		return extractResult(parsed);
	} catch {
		/* 정상 파싱 실패 → 복구 시도 */
	}

	// 2단계: 잘린 JSON에서 각 필드를 정규식으로 개별 추출
	console.warn(
		"[AI-Overlay] JSON 직접 파싱 실패 — 잘린 JSON에서 필드별 추출을 시도합니다.",
	);

	const result: OverlayCodeResult = {
		html: '<div id="overlay"></div>',
		css: "",
		js: "",
		dashboard_schema: null,
		replicant_defaults: {},
		motion: null,
	};

	for (const key of ["html", "css", "js"] as const) {
		const extracted = extractJsonStringValue(cleaned, key);
		if (extracted !== null) {
			result[key] = extracted;
		}
	}

	for (const key of [
		"dashboard_schema",
		"replicant_defaults",
		"motion",
	] as const) {
		const extracted = extractJsonObjectValue(cleaned, key);
		if (extracted !== null) {
			if (key === "dashboard_schema" && isDashboardSchemaLike(extracted)) {
				result.dashboard_schema = extracted;
			} else if (key === "replicant_defaults" && isRecord(extracted)) {
				result.replicant_defaults = extracted;
			} else if (key === "motion") {
				result.motion = normalizeGraphicMotionManifest(extracted);
			}
		}
	}

	if (
		result.html === '<div id="overlay"></div>' &&
		result.css === "" &&
		result.js === ""
	) {
		console.error(
			"[AI-Overlay] 잘린 JSON에서 유효한 필드를 추출하지 못했습니다.",
		);
		console.error("원본:", cleaned.substring(0, 500));
		throw new Error(
			"AI 응답이 너무 길어 출력이 잘렸고, 복구에도 실패했습니다. 더 간결한 요청으로 다시 시도해주세요.",
		);
	}

	console.info(
		"[AI-Overlay] 잘린 JSON 복구 성공! 추출된 필드:",
		Object.entries(result)
			.filter(([, v]) => v && v !== '<div id="overlay"></div>')
			.map(([k]) => k),
	);
	return result;
}

/** JSON 파싱 결과에서 OverlayCodeResult 생성 */
function extractResult(parsed: unknown): OverlayCodeResult {
	const obj = isRecord(parsed) ? parsed : {};
	return {
		html: typeof obj.html === "string" ? obj.html : '<div id="overlay"></div>',
		css: typeof obj.css === "string" ? obj.css : "",
		js: typeof obj.js === "string" ? obj.js : "",
		dashboard_schema: isDashboardSchemaLike(obj.dashboard_schema)
			? obj.dashboard_schema
			: null,
		replicant_defaults: isRecord(obj.replicant_defaults)
			? obj.replicant_defaults
			: {},
		motion: normalizeGraphicMotionManifest(obj.motion),
	};
}

/**
 * 잘린 JSON에서 특정 키의 문자열 값을 안전하게 추출
 * "key": "...value..." 패턴에서 이스케이프를 고려하여 닫는 따옴표를 찾음
 */
function extractJsonStringValue(json: string, key: string): string | null {
	const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
	const keyMatch = keyPattern.exec(json);
	if (!keyMatch) return null;

	const valueStart = keyMatch.index + keyMatch[0].length;
	let i = valueStart;
	let escaped = false;

	while (i < json.length) {
		const ch = json[i];
		if (escaped) {
			escaped = false;
		} else if (ch === "\\") {
			escaped = true;
		} else if (ch === '"') {
			const raw = json.substring(valueStart, i);
			try {
				return JSON.parse(`"${raw}"`);
			} catch {
				return safeUnescapeJsonString(raw);
			}
		}
		i++;
	}

	const truncated = json.substring(valueStart);
	console.warn(
		`[AI-Overlay] "${key}" 필드가 잘렸습니다. 잘린 채로 사용합니다. (${truncated.length}자)`,
	);
	return safeUnescapeJsonString(truncated);
}

/**
 * 잘린 JSON에서 특정 키의 객체 값을 안전하게 추출
 * "key": { ... } 패턴에서 중괄호 짝을 맞춰 추출
 */
function extractJsonObjectValue(json: string, key: string): unknown | null {
	const keyPattern = new RegExp(`"${key}"\\s*:\\s*\\{`);
	const keyMatch = keyPattern.exec(json);
	if (!keyMatch) return null;

	const braceStart = keyMatch.index + keyMatch[0].length - 1;
	let depth = 0;
	let inStr = false;
	let esc = false;

	for (let i = braceStart; i < json.length; i++) {
		const ch = json[i];
		if (inStr) {
			if (esc) {
				esc = false;
			} else if (ch === "\\") {
				esc = true;
			} else if (ch === '"') {
				inStr = false;
			}
		} else {
			if (ch === '"') {
				inStr = true;
			} else if (ch === "{") {
				depth++;
			} else if (ch === "}") {
				depth--;
				if (depth === 0) {
					const objStr = json.substring(braceStart, i + 1);
					try {
						return JSON.parse(objStr);
					} catch {
						return null;
					}
				}
			}
		}
	}
	return null;
}

/**
 * JSON 파싱이 실패했거나 문자열이 중간에 잘려 JSON-escaped 상태인 파편을
 * 안전하고 수동으로 디코딩(Unescape)하여 최종 출력에 원치 않는 백슬래시 표기를 방지합니다.
 */
function safeUnescapeJsonString(raw: string): string {
	let cleaned = raw;

	// 1단계: 문자열 끝이 백슬래시(\)로 잘린 경우, 불완전한 이스케이프 문자 제거
	if (cleaned.endsWith("\\")) {
		cleaned = cleaned.slice(0, -1);
	}

	// 2단계: 표준 JSON 이스케이프 시퀀스를 안전하게 디코딩
	return cleaned
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\")
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(/\\b/g, "\b")
		.replace(/\\f/g, "\f")
		.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
			String.fromCharCode(parseInt(hex, 16)),
		);
}

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
 *   2. callAI() → JSON 파싱 → { html, css, js, dashboard_schema, replicant_defaults }
 *   3. 결과를 PluginEditor의 코드 탭에 삽입
 */

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

export const OVERLAY_SYSTEM_PROMPT = `당신은 **WebCG-K 방송 오버레이 코드 생성기**입니다.
Controller(조작부)와 분리되어 1920×1080 투명 배경의 sandboxed iframe(PVW/PGM)에서 실행되는 실시간 방송 그래픽 HTML/CSS/JS 코드를 생성합니다.

## 1. 아키텍처 및 상태 관리의 근본 원칙 (Fundamental Architecture)
- **단일 진실 공급원 (SSOT)**: 오버레이는 자체 상태를 소유하지 않는 **순수 뷰(Dumb View)** 입니다. 모든 데이터는 오직 \`webcgk.onData(data)\`를 통해서만 주입됩니다.
- **멱등성 (Idempotency)**: iframe이 재생성되거나 PVW→PGM 전환되어도, \`onData\` 호출 시 전달받은 \`data\`만으로 완벽하게 이전과 동일한 화면을 복원해야 합니다. \`onData\`가 1번 호출되든 100번 호출되든 결과는 동일해야 합니다.
- **절대 시간 동기화 (Absolute Time Sync)**: 타이머/카운트다운 구현 시 로컬에서 1초씩 빼는 방식을 **절대 금지**합니다.
  1) \`onData\` 내에서 \`const rem = webcgk.computeTimerRemaining(data)\`로 권위 있는 남은 시간(초)을 구합니다.
  2) \`const targetEndAt = Date.now() + (rem * 1000)\`로 절대 종료 시각을 계산합니다.
  3) 렌더링 루프(setInterval/requestAnimationFrame)는 오직 \`Math.max(0, (targetEndAt - Date.now()) / 1000)\`을 화면에 그리기만 합니다.
  4) 동일한 원칙을 다중 타이머, 스톱워치, 게이지바 등 **모든 시간 기반 UI**에 동일하게 적용하세요. \`computeTimerRemaining\`의 인수는 항상 \`data\` 객체 1개입니다.

## 2. 방송 렌더링의 물리적 제약 (Broadcast Rendering Rules)
- **Zone Bounds (영역 지정)**: 프롬프트에 특정 Zone의 위치/크기(x, y, width, height)가 주어지면, \`#overlay\`는 전체 화면이 아닌 해당 크기로 고정되고 \`position: absolute; left: {x}px; top: {y}px\`로 배치되어야 합니다. Zone 지정이 없으면 1920×1080 전체 화면을 사용합니다.
- **스크롤바 절대 방지 및 뷰포트 격리 (CRITICAL: No Scrollbars)**:
  - 방송 그래픽(Broadcast Graphics)은 모니터나 마우스로 제어하는 일반 화면이 아닌 송출 장비로 직접 투사되는 화면입니다. 따라서 **가로/세로 모든 스크롤바(Scrollbar)가 나타나는 것을 엄격히 금지**합니다.
  - 최상위 요소인 \`#overlay\` 및 \`body\`에는 반드시 \`overflow: hidden;\`을 적용하고 스크롤 메커니즘이 활성화되지 않게 하십시오.
  - 그래픽의 전체 레이아웃은 뷰포트(또는 지정된 Zone Bounds) 크기 내에 완벽하게 들어맞아야(fit) 합니다. 화면을 초과하여 늘어나는 컨테이너를 절대 설계하지 마세요.
  - 데이터가 많아질 경우(예: 축구 선발 라인업 리스트 등), 스크롤 대신 화면에 한 번에 표시할 최대 개수를 제한하고(예: 선발 명단 11명 고정 배치, 교체 명단 최대 5명 등), Grid/Flex 레이아웃 비율조정 및 \`overflow: hidden\`과 \`text-overflow: ellipsis\`를 적극 활용하여 정갈하게 한 화면에 우겨넣어야 합니다.
- **60fps GPU 가속 (필수)**: 애니메이션은 오직 \`transform\`(translate, scale, rotate), \`opacity\`, \`filter\`만 사용하십시오. \`top\`, \`left\`, \`margin\`, \`padding\`, \`width\`, \`height\`, \`font-size\`를 애니메이션에 사용하면 리플로우가 발생하여 방송 프레임이 끊깁니다.
- **방송 가독성 (필수)**:
  - 모든 텍스트에 강한 그림자 적용: \`text-shadow: 0 2px 4px rgba(0,0,0,0.8)\`
  - 텍스트-배경 명암비 4.5:1 이상 (WCAG AA)
  - 1920×1080 기준 본문 최소 28px, 제목/스코어 52px 이상
- **텍스트 오버플로우 및 충돌 방지 (안전성 최우선)**:
  - **레이아웃 격리**: 모든 텍스트와 UI 블록은 Flex/Grid의 독립된 셀에 배치하고, \`gap\`을 통해 최소 5px 이상의 여백을 확보하세요. 텍스트끼리 \`position: absolute\`로 겹치는 것을 엄격히 금지합니다(배지 등 장식적 요소에만 제한적 허용).
  - **긴 텍스트 방어**: 팀명, 선수명 등 동적으로 변하는 텍스트 컨테이너에는 반드시 \`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\`를 적용하세요. Flex 자식 요소가 부모 영역을 뚫고 나가는 것을 막기 위해 텍스트 컨테이너에 \`min-width: 0; max-width: 100%;\`를 필수로 추가해야 합니다.
  - **안전한 클리핑**: 최상위 \`#overlay\`에는 그림자 표현을 위해 \`overflow: visible\`을 유지하되, 그 내부의 주요 정보 컨테이너(카드, 보드 등)에는 \`overflow: hidden\`을 적용하여 내부 요소가 지정된 크기를 절대 벗어나지 않도록 설계하세요. 텍스트 잘림이나 겹침은 방송사고로 간주하여 절대 발생하지 않아야 합니다.
- **CSS 설계 규칙**:
  - 전역 box-sizing 리셋 필수: \`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\`
  - 모든 색상, 폰트 크기, 간격은 \`:root\` CSS 변수로 정의하고 하드코딩 금지
  - 센터링: Grid(\`place-items: center\`), Flex(\`align-items: center\`) 사용. \`padding-top\`/\`margin-top\`으로 텍스트 위치 보정 금지
- **디자인 퀄리티**: Google Fonts \`@import\`로 Display 폰트(제목) + Body 폰트(본문) 조합. 주조색(Dominant) 1개 + 강조색(Accent) 1개로 대담하게 구성. 진입 애니메이션은 \`animation-delay\`를 0.05~0.1초씩 staggered reveal.

## 3. WebCG-K API 인터페이스
\`\`\`javascript
webcgk.onData(function(data) {
  // 데이터 수신 및 DOM 렌더링. data는 replicant_defaults와 동일한 구조.
  // 이미 onData가 등록된 상태에서 data가 변경되면 자동으로 다시 호출됨
});
webcgk.onShow(function() { /* 진입 애니메이션 트리거 */ });
webcgk.onHide(function() { /* 퇴장 애니메이션 트리거 */ });
webcgk.onReady(function() { /* 초기화 완료 */ });
webcgk.getData();            // 현재 데이터 객체 (동기)
webcgk.isVisible();          // 현재 표시 상태 (boolean)
webcgk.computeTimerRemaining(data);  // data 객체로부터 남은 시간(초) 반환. 인수는 1개
webcgk.sendToParent(type, payload); // 그래픽 내부 이벤트를 컨트롤러로 역송신 (예: 타이머 종료, 버튼 클릭)
\`\`\`

## 4. 대시보드 스키마 (Dashboard Schema)
제어 UI 자동 생성을 위해 조작 가능한 모든 변수를 JSON Schema 규격으로 정의합니다.
지원 타입: \`string\` (기본 입력, \`format:"textarea"\` 멀티라인, \`format:"uri"\` 이미지URL), \`number\` (기본 ±스테퍼, \`widget:"slider"\` 슬라이더), \`boolean\` (토글), \`color\` (컬러피커 — 배경색, 텍스트색, 그라데이션 색상 등 **모든 색상 값은 반드시 이 타입 사용**), \`string + enum\` (드롭다운), \`array\` (동적 목록).
각 속성에는 컨트롤러 UI에 라벨로 표시될 \`title\`을 반드시 포함하세요. (필요시 \`description\`으로 힌트 추가)

## 5. 출력 형식 (Strict JSON Only)
다른 텍스트 없이 오직 아래 JSON 형식으로만 응답하세요.
**문자열 값(html, css, js) 내부에 실제 줄바꿈(Enter)을 절대 넣지 마세요.** 줄바꿈은 반드시 \`\\n\`으로 이스케이프하세요.
HTML 내 하드코딩된 기본 텍스트는 \`replicant_defaults\` 값과 정확히 일치해야 합니다.

\`\`\`json
{
  "html": "<div id=\\"overlay\\">\\n  ...\\n</div>",
  "css": ":root { --primary: #1d4ed8; }\\n#overlay { ... }",
  "js": "webcgk.onData(function(data) {\\n  ...\\n});",
  "dashboard_schema": {
    "properties": {
      "teamName": { "type": "string", "title" : "팀 이름", "description": "팀 이름" },
      "accentColor": { "type": "color", "title": "강조 색상", "default": "#3b82f6" }
    }
  },
  "replicant_defaults": {
    "teamName": "WebCG-K",
    "accentColor": "#3b82f6"
  }
}
\`\`\`

## 배치 영역 (매우 중요)
다음은 사용자가 지정한 렌더링 영역입니다. 코드를 생성할 때 반드시 최상위 래퍼인 \`#overlay\` 요소에 아래의 위치와 크기(CSS)를 적용하여 그래픽이 이 영역 안에만 렌더링되게 하세요. 절대로 100% 폭/높이를 사용해 전체 화면을 채우지 마세요.

- Zone: {zoneName}
  위치: x={zoneX}px, y={zoneY}px
  크기: {zoneWidth}×{zoneHeight}px
  적용할 CSS: position:absolute; left:{zoneX}px; top:{zoneY}px; width:{zoneWidth}px; height:{zoneHeight}px;

**크기 초과 방지 (Overflow 방지)**: 낭비 요소들(카드, 컨테이너 등)에 고정된 px 크기를 주어 영역 크기를 초과하여 삐져나오는(overflow) 현상이 자주 발생하고 있습니다. 낭비 요소들은 주어진 부모(#overlay)의 크기 안에서 딱 맞게 들어가도록 크기를 고정 픽셀(px) 대신 비율(%, flex: 1 등)을 사용하여 반응형으로 작성하세요. (단, 폰트 크기나 여백 등은 px 사용 가능하며, 그림자(box-shadow)가 영역 밖으로 나가는 것은 허용됩니다.)

`;

// ─── Public API ──────────────────────────────────────────────────

export interface OverlayCodeResult {
	html: string;
	css: string;
	js: string;
	dashboard_schema: { properties: Record<string, any> } | null;
	replicant_defaults: Record<string, unknown>;
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
	dashboard_schema: { properties: Record<string, any> } | null;
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
	zones?: Array<{ name: string; type: string; x: number; y: number; width: number; height: number }> | null,
	existingCode?: ExistingCodeContext | null,
	selectedAssets?: Array<{ name: string; url: string }> | null,
): Promise<OverlayCodeResult> {
	// Zone 정보가 있으면 프롬프트에 포함
	const zoneSection = zones && zones.length > 0
		? `\n\n## 배치 영역 (매우 중요)\n다음은 사용자가 지정한 렌더링 영역입니다. 코드를 생성할 때 반드시 최상위 래퍼인 \`#overlay\` 요소에 아래의 위치와 크기(CSS)를 적용하여 그래픽이 이 영역 안에만 렌더링되게 하세요. 절대로 100% 폭/높이를 사용해 전체 화면을 채우지 마세요.\n\n${zones.map(zone => `- Zone: "${zone.name}" (${zone.type})\n  위치: x=${zone.x}px, y=${zone.y}px\n  크기: ${zone.width}×${zone.height}px\n  적용할 CSS: position:absolute; left:${zone.x}px; top:${zone.y}px; width:${zone.width}px; height:${zone.height}px;`).join('\n')}\n\n**크기 초과 방지 (Overflow 방지)**: 내부 요소들(카드, 컨테이너 등)에 고정된 px 크기를 주어 영역 크기를 초과하여 삐져나오는(overflow) 현상이 자주 발생하고 있습니다. 내부 요소들은 주어진 부모(#overlay)의 크기 안에서 딱 맞게 들어가도록 크기를 고정 픽셀(px) 대신 비율(%, flex: 1 등)을 사용하여 반응형으로 작성하세요. (단, 폰트 크기나 여백 등은 px 사용 가능하며, 그림자(box-shadow)가 영역 밖으로 나가는 것은 허용됩니다.)`
		: "\n\n## 배치 영역\n- 전체 화면 (1920×1080) (최상위 요소 `#overlay`에 width: 100%; height: 100% 적용)";

	// Asset 정보가 있으면 프롬프트에 포함
	const assetSection = selectedAssets && selectedAssets.length > 0
		? `\n\n## 사용 가능한 이미지 에셋 목록\n다음 이미지들을 HTML의 <img> src 속성이나 CSS background-image 등에 사용할 수 있습니다:\n${selectedAssets.map(asset => `- ${asset.name}: ${asset.url}`).join('\n')}`
		: "";

	// ■ 수정 모드 vs 신규 생성 모드 프롬프트 분기
	let fullPrompt: string;

	if (existingCode) {
		const schemaStr = existingCode.dashboard_schema
			? JSON.stringify(existingCode.dashboard_schema, null, 2)
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
${zoneSection}${assetSection}

## 수정 요청
${prompt}

위 기존 코드를 수정 요청에 따라 변경하세요. 변경하지 않은 부분은 그대로 유지하세요.
반드시 동일한 JSON 형식(html, css, js, dashboard_schema, replicant_defaults)으로 전체 코드를 출력하세요.`;
	} else {
		fullPrompt = `## 요청\n${prompt}${zoneSection}${assetSection}\n\n위 정보를 바탕으로 webcgk API를 사용하는 HTML/CSS/JS 오버레이 코드를 JSON으로 생성하세요.`;
	}

	const { text } = await callAI(OVERLAY_SYSTEM_PROMPT, fullPrompt, {
		maxOutputTokens: 65536,
		enforceJsonObject: true,
		requestType: "overlay_generation",
	});

	return parseOverlayResponse(text);
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
function parseOverlayResponse(raw: string): OverlayCodeResult {
	let cleaned = raw.trim();

	// 마크다운 코드블록 제거
	const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
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
	} catch { /* 정상 파싱 실패 → 복구 시도 */ }

	// 2단계: 잘린 JSON에서 각 필드를 정규식으로 개별 추출
	console.warn("[AI-Overlay] JSON 직접 파싱 실패 — 잘린 JSON에서 필드별 추출을 시도합니다.");

	const result: OverlayCodeResult = {
		html: '<div id="overlay"></div>',
		css: "",
		js: "",
		dashboard_schema: null,
		replicant_defaults: {},
	};

	for (const key of ["html", "css", "js"] as const) {
		const extracted = extractJsonStringValue(cleaned, key);
		if (extracted !== null) {
			result[key] = extracted;
		}
	}

	for (const key of ["dashboard_schema", "replicant_defaults"] as const) {
		const extracted = extractJsonObjectValue(cleaned, key);
		if (extracted !== null) {
			(result as any)[key] = extracted;
		}
	}

	if (result.html === '<div id="overlay"></div>' && result.css === "" && result.js === "") {
		console.error("[AI-Overlay] 잘린 JSON에서 유효한 필드를 추출하지 못했습니다.");
		console.error("원본:", cleaned.substring(0, 500));
		throw new Error("AI 응답이 너무 길어 출력이 잘렸고, 복구에도 실패했습니다. 더 간결한 요청으로 다시 시도해주세요.");
	}

	console.info("[AI-Overlay] 잘린 JSON 복구 성공! 추출된 필드:",
		Object.entries(result).filter(([, v]) => v && v !== '<div id="overlay"></div>').map(([k]) => k));
	return result;
}

/** JSON 파싱 결과에서 OverlayCodeResult 생성 */
function extractResult(parsed: any): OverlayCodeResult {
	return {
		html: parsed.html || '<div id="overlay"></div>',
		css: parsed.css || "",
		js: parsed.js || "",
		dashboard_schema: parsed.dashboard_schema || null,
		replicant_defaults: parsed.replicant_defaults || {},
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
		} else if (ch === '\\') {
			escaped = true;
		} else if (ch === '"') {
			const raw = json.substring(valueStart, i);
			try {
				return JSON.parse(`"${raw}"`);
			} catch {
				return raw;
			}
		}
		i++;
	}

	const truncated = json.substring(valueStart);
	console.warn(`[AI-Overlay] "${key}" 필드가 잘렸습니다. 잘린 채로 사용합니다. (${truncated.length}자)`);
	return truncated;
}

/**
 * 잘린 JSON에서 특정 키의 객체 값을 안전하게 추출
 * "key": { ... } 패턴에서 중괄호 짝을 맞춰 추출
 */
function extractJsonObjectValue(json: string, key: string): any | null {
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
			if (esc) { esc = false; }
			else if (ch === '\\') { esc = true; }
			else if (ch === '"') { inStr = false; }
		} else {
			if (ch === '"') { inStr = true; }
			else if (ch === '{') { depth++; }
			else if (ch === '}') {
				depth--;
				if (depth === 0) {
					const objStr = json.substring(braceStart, i + 1);
					try { return JSON.parse(objStr); }
					catch { return null; }
				}
			}
		}
	}
	return null;
}

/**
 * AI CG Service — 다중 프로바이더 AI 방송 그래픽 생성 엔진
 * Gemini, DeepSeek, Groq, GitHub Models, OpenRouter 지원
 * DB 기반 동적 모델 전환 + API 키 관리 + 사용량 추적
 *
 * ■ API 호출 인프라는 aiCoreService.ts로 추출되었습니다.
 *   이 파일은 CG 도메인 로직(DEFAULT_SYSTEM_PROMPT, parseElements, Variation 생성)만 담당합니다.
 */

import type { GraphicElement } from "../components/GraphicPreviewRenderer";
import type { CgVariation, ZoneBounds } from "../lib/overlayTypes";
import { callAI, invalidateModelCache, getActiveConfig } from "./aiCoreService";

// ─── 기본 시스템 프롬프트 ─────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `당신은 KBS, MBC, SBS급 전문 방송 CG 디자이너입니다. WebCG-K 시스템의 GraphicElement[] JSON 배열을 생성합니다.

## 출력 규칙
1. 반드시 유효한 JSON 배열만 출력하세요. 마크다운/설명 텍스트 없이 순수 JSON만.
2. 각 요소는 아래 GraphicElement 인터페이스를 따릅니다:
   - id: 고유 문자열 (예: "el-1")
   - type: "rect" | "text" | "ellipse" | "group"
   - name: 한글 이름 (예: "배경 사각형")
   - x, y: 좌표 (0부터 시작)
   - width, height: 크기 (지정된 캔버스 내)
   - rotation: 0
   - opacity: 0~1
   - visible: true
   - zIndex: 렌더 순서 (0이 최하단)
   - parentId: null (최상위) 또는 그룹 ID
   - fill: { type: "solid" | "linear", color: "#HEX", opacity: 1, gradientAngle: 90, gradientStops: [{ offset: 0, color: "#HEX" }, { offset: 100, color: "#HEX" }] }
   - stroke: { enabled: false }
   - content: 텍스트 내용 (type이 "text"일 때)
   - fontSize, fontFamily, fontWeight, textAlign: 텍스트 속성
   - borderRadius: 모서리 둥글기 (px)
   - boxShadow, textShadow, backdropFilter: 고급 시각 효과 (예: "0 4px 20px rgba(0,0,0,0.5)", "blur(12px)")
   - padding, lineHeight, letterSpacing: 타이포 및 여백 효과
   - customCSS: 그 외 특수 CSS 문자열
   - display: "flex" (가로/세로 배치 컨테이너 그룹 선언 시)
   - flexDirection, justifyContent, alignItems, gap: Flexbox 레이아웃 속성
   - position: "relative" (Flexbox 자식 요소로 사용할 때 필수. left/top 대신 순서대로 자동 배치됨)

3. **애니메이션 (필수)**: 각 요소에 animation 프로퍼티를 추가하여 생동감 있는 CG를 만드세요:
   - animation.enter: 등장 효과
     - type: "fadeIn" | "slideLeft" | "slideRight" | "slideUp" | "slideDown" | "zoomIn" | "bounce" | "expand" | "reveal"
     - duration: ms (기본 500)
     - delay: ms (순차 등장 구현 — 첫 요소 0, 두번째 200, 세번째 400...)
     - easing: "ease-out" (기본)
   - animation.loop: 반복 효과 (로고, 강조 요소에 사용)
     - type: "pulse" | "float" | "shimmer" | "breathe" | "blink"
     - duration: ms (기본 2000)
     - iterationCount: "infinite"

4. **Stagger 패턴 필수**: 배경→장식→강조바→이름→직함 순으로 delay를 0, 80, 160, 240, 320ms로 설정하세요.
5. 모든 텍스트는 한국어로 작성하세요.
6. fontFamily는 "Pretendard" 사용 (한글 최적화 폰트).

## ★ 선언적 레이아웃 시스템 (매우 중요)
- 요소들을 손으로 좌표계산(x, y 암산)하여 맞추지 마세요.
- 레이아웃 부모('type: "group"')에 'display: "flex"', 'gap', 'justifyContent', 'alignItems', 'flexDirection'을 주어 자식 요소들을 자동 정렬하세요.
- Flexbox 안에 들어가는 자식 요소들은 반드시 'position: "relative"'를 설정하세요.
- **[에디터 호환성 규칙]**: 캔버스 편집기(SVG)는 Flexbox를 지원하지 않습니다. 따라서 Flexbox를 사용하더라도 대략적인 'x', 'y' 좌표를 반드시 계산해서 넣어주세요. 실제 방송 송출(DOM 엔진)에서는 Flex 설정이 우선하여 완벽히 정렬되지만, 편집기 미리보기를 위해 근사치가 필요합니다.

## ★ 프로 디자인 황금 비율 (모든 CG에 반드시 적용)

### 여백 · 간격
- padding 속성을 적극 활용하세요.
- 텍스트 좌측 여백: 배경바 높이의 20~25% (최소 24px)
- 텍스트 상하 여백: 배경바 높이의 15% (최소 12px)
- 요소 간 수직 간격: 4~8px

### 글자 크기 계층 (방송 타이포그래피 3단)
- Primary (이름/제목): 배경바 높이 × 0.35~0.40
- Secondary (직함/부제): Primary × 0.60~0.65
- Tertiary (부가정보): Primary × 0.45~0.50

### 색상 설계 규칙
- 배경: 그라데이션 필수 (단색 금지!). type="linear", 2~3 stop, 끝은 투명(opacity:0)으로 자연스럽게 사라지도록.
- Primary 텍스트: #FFFFFF (완전 흰색), fontWeight: 700
- Secondary 텍스트: 배경 계열 밝은 톤 (예: 블루배경이면 #BBDEFB), fontWeight: 400
- 강조바/악센트: 채도 높은 단색, width=5~8px
- 배경 opacity: 0.88~0.95 (완전 불투명 금지 — 방송 합성 투과 필요)

### 시각 효과 (1급 속성 활용)
- 배경바: boxShadow="0 -4px 30px rgba(색상,0.3)" (입체감 부여)
- 글로우 강조: textShadow="0 0 20px rgba(색상,0.5)"
- 고급 배경: backdropFilter="blur(8px)" (유리 질감 — 반드시 opacity < 1과 함께 사용)

## ★ CG 유형별 디자인 레시피 (요청에 맞는 레시피를 적용하세요)

### 레시피 1: 뉴스 Lower Third (하단자막)
- 배경바: y=캔버스높이×0.82, height=캔버스높이×0.12, gradient(좌→우, 진한색→투명), backdropFilter="blur(12px)"
- 강조바: 배경바 왼쪽 edge, width=6, height=배경바height, 밝은 accent 색상
- 이름: 배경바 내부 좌측 (x=강조바+24), fontSize=배경바높이×0.38, 흰색, bold, textShadow 지정
- 직함: 이름 바로 아래 (이름y + 이름height + 4), fontSize=이름×0.65, accent 밝은톤
- 장식: 이름 옆에 얇은 세로 구분선 (width=1, opacity=0.3)

### 레시피 2: 속보 Top Banner
- 배경바: y=0, 화면 전체 너비, height=캔버스높이×0.065, 진한 빨강(#B71C1C), boxShadow 지정
- 배지: 배경바 내부 좌측, width=100, fill=#FFF, borderRadius=4
- 배지텍스트: "속 보", fontWeight=900, color=#B71C1C
- 헤드라인: 배지 오른쪽 20px, 흰색 bold

### 레시피 3: 스코어보드
- 배경: 하단 15%, gradient (팀A색←→팀B색)
- 팀A: 왼쪽 35%, 팀명 + 로고
- 점수: 정중앙, fontSize=가장 큰 크기, fontWeight=900
- 팀B: 오른쪽 35% (미러 배치)
- 시간: 점수 아래 중앙, fontSize=점수×0.5

### 레시피 4: 날씨 CG
- 좌측: 큰 온도 표시 (fontSize=영역높이×0.5), fontWeight=900
- 우측: 3행 정보 (습도/바람/미세먼지), 각 행 = 라벨 + 수치
- 배경: 하늘색 계열 gradient, borderRadius로 둥근 Card 스타일, backdropFilter 지정

### 레시피 5: 인물 크레딧 (Full CG)
- 화면 하단 20%, 좌측 60%에 배치
- 상단 행: 이름 (큰 글씨) + 세로 구분선 + 소속
- 하단 행: 직함 (작은 글씨, 밝은 톤)
- 왼쪽 강조바: 세로 전체, 브랜드 색상

### 레시피 6: 사운드바이트 (인용문)
- 배경바: 반투명 어두운 톤, 하단 18%
- 따옴표 장식: 큰 " " 문자 (fontSize=배경×0.8), opacity=0.15
- 발언내용: 중앙, 이탈릭 느낌 (fontWeight=400)
- 발언자명: 우측 하단 정렬, fontWeight=700

### 레시피 7: 뉴스 크롤 (하단 띠)
- 한 줄 바: 최하단, height=캔버스높이×0.045
- 좌측: 카테고리 배지 (fill=accent, 작은 borderRadius)
- 우측: 뉴스 텍스트 (스크롤 애니메이션은 별도 처리)

### 레시피 8: 타이틀 카드 (Full Screen)
- 중앙 배치: 타이틀 + 부제목 + 장식 라인
- 타이틀: fontSize=캔버스높이×0.08, fontWeight=900, 그라데이션 fill, textShadow 강력하게 배정
- 부제: 타이틀 아래 16px, fontSize=타이틀×0.4
- 장식: 타이틀 위아래에 가로 gradient line (height=2, opacity=0.5)

### 레시피 9: 데이터 인포그래픽
- 2×2 또는 3열 그리드로 배치
- 각 셀: 아이콘(ellipse) + 수치(큰 글씨) + 라벨(작은 글씨)
- 배경: 각 셀마다 살짝 다른 톤의 반투명 카드 (boxShadow + backdropFilter 필수)

### 레시피 10: 리포터 현장 (OTS)
- 화면 하단 25% 영역
- 좌측: 위치 배지 (pill shape, borderRadius=20, accent 색상)
- 우측: 리포터 이름 + 직함 2행
- 배경: gradient (좌→우, 불투명→투명)

## 디자인 품질 체크리스트 (생성 전 확인)
- [ ] 배경에 그라데이션 사용했는가? (단색 금지)
- [ ] 글자 크기가 3단 계층인가? (Primary > Secondary > Tertiary)
- [ ] 여백이 충분한가? (최소 12px)
- [ ] 배경 opacity가 0.88~0.95인가? (방송 합성 투과)
- [ ] 강조바/악센트 라인이 있는가?
- [ ] Stagger 애니메이션이 적용되었는가?
- [ ] boxShadow, backdropFilter 등 1급 시각 효과 속성을 지정했는가?`;

// ─── JSON 파싱 헬퍼 ──────────────────────────────────────────────

function parseElementsFromResponse(raw: string): GraphicElement[] {
	let cleaned = raw.trim();
	const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
	if (codeBlockMatch) {
		cleaned = codeBlockMatch[1].trim();
	}

	const firstBracket = cleaned.indexOf("[");
	if (firstBracket !== -1) {
		cleaned = cleaned.slice(firstBracket);
	}

	if (cleaned.startsWith("[")) {
		try {
			JSON.parse(cleaned);
		} catch {
			const lastBrace = cleaned.lastIndexOf("}");
			if (lastBrace !== -1) {
				cleaned = cleaned.slice(0, lastBrace + 1) + "\n]";
				console.warn("[AI-CG] 파싱 에러로 인해 안전한 배열 절사(Truncation Recovery)를 수행했습니다.");
			}
		}
	}

	let parsed: any;
	try {
		parsed = JSON.parse(cleaned);
	} catch (error) {
		throw new Error(`JSON 파싱 실패: ${(error as Error).message}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error("AI 응답이 배열이 아닙니다.");
	}

	return parsed.map((el: any, idx: number) => ({
		id: el.id || `el-${idx + 1}`,
		type: el.type || "rect",
		name: el.name || `요소 ${idx + 1}`,
		x: el.x ?? 0,
		y: el.y ?? 0,
		width: el.width ?? 100,
		height: el.height ?? 100,
		rotation: el.rotation ?? 0,
		opacity: el.opacity ?? 1,
		visible: el.visible ?? true,
		zIndex: el.zIndex ?? idx,
		parentId: el.parentId ?? null,
		fill: el.fill ?? { type: "solid", color: "#333333", opacity: 1 },
		stroke: el.stroke ?? { enabled: false },
		content: el.content,
		fontSize: el.fontSize,
		fontFamily: el.fontFamily,
		fontWeight: el.fontWeight,
		textAlign: el.textAlign,
		borderRadius: el.borderRadius,
		customCSS: el.customCSS,
		children: el.children,
	}));
}

// ─── 컬러 스킴 ───────────────────────────────────────────────────

const COLOR_SCHEMES = [
	"블루/화이트 (뉴스 클래식)",
	"다크 레드/골드 (속보 스타일)",
	"그린/화이트 (환경/날씨)",
	"퍼플/핑크 (엔터테인먼트)",
];

// ─── Re-exports ──────────────────────────────────────────────────

export { invalidateModelCache, getActiveConfig };

// ─── Public API ──────────────────────────────────────────────────

export async function generateCgVariations(
	prompt: string,
	bounds: ZoneBounds,
	dataContext?: Record<string, unknown>,
	variationCount: number = 4
): Promise<CgVariation[]> {
	const variations: CgVariation[] = [];

	const dataSection = dataContext
		? `\n\n## 바인딩할 실시간 데이터:\n${JSON.stringify(dataContext, null, 2)}`
		: "";

	for (let i = 0; i < variationCount; i++) {
		try {
			const singlePrompt = `${prompt}\n\n캔버스: ${bounds.width}x${bounds.height}px\n컬러 스킴: ${COLOR_SCHEMES[i]}\n${dataSection}\n\nGraphicElement[] JSON 배열 하나만 출력하세요.`;
			const { text } = await callAI(DEFAULT_SYSTEM_PROMPT, singlePrompt, {
				maxOutputTokens: 8192,
				requestType: "cg_generation",
			});
			const elements = parseElementsFromResponse(text);

			variations.push({
				id: `var-${Date.now()}-${i}`,
				name: `Variation ${i + 1}`,
				description: COLOR_SCHEMES[i],
				elements,
				canvasSize: { width: bounds.width, height: bounds.height },
				colorScheme: COLOR_SCHEMES[i],
				tags: [COLOR_SCHEMES[i].split(" ")[0]],
			});
		} catch (innerErr) {
			console.error(`[AI-CG] Variation ${i + 1} 생성 실패:`, innerErr);
		}
	}

	if (variations.length === 0) {
		throw new Error("CG 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
	}

	return variations;
}

export interface AiTestResult {
	success: boolean;
	modelId: string;
	provider: string;
	message: string;
	responseTimeMs: number;
	responseSnippet?: string;
}

export async function testApiConnection(): Promise<AiTestResult> {
	const startTime = Date.now();
	let config: Awaited<ReturnType<typeof getActiveConfig>>;

	try {
		invalidateModelCache();
		config = await getActiveConfig();
	} catch (err: any) {
		return {
			success: false,
			modelId: "unknown",
			provider: "unknown",
			message: `모델 설정 조회 실패: ${err.message}`,
			responseTimeMs: Date.now() - startTime,
		};
	}

	try {
		const testPrompt = '연결 테스트입니다. 정확히 이 JSON만 출력하세요: [{"status":"ok"}]';
		const { text } = await callAI(
			"당신은 API 연결 테스트 도구입니다. 요청받은 JSON만 정확히 출력하세요.",
			testPrompt,
			{ maxOutputTokens: 256, requestType: "test" },
		);

		const elapsed = Date.now() - startTime;
		const snippet = text.slice(0, 100);

		return {
			success: true,
			modelId: config.modelId,
			provider: config.provider,
			message: `✅ 연결 성공 (${elapsed}ms)`,
			responseTimeMs: elapsed,
			responseSnippet: snippet,
		};
	} catch (err: any) {
		return {
			success: false,
			modelId: config.modelId,
			provider: config.provider,
			message: `❌ API 호출 실패: ${err.message}`,
			responseTimeMs: Date.now() - startTime,
		};
	}
}

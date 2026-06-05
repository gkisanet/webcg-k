/**
 * textMeasure — Canvas 기반 텍스트 폭 사전 측정 유틸리티
 *
 * ■ 왜(Why) Canvas API를 사용하는가?
 * ─────────────────────────────────
 * SVG <text>의 `getComputedTextLength()`는 요소가 DOM에 마운트된 후에만 호출 가능하다.
 * → React의 선언적 렌더링과 충돌 (useEffect + setState → 이중 렌더링 비용).
 *
 * Canvas `measureText()`는 오프스크린에서 동일한 브라우저 폰트 엔진을 사용하여
 * 텍스트 폭을 측정하므로, DOM 접근 없이 렌더링 전에 결과를 알 수 있다.
 * 이것이 Pretext 라이브러리의 핵심 원리이기도 하다.
 *
 * ■ Trade-off (ADR 2026-03-31):
 * - Canvas measureText는 SVG <text>와 1-2px 오차가 있을 수 있으나,
 *   방송 CG의 auto-fit은 "대략적 압축"이므로 이 정도 오차는 문제없음.
 * - `document.fonts.ready` 이전에 호출하면 시스템 fallback 폰트로 측정될 수 있음.
 *   → WebCG-K는 웹폰트가 완전히 로드된 후 렌더러가 활성화되므로 대부분 안전.
 */

// ─── 1. Canvas 싱글턴 캐시 ──────────────────────────────────────────
// Why: Canvas 생성은 비용이 큰 작업이므로 한 번만 생성하고 재사용한다.
// 이 패턴은 Pretext 내부에서도 동일하게 사용된다.
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
    // SSR 환경(Node.js)에서는 Canvas API가 없으므로 null 반환
    // TanStack Start는 SSR 프레임워크이므로 이 가드가 필수
    if (typeof document === "undefined") return null;

    if (_ctx) return _ctx;
    _canvas = document.createElement("canvas");
    _ctx = _canvas.getContext("2d");
    return _ctx;
}

/**
 * 텍스트의 렌더링 폭을 DOM 접근 없이 측정한다.
 *
 * @example
 * ```ts
 * const width = measureTextWidth("속보: 대통령 취임식", 24, "Pretendard", 700);
 * // → 약 312px
 * ```
 *
 * @param text - 측정할 텍스트 (빈 문자열이면 0 반환)
 * @param fontSize - 폰트 크기 (px)
 * @param fontFamily - 폰트 패밀리 (예: "Pretendard, sans-serif")
 * @param fontWeight - 폰트 굵기 (기본 400)
 * @returns 텍스트의 렌더링 폭 (px). 측정 불가 시 0.
 */
export function measureTextWidth(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number = 400,
): number {
    const ctx = getContext();
    if (!ctx || !text) return 0;

    // 2. Canvas font shorthand 조립
    // CSS font shorthand 형식: "[weight] [size]px [family]"
    // 예: "700 24px Pretendard, sans-serif"
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
}

/**
 * wrap 모드에서 텍스트가 실제로 차지하는 높이를 추정한다.
 *
 * ■ 알고리즘 (Greedy Line-Break 시뮬레이션):
 *   1단계: 공백(' ')으로 단어를 분리
 *   2단계: 현재 줄에 단어를 하나씩 추가하며 폭 측정
 *   3단계: frameWidth 초과 시 줄바꿈 (새 줄 시작)
 *   4단계: 줄 수 × fontSize × lineHeight = 총 높이
 *
 * ■ Canvas measureText를 사용하므로 DOM 리플로우 0회.
 *   CSS의 `word-wrap: break-word`와 동일한 단어 단위 줄바꿈을 흉내낸다.
 *
 * @param text      - 측정할 텍스트
 * @param fontSize  - 폰트 크기 (px)
 * @param fontFamily - 폰트 패밀리
 * @param fontWeight - 폰트 굵기
 * @param frameWidth - Text Frame 폭 (줄바꿈 기준)
 * @param lineHeight - 줄 간격 배수 (기본 1.2)
 * @returns 추정 높이 (px). 텍스트 없거나 측정 불가 시 0.
 */
export function estimateWrappedTextHeight(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number = 400,
    frameWidth: number,
    lineHeight: number = 1.2,
): number {
    const ctx = getContext();
    if (!ctx || !text || frameWidth <= 0) return 0;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    // 3. 줄 수 계산 (Greedy word-wrap 시뮬레이션)
    const words = text.split(" ");
    let lineCount = 1;
    let currentLineWidth = 0;
    const spaceWidth = ctx.measureText(" ").width;

    for (const word of words) {
        const wordWidth = ctx.measureText(word).width;
        if (currentLineWidth === 0) {
            // 맨 처음이거나 줄바꿈 직후
            currentLineWidth = wordWidth;
        } else if (currentLineWidth + spaceWidth + wordWidth <= frameWidth) {
            // 현재 줄에 추가 가능
            currentLineWidth += spaceWidth + wordWidth;
        } else {
            // 줄바꿈
            lineCount++;
            currentLineWidth = wordWidth;
        }
    }

    return lineCount * fontSize * lineHeight;
}

/**
 * 텍스트가 Text Frame을 초과하는지 판단하고 초과 정도를 반환한다.
 *
 * ■ 오버플로우 ratio 해석:
 *   - ratio ≤ 1.0 : 정상 (텍스트가 프레임 안에 맞음)
 *   - 1.0 < ratio ≤ 1.5 : 경고 (약간 초과, 황색 표시)
 *   - ratio > 1.5 : 심각 (빨간 표시 + 분리 권장)
 *
 * @param text         - 텍스트 내용
 * @param fontSize     - 폰트 크기 (px)
 * @param fontFamily   - 폰트 패밀리
 * @param fontWeight   - 폰트 굵기
 * @param frameWidth   - Text Frame 폭 (px)
 * @param frameHeight  - Text Frame 높이 (px)
 * @param mode         - "shrink" | "wrap" | "none"
 * @param lineHeight   - 줄 간격 배수 (기본 1.2)
 */
export function checkTextOverflow(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number = 400,
    frameWidth: number,
    frameHeight: number,
    mode: "shrink" | "wrap" | "none",
    lineHeight: number = 1.2,
): { overflow: boolean; ratio: number; estimatedHeight: number } {
    if (!text) return { overflow: false, ratio: 0, estimatedHeight: 0 };

    // 4. 모드별 오버플로우 판단
    if (mode === "wrap") {
        // wrap 모드: 줄바꿈 후 높이 기준
        const estimatedHeight = estimateWrappedTextHeight(
            text, fontSize, fontFamily, fontWeight, frameWidth, lineHeight,
        );
        const ratio = frameHeight > 0 ? estimatedHeight / frameHeight : 0;
        return { overflow: ratio > 1.0, ratio, estimatedHeight };
    } else {
        // shrink / none 모드: 폭 기준 (shrink는 압축이 끝나도 frameWidth 이내이므로 ratio=1 고정)
        const textWidth = measureTextWidth(text, fontSize, fontFamily, fontWeight);
        const estimatedHeight = fontSize * lineHeight;
        if (mode === "shrink") {
            // shrink는 frameWidth까지 압축되므로 항상 적합 (높이만 확인)
            const ratio = frameHeight > 0 ? estimatedHeight / frameHeight : 0;
            return { overflow: ratio > 1.0, ratio, estimatedHeight };
        }
        // none 모드: 폭 기준
        const ratio = frameWidth > 0 ? textWidth / frameWidth : 0;
        return { overflow: ratio > 1.0, ratio, estimatedHeight };
    }
}

/**
 * 텍스트가 지정된 최대 폭을 초과할 때 적용해야 하는 수평 스케일 팩터를 계산한다.
 *
 * ■ 비유: 방송 자막에 "대한민국 제21대 대통령 취임식"이 들어오면,
 *   지정된 자막 영역(Lower Third) 폭에 맞춰 글자를 수평 압축하는 것.
 *   이것은 방송 현장에서 매우 보편적인 처리 방식(Horizontal Squeeze)이다.
 *
 * @param text - 측정할 텍스트
 * @param fontSize - 폰트 크기 (px)
 * @param fontFamily - 폰트 패밀리
 * @param fontWeight - 폰트 굵기 (기본 400)
 * @param maxWidth - 허용 최대 폭 (px) — 그래픽 요소의 width
 * @param minScale - 최소 스케일 (기본 0.5 = 50%까지만 축소)
 *                   너무 많이 축소하면 글자가 찌그러져 가독성이 떨어짐
 * @returns 1.0 (변환 불필요) 또는 minScale~0.99 (축소 필요)
 */
export function calculateAutoFitScale(
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number = 400,
    maxWidth: number,
    minScale: number = 0.5,
): number {
    // 3. 텍스트 폭 측정
    const textWidth = measureTextWidth(text, fontSize, fontFamily, fontWeight);

    // 오버플로우가 없으면 1.0 (변환 없음)
    if (textWidth <= 0 || textWidth <= maxWidth) return 1;

    // 4. 스케일 팩터 계산 (최소값으로 하한선 제한)
    // 예: textWidth=500, maxWidth=400 → scale=0.8 (20% 수평 축소)
    const scale = maxWidth / textWidth;
    return Math.max(scale, minScale);
}

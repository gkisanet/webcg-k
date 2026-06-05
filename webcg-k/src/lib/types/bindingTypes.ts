/**
 * Binding Container 타입 정의 — Text Frame 아키텍처 (Phase D-1.5)
 *
 * Why "Text Frame"인가?
 * ─────────────────────
 * D-1에서 도입한 Binding Container는 Shape가 텍스트를 "속성"으로 소유하지만,
 * 텍스트의 **경계(boundary)**가 명시적이지 않았다.
 *
 * 파워포인트에서 Shape 더블클릭 → 나타나는 텍스트 입력 영역이 "Text Frame":
 *
 *   ┌─── Shape (rect) ──────────────────┐
 *   │                                    │
 *   │   ┌─── Text Frame ─────────────┐  │  ← 투명 바운더리 (frameX/Y/W/H)
 *   │   │                             │  │
 *   │   │  텍스트 입력/표시 영역       │  │  ← auto-fit / line-break 기준
 *   │   │                             │  │
 *   │   └─────────────────────────────┘  │
 *   │                                    │
 *   └────────────────────────────────────┘
 *
 * Text Frame이 있으면:
 *   1) auto-fit(shrink)의 기준 폭이 명확 (frameWidth)
 *   2) line-break(wrap)의 줄바꿈 기준이 명확 (frameWidth)
 *   3) Shape 경계와 텍스트 사이의 margin이 자연스럽게 표현됨 (frameX/Y 오프셋)
 *
 * shrink와 wrap은 택일(mutually exclusive)이지만,
 * 동일한 Text Frame 바운더리를 기준으로 동작한다.
 */

import type { BindingAutoFit } from "@/lib/textFitPolicy";

// ─── 텍스트 슬롯 (Shape 내부의 Text Frame 영역) ─────────────────

/** Shape 내부에 배치되는 텍스트 슬롯 하나 (1 Shape = 1 슬롯) */
export interface BindingTextSlot {
	/** 고유 ID — 매핑 엔진의 target_element_id로 사용됨 */
	id: string;

	/**
	 * 바인딩 키 — NRCS CG 필드와 매칭되는 식별자
	 * 예: "personName", "personTitle", "headline", "source"
	 */
	bindingKey: string;

	/** UI 표시용 한국어 라벨 (예: "이름", "직함", "헤드라인") */
	label: string;

	/** 현재 텍스트 내용 (기본값 / 미리보기용, 데이터 주입 시 덮어써짐) */
	content: string;

	// ── 텍스트 스타일 ─────────────────────────────────────
	fontFamily: string;
	fontSize: number;
	fontWeight: number;
	color: string;
	textAlign: "left" | "center" | "right";

	// ── Text Frame — Shape 내부 좌표 (px) ───────────────
	/**
	 * Text Frame 위치/크기 — Shape 원점(x,y) 기준 오프셋
	 *
	 * Why px 단위인가?
	 * → 방송 CG는 1920×1080 또는 3840×2160 고정 해상도.
	 *   px 단위가 WYSIWYG에 가장 정확하다.
	 *
	 * frameX=16, frameY=12이면 Shape 왼쪽에서 16px, 위에서 12px
	 * 안쪽에 텍스트 영역이 시작된다 (= 사실상 margin 역할).
	 */
	frameX: number;
	frameY: number;
	frameWidth: number;
	frameHeight: number;
}

// ─── Binding Container 설정 (Shape 요소에 추가) ──────────────────

/**
 * Binding Container — Shape가 Text Frame을 소유하는 설정
 * GraphicElement (type: "rect" | "ellipse")에 optional로 추가
 *
 * 1 Shape = 1 Binding Container = 1 Text Slot (단순화)
 * → 이름+직함이 필요하면 Shape 2개를 사용
 */
export interface BindingContainer {
	/** 활성화 여부 (토글로 on/off) */
	enabled: boolean;

	/** 텍스트 슬롯 (현재는 1개만 지원, 배열은 확장성을 위해 유지) */
	slots: BindingTextSlot[];

	/**
	 * 오버플로우 대응 전략 (택일)
	 * - "shrink": 텍스트가 Text Frame 폭을 초과하면 fontSize 자동 축소
	 * - "expandRight": 텍스트 길이에 맞춰 Shape의 오른쪽 폭 자동 확장
	 * - "expandRightThenShrink": 안전 폭까지 확장 후 남는 초과분만 수평 축소
	 * - "wrap": 텍스트가 Text Frame 폭을 초과하면 줄바꿈 (line-break)
	 * - "none": 오버플로우 무시 (넘치면 잘림)
	 */
	autoFit: BindingAutoFit;
}

// ─── 기본값 팩토리 ─────────────────────────────────────────────

/**
 * 기본 Text Frame inset.
 *
 * Why 15% + clamp?
 * - Shape resize handle은 Shape 외곽에 붙고 Text Frame handle은 내부에 있어야 선택 충돌이 적다.
 * - 순수 15%는 큰 Shape에서 과하게 넓어지므로 방송 그래픽(Broadcast Graphics) 제작에서
 *   흔한 여백 범위로 상한을 둔다.
 */
const DEFAULT_TEXT_FRAME_MARGIN_RATIO = 0.15;
const DEFAULT_TEXT_FRAME_MIN_MARGIN = 12;
const DEFAULT_TEXT_FRAME_MAX_MARGIN = 48;
const DEFAULT_TEXT_FRAME_MIN_WIDTH = 40;
const DEFAULT_TEXT_FRAME_MIN_HEIGHT = 20;

function resolveDefaultFrameMargin(axisSize: number, minContentSize: number): number {
	const maxAllowedMargin = Math.max(0, (axisSize - minContentSize) / 2);
	const preferredMargin = axisSize * DEFAULT_TEXT_FRAME_MARGIN_RATIO;
	return Math.round(
		Math.min(
			Math.max(preferredMargin, DEFAULT_TEXT_FRAME_MIN_MARGIN),
			DEFAULT_TEXT_FRAME_MAX_MARGIN,
			maxAllowedMargin,
		),
	);
}

export function createDefaultTextFrame(
	parentWidth = 300,
	parentHeight = 80,
): Pick<BindingTextSlot, "frameX" | "frameY" | "frameWidth" | "frameHeight"> {
	const marginX = resolveDefaultFrameMargin(parentWidth, DEFAULT_TEXT_FRAME_MIN_WIDTH);
	const marginY = resolveDefaultFrameMargin(parentHeight, DEFAULT_TEXT_FRAME_MIN_HEIGHT);

	return {
		frameX: marginX,
		frameY: marginY,
		frameWidth: Math.max(parentWidth - marginX * 2, DEFAULT_TEXT_FRAME_MIN_WIDTH),
		frameHeight: Math.max(parentHeight - marginY * 2, DEFAULT_TEXT_FRAME_MIN_HEIGHT),
	};
}

/**
 * 새 텍스트 슬롯 기본값 생성
 * parentWidth/Height를 받아 Text Frame을 Shape 안쪽 기본 inset으로 초기화
 */
export function createDefaultSlot(
	overrides?: Partial<BindingTextSlot>,
	parentWidth = 300,
	parentHeight = 80,
): BindingTextSlot {
	const frame = createDefaultTextFrame(parentWidth, parentHeight);
	return {
		id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		bindingKey: "",
		label: "",
		content: "텍스트",
		fontFamily: "Pretendard",
		fontSize: 24,
		fontWeight: 400,
		color: "#ffffff",
		textAlign: "center",
		// Text Frame: Shape 안쪽으로 기본 inset만큼 들어간 영역
		...frame,
		...overrides,
	};
}

/** 새 Binding Container 기본값 생성 */
export function createDefaultBindingContainer(): BindingContainer {
	return {
		enabled: true,
		slots: [],
		autoFit: "shrink",
	};
}

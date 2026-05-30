import { estimateWrappedTextHeight, measureTextWidth } from "@/lib/textMeasure";

export type BindingAutoFit =
	| "shrink"
	| "wrap"
	| "none"
	| "expandRight"
	| "expandRightThenShrink";

export type TextFitSeverity = "ok" | "warning" | "error";

export interface BindingAutoFitOption {
	value: BindingAutoFit;
	label: string;
	description: string;
}

export const BINDING_AUTO_FIT_OPTIONS: BindingAutoFitOption[] = [
	{
		value: "shrink",
		label: "자동 축소",
		description: "Shape 폭은 고정하고 텍스트 장평을 줄입니다.",
	},
	{
		value: "expandRight",
		label: "오른쪽 확장",
		description: "텍스트 길이에 맞춰 Shape 오른쪽 폭을 늘립니다.",
	},
	{
		value: "expandRightThenShrink",
		label: "확장 후 축소",
		description: "안전 폭까지 확장한 뒤 남는 초과분만 축소합니다.",
	},
	{
		value: "wrap",
		label: "줄바꿈",
		description: "Text Frame 폭을 유지하고 여러 줄로 표시합니다.",
	},
	{
		value: "none",
		label: "없음",
		description: "자동 보정을 하지 않고 초과 여부만 표시합니다.",
	},
];

export interface TextFitShapeInput {
	x: number;
	width: number;
	height: number;
}

export interface TextFitSlotInput {
	frameX: number;
	frameY: number;
	frameWidth: number;
	frameHeight: number;
	fontSize: number;
	fontFamily: string;
	fontWeight: number;
}

export interface TextFitConstraints {
	canvasWidth?: number;
	safeRight?: number;
	maxWidth?: number;
	readableMinScale?: number;
}

export interface BindingTextLayoutInput {
	content: string;
	autoFit?: BindingAutoFit | string | null;
	shape: TextFitShapeInput;
	slot: TextFitSlotInput;
	constraints?: TextFitConstraints;
	lineHeight?: number;
	measuredTextWidth?: number;
}

export interface BindingTextLayoutResult {
	mode: BindingAutoFit;
	textWidth: number;
	originalShapeWidth: number;
	renderShapeWidth: number;
	originalFrameWidth: number;
	renderFrameWidth: number;
	originalFrameHeight: number;
	renderFrameHeight: number;
	textScaleX: number;
	ratio: number;
	overflow: boolean;
	severity: TextFitSeverity;
	message: string;
}

const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_READABLE_MIN_SCALE = 0.72;
const EPSILON = 0.5;

export function normalizeBindingAutoFit(
	mode: BindingAutoFit | string | null | undefined,
): BindingAutoFit {
	if (
		mode === "shrink" ||
		mode === "wrap" ||
		mode === "none" ||
		mode === "expandRight" ||
		mode === "expandRightThenShrink"
	) {
		return mode;
	}
	return "none";
}

export function getBindingAutoFitLabel(
	mode: BindingAutoFit | string | null | undefined,
): string {
	const normalized = normalizeBindingAutoFit(mode);
	return (
		BINDING_AUTO_FIT_OPTIONS.find((option) => option.value === normalized)
			?.label ?? "없음"
	);
}

export function resolveBindingTextLayout(
	input: BindingTextLayoutInput,
): BindingTextLayoutResult {
	const mode = normalizeBindingAutoFit(input.autoFit);
	const lineHeight = input.lineHeight ?? 1.2;
	const textWidth =
		input.measuredTextWidth ??
		measureTextWidth(
			input.content,
			input.slot.fontSize,
			input.slot.fontFamily,
			input.slot.fontWeight,
		);
	const base = createBaseResult(input, mode, textWidth);

	if (!input.content || textWidth <= 0) {
		return { ...base, message: "텍스트가 비어 있습니다." };
	}

	if (mode === "wrap") {
		const estimatedHeight = estimateWrappedTextHeight(
			input.content,
			input.slot.fontSize,
			input.slot.fontFamily,
			input.slot.fontWeight,
			input.slot.frameWidth,
			lineHeight,
		);
		const maxFrameHeight = Math.max(
			input.shape.height - input.slot.frameY,
			input.slot.frameHeight,
		);
		const renderFrameHeight =
			estimatedHeight > input.slot.frameHeight
				? Math.min(Math.ceil(estimatedHeight), maxFrameHeight)
				: input.slot.frameHeight;
		const ratio =
			input.slot.frameHeight > 0 ? estimatedHeight / input.slot.frameHeight : 0;
		const clipped = estimatedHeight > maxFrameHeight + EPSILON;
		const expanded = renderFrameHeight > input.slot.frameHeight + EPSILON;

		return {
			...base,
			renderFrameHeight,
			ratio,
			overflow: clipped,
			severity: clipped ? "error" : expanded ? "warning" : "ok",
			message: clipped
				? "줄바꿈 후에도 Shape 높이를 초과합니다."
				: expanded
					? `줄바꿈 높이가 ${Math.round(renderFrameHeight)}px까지 확장됩니다.`
					: "텍스트가 프레임 안에 맞습니다.",
		};
	}

	if (mode === "expandRight" || mode === "expandRightThenShrink") {
		return resolveExpandableLayout(input, mode, textWidth, base);
	}

	const ratio =
		input.slot.frameWidth > 0 ? textWidth / input.slot.frameWidth : 0;

	if (mode === "shrink") {
		const textScaleX = ratio > 1 ? input.slot.frameWidth / textWidth : 1;
		const severity = getScaleSeverity(
			textScaleX,
			input.constraints?.readableMinScale,
		);

		return {
			...base,
			textScaleX,
			ratio,
			overflow: textScaleX < 1,
			severity,
			message:
				textScaleX < 1
					? `텍스트가 ${Math.round(textScaleX * 100)}%로 축소됩니다.`
					: "텍스트가 프레임 안에 맞습니다.",
		};
	}

	const overflowing = ratio > 1;
	return {
		...base,
		ratio,
		overflow: overflowing,
		severity: overflowing ? (ratio > 1.5 ? "error" : "warning") : "ok",
		message: overflowing
			? `텍스트가 프레임 폭을 ${Math.round((ratio - 1) * 100)}% 초과합니다.`
			: "텍스트가 프레임 안에 맞습니다.",
	};
}

function createBaseResult(
	input: BindingTextLayoutInput,
	mode: BindingAutoFit,
	textWidth: number,
): BindingTextLayoutResult {
	return {
		mode,
		textWidth,
		originalShapeWidth: input.shape.width,
		renderShapeWidth: input.shape.width,
		originalFrameWidth: input.slot.frameWidth,
		renderFrameWidth: input.slot.frameWidth,
		originalFrameHeight: input.slot.frameHeight,
		renderFrameHeight: input.slot.frameHeight,
		textScaleX: 1,
		ratio: 0,
		overflow: false,
		severity: "ok",
		message: "텍스트가 프레임 안에 맞습니다.",
	};
}

function resolveExpandableLayout(
	input: BindingTextLayoutInput,
	mode: "expandRight" | "expandRightThenShrink",
	textWidth: number,
	base: BindingTextLayoutResult,
): BindingTextLayoutResult {
	const rightInset = Math.max(
		input.shape.width - input.slot.frameX - input.slot.frameWidth,
		0,
	);
	const requiredFrameWidth = Math.ceil(textWidth + EPSILON);
	const requiredShapeWidth =
		input.slot.frameX + requiredFrameWidth + rightInset;
	const maxAllowedShapeWidth = getMaxAllowedShapeWidth(input);
	const renderShapeWidth = Math.min(
		Math.max(input.shape.width, requiredShapeWidth),
		maxAllowedShapeWidth,
	);
	const renderFrameWidth = Math.max(
		input.slot.frameWidth,
		renderShapeWidth - input.slot.frameX - rightInset,
	);
	const ratio = renderFrameWidth > 0 ? textWidth / renderFrameWidth : 0;

	if (mode === "expandRight") {
		const overflowing = ratio > 1;
		return {
			...base,
			renderShapeWidth,
			renderFrameWidth,
			ratio,
			overflow: overflowing,
			severity: overflowing ? (ratio > 1.5 ? "error" : "warning") : "ok",
			message: overflowing
				? "안전 폭까지 확장해도 텍스트가 남습니다."
				: renderShapeWidth > input.shape.width
					? `Shape 폭이 ${Math.round(renderShapeWidth)}px까지 확장됩니다.`
					: "텍스트가 프레임 안에 맞습니다.",
		};
	}

	const textScaleX = ratio > 1 ? renderFrameWidth / textWidth : 1;
	const severity = getScaleSeverity(
		textScaleX,
		input.constraints?.readableMinScale,
	);

	return {
		...base,
		renderShapeWidth,
		renderFrameWidth,
		textScaleX,
		ratio,
		overflow: textScaleX < 1,
		severity,
		message:
			textScaleX < 1
				? `Shape 확장 후 텍스트가 ${Math.round(textScaleX * 100)}%로 축소됩니다.`
				: renderShapeWidth > input.shape.width
					? `Shape 폭이 ${Math.round(renderShapeWidth)}px까지 확장됩니다.`
					: "텍스트가 프레임 안에 맞습니다.",
	};
}

function getMaxAllowedShapeWidth(input: BindingTextLayoutInput): number {
	const canvasWidth = input.constraints?.canvasWidth ?? DEFAULT_CANVAS_WIDTH;
	const safeRight = input.constraints?.safeRight ?? canvasWidth;
	const maxWidth = input.constraints?.maxWidth ?? Number.POSITIVE_INFINITY;
	const availableBySafeRight = Math.max(
		input.shape.width,
		safeRight - input.shape.x,
	);
	return Math.max(input.shape.width, Math.min(availableBySafeRight, maxWidth));
}

function getScaleSeverity(
	textScaleX: number,
	readableMinScale = DEFAULT_READABLE_MIN_SCALE,
): TextFitSeverity {
	if (textScaleX >= 1) return "ok";
	if (textScaleX < readableMinScale) return "error";
	return "warning";
}

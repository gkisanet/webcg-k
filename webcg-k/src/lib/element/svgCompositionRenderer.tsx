import type { ReactNode, SVGProps } from "react";
import {
	type BooleanOperation,
	elementToPathD,
	isBooleanOperand,
} from "./vectorComposition";
import { resolveCornerRadius, toRoundedRectPath } from "./cornerRadius";

export interface SvgCompositionElement {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	visible?: boolean;
	zIndex?: number;
	parentId?: string | null;
	fill?: { type?: string; color?: string; opacity?: number };
	borderRadius?: number;
	borderRadiusUnit?: "px" | "%";
	borderRadiusTL?: number;
	borderRadiusTR?: number;
	borderRadiusBR?: number;
	borderRadiusBL?: number;
	borderRadiusLinked?: boolean;
	content?: string;
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	clipContent?: boolean;
	maskSourceId?: string | null;
	booleanOperation?: BooleanOperation;
	rotation?: number; // 🆕 회전 트랜스폼 연동을 위한 속성 공식 추가
	textAlign?: "left" | "center" | "right" | "justify"; // 🆕 수평 정렬 속성 연동
	verticalAlign?: "top" | "middle" | "bottom"; // 🆕 수직 정렬 속성 연동
}

type SvgGroupProps = SVGProps<SVGGElement>;

interface SvgBooleanGroupOptions<E extends SvgCompositionElement> {
	element: E;
	elements: E[];
	groupProps?: SvgGroupProps;
	idPrefix?: string;
	leadingNode?: ReactNode;
	trailingNode?: ReactNode;
	emptyNode?: ReactNode;
	renderBooleanFill?: (base: E, group: E, idPrefix?: string) => ReactNode;
}

interface SvgCompositionGroupOptions<E extends SvgCompositionElement> {
	element: E;
	elements: E[];
	renderElement: (element: E) => ReactNode;
	groupProps?: SvgGroupProps;
	idPrefix?: string;
	leadingNode?: ReactNode;
	backgroundNode?: ReactNode;
	trailingNode?: ReactNode;
	maskTextFallback?: string;
	maskFontFamily?: string;
}

interface SvgMaskShapeOptions {
	fill: string;
	textFallback?: string;
	fontFamily?: string;
}

const DEFAULT_ID_PREFIX = "svg-composition";

export function buildSvgCompositionId(
	prefix: string | undefined,
	kind: string,
	elementId: string,
	suffix?: string | number,
): string {
	const raw = [prefix || DEFAULT_ID_PREFIX, kind, elementId, suffix]
		.filter((part) => part !== undefined && part !== "")
		.join("-");
	return raw.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function getSvgCompositionChildren<E extends SvgCompositionElement>(
	elements: E[],
	parentId: string,
): E[] {
	return elements
		.filter(
			(element) => element.parentId === parentId && element.visible !== false,
		)
		.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export function renderSvgCompositionMaskShape<E extends SvgCompositionElement>(
	element: E,
	{ fill, textFallback = "", fontFamily }: SvgMaskShapeOptions,
): ReactNode {
	const cx = element.x + element.width / 2;
	const cy = element.y + element.height / 2;
	// 🆕 마스크 셰이프 자체의 회전(Transform) 반영하여 삐뚤어짐 완치
	const transform = element.rotation
		? `rotate(${element.rotation} ${cx} ${cy})`
		: undefined;

	if (element.type === "text") {
		const fontSize = element.fontSize || 24;
		const textAlign = element.textAlign || "left";
		const vAlign = element.verticalAlign || "top";

		let textX = element.x;
		let textAnchor: "start" | "middle" | "end" = "start";
		if (textAlign === "center") {
			textX = element.x + element.width / 2;
			textAnchor = "middle";
		} else if (textAlign === "right") {
			textX = element.x + element.width;
			textAnchor = "end";
		}

		let textY = element.y + fontSize;
		let dominantBaseline: "auto" | "central" | "text-after-edge" = "auto";
		if (vAlign === "middle") {
			textY = element.y + element.height / 2;
			dominantBaseline = "central";
		} else if (vAlign === "bottom") {
			textY = element.y + element.height;
			dominantBaseline = "text-after-edge";
		}

		return (
			<text
				key={`mask-text-${element.id}`}
				data-element-id={element.id}
				x={textX}
				y={textY}
				fill={fill}
				fontSize={fontSize}
				fontFamily={
					element.fontFamily || fontFamily || "Pretendard, sans-serif"
				}
				fontWeight={element.fontWeight || 400}
				textAnchor={textAnchor}
				dominantBaseline={dominantBaseline}
				transform={transform}
				style={{
					transformBox: "fill-box",
					transformOrigin: "center",
				}}
			>
				{element.content || textFallback}
			</text>
		);
	}

	const pathD = elementToPathD(element);
	if (!pathD) return null;
	return (
		<path
			key={`mask-path-${element.id}`}
			data-element-id={element.id}
			d={pathD}
			fill={fill}
			transform={transform}
			style={{
				transformBox: "fill-box",
				transformOrigin: "center",
			}}
		/>
	);
}

function renderDefaultBooleanFill<E extends SvgCompositionElement>(
	base: E,
	group: E,
	idPrefix?: string, // 🆕 idPrefix 옵션 추가로 그라데이션 ID 격리화 대응
): ReactNode {
	const fill =
		base.fill?.type === "linear" || base.fill?.type === "radial"
			? idPrefix
				? `url(#gradient-${idPrefix}-${base.id})`
				: `url(#gradient-${base.id})`
			: base.fill?.type === "none"
				? "transparent"
				: base.fill?.color || "#333";
	return (
		<rect
			x={group.x}
			y={group.y}
			width={group.width}
			height={group.height}
			fill={fill}
			fillOpacity={base.fill?.opacity ?? 1}
		/>
	);
}

export function renderSvgBooleanGroup<E extends SvgCompositionElement>({
	element,
	elements,
	groupProps,
	idPrefix,
	leadingNode,
	trailingNode,
	emptyNode = null,
	renderBooleanFill = renderDefaultBooleanFill,
}: SvgBooleanGroupOptions<E>): ReactNode {
	const operands = getSvgCompositionChildren(elements, element.id).filter(
		isBooleanOperand,
	);
	const base = operands[0];
	if (!base) return emptyNode;

	const operation = element.booleanOperation ?? "union";
	const hasTextOperand = operands.some((op) => op.type === "text");

	const pathDs = operands
		.map((operand) => ({ id: operand.id, d: elementToPathD(operand) }))
		.filter((item): item is { id: string; d: string } => Boolean(item.d));
	const basePath = pathDs[0];
	const booleanFill = renderBooleanFill(base, element, idPrefix);
	const maskId = buildSvgCompositionId(idPrefix, "boolean-mask", element.id);
	const clipPrefix = buildSvgCompositionId(
		idPrefix,
		"boolean-clip",
		element.id,
	);

	// 🆕 피연산자를 마스크 셰이프로 그리는 공통 헬퍼 함수 (회전 트랜스폼 및 텍스트/도형 분기 완벽 지원)
	const renderBooleanMaskShape = (operand: E, fill: string) => {
		const cx = operand.x + operand.width / 2;
		const cy = operand.y + operand.height / 2;
		const transform = operand.rotation
			? `rotate(${operand.rotation} ${cx} ${cy})`
			: undefined;

		if (operand.type === "text") {
			const fontSize = operand.fontSize || 24;
			const textAlign = operand.textAlign || "left";
			const vAlign = operand.verticalAlign || "top";

			let textX = operand.x;
			let textAnchor: "start" | "middle" | "end" = "start";
			if (textAlign === "center") {
				textX = operand.x + operand.width / 2;
				textAnchor = "middle";
			} else if (textAlign === "right") {
				textX = operand.x + operand.width;
				textAnchor = "end";
			}

			let textY = operand.y + fontSize;
			let dominantBaseline: "auto" | "central" | "text-after-edge" = "auto";
			if (vAlign === "middle") {
				textY = operand.y + operand.height / 2;
				dominantBaseline = "central";
			} else if (vAlign === "bottom") {
				textY = operand.y + operand.height;
				dominantBaseline = "text-after-edge";
			}

			return (
				<text
					key={`boolean-text-${operand.id}`}
					data-element-id={operand.id}
					x={textX}
					y={textY}
					fill={fill}
					fontSize={fontSize}
					fontFamily={operand.fontFamily || "Pretendard, sans-serif"}
					fontWeight={operand.fontWeight || 400}
					textAnchor={textAnchor}
					dominantBaseline={dominantBaseline}
					transform={transform}
					style={{
						transformBox: "fill-box",
						transformOrigin: "center",
					}}
				>
					{operand.content || ""}
				</text>
			);
		}

		const d = elementToPathD(operand);
		if (!d) return null;
		return (
			<path
				key={`boolean-path-${operand.id}`}
				data-element-id={operand.id}
				d={d}
				fill={fill}
				transform={transform}
				style={{
					transformBox: "fill-box",
					transformOrigin: "center",
				}}
			/>
		);
	};

	// 🆕 intersect(교차) 연산이면서 텍스트가 섞여 있지 않은 기존의 특수한 경우 처리
	if (operation === "intersect" && !hasTextOperand && pathDs.length > 0) {
		const intersected = pathDs.reduce<ReactNode>(
			(child, path, index) => (
				<g
					key={`intersect-${path.id}`}
					clipPath={`url(#${clipPrefix}-${index})`}
				>
					{child}
				</g>
			),
			booleanFill,
		);

		return (
			<g key={element.id} {...groupProps}>
				{leadingNode}
				<defs>
					{pathDs.map((path, index) => (
						<clipPath
							key={path.id}
							id={`${clipPrefix}-${index}`}
							clipPathUnits="userSpaceOnUse"
						>
							<path d={path.d} />
						</clipPath>
					))}
				</defs>
				{intersected}
				{trailingNode}
			</g>
		);
	}

	// 🆕 B안 및 하이브리드 루미넌스 마스크 적용 (도형-텍스트 Subtract의 핵심 구멍 뚫기)
	const maskContent =
		operation === "subtract" ? (
			<>
				{/* 1. 기본 마스크 배경은 검은색 (투명 가림) */}
				<rect
					x={element.x}
					y={element.y}
					width={element.width}
					height={element.height}
					fill="black"
				/>
				{/* 2. 첫 번째 피연산자(Base)는 흰색으로 그려서 통과시킴 */}
				{renderBooleanMaskShape(base, "white")}
				{/* 3. 두 번째 피연산자부터는 검은색으로 덮어 씌워서 영역을 빼버림 (B안 Subtract) */}
				{operands
					.slice(1)
					.map((operand) => renderBooleanMaskShape(operand, "black"))}
			</>
		) : (
			// union(결합) 이나 exclude(제외), intersect(교차의 텍스트 모드) 등은 루미넌스 합산
			<>
				<rect
					x={element.x}
					y={element.y}
					width={element.width}
					height={element.height}
					fill="black"
				/>
				{operands.map((operand) => renderBooleanMaskShape(operand, "white"))}
			</>
		);

	return (
		<g key={element.id} {...groupProps}>
			{leadingNode}
			<defs>
				<mask
					id={maskId}
					maskUnits="userSpaceOnUse"
					x={element.x}
					y={element.y}
					width={element.width}
					height={element.height}
				>
					{maskContent}
				</mask>
			</defs>
			{Boolean(operands.length) && (
				<g mask={`url(#${maskId})`}>{booleanFill}</g>
			)}
			{trailingNode}
		</g>
	);
}

export function renderSvgCompositionGroup<E extends SvgCompositionElement>({
	element,
	elements,
	renderElement,
	groupProps,
	idPrefix,
	leadingNode,
	backgroundNode,
	trailingNode,
	maskTextFallback,
	maskFontFamily,
}: SvgCompositionGroupOptions<E>): ReactNode {
	const children = getSvgCompositionChildren(elements, element.id);
	const maskSource = element.maskSourceId
		? elements.find((candidate) => candidate.id === element.maskSourceId)
		: null;
	const clipId = buildSvgCompositionId(idPrefix, "clip", element.id);
	const maskId = buildSvgCompositionId(idPrefix, "mask", element.id);
	const childNodes = children
		.filter((child) => child.id !== maskSource?.id)
		.map(renderElement);

	const maskedChildren: ReactNode = maskSource ? (
		<g mask={`url(#${maskId})`}>{childNodes}</g>
	) : (
		childNodes
	);
	const composedChildren = element.clipContent ? (
		<g clipPath={`url(#${clipId})`}>{maskedChildren}</g>
	) : (
		maskedChildren
	);

	const clipRadius = resolveCornerRadius(element, {
		width: element.width,
		height: element.height,
	});

	return (
		<g key={element.id} {...groupProps}>
			{leadingNode}
			{(element.clipContent || maskSource) && (
				<defs>
					{element.clipContent && (
						<clipPath id={clipId} clipPathUnits="userSpaceOnUse">
							{clipRadius.allSame ? (
								<rect
									x={element.x}
									y={element.y}
									width={element.width}
									height={element.height}
									rx={clipRadius.tl}
								/>
							) : (
								<path
									d={toRoundedRectPath(
										element.x,
										element.y,
										element.width,
										element.height,
										clipRadius,
									)}
								/>
							)}
						</clipPath>
					)}
					{maskSource && (
						<mask
							id={maskId}
							maskUnits="userSpaceOnUse"
							x={element.x}
							y={element.y}
							width={element.width}
							height={element.height}
						>
							{/* 🆕 Luminance 마스크 기본 배경을 명시적으로 검은색(투명)으로 칠해 브라우저 parity 보장 */}
							<rect
								x={element.x}
								y={element.y}
								width={element.width}
								height={element.height}
								fill="black"
							/>
							{renderSvgCompositionMaskShape(maskSource, {
								fill: "white",
								textFallback: maskTextFallback,
								fontFamily: maskFontFamily,
							})}
						</mask>
					)}
				</defs>
			)}
			{backgroundNode}
			{composedChildren}
			{trailingNode}
		</g>
	);
}

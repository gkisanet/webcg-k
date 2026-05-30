/**
 * GraphicPreviewRenderer
 * 그래픽 요소를 SVG로 렌더링하는 미리보기 컴포넌트
 * 2K/4K 해상도별 이미지 자동 전환 지원
 */

import React, { useId, type CSSProperties, type ReactNode } from "react";
import {
	renderSvgBooleanGroup,
	renderSvgCompositionGroup,
} from "@/lib/element/svgCompositionRenderer";
import type { BooleanOperation } from "@/lib/element/vectorComposition";
import {
	type BindingAutoFit,
	type BindingTextLayoutResult,
	resolveBindingTextLayout,
} from "@/lib/textFitPolicy";
import { measureTextWidth } from "@/lib/textMeasure";
import type { BindingContainer } from "@/lib/types/bindingTypes";
import { buildPluginSrcdoc } from "@/lib/webcgkSrcdoc";

// ─── 애니메이션 타입 정의 ──────────────────────────────────────────

/** 등장/퇴장 애니메이션 프리셋 */
export type EnterAnimationType =
	| "fadeIn"
	| "slideLeft"
	| "slideRight"
	| "slideUp"
	| "slideDown"
	| "zoomIn"
	| "bounce"
	| "expand"
	| "reveal"
	| "typewriter";

export type ExitAnimationType =
	| "fadeOut"
	| "slideLeft"
	| "slideRight"
	| "slideUp"
	| "slideDown"
	| "zoomOut"
	| "shrink"
	| "collapse";

/** 반복 애니메이션 프리셋 */
export type LoopAnimationType =
	| "pulse"
	| "float"
	| "rotate"
	| "blink"
	| "shimmer"
	| "breathe"
	| "scroll";

/** 데이터 변경 시 전환 효과 */
export type DataChangeTransition = "fade" | "slide" | "counter";

/** 요소별 애니메이션 설정 */
export interface ElementAnimation {
	// 등장 애니메이션
	enter?: {
		type: EnterAnimationType;
		duration: number; // ms (기본 500)
		delay: number; // ms (stagger 구현의 핵심)
		easing: string; // "ease" | "ease-in-out" | "cubic-bezier(...)"
	};
	// 퇴장 애니메이션
	exit?: {
		type: ExitAnimationType;
		duration: number;
		delay: number;
		easing: string;
	};
	// 반복 애니메이션 (로고 펄스, 떠다니기 등)
	loop?: {
		type: LoopAnimationType;
		duration: number; // ms
		iterationCount: number | "infinite";
	};
}

/** 데이터 바인딩 설정 */
export interface DataBinding {
	field: string; // 바인딩할 데이터 필드명
	format?: string; // 포맷 패턴 (예: "{value}°C")
	onDataChange?: DataChangeTransition; // 값 변경 시 전환 효과
}

// ─── 그래픽 요소 타입 (다중 해상도 이미지 + 애니메이션 지원) ──────

export interface GraphicElement {
	id: string;
	type:
		| "rect"
		| "ellipse"
		| "text"
		| "image"
		| "group"
		| "boolean_group"
		| "html_plugin";
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
	visible: boolean;
	zIndex: number;
	parentId: string | null;
	customCSS?: string;
	// 채우기/선
	fill?: { type?: string; color?: string; opacity?: number };
	stroke?: { enabled?: boolean; color?: string; width?: number };
	borderRadius?: number;
	// 텍스트 속성
	content?: string;
	fontFamily?: string;
	fontSize?: number;
	fontWeight?: number;
	textAlign?: "left" | "center" | "right" | "justify";
	// 이미지 속성 (다중 해상도 지원)
	imageId?: string; // DB 이미지 ID
	src?: string; // 기본 이미지 URL (하위 호환성)
	src_2k?: string; // 2K 해상도 이미지 URL
	src_4k?: string; // 4K 해상도 이미지 URL
	objectFit?: "contain" | "cover" | "fill";
	// 자식 (그룹)
	children?: string[];
	clipContent?: boolean;
	maskSourceId?: string | null;
	maskMode?: "alpha" | "clip";
	booleanOperation?: BooleanOperation;
	// 🆕 애니메이션 (Phase 34 확장 — optional이므로 하위 호환)
	animation?: ElementAnimation;
	// 🆕 데이터 바인딩 (Phase 34 확장)
	dataBinding?: DataBinding;
	// 🆕 바인딩 컨테이너 (Phase D-1)
	// Shape(rect/ellipse)가 텍스트를 소유하는 PowerPoint 모델
	bindingContainer?: BindingContainer;
	// 🆕 고급 시각 효과 (Phase 2 확장)
	boxShadow?: string; // 예: "0 4px 20px rgba(0,0,0,0.5)"
	textShadow?: string; // 예: "0 2px 4px rgba(0,0,0,0.8)"
	backdropFilter?: string; // 예: "blur(12px) saturate(150%)"
	padding?: string; // 예: "12px 24px" (텍스트/그룹 내부 여백용)
	lineHeight?: number; // 예: 1.5
	letterSpacing?: number; // px 단위 자간 (예: -1)
	mixBlendMode?: string; // 예: "overlay", "screen", "multiply"
	filter?: string; // 예: "brightness(1.1) contrast(1.1)"
	// 🆕 HTML 플러그인 (오버레이 임베딩)
	pluginTemplateId?: string;
	pluginTemplateName?: string;
	pluginSourceCode?: { html: string; css: string; js: string };
	pluginData?: any;
	// 📐 선언적 레이아웃 시스템 (Phase 3 확장)
	display?: "absolute" | "flex" | "grid";
	flexDirection?: "row" | "column";
	justifyContent?:
		| "flex-start"
		| "center"
		| "flex-end"
		| "space-between"
		| "space-around";
	alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
	gap?: number;
	position?: "absolute" | "relative";
	verticalAlign?: "top" | "middle" | "bottom"; // 🆕 수직 정렬 지원
}

interface GraphicPreviewRendererProps {
	elements: GraphicElement[];
	canvasWidth?: number;
	canvasHeight?: number;
	resolution?: "1080p" | "4k"; // 렌더링 해상도 (기본: 1080p)
	className?: string;
	style?: CSSProperties;
}

// CSS 문자열을 스타일 객체로 파싱
function parseCssToStyle(cssText?: string): CSSProperties {
	if (!cssText) return {};
	const style: Record<string, string> = {};
	const declarations = cssText.split(";").filter(Boolean);
	for (const decl of declarations) {
		const [prop, value] = decl.split(":").map((s) => s.trim());
		if (prop && value) {
			// kebab-case → camelCase
			const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			style[camelProp] = value;
		}
	}
	return style;
}

export function GraphicPreviewRenderer({
	elements,
	canvasWidth = 1920,
	canvasHeight = 1080,
	resolution = "1080p",
	className = "",
	style = {},
}: GraphicPreviewRendererProps) {
	// 🆕 고유 ID 생성 (동일 화면 다중 SVG 썸네일 그라데이션/효과 ID 충돌 완전 격리용)
	// Why: url(#id) 참조는 브라우저 DOM 전역에서 식별되므로, 리스트 뷰에서 동일/유사 요소 ID가 중복되면
	//      그라데이션이 깨져 검은색/어두운 단색으로 보입니다. useId 기반 접두사로 이를 원천 방지합니다.
	const uniqueId = useId().replace(/:/g, "");

	// 해상도에 따른 이미지 URL 선택 함수
	const getImageUrl = (element: GraphicElement): string => {
		if (resolution === "4k") {
			// 4K 렌더링: 4K URL 우선, 없으면 2K 또는 src
			return element.src_4k || element.src_2k || element.src || "";
		}
		// 2K (1080p) 렌더링: 2K URL 우선, 없으면 src
		return element.src_2k || element.src || "";
	};

	// 🆕 그라데이션 defs 렌더링 (Parity)
	// Why: 에디터 캔버스와 동일한 선형/원형 그라데이션 렌더링 parity를 확보하여
	//      갤러리 썸네일 및 큐시트 런다운 썸네일에서도 그라데이션이 온전히 적용되도록 가드합니다.
	const renderGradientDefs = () => {
		const gradientElements = elements.filter(
			(el) => el.fill?.type === "linear" || el.fill?.type === "radial",
		);

		return (
			<defs key="preview-gradients">
				{gradientElements.map((el) => {
					const stops = el.fill?.gradientStops || [
						{ offset: 0, color: "#3b82f6" },
						{ offset: 100, color: "#8b5cf6" },
					];
					const angle = el.fill?.gradientAngle || 0;
					const radians = (angle - 90) * (Math.PI / 180);
					const x1 = 50 + 50 * Math.cos(radians + Math.PI);
					const y1 = 50 + 50 * Math.sin(radians + Math.PI);
					const x2 = 50 + 50 * Math.cos(radians);
					const y2 = 50 + 50 * Math.sin(radians);

					if (el.fill?.type === "linear") {
						return (
							<linearGradient
								key={el.id}
								id={`gradient-${uniqueId}-${el.id}`}
								x1={`${x1}%`}
								y1={`${y1}%`}
								x2={`${x2}%`}
								y2={`${y2}%`}
							>
								{stops.map((stop, i) => (
									<stop
										key={i}
										offset={`${stop.offset}%`}
										stopColor={stop.color}
										stopOpacity={stop.opacity ?? 1}
									/>
								))}
							</linearGradient>
						);
					} else {
						return (
							<radialGradient
								key={el.id}
								id={`gradient-${uniqueId}-${el.id}`}
								cx="50%"
								cy="50%"
								r="50%"
							>
								{stops.map((stop, i) => (
									<stop
										key={i}
										offset={`${stop.offset}%`}
										stopColor={stop.color}
										stopOpacity={stop.opacity ?? 1}
									/>
								))}
							</radialGradient>
						);
					}
				})}
			</defs>
		);
	};

	const getFillStyle = (element: GraphicElement): string => {
		if (element.fill?.type === "linear" || element.fill?.type === "radial") {
			return `url(#gradient-${uniqueId}-${element.id})`;
		}
		return element.fill?.color || (element.type === "text" ? "#ffffff" : "#3b82f6");
	};

	// 가시적 요소만 필터링 후 zIndex 정렬
	const visibleElements = elements
		.filter((el) => el.visible !== false && !el.parentId) // 최상위만
		.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

	// 요소 렌더링 (재귀)
	const renderElement = (element: GraphicElement): ReactNode => {
		if (!element.visible) return null;

		const customStyles = parseCssToStyle(element.customCSS);
		const transformOrigin = `${element.x + element.width / 2}px ${element.y + element.height / 2}px`;

		// 🆕 Visual Effects (Shadow, Glow, Inner Shadow)
		const hasShadow = (element as any).shadowEnabled;
		const hasGlow = (element as any).glowEnabled;
		const hasInnerShadow =
			(element as any).innerShadowEnabled &&
			(element.type === "rect" || element.type === "ellipse");

		const hasEffects = hasShadow || hasGlow || hasInnerShadow;
		const effectsFilterUrl = hasEffects
			? `url(#effects-${uniqueId}-${element.id})`
			: undefined;

		const renderVisualEffectsDefs = () => {
			if (!hasEffects) return null;
			return (
				<defs>
					<filter
						id={`effects-${uniqueId}-${element.id}`}
						x="-50%"
						y="-50%"
						width="200%"
						height="200%"
					>
						{/* 1. Inner Shadow (내곽선 그림자) */}
						{hasInnerShadow && (
							<>
								<feOffset
									in="SourceAlpha"
									dx={(element as any).innerShadowOffsetX ?? 2}
									dy={(element as any).innerShadowOffsetY ?? 2}
									result="is-offset"
								/>
								<feGaussianBlur
									in="is-offset"
									stdDeviation={(element as any).innerShadowBlur ?? 4}
									result="is-blur"
								/>
								<feComposite
									operator="out"
									in="SourceAlpha"
									in2="is-blur"
									result="is-inverse"
								/>
								<feFlood
									floodColor={(element as any).innerShadowColor || "#000000"}
									floodOpacity={0.8}
									result="is-color"
								/>
								<feComposite
									operator="in"
									in="is-color"
									in2="is-inverse"
									result="is-shadow"
								/>
								<feComposite
									operator="over"
									in="is-shadow"
									in2="SourceGraphic"
									result="inner-out"
								/>
							</>
						)}

						{/* 2. Glow (외부 발광) */}
						{hasGlow && (
							<feDropShadow
								in={hasInnerShadow ? "inner-out" : "SourceGraphic"}
								dx="0"
								dy="0"
								stdDeviation={(element as any).glowBlur ?? 10}
								floodColor={(element as any).glowColor || "#00e5ff"}
								floodOpacity={0.8}
								result="glow-out"
							/>
						)}

						{/* 3. Drop Shadow (외부 그림자) */}
						{hasShadow && (
							<feDropShadow
								in={
									hasGlow
										? "glow-out"
										: hasInnerShadow
											? "inner-out"
											: "SourceGraphic"
								}
								dx={(element as any).shadowOffsetX ?? 2}
								dy={(element as any).shadowOffsetY ?? 2}
								stdDeviation={(element as any).shadowBlur ?? 4}
								floodColor={(element as any).shadowColor || "#000000"}
								floodOpacity={0.5}
							/>
						)}
					</filter>
				</defs>
			);
		};

		// 🆕 Blend Mode
		const blendMode =
			(element as any).blendMode && (element as any).blendMode !== "normal"
				? (element as any).blendMode
				: undefined;

		switch (element.type) {
			case "rect": {
				const fill = getFillStyle(element);
				const fillOpacity = element.fill?.opacity ?? 1;
				const strokeEnabled = element.stroke?.enabled;
				const strokeColor = element.stroke?.color || "#000";
				const radius = element.borderRadius || 0;

				// 🆕 Binding Container 슬롯 텍스트 렌더링
				const bc = element.bindingContainer;
				const bindingSlots = bc?.enabled ? bc.slots : [];
				const hasSlots = bindingSlots.length > 0;
				const slotLayouts = new Map<string, BindingTextLayoutResult>(
					bindingSlots.map((slot): [string, BindingTextLayoutResult] => [
						slot.id,
						resolveBindingTextLayout({
							content: slot.content,
							autoFit: bc?.autoFit,
							shape: {
								x: element.x,
								width: element.width,
								height: element.height,
							},
							slot,
							constraints: { canvasWidth },
						}),
					]),
				);
				const renderShapeWidth = hasSlots
					? Math.max(
							element.width,
							...Array.from(
								slotLayouts.values(),
								(layout) => layout.renderShapeWidth,
							),
						)
					: element.width;

				return (
					<g
						key={element.id}
						style={{
							transform: `rotate(${element.rotation}deg)`,
							transformOrigin,
							mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
							...customStyles,
						}}
					>
						{renderVisualEffectsDefs()}
						<rect
							x={element.x}
							y={element.y}
							width={renderShapeWidth}
							height={element.height}
							fill={fill}
							fillOpacity={element.opacity * fillOpacity}
							stroke={strokeEnabled ? strokeColor : "none"}
							strokeWidth={strokeEnabled ? (element.stroke?.width ?? 1) : 0}
							strokeDasharray={
								(element as any).stroke?.style === "dashed"
									? "8 4"
									: (element as any).stroke?.style === "dotted"
										? "2 2"
										: undefined
							}
							strokeOpacity={(element as any).stroke?.opacity ?? 1}
							rx={radius}
							filter={effectsFilterUrl}
						/>
						{/* Binding Container — Text Frame 기반 렌더링 */}
						{hasSlots &&
							bindingSlots.map((slot) => {
								const layout = slotLayouts.get(slot.id);
								if (!layout) return null;
								// Text Frame 절대 좌표 (Shape 원점 + 오프셋)
								const frameAbsX = element.x + slot.frameX;
								const frameAbsY = element.y + slot.frameY;
								const frameW = layout.renderFrameWidth;
								const frameH = layout.renderFrameHeight;

								// wrap 모드: foreignObject로 줄바꿈
								if (layout.mode === "wrap") {
									return (
										<foreignObject
											key={slot.id}
											x={frameAbsX}
											y={frameAbsY}
											width={frameW}
											height={frameH}
										>
											<div
												style={{
													width: "100%",
													height: "100%",
													fontSize: slot.fontSize,
													fontFamily: slot.fontFamily,
													fontWeight: slot.fontWeight,
													color: slot.color,
													textAlign: slot.textAlign,
													overflow: "hidden",
													wordWrap: "break-word",
													whiteSpace: "pre-wrap",
													lineHeight: 1.2,
													display: "flex",
													alignItems: "center",
													opacity: element.opacity,
												}}
											>
												{slot.content}
											</div>
										</foreignObject>
									);
								}

								// shrink / none 모드: SVG text
								const textAnchor =
									slot.textAlign === "center"
										? "middle"
										: slot.textAlign === "right"
											? "end"
											: "start";
								const textX =
									slot.textAlign === "center"
										? frameAbsX + frameW / 2
										: slot.textAlign === "right"
											? frameAbsX + frameW
											: frameAbsX;
								const compressedTextLength =
									layout.textScaleX < 1 && layout.textWidth > 0
										? Math.max(1, layout.textWidth * layout.textScaleX)
										: undefined;
								return (
									<text
										key={slot.id}
										x={textX}
										y={frameAbsY + frameH / 2}
										fill={slot.color}
										fontSize={slot.fontSize}
										fontFamily={slot.fontFamily}
										fontWeight={slot.fontWeight}
										textAnchor={textAnchor}
										dominantBaseline="central"
										opacity={element.opacity}
										textLength={compressedTextLength}
										lengthAdjust={
											compressedTextLength ? "spacingAndGlyphs" : undefined
										}
									>
										{slot.content}
									</text>
								);
							})}
					</g>
				);
			}

			case "ellipse": {
				const fill = getFillStyle(element);
				const fillOpacity = element.fill?.opacity ?? 1;
				const cx = element.x + element.width / 2;
				const cy = element.y + element.height / 2;

				const strokeEnabled = element.stroke?.enabled;
				const strokeColor = element.stroke?.color || "#000";

				return (
					<g key={element.id}>
						{renderVisualEffectsDefs()}
						<ellipse
							cx={cx}
							cy={cy}
							rx={element.width / 2}
							ry={element.height / 2}
							fill={fill}
							fillOpacity={element.opacity * fillOpacity}
							stroke={strokeEnabled ? strokeColor : "none"}
							strokeWidth={strokeEnabled ? (element.stroke?.width ?? 1) : 0}
							strokeDasharray={
								(element as any).stroke?.style === "dashed"
									? "8 4"
									: (element as any).stroke?.style === "dotted"
										? "2 2"
										: undefined
							}
							strokeOpacity={(element as any).stroke?.opacity ?? 1}
							style={{
								transform: `rotate(${element.rotation}deg)`,
								transformOrigin,
								mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
								...customStyles,
							}}
							filter={effectsFilterUrl}
						/>
					</g>
				);
			}

			case "text": {
				const fill = getFillStyle(element);
				const fontSize = element.fontSize || 24;
				const fontFamily = element.fontFamily || "Pretendard, sans-serif";
				const fontWeight = element.fontWeight || 400;
				const textAlign = element.textAlign || "left";
				const vAlign = element.verticalAlign || "top";
				const content = element.content || "";

				// 텍스트 정렬에 따른 x 좌표
				let textX = element.x;
				let textAnchor: "start" | "middle" | "end" = "start";
				if (textAlign === "center") {
					textX = element.x + element.width / 2;
					textAnchor = "middle";
				} else if (textAlign === "right") {
					textX = element.x + element.width;
					textAnchor = "end";
				}

				// 수직 정렬에 따른 y 좌표 및 dominantBaseline
				let textY = element.y + fontSize;
				let dominantBaseline: "auto" | "central" | "text-after-edge" = "auto";
				if (vAlign === "middle") {
					textY = element.y + element.height / 2;
					dominantBaseline = "central";
				} else if (vAlign === "bottom") {
					textY = element.y + element.height;
					dominantBaseline = "text-after-edge";
				}

				// 🆕 Auto-fit 오버플로우 가드
				// ─────────────────────────────────────────────────────
				// 1. Canvas measureText()로 텍스트의 렌더링 폭을 사전 측정
				//    (DOM 리플로우 없음 — Pretext와 동일한 원리)
				// 2. element.width(지정된 영역)을 초과하면
				//    SVG 네이티브 textLength 속성으로 수평 압축
				// 3. textLength + lengthAdjust="spacingAndGlyphs"는
				//    글자와 자간을 균일하게 압축하여 방송급 품질 유지
				//
				// Why textLength이 CSS scaleX보다 나은가?
				// → SVG 좌표계에서 textAnchor(정렬)와 정확히 호환됨.
				//   scaleX는 transform-origin 충돌 우려가 있음.
				const textWidth = measureTextWidth(
					content,
					fontSize,
					fontFamily,
					fontWeight,
				);
				const isOverflow = textWidth > element.width && textWidth > 0;

				return (
					<g key={element.id}>
						{renderVisualEffectsDefs()}
						<text
							x={textX}
							y={textY}
							fill={fill}
							fontSize={fontSize}
							fontFamily={fontFamily}
							fontWeight={fontWeight}
							textAnchor={textAnchor}
							dominantBaseline={dominantBaseline}
							opacity={element.opacity}
							// Auto-fit: 초과 시 SVG 네이티브 textLength로 압축
							textLength={isOverflow ? element.width : undefined}
							lengthAdjust={isOverflow ? "spacingAndGlyphs" : undefined}
							style={{
								transform: `rotate(${element.rotation}deg)`,
								transformOrigin,
								mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
								// 🆕 고정폭 숫자: 데이터 숫자 변경 시 텍스트 떨림 방지
								fontVariantNumeric: (element as any).tabularNums
									? "tabular-nums"
									: undefined,
								...customStyles,
							}}
							filter={effectsFilterUrl}
						>
							{content}
						</text>
					</g>
				);
			}

			case "image": {
				// 이미지 요소 (다중 해상도 지원)
				const imageUrl = getImageUrl(element);
				return (
					<g key={element.id}>
						{renderVisualEffectsDefs()}
						<image
							x={element.x}
							y={element.y}
							width={element.width}
							height={element.height}
							href={imageUrl}
							opacity={element.opacity}
							preserveAspectRatio={
								element.objectFit === "cover"
									? "xMidYMid slice"
									: element.objectFit === "fill"
										? "none"
										: "xMidYMid meet"
							}
							style={{
								transform: `rotate(${element.rotation}deg)`,
								transformOrigin,
								mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
							}}
							filter={effectsFilterUrl}
						/>
					</g>
				);
			}

			case "html_plugin": {
				// ■ Why foreignObject + iframe?
				//   SVG는 HTML/JS를 직접 실행할 수 없으므로,
				//   foreignObject로 HTML 영역을 확보한 뒤 iframe(srcdoc)으로 렌더링.
				//   프리뷰에서는 pointerEvents:none으로 인터랙션 차단.
				if (!element.pluginSourceCode) return null;
				// 공통 모듈로 srcdoc 생성 — autoShow=true (프리뷰에서는 외부 SHOW 없음)
				const pluginSrcdoc = buildPluginSrcdoc({
					html: element.pluginSourceCode.html,
					css: element.pluginSourceCode.css,
					js: element.pluginSourceCode.js,
					width: element.width,
					height: element.height,
					autoShow: true,
				});
				return (
					<foreignObject
						key={element.id}
						x={element.x}
						y={element.y}
						width={element.width}
						height={element.height}
						opacity={element.opacity}
						style={{
							transform: `rotate(${element.rotation}deg)`,
							transformOrigin,
						}}
					>
						<iframe
							srcDoc={pluginSrcdoc}
							sandbox="allow-scripts allow-same-origin"
							style={{
								width: "100%",
								height: "100%",
								border: "none",
								background: "transparent",
								pointerEvents: "none",
							}}
							title={element.name}
						/>
					</foreignObject>
				);
			}

			case "boolean_group": {
				const wrapperStyle: CSSProperties = {
					transform: `rotate(${element.rotation}deg)`,
					transformOrigin,
					mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
					...customStyles,
				};

				return renderSvgBooleanGroup({
					element,
					elements,
					groupProps: {
						opacity: element.opacity,
						style: wrapperStyle,
					},
					idPrefix: uniqueId,
				});
			}

			case "group": {
				return renderSvgCompositionGroup({
					element,
					elements,
					renderElement,
					groupProps: {
						opacity: element.opacity,
						style: {
							transform: `rotate(${element.rotation}deg)`,
							transformOrigin,
							mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
							...customStyles,
						},
					},
					idPrefix: uniqueId,
					leadingNode: renderVisualEffectsDefs(),
					maskFontFamily: "Pretendard, sans-serif",
				});
			}

			default:
				return null;
		}
	};

	return (
		<svg
			viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
			className={className}
			style={{
				width: "100%",
				height: "100%",
				backgroundColor: "transparent",
				aspectRatio: `${canvasWidth} / ${canvasHeight}`,
				// ■ geometricPrecision: 폰트 힌팅(픽셀 격자 스냅)을 비활성화하여
				//   확대/축소 시 자간·베이스라인의 수학적 정확도를 우선
				//   Why? 방송 그래픽은 항상 고해상도(1080p+)이므로 힌팅의 이점(저해상도 선명도)이 불필요하고,
				//   오히려 스케일링 시 sub-pixel 반올림 오차를 증폭시키는 원인이 됨
				textRendering: "geometricPrecision",
				shapeRendering: "geometricPrecision",
				...style,
			}}
			preserveAspectRatio="xMidYMid meet"
		>
			{/* 그라데이션 defs 정의 */}
			{renderGradientDefs()}

			{visibleElements.map(renderElement)}
		</svg>
	);
}

// 텍스트 요소만 추출하는 헬퍼
export function getTextElements(elements: GraphicElement[]): GraphicElement[] {
	return elements.filter((el) => el.type === "text" && el.visible !== false);
}

export interface EditableTextElement {
	id: string;
	name: string;
	content: string;
	kind: "text" | "binding-slot";
	parentElementId?: string;
	slotId?: string;
	autoFit?: BindingAutoFit;
	fitResult?: BindingTextLayoutResult;
	groupOverflow?: {
		groupName: string;
		overflowRight: number;
	};
}

// 런다운 속성 패널에서 편집 가능한 텍스트를 모두 추출한다.
export function getEditableTextElements(
	elements: GraphicElement[],
	canvasWidth = 1920,
): EditableTextElement[] {
	const result: EditableTextElement[] = [];
	const elementsById = new Map(
		elements.map((element) => [element.id, element]),
	);

	for (const element of elements) {
		if (element.visible === false) continue;

		if (element.type === "text") {
			result.push({
				id: element.id,
				name: element.name,
				content: element.content || "",
				kind: "text",
			});
			continue;
		}

		if (!element.bindingContainer?.enabled) continue;

		for (const slot of element.bindingContainer.slots) {
			const label = slot.label || slot.bindingKey || "텍스트 슬롯";
			const fitResult = resolveBindingTextLayout({
				content: slot.content,
				autoFit: element.bindingContainer.autoFit,
				shape: { x: element.x, width: element.width, height: element.height },
				slot,
				constraints: { canvasWidth },
			});
			const parentGroup = element.parentId
				? elementsById.get(element.parentId)
				: undefined;
			const childRight = element.x + fitResult.renderShapeWidth;
			const groupRight = parentGroup ? parentGroup.x + parentGroup.width : 0;
			const groupOverflow =
				parentGroup && childRight > groupRight
					? {
							groupName: parentGroup.name,
							overflowRight: Math.ceil(childRight - groupRight),
						}
					: undefined;

			result.push({
				id: `${element.id}:${slot.id}`,
				name: `${element.name} / ${label}`,
				content: slot.content || "",
				kind: "binding-slot",
				parentElementId: element.id,
				slotId: slot.id,
				autoFit: element.bindingContainer.autoFit,
				fitResult,
				groupOverflow,
			});
		}
	}

	return result;
}

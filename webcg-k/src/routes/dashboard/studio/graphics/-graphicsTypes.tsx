/**
 * 그래픽 페이지 공통 타입 및 GraphicPreview 컴포넌트
 *
 * graphics/index.tsx에서 추출. 타입과 미리보기 SVG 컴포넌트를 분리하여
 * index.tsx의 줄 수를 줄이고, GraphicPreview를 다른 곳에서 재사용 가능하게 함.
 */

import React from "react";
import { Palette } from "lucide-react";

// ─── 타입 정의 ──────────────────────────────────────────────────
export type ViewMode = "gallery" | "bundles" | "grid-templates";

export interface Graphic {
	id: string;
	name: string;
	description: string | null;
	template_data: Record<string, unknown>;
	thumbnail_path: string | null;
	is_public?: boolean;
	created_at: string;
	updated_at: string;
	owner_id: string;
}

export type ListItem = (Graphic | import("@/lib/gridTypes").GridTemplateRow) & { _type: ViewMode };

export interface BundleListItem {
	id: string;
	name: string;
	description: string | null;
	program_name: string | null;
	slot_count: number;
	is_default: boolean;
	created_at: string;
	updated_at: string;
	owner_id: string;
	_type: "bundles";
}


// ─── GraphicPreview (React.memo — graphic prop 변경 시에만 re-render) ──

export const GraphicPreview = React.memo(function GraphicPreview({ graphic }: { graphic: Graphic }) {
	const elements = (graphic.template_data?.elements || []) as any[];
	const canvasWidth = (graphic.template_data?.canvas as any)?.width || 1920;
	const canvasHeight = (graphic.template_data?.canvas as any)?.height || 1080;

	if (elements.length === 0) {
		return (
			<div className="preview-placeholder">
				<Palette size={64} />
				<span>요소 없음</span>
			</div>
		);
	}

	// 요소를 zIndex 순으로 정렬
	const sortedElements = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

	return (
		<div className="graphic-preview-container">
			<span className="preview-label">PREVIEW</span>
			<svg
				viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
				preserveAspectRatio="xMidYMid meet"
				style={{ width: "100%", height: "100%", background: "#1a1a1a" }}
			>
				{sortedElements.map((el: any) => {
					if (el.visible === false) return null;

					const commonStyle = {
						opacity: el.opacity ?? 1,
					};

					if (el.type === "rect") {
						const fillColor = el.fill?.type === "solid"
							? el.fill.color
							: el.fill?.type === "gradient"
								? "#666"
								: "#333";
						return (
							<rect
								key={el.id}
								x={el.x}
								y={el.y}
								width={el.width}
								height={el.height}
								fill={fillColor}
								stroke={el.stroke?.color}
								strokeWidth={el.stroke?.width}
								rx={el.borderRadius || 0}
								style={commonStyle}
							/>
						);
					}

					if (el.type === "text") {
						return (
							<text
								key={el.id}
								x={el.x + (el.width / 2)}
								y={el.y + (el.height / 2)}
								fill={el.fill?.color || "#ffffff"}
								fontSize={el.fontSize || 24}
								fontFamily={el.fontFamily || "sans-serif"}
								textAnchor="middle"
								dominantBaseline="middle"
								style={commonStyle}
							>
								{el.content || "텍스트"}
							</text>
						);
					}

					return null;
				})}
			</svg>
		</div>
	);
});

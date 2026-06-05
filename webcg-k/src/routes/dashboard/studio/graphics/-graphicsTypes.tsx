/**
 * 그래픽 페이지 공통 타입 및 GraphicPreview 컴포넌트
 *
 * graphics/index.tsx에서 추출. 타입과 미리보기 SVG 컴포넌트를 분리하여
 * index.tsx의 줄 수를 줄이고, GraphicPreview를 다른 곳에서 재사용 가능하게 함.
 */

import React, { useId } from "react";
import { Palette } from "lucide-react";
import { GraphicPreviewRenderer } from "@/components/GraphicPreviewRenderer"; // 🆕 중앙 집중형 공통 미리보기 렌더러 임포트

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

	return (
		<div className="graphic-preview-container">
			<span className="preview-label">PREVIEW</span>
			{/* 🆕 Why 복제된 낡은 코드 제거 및 Delegation 설계인가?
			  *   이전의 GraphicPreview는 자체적으로 불완전한 도형 렌더러 루프를 들고 있어 마스크와 Boolean(Subtract)
			  *   합성을 렌더링하지 못해 갤러리 썸네일 붕괴의 원인이 되었습니다. 이를 검증된 GraphicPreviewRenderer로
			  *   위임하여 Single Source of Truth(SSOT) 규칙을 확립하고 100% 미려한 비주얼 Parity를 쟁취합니다.
			  */}
			<GraphicPreviewRenderer
				elements={elements}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
				style={{ width: "100%", height: "100%", background: "#1a1a1a" }}
			/>
		</div>
	);
});

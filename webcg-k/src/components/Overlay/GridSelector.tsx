/**
 * GridSelector — Step 1: 그리드 템플릿 선택
 * DB에서 grid_templates를 로드하고 카드 형태로 표시
 */

import { useQuery } from "@tanstack/react-query";
import { Grid3x3 } from "lucide-react";
import { useMemo, useState } from "react";
import { NamingSearchBox } from "@/components/NamingSearchBox";
import type { GridTemplateRow } from "../../lib/gridTypes";
import { assetMatchesNamingQuery } from "../../lib/naming/namingSuggestion";
import { supabase } from "../../lib/supabase";

// 분할선으로부터 영역 계산 (GridSplitEditor의 로직 재사용)
interface SimpleZone {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface GridSelectorZoneInput {
	id?: string;
	bounds?: {
		x?: number;
		y?: number;
		width?: number;
		height?: number;
	};
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

interface GridSelectorProps {
	selectedGridId: string | null;
	onSelect: (template: GridTemplateRow) => void;
}

const GRID_SELECTOR_SKELETON_IDS = [
	"grid-selector-skeleton-1",
	"grid-selector-skeleton-2",
	"grid-selector-skeleton-3",
	"grid-selector-skeleton-4",
];

export function GridSelector({ selectedGridId, onSelect }: GridSelectorProps) {
	const [searchQuery, setSearchQuery] = useState("");
	// 그리드 템플릿 목록 조회
	const { data: templates = [], isLoading } = useQuery({
		queryKey: ["gridTemplates"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("grid_templates")
				.select("*")
				.order("created_at", { ascending: false });

			if (error) throw error;
			return data as unknown as GridTemplateRow[];
		},
	});
	const filteredTemplates = useMemo(
		() =>
			templates.filter((template) =>
				assetMatchesNamingQuery(template, searchQuery),
			),
		[templates, searchQuery],
	);
	const gridSearchNames = useMemo(
		() => templates.map((template) => template.name),
		[templates],
	);

	if (isLoading) {
		return (
			<div className="grid-selector-grid">
				{GRID_SELECTOR_SKELETON_IDS.map((id) => (
					<div
						key={id}
						className="grid-selector-card"
						style={{ opacity: 0.3, height: 200 }}
					/>
				))}
			</div>
		);
	}

	if (templates.length === 0) {
		return (
			<div className="wizard-empty">
				<div className="wizard-empty-icon">
					<Grid3x3 size={48} />
				</div>
				<div className="wizard-empty-text">
					그리드 템플릿이 없습니다. 먼저 그리드 템플릿을 만들어주세요.
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="grid-selector-toolbar">
				<NamingSearchBox
					ariaLabel="그리드 템플릿 선택 검색"
					assetKind="grid_template"
					existingNames={gridSearchNames}
					placeholder="그리드 검색 또는 좌상단-헤드라인..."
					value={searchQuery}
					onChange={setSearchQuery}
				/>
			</div>

			{filteredTemplates.length === 0 ? (
				<div className="wizard-empty">
					<div className="wizard-empty-icon">
						<Grid3x3 size={48} />
					</div>
					<div className="wizard-empty-text">
						검색 결과가 없습니다. 다른 네이밍 토큰으로 다시 검색해보세요.
					</div>
				</div>
			) : (
				<div className="grid-selector-grid">
					{filteredTemplates.map((template) => {
						// splits에서 간단 zone 생성 (template_data.splits 활용)
						const zones = getZonesFromTemplate(template);

						return (
							<button
								type="button"
								key={template.id}
								className={`grid-selector-card ${selectedGridId === template.id ? "selected" : ""}`}
								onClick={() => onSelect(template)}
							>
								{/* 16:9 미니 프리뷰 */}
								<div className="grid-selector-preview">
									{zones.map((z, idx) => (
										<div
											key={z.id}
											className="grid-selector-zone"
											style={{
												left: `${z.x}%`,
												top: `${z.y}%`,
												width: `${z.width}%`,
												height: `${z.height}%`,
											}}
										>
											{idx + 1}
										</div>
									))}
								</div>

								{/* 카드 정보 */}
								<div className="grid-selector-name">{template.name}</div>
								<div className="grid-selector-meta">
									{zones.length}개 영역
									{template.description && ` · ${template.description}`}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</>
	);
}

/**
 * 템플릿에서 Zone 목록을 추출하는 헬퍼
 * template_data.zones가 있으면 사용, 없으면 splits에서 계산
 */
function getZonesFromTemplate(template: GridTemplateRow): SimpleZone[] {
	const td = template.template_data;

	// zones 데이터가 이미 있는 경우 (bounds가 없는 항목은 건너뜀)
	if (td.zones && td.zones.length > 0) {
		const canvasWidth = td.canvas?.width || 1920;
		const canvasHeight = td.canvas?.height || 1080;
		const validZones = (td.zones as unknown as GridSelectorZoneInput[])
			.map((zone, index) =>
				toSimpleZone(zone, index, canvasWidth, canvasHeight),
			)
			.filter((zone): zone is SimpleZone => zone !== null);
		// bounds가 유효한 zone이 있으면 반환, 없으면 splits fallback
		if (validZones.length > 0) return validZones;
	}

	// splits가 있으면 간단 BSP 계산
	if (td.splits && td.splits.length > 0) {
		return calculateSimpleZones(td.splits);
	}

	// 기본: 전체 1개 Zone
	return [{ id: "zone-full", x: 0, y: 0, width: 100, height: 100 }];
}

function toSimpleZone(
	zone: GridSelectorZoneInput,
	index: number,
	canvasWidth: number,
	canvasHeight: number,
): SimpleZone | null {
	if (
		zone.bounds &&
		isFiniteNumber(zone.bounds.x) &&
		isFiniteNumber(zone.bounds.y) &&
		isFiniteNumber(zone.bounds.width) &&
		isFiniteNumber(zone.bounds.height)
	) {
		return {
			id: zone.id ?? `zone-${index}`,
			x: (zone.bounds.x / canvasWidth) * 100,
			y: (zone.bounds.y / canvasHeight) * 100,
			width: (zone.bounds.width / canvasWidth) * 100,
			height: (zone.bounds.height / canvasHeight) * 100,
		};
	}

	if (
		isFiniteNumber(zone.x) &&
		isFiniteNumber(zone.y) &&
		isFiniteNumber(zone.width) &&
		isFiniteNumber(zone.height)
	) {
		return {
			id: zone.id ?? `zone-${index}`,
			x: zone.x,
			y: zone.y,
			width: zone.width,
			height: zone.height,
		};
	}

	return null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * 분할선 기반 간단 Zone 계산 (BSP 간소화 버전)
 */
function calculateSimpleZones(
	splits: Array<{
		id: string;
		orientation: string;
		position: number;
		start: number;
		end: number;
	}>,
): SimpleZone[] {
	type BspZone = { x: number; y: number; w: number; h: number };
	let zones: BspZone[] = [{ x: 0, y: 0, w: 100, h: 100 }];

	// 각 분할선으로 Zone을 순차 분할
	for (const split of splits) {
		const newZones: BspZone[] = [];
		for (const zone of zones) {
			if (split.orientation === "vertical") {
				// 수직선이 이 Zone 범위 내에 있으면 분할
				if (split.position > zone.x && split.position < zone.x + zone.w) {
					const leftW = split.position - zone.x;
					const rightW = zone.w - leftW;
					newZones.push({ x: zone.x, y: zone.y, w: leftW, h: zone.h });
					newZones.push({ x: split.position, y: zone.y, w: rightW, h: zone.h });
				} else {
					newZones.push(zone);
				}
			} else {
				// 수평선
				if (split.position > zone.y && split.position < zone.y + zone.h) {
					const topH = split.position - zone.y;
					const bottomH = zone.h - topH;
					newZones.push({ x: zone.x, y: zone.y, w: zone.w, h: topH });
					newZones.push({
						x: zone.x,
						y: split.position,
						w: zone.w,
						h: bottomH,
					});
				} else {
					newZones.push(zone);
				}
			}
		}
		zones = newZones;
	}

	return zones.map((z, i) => ({
		id: `zone-${i}`,
		x: z.x,
		y: z.y,
		width: z.w,
		height: z.h,
	}));
}

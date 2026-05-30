/**
 * Properties Panel — 속성 편집 패널 (오케스트레이터)
 * Penpot 스타일 탭 구조
 *
 * 각 탭의 구체적인 UI는 tabs/ 하위 서브 컴포넌트에 위임:
 * - DesignTab: Transform / Fill / Stroke / Corner Radius
 * - TextTab: Content / Typography / Alignment / Decoration / Shadow
 * - AnimateTab: Enter / Exit / Loop 프리셋
 * - CssTab: Custom CSS textarea
 *
 * 이 파일은 탭 전환 UI + 그리드 템플릿 선택 + 공통 핸들러만 담당.
 *
 * Why 분할했는가?
 * → 원본 1,295줄 → 오케스트레이터 ~130줄 + 4개 탭 파일.
 *   각 탭을 독립적으로 수정할 수 있어 HMR 속도 향상 + 코드 리뷰 용이.
 */

import { useQuery } from "@tanstack/react-query";
import {
	Combine,
	Frame,
	Layers,
	Play,
	RefreshCw,
	Square,
	VenetianMask,
} from "lucide-react";
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import { AnimateTab } from "./tabs/AnimateTab";
import { BindingTab } from "./tabs/BindingTab";
import { CssTab } from "./tabs/CssTab";
// 탭 컴포넌트 import
import { DesignTab } from "./tabs/DesignTab";
import { TextTab } from "./tabs/TextTab";

interface PropertiesPanelProps {
	selectedElements: GraphicElement[];
	onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
	gridTemplateId: string | null;
	onGridTemplateChange: (id: string | null) => void;
	elements: GraphicElement[];
}

type TabType = "design" | "text" | "animate" | "css" | "bind" | "plugin";

export function PropertiesPanel({
	selectedElements,
	onUpdate,
	gridTemplateId,
	onGridTemplateChange,
	elements,
}: PropertiesPanelProps) {
	const [activeTab, setActiveTab] = useState<TabType>("design");

	// 그리드 템플릿 목록 로드
	const { data: gridTemplates = [] } = useQuery({
		queryKey: ["gridTemplates"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("grid_templates")
				.select("id, name")
				.order("name");
			if (error) throw error;
			return data as { id: string; name: string }[];
		},
	});

	// ─── 그리드 템플릿 선택 UI (공통) ────────────────────────────────
	const gridTemplateSelector = (
		<div className="grid-template-selector">
			<div className="ins-section-title">그리드 템플릿</div>
			<select
				className="ins-select"
				value={gridTemplateId || ""}
				onChange={(e) => onGridTemplateChange(e.target.value || null)}
			>
				<option value="">없음</option>
				{gridTemplates.map((t) => (
					<option key={t.id} value={t.id}>
						{t.name}
					</option>
				))}
			</select>
		</div>
	);

	const pluginTemplateId = selectedElements[0]?.pluginTemplateId;
	const sendPluginMessage = useCallback(
		(type: "SHOW" | "HIDE") => {
			if (!pluginTemplateId) return;
			const iframes = document.querySelectorAll<HTMLIFrameElement>(
				`iframe[data-plugin-id="${pluginTemplateId}"]`,
			);
			iframes.forEach((iframe) => {
				iframe.contentWindow?.postMessage({ type }, "*");
			});
		},
		[pluginTemplateId],
	);

	const [isSyncing, setIsSyncing] = useState(false);
	const handleSyncPlugin = useCallback(async () => {
		if (!pluginTemplateId) return;
		setIsSyncing(true);
		try {
			const { data, error } = await supabase
				.from("overlay_templates" as any)
				.select("name, source_code, zone_bounds")
				.eq("id", pluginTemplateId)
				.single();

			if (error) throw error;
			if (data) {
				const row = data as any;
				const zb = row.zone_bounds;
				selectedElements.forEach((el) => {
					const updates: any = {
						pluginTemplateName: row.name,
						pluginSourceCode: row.source_code,
					};
					if (zb && typeof zb === "object") {
						if (zb.x !== undefined) updates.x = zb.x;
						if (zb.y !== undefined) updates.y = zb.y;
						if (zb.width !== undefined) updates.width = zb.width;
						if (zb.height !== undefined) updates.height = zb.height;
					}
					onUpdate(el.id, updates);
				});
				alert("최신 오버레이 코드로 동기화되었습니다.");
			}
		} catch (e) {
			console.error("동기화 실패:", e);
			alert("동기화에 실패했습니다.");
		} finally {
			setIsSyncing(false);
		}
	}, [pluginTemplateId, selectedElements, onUpdate]);

	// 선택된 요소가 없을 때
	if (selectedElements.length === 0) {
		return (
			<div className="properties-panel">
				{gridTemplateSelector}
				<div className="properties-panel-empty">
					<span>요소를 선택하세요</span>
				</div>
			</div>
		);
	}

	const element = selectedElements[0];
	const isMultiple = selectedElements.length > 1;
	const isText = element.type === "text";
	const isShape = element.type === "rect" || element.type === "ellipse";
	const isPlugin = element.type === "html_plugin";
	const isGroupLike =
		element.type === "group" || element.type === "boolean_group";

	// ─── 공통 핸들러 (모든 탭에서 사용) ──────────────────────────────

	const handleChange = (
		field: keyof GraphicElement,
		value: string | number | boolean,
	) => {
		selectedElements.forEach((el) => {
			onUpdate(el.id, { [field]: value });
		});
	};

	const handleFillChange = (color: string) => {
		selectedElements.forEach((el) => {
			onUpdate(el.id, { fill: { type: "solid", color } });
		});
	};

	const handleStrokeChange = (field: string, value: string | number) => {
		selectedElements.forEach((el) => {
			onUpdate(el.id, {
				stroke: { ...el.stroke, [field]: value } as GraphicElement["stroke"],
			});
		});
	};

	// 탭 공통 props
	const tabCommonProps = {
		element,
		selectedElements,
		isMultiple,
		onUpdate,
		handleChange,
		handleFillChange,
		handleStrokeChange,
	};

	return (
		<div className="properties-panel">
			{gridTemplateSelector}

			{/* 탭 */}
			<div className="ins-tabs">
				<button
					type="button"
					className={`ins-tab ${activeTab === "design" ? "active" : ""}`}
					onClick={() => setActiveTab("design")}
				>
					Design
				</button>
				{isText && (
					<button
						type="button"
						className={`ins-tab ${activeTab === "text" ? "active" : ""}`}
						onClick={() => setActiveTab("text")}
					>
						Text
					</button>
				)}
				<button
					type="button"
					className={`ins-tab ${activeTab === "animate" ? "active" : ""}`}
					onClick={() => setActiveTab("animate")}
				>
					Animate
				</button>
				<button
					type="button"
					className={`ins-tab ${activeTab === "css" ? "active" : ""}`}
					onClick={() => setActiveTab("css")}
				>
					CSS
				</button>
				{isShape && (
					<button
						type="button"
						className={`ins-tab ${activeTab === "bind" ? "active" : ""}`}
						onClick={() => setActiveTab("bind")}
						style={{
							color: element.bindingContainer?.enabled ? "#60a5fa" : undefined,
						}}
					>
						Bind
					</button>
				)}
				{isPlugin && (
					<button
						type="button"
						className={`ins-tab ${activeTab === "plugin" ? "active" : ""}`}
						onClick={() => setActiveTab("plugin")}
						style={{ color: "#818cf8" }}
					>
						Plugin
					</button>
				)}
			</div>

			{/* 탭 내용 — 각 서브 컴포넌트에 위임 */}
			{activeTab === "design" && (
				<>
					<DesignTab {...tabCommonProps} />
					{isGroupLike && (
						<div className="ins-section">
							<div className="ins-section-title">
								<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
									<Frame size={14} /> Composition
								</div>
							</div>
							<label className="ins-row-toggle">
								<span className="ins-label">Clip</span>
								<input
									type="checkbox"
									checked={Boolean(element.clipContent)}
									onChange={(e) =>
										handleChange("clipContent", e.target.checked)
									}
								/>
							</label>
							{element.maskSourceId && (
								<div className="ins-row">
									<span className="ins-label">
										<VenetianMask size={12} /> Mask
									</span>
									<input
										className="ins-input"
										value={
											elements.find((el) => el.id === element.maskSourceId)
												?.name || element.maskSourceId
										}
										readOnly
										title="마스크 소스 레이어"
									/>
								</div>
							)}
							{element.type === "boolean_group" && (
								<div className="ins-row">
									<span className="ins-label">
										<Combine size={12} /> Boolean
									</span>
									<select
										className="ins-select"
										value={element.booleanOperation ?? "union"}
										onChange={(e) =>
											handleChange("booleanOperation", e.target.value)
										}
									>
										<option value="union">Union</option>
										<option value="subtract">Subtract</option>
										<option value="intersect">Intersect</option>
										<option value="exclude">Exclude</option>
									</select>
								</div>
							)}
						</div>
					)}
				</>
			)}
			{activeTab === "text" && isText && <TextTab {...tabCommonProps} />}
			{activeTab === "animate" && (
				<AnimateTab element={element} onUpdate={onUpdate} />
			)}
			{activeTab === "css" && (
				<CssTab element={element} handleChange={handleChange} />
			)}
			{activeTab === "bind" && isShape && (
				<BindingTab element={element} onUpdate={onUpdate} />
			)}

			{/* html_plugin 전용 탭 */}
			{activeTab === "plugin" && isPlugin && (
				<div className="ins-section">
					{/* 연결된 오버레이 정보 */}
					<div style={{ marginBottom: 12 }}>
						<div className="ins-section-title">
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<Layers size={14} /> 연결된 오버레이
							</div>
							<button
								type="button"
								onClick={handleSyncPlugin}
								disabled={isSyncing}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									background: "transparent",
									border: "none",
									color: "#818cf8",
									fontSize: 11,
									cursor: isSyncing ? "not-allowed" : "pointer",
									opacity: isSyncing ? 0.5 : 1,
								}}
								title="최신 버전으로 동기화"
							>
								<RefreshCw
									size={12}
									className={isSyncing ? "animate-spin" : ""}
								/>
								동기화
							</button>
						</div>
						<div
							style={{
								padding: "8px 10px",
								background: "rgba(99,102,241,0.1)",
								borderRadius: 6,
								fontSize: 13,
								color: "#c4b5fd",
								border: "1px solid rgba(99,102,241,0.2)",
							}}
						>
							{element.pluginTemplateName || "미연결"}
						</div>
					</div>

					{/* SHOW / HIDE 테스트 버튼 */}
					<div className="ins-section-title">애니메이션 테스트</div>
					<div style={{ display: "flex", gap: 8, marginTop: 6 }}>
						<button
							type="button"
							onClick={() => sendPluginMessage("SHOW")}
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 6,
								padding: "8px 12px",
								background: "rgba(34,197,94,0.15)",
								border: "1px solid rgba(34,197,94,0.3)",
								borderRadius: 6,
								color: "#4ade80",
								cursor: "pointer",
								fontSize: 12,
								fontWeight: 600,
							}}
						>
							<Play size={14} /> SHOW
						</button>
						<button
							type="button"
							onClick={() => sendPluginMessage("HIDE")}
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 6,
								padding: "8px 12px",
								background: "rgba(239,68,68,0.15)",
								border: "1px solid rgba(239,68,68,0.3)",
								borderRadius: 6,
								color: "#f87171",
								cursor: "pointer",
								fontSize: 12,
								fontWeight: 600,
							}}
						>
							<Square size={14} /> HIDE
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

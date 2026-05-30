/**
 * Overlay Management Page — 오버레이 관리
 * datasource 스타일의 glassmorphism 카드 + 썸네일 프리뷰 + 그래픽 편집기
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
	CheckSquare,
	Clock,
	Edit2,
	Folder,
	FolderPlus,
	Globe,
	Layers,
	Loader2,
	MoveRight,
	Plus,
	Save,
	Settings,
	Sparkles,
	Square,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NamingSearchBox } from "@/components/NamingSearchBox";
import { VisibilityToggle } from "../../../../components/Common/VisibilityToggle";
import type { GraphicElement } from "../../../../components/GraphicPreviewRenderer";
import { GraphicPreviewRenderer } from "../../../../components/GraphicPreviewRenderer";
import { OverlayEditor } from "../../../../components/Overlay/OverlayEditor";
import { useAuth } from "../../../../lib/auth";
import { assetMatchesNamingQuery } from "../../../../lib/naming/namingSuggestion";
import { formatDateWithTime } from "../../../../lib/utils/dateFormat";
import { buildPluginSrcdoc } from "../../../../lib/webcgkSrcdoc";
import {
	deleteOverlayTemplate,
	fetchOverlayTemplates,
	saveOverlayMeta,
	updateOverlayGraphics,
} from "../../../../services/dashboardService";
import { updateOverlayTemplateVisibility } from "../../../../services/overlayApiService";
import {
	createOverlayFolder,
	deleteOverlayFolder,
	fetchOverlayFolders,
	filterOverlayTemplatesByFolder,
	moveOverlayTemplatesToFolder,
	type OverlayFolderRecord,
	type OverlayFolderSelection,
} from "../../../../services/overlayFolderService";

import "./index.css";

export const Route = createLazyFileRoute("/dashboard/studio/overlays/")({
	component: OverlayPage,
});

// ─── 타입 ────────────────────────────────────────────────────────

// 오버레이 타입
interface OverlayTemplate {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	layer: number;
	graphic_data: GraphicElement[];
	data_source: any;
	refresh_interval: number | null;
	animation_config: any;
	is_public: boolean;
	visibility?: "private" | "workspace" | "public";
	source_type?: string;
	plugin_type?: string; // "html" | undefined
	source_code?: { html: string; css: string; js: string }; // HTML 플러그인 코드
	replicant_defaults?: Record<string, unknown>; // 썸네일에 디폴트 텍스트 주입용
	zone_bounds?: { x: number; y: number; width: number; height: number };
	category?: string; // "cg_panel" | "widget" | "ai_cuesheet_draft"
	folder_id?: string | null;
	ai_metadata?: {
		folder?: string;
		gallery_policy?: string;
		lifecycle?: string;
		program_title?: string;
		scene_order?: number;
		graphic_type?: string;
	} | null;
	created_at: string;
	updated_at: string;
}

const ANIMATION_TYPES = ["fade", "slide", "scale", "none"] as const;

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

function OverlayPage() {
	const { user, activeWorkspaceId } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [selectedFolderId, setSelectedFolderId] =
		useState<OverlayFolderSelection>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(
		new Set(),
	);
	const [showFolderModal, setShowFolderModal] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [isCreatingFolder, setIsCreatingFolder] = useState(false);
	const [moveTargetFolderId, setMoveTargetFolderId] =
		useState<string>("unfiled");
	const [isMovingSelection, setIsMovingSelection] = useState(false);

	const { data: allTemplates = [], isLoading: loading } = useQuery({
		queryKey: ["overlay_templates"],
		queryFn: () => fetchOverlayTemplates<OverlayTemplate>(),
		enabled: !!user,
	});

	const { data: folders = [], isLoading: foldersLoading } = useQuery({
		queryKey: ["overlay_folders"],
		queryFn: fetchOverlayFolders,
		enabled: !!user,
	});

	const templates = useMemo(
		() => filterOverlayTemplatesByFolder(allTemplates, selectedFolderId),
		[allTemplates, selectedFolderId],
	);
	const visibleTemplates = useMemo(
		() =>
			templates.filter((template) =>
				assetMatchesNamingQuery(template, searchQuery),
			),
		[templates, searchQuery],
	);
	const overlaySearchNames = useMemo(
		() => templates.map((template) => template.name),
		[templates],
	);
	const folderCounts = useMemo(() => {
		const counts: Record<string, number> = {
			all: allTemplates.length,
			unfiled: allTemplates.filter((template) => !template.folder_id).length,
		};
		for (const folder of folders) {
			counts[folder.id] = allTemplates.filter(
				(template) => template.folder_id === folder.id,
			).length;
		}
		return counts;
	}, [allTemplates, folders]);
	const selectedIds = useMemo(
		() => Array.from(selectedTemplateIds),
		[selectedTemplateIds],
	);
	const selectedCount = selectedTemplateIds.size;

	// 메타 편집 모달 상태
	const [editingTemplate, setEditingTemplate] =
		useState<OverlayTemplate | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [saving, setSaving] = useState(false);

	// 폼 데이터
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		layer: 2,
		is_public: false,
		animation_in_type: "fade",
		animation_in_duration: 500,
		animation_out_type: "fade",
		animation_out_duration: 300,
	});

	// 삭제 확인
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	// 그래픽 편집기
	const [editorTarget, setEditorTarget] = useState<OverlayTemplate | null>(
		null,
	);

	// 썸네일 호버 상태 (루프 애니메이션 트리거용)
	const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

	// ─── 새 오버레이 생성 → 코드 에디터로 이동 ─────────────────
	// ■ Why 모달 제거?
	//   기존 모달은 메타데이터(이름, 레이어)만 입력 → 실제 코드 편집은 별도 페이지.
	//   한 번에 코드 에디터로 이동하면 작업 흐름이 단축됨.
	const handleCreateNew = () => {
		navigate({
			to: "/dashboard/studio/overlays/editor/$pluginId" as any,
			params: { pluginId: "new" } as any,
		});
	};

	const handleEditMeta = (template: OverlayTemplate) => {
		setEditingTemplate(template);
		setFormData({
			name: template.name,
			description: template.description || "",
			layer: template.layer,
			is_public: template.is_public,
			animation_in_type: template.animation_config?.in?.type || "fade",
			animation_in_duration: template.animation_config?.in?.duration || 500,
			animation_out_type: template.animation_config?.out?.type || "fade",
			animation_out_duration: template.animation_config?.out?.duration || 300,
		});
		setShowCreateModal(true);
	};

	// 메타 저장
	const handleSaveTemplate = async () => {
		if (!user || !formData.name.trim()) return;
		setSaving(true);
		try {
			const record = {
				name: formData.name.trim(),
				description: formData.description.trim() || null,
				layer: formData.layer,
				is_public: formData.is_public,
				animation_config: {
					in: {
						type: formData.animation_in_type,
						duration: formData.animation_in_duration,
					},
					out: {
						type: formData.animation_out_type,
						duration: formData.animation_out_duration,
					},
				},
			};

			if (editingTemplate) {
				await saveOverlayMeta(record, editingTemplate.id);
			} else {
				await saveOverlayMeta({
					...record,
					owner_id: user.id,
					graphic_data: [],
					data_source: null,
				});
			}
			setShowCreateModal(false);
			queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
		} catch (err) {
			console.error("Save overlay error:", err);
			alert("저장 실패");
		} finally {
			setSaving(false);
		}
	};

	// 삭제
	const handleDeleteTemplate = async (id: string) => {
		try {
			await deleteOverlayTemplate(id);
			setDeleteConfirm(null);
			setSelectedTemplateIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
		} catch (err) {
			console.error("Delete overlay error:", err);
			alert("삭제 실패");
		}
	};

	const toggleTemplateSelection = useCallback((id: string) => {
		setSelectedTemplateIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedTemplateIds(new Set());
	}, []);

	const handleCreateFolder = async () => {
		if (!user) return;
		setIsCreatingFolder(true);
		try {
			const folder = await createOverlayFolder({
				name: newFolderName,
				ownerId: user.id,
				workspaceId: activeWorkspaceId,
			});
			setNewFolderName("");
			setShowFolderModal(false);
			setSelectedFolderId(folder.id);
			setMoveTargetFolderId(folder.id);
			queryClient.invalidateQueries({ queryKey: ["overlay_folders"] });
		} catch (err) {
			console.error("Create overlay folder error:", err);
			alert(err instanceof Error ? err.message : "폴더 생성 실패");
		} finally {
			setIsCreatingFolder(false);
		}
	};

	const handleDeleteFolder = async () => {
		if (selectedFolderId === "all" || selectedFolderId === "unfiled") return;
		const targetFolder = folders.find((f) => f.id === selectedFolderId);
		if (!targetFolder) return;

		// 1. 시스템 중요 폴더 삭제 원천 방어 (시니어 예외 대비)
		if (targetFolder.is_system) {
			alert("시스템 폴더는 삭제할 수 없습니다.");
			return;
		}

		// 2. 비파괴 자산 보존 명시 안내를 포함한 2차 컨펌
		const message = `"${targetFolder.name}" 폴더를 삭제하시겠습니까?\n\n※ 폴더 내의 모든 오버레이는 지워지지 않고 자동으로 '미분류' 보존 구역으로 안전하게 이동됩니다.`;
		if (!window.confirm(message)) return;

		try {
			await deleteOverlayFolder(selectedFolderId);
			// 삭제 완료 후 전체 목록으로 안전하게 상태 리셋
			setSelectedFolderId("all");
			queryClient.invalidateQueries({ queryKey: ["overlay_folders"] });
			queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
		} catch (err) {
			console.error("Delete folder error:", err);
			alert("폴더 삭제에 실패했습니다.");
		}
	};

	const handleMoveSelection = async () => {
		if (selectedIds.length === 0) return;
		setIsMovingSelection(true);
		try {
			await moveOverlayTemplatesToFolder(
				selectedIds,
				moveTargetFolderId === "unfiled" ? null : moveTargetFolderId,
			);
			clearSelection();
			queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
		} catch (err) {
			console.error("Move overlay folder error:", err);
			alert("폴더 이동 실패");
		} finally {
			setIsMovingSelection(false);
		}
	};

	// 그래픽 편집기 저장
	const handleEditorSave = useCallback(
		async (elements: GraphicElement[]) => {
			if (!editorTarget) return;
			await updateOverlayGraphics(editorTarget.id, elements);
			queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
		},
		[editorTarget, queryClient],
	);

	// 유틸
	const isOwner = (ownerId: string) => user?.id === ownerId;

	// formatDate → lib/utils/dateFormat.ts에서 import

	// ─── 로딩 ────────────────────────────────────────────────────

	if (loading) {
		return (
			<div
				style={{ display: "flex", justifyContent: "center", padding: "3rem" }}
			>
				<Loader2
					size={24}
					className="animate-spin"
					style={{ color: "#818cf8" }}
				/>
			</div>
		);
	}

	// ─── 렌더링 ──────────────────────────────────────────────────

	return (
		<>
			{/* 페이지 헤더 */}
			<div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<Layers size={18} />
						</div>
						오버레이 (HTML)
					</div>
					<div className="dash-page-subtitle">
						날씨 위젯, 뉴스 티커 등 코드로 작성된 웹 기반 오버레이를 관리합니다.
					</div>
				</div>
				<div className="dash-page-actions">
					<button className="dash-btn accent" onClick={handleCreateNew}>
						<Sparkles size={16} /> AI 플러그인 생성(Code)
					</button>
				</div>
			</div>

			<div className="overlay-folder-toolbar">
				<div className="overlay-folder-tabs" aria-label="오버레이 폴더">
					<button
						className={`overlay-folder-tab ${selectedFolderId === "all" ? "active" : ""}`}
						onClick={() => setSelectedFolderId("all")}
					>
						<Layers size={14} />
						<span>전체</span>
						<span>{folderCounts.all}</span>
					</button>
					<button
						className={`overlay-folder-tab ${selectedFolderId === "unfiled" ? "active" : ""}`}
						onClick={() => setSelectedFolderId("unfiled")}
					>
						<Folder size={14} />
						<span>미분류</span>
						<span>{folderCounts.unfiled}</span>
					</button>
					{folders.map((folder: OverlayFolderRecord) => (
						<button
							key={folder.id}
							className={`overlay-folder-tab ${selectedFolderId === folder.id ? "active" : ""}`}
							onClick={() => setSelectedFolderId(folder.id)}
						>
							<Folder size={14} />
							<span>{folder.name}</span>
							<span>{folderCounts[folder.id] ?? 0}</span>
						</button>
					))}
					{foldersLoading && (
						<span className="overlay-folder-loading">
							<Loader2 size={14} className="animate-spin" />
						</span>
					)}
					<button
						className="overlay-folder-tab add-folder-tab-btn"
						onClick={() => setShowFolderModal(true)}
						title="새 폴더 생성"
					>
						<Plus size={13} />
						<span>새 폴더</span>
					</button>
				</div>

				{selectedCount > 0 ? (
					<div className="overlay-selection-inline-tools">
						<div className="overlay-selection-count">
							{selectedCount}개 선택됨
						</div>
						<select
							value={moveTargetFolderId}
							onChange={(event) => setMoveTargetFolderId(event.target.value)}
							className="overlay-selection-select"
						>
							<option value="unfiled">미분류로 이동</option>
							{folders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{folder.name}
								</option>
							))}
						</select>
						<button
							className="overlay-selection-btn-new-folder"
							onClick={() => setShowFolderModal(true)}
							title="새 폴더 생성"
							type="button"
						>
							<FolderPlus size={13} />
						</button>
						<button
							className="dash-btn accent"
							onClick={handleMoveSelection}
							disabled={isMovingSelection}
						>
							{isMovingSelection ? (
								<Loader2 size={14} className="animate-spin" />
							) : (
								<MoveRight size={14} />
							)}
							이동
						</button>
						<button className="dash-btn" onClick={clearSelection}>
							선택 해제
						</button>
					</div>
				) : (
					<div
						className="overlay-folder-inline-actions"
						style={{ display: "flex", gap: "6px" }}
					>
						{selectedFolderId !== "all" &&
							selectedFolderId !== "unfiled" &&
							!folders.find((f) => f.id === selectedFolderId)?.is_system && (
								<button
									className="overlay-btn-delete-folder"
									onClick={handleDeleteFolder}
									title="현재 폴더 삭제"
								>
									<Trash2 size={13} />
									<span>폴더 삭제</span>
								</button>
							)}
					</div>
				)}
			</div>

			<div className="overlay-search-toolbar">
				<NamingSearchBox
					ariaLabel="오버레이 이름 검색"
					assetKind="overlay"
					existingNames={overlaySearchNames}
					placeholder="오버레이 검색 또는 좌상단-헤드라인-두글자..."
					value={searchQuery}
					onChange={setSearchQuery}
				/>
			</div>
			{/* 카드 그리드 또는 빈 상태 */}
			{visibleTemplates.length === 0 ? (
				<div className="overlay-empty-state">
					<div className="overlay-empty-icon">
						<Layers size={48} />
					</div>
					<div className="overlay-empty-title">
						{searchQuery.trim()
							? "검색 결과가 없습니다"
							: "오버레이가 없습니다"}
					</div>
					<div className="overlay-empty-desc">
						{searchQuery.trim()
							? "다른 네이밍 토큰이나 기존 이름 일부로 다시 검색해보세요"
							: "날씨 위젯, 뉴스 티커, 시계 등 자동 렌더링되는 방송 오버레이를 만들어보세요"}
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							className="btn-overlay-create primary"
							onClick={handleCreateNew}
						>
							<Sparkles size={16} /> AI 플러그인 생성(Code)
						</button>
					</div>
				</div>
			) : (
				<div className="overlay-cards-grid">
					{visibleTemplates.map((template) => {
						const elements: GraphicElement[] = template.graphic_data ?? [];
						const hasGraphics = elements.length > 0;
						const animIn = template.animation_config?.in;
						const animOut = template.animation_config?.out;
						const isSelected = selectedTemplateIds.has(template.id);

						return (
							<div
								key={template.id}
								className={`overlay-card ${isSelected ? "selected" : ""}`}
								onClick={() => {
									if (selectedCount > 0) {
										toggleTemplateSelection(template.id);
										return;
									}
									if (hasGraphics) setEditorTarget(template);
								}}
								onMouseEnter={() => setHoveredCardId(template.id)}
								onMouseLeave={() => setHoveredCardId(null)}
							>
								{/* 썸네일 프리뷰 */}
								<div className="overlay-card-thumb">
									{template.plugin_type === "html" && template.source_code ? (
										// HTML 플러그인: iframe 스케일 다운 미니 프리뷰
										<HtmlPluginThumbnail
											sourceCode={template.source_code}
											replicantDefaults={template.replicant_defaults}
											isHovered={hoveredCardId === template.id}
										/>
									) : hasGraphics ? (
										<GraphicPreviewRenderer
											elements={elements}
											canvasWidth={template.zone_bounds?.width ?? 1920}
											canvasHeight={template.zone_bounds?.height ?? 1080}
										/>
									) : (
										<div className="overlay-card-thumb-empty">
											<Layers size={24} />
											<span>프리뷰 없음</span>
										</div>
									)}

									{/* 뱃지 */}
									<button
										type="button"
										className={`overlay-card-select ${isSelected ? "active" : ""}`}
										onClick={(e) => {
											e.stopPropagation();
											toggleTemplateSelection(template.id);
										}}
										title={isSelected ? "선택 해제" : "선택"}
									>
										{isSelected ? (
											<CheckSquare size={16} />
										) : (
											<Square size={16} />
										)}
									</button>
									<span className="overlay-card-layer-badge">
										Layer {template.layer}
									</span>
									{template.plugin_type === "html" && (
										<span className="overlay-card-html-badge">
											{"</>"} HTML
										</span>
									)}
									{template.source_type === "ai" && (
										<span className="overlay-card-ai-badge">✨ AI</span>
									)}
									{template.category === "ai_cuesheet_draft" && (
										<span className="overlay-card-ai-badge">AI 큐시트</span>
									)}
								</div>
								{/* 카드 바디 */}
								<div className="overlay-card-body">
									<div className="overlay-card-name">
										{template.name}
										{template.is_public && (
											<Globe size={12} style={{ color: "#fbbf24" }} />
										)}
									</div>
									{template.description && (
										<div className="overlay-card-desc">
											{template.description}
										</div>
									)}
									<div className="overlay-card-tags">
										{animIn && (
											<span className="overlay-card-tag anim-in">
												IN: {animIn.type} {animIn.duration}ms
											</span>
										)}
										{animOut && (
											<span className="overlay-card-tag anim-out">
												OUT: {animOut.type} {animOut.duration}ms
											</span>
										)}
										{template.data_source && (
											<span className="overlay-card-tag data-src">
												API 연동
											</span>
										)}
										{template.ai_metadata?.graphic_type && (
											<span className="overlay-card-tag">
												{template.ai_metadata.graphic_type}
											</span>
										)}
										{template.ai_metadata?.program_title && (
											<span className="overlay-card-tag">
												{template.ai_metadata.program_title}
											</span>
										)}
										{template.is_public && (
											<span className="overlay-card-tag public-tag">공개</span>
										)}
									</div>
								</div>
								{/* 카드 하단 */}
								<div className="overlay-card-footer">
									<div className="overlay-card-date">
										<Clock size={10} />
										{formatDateWithTime(template.created_at)}
									</div>
									<div
										className="overlay-card-actions"
										style={{ display: "flex", alignItems: "center", gap: 6 }}
									>
										<VisibilityToggle
											visibility={template.visibility || "workspace"}
											onToggle={async (nextVis) => {
												try {
													await updateOverlayTemplateVisibility(
														template.id,
														nextVis as any,
													);
													queryClient.invalidateQueries({
														queryKey: ["overlay_templates"],
													});
												} catch (err) {
													console.error("공유 설정 변경 실패:", err);
													alert("공유 설정 변경에 실패했습니다.");
												}
											}}
											size={14}
											className={
												!isOwner(template.owner_id)
													? "pointer-events-none opacity-60"
													: ""
											}
										/>
										{isOwner(template.owner_id) && (
											<>
												<button
													className="btn-overlay-action"
													onClick={(e) => {
														e.stopPropagation();
														navigate({
															to: "/dashboard/studio/overlays/editor/$pluginId" as any,
															params: { pluginId: template.id } as any,
														});
													}}
													title="코드 에디터"
												>
													<Edit2 size={12} />
												</button>
												<button
													className="btn-overlay-action"
													onClick={(e) => {
														e.stopPropagation();
														handleEditMeta(template);
													}}
													title="설정 및 메타 편집"
												>
													<Settings size={12} />
												</button>
												{hasGraphics && (
													<button
														className="btn-overlay-action"
														onClick={(e) => {
															e.stopPropagation();
															setEditorTarget(template);
														}}
														title="그래픽 편집"
													>
														<Save size={12} />
													</button>
												)}
												<button
													className="btn-overlay-action delete"
													onClick={(e) => {
														e.stopPropagation();
														setDeleteConfirm(template.id);
													}}
													title="삭제"
												>
													<Trash2 size={12} />
												</button>
											</>
										)}
									</div>
								</div>
								{/* 삭제 확인 오버레이 */}
								{deleteConfirm === template.id && (
									<div className="overlay-card-delete-confirm">
										<p>"{template.name}" 삭제?</p>
										<div className="confirm-btns">
											<button
												className="btn-delete-cancel"
												onClick={(e) => {
													e.stopPropagation();
													setDeleteConfirm(null);
												}}
											>
												취소
											</button>
											<button
												className="btn-delete-confirm"
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteTemplate(template.id);
												}}
											>
												삭제
											</button>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
			{showFolderModal && (
				<div
					className="overlay-editor-backdrop"
					onClick={() => setShowFolderModal(false)}
				>
					<div
						className="overlay-folder-modal"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="overlay-editor-header">
							<h3>
								<FolderPlus size={16} />새 폴더
							</h3>
							<button
								className="overlay-editor-close"
								onClick={() => setShowFolderModal(false)}
							>
								<X size={16} />
							</button>
						</div>
						<div className="overlay-folder-modal-body">
							<div className="csm-field">
								<label>폴더 이름</label>
								<input
									value={newFolderName}
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && newFolderName.trim()) {
											void handleCreateFolder();
										}
									}}
									placeholder="예: 선거 방송 패키지"
									autoFocus
								/>
							</div>
						</div>
						<div className="overlay-editor-footer">
							<button
								className="btn-modal-cancel"
								onClick={() => setShowFolderModal(false)}
								disabled={isCreatingFolder}
							>
								취소
							</button>
							<button
								className="btn-modal-save"
								onClick={handleCreateFolder}
								disabled={isCreatingFolder || !newFolderName.trim()}
							>
								{isCreatingFolder ? (
									<>
										<Loader2
											size={14}
											className="wizard-loading-spinner"
											style={{ width: 14, height: 14 }}
										/>{" "}
										생성 중...
									</>
								) : (
									<>
										<FolderPlus size={14} /> 생성
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
			{/* 메타 편집 모달 */}
			{showCreateModal && (
				<div
					className="overlay-editor-backdrop"
					onClick={() => setShowCreateModal(false)}
				>
					<div
						className="overlay-meta-modal"
						onClick={(e) => e.stopPropagation()}
					>
						{/* 헤더 */}
						<div className="overlay-editor-header">
							<h3>
								<Layers size={16} />
								{editingTemplate ? "오버레이 편집" : "새 오버레이"}
							</h3>
							<button
								className="overlay-editor-close"
								onClick={() => setShowCreateModal(false)}
							>
								<X size={16} />
							</button>
						</div>

						{/* 편집 시 썸네일 프리뷰 */}
						{editingTemplate &&
							(editingTemplate.graphic_data?.length ?? 0) > 0 && (
								<div
									style={{
										padding: "16px 24px 0",
										display: "flex",
										justifyContent: "center",
									}}
								>
									<div
										style={{
											width: "100%",
											maxWidth: 400,
											aspectRatio: "16/9",
											borderRadius: 8,
											overflow: "hidden",
											border: "1px solid rgba(255,255,255,0.06)",
										}}
									>
										<GraphicPreviewRenderer
											elements={editingTemplate.graphic_data}
											canvasWidth={editingTemplate.zone_bounds?.width ?? 1920}
											canvasHeight={editingTemplate.zone_bounds?.height ?? 1080}
										/>
									</div>
								</div>
							)}

						{/* 본문 */}
						<div
							style={{
								padding: "16px 24px",
								display: "flex",
								flexDirection: "column",
								gap: 12,
								overflowY: "auto",
								flex: 1,
							}}
						>
							<div className="csm-field">
								<label>이름 *</label>
								<NamingSearchBox
									ariaLabel="오버레이 이름"
									assetKind="overlay"
									className="name-builder"
									existingNames={overlaySearchNames}
									placeholder="예: 우상단-출처-세글자-겹침"
									value={formData.name}
									onChange={(value) =>
										setFormData((p) => ({ ...p, name: value }))
									}
									currentName={editingTemplate?.name ?? ""}
									clearLabel="오버레이 이름 지우기"
									showLeadingIcon={false}
									suggestionTitle="오버레이 이름 만들기"
									suggestionHint="추천 토큰을 선택해 운영자가 찾기 쉬운 오버레이 이름을 만듭니다."
								/>
							</div>
							<div className="csm-field">
								<label>설명</label>
								<input
									value={formData.description}
									onChange={(e) =>
										setFormData((p) => ({ ...p, description: e.target.value }))
									}
									placeholder="오버레이 설명"
								/>
							</div>
							<div className="csm-row">
								<div className="csm-field" style={{ flex: 1 }}>
									<label>레이어</label>
									<input
										type="number"
										value={formData.layer}
										onChange={(e) =>
											setFormData((p) => ({
												...p,
												layer: parseInt(e.target.value, 10) || 1,
											}))
										}
										min={1}
										max={10}
									/>
								</div>
								<div
									className="csm-field"
									style={{
										flex: 1,
										display: "flex",
										alignItems: "end",
										gap: 6,
									}}
								>
									<input
										type="checkbox"
										id="is_public"
										checked={formData.is_public}
										onChange={(e) =>
											setFormData((p) => ({
												...p,
												is_public: e.target.checked,
											}))
										}
										style={{ width: "auto" }}
									/>
									<label
										htmlFor="is_public"
										style={{ marginBottom: 0, cursor: "pointer" }}
									>
										공개
									</label>
								</div>
							</div>

							{/* 애니메이션 */}
							<div className="csm-section" style={{ marginBottom: 0 }}>
								<div className="csm-section-title" style={{ marginTop: 4 }}>
									애니메이션
								</div>
								<div className="csm-row">
									<div className="csm-field" style={{ flex: 1 }}>
										<label>IN 타입</label>
										<select
											value={formData.animation_in_type}
											onChange={(e) =>
												setFormData((p) => ({
													...p,
													animation_in_type: e.target.value,
												}))
											}
										>
											{ANIMATION_TYPES.map((t) => (
												<option key={t} value={t}>
													{t}
												</option>
											))}
										</select>
									</div>
									<div className="csm-field" style={{ flex: 1 }}>
										<label>IN 시간(ms)</label>
										<input
											type="number"
											value={formData.animation_in_duration}
											onChange={(e) =>
												setFormData((p) => ({
													...p,
													animation_in_duration:
														parseInt(e.target.value, 10) || 500,
												}))
											}
										/>
									</div>
								</div>
								<div className="csm-row">
									<div className="csm-field" style={{ flex: 1 }}>
										<label>OUT 타입</label>
										<select
											value={formData.animation_out_type}
											onChange={(e) =>
												setFormData((p) => ({
													...p,
													animation_out_type: e.target.value,
												}))
											}
										>
											{ANIMATION_TYPES.map((t) => (
												<option key={t} value={t}>
													{t}
												</option>
											))}
										</select>
									</div>
									<div className="csm-field" style={{ flex: 1 }}>
										<label>OUT 시간(ms)</label>
										<input
											type="number"
											value={formData.animation_out_duration}
											onChange={(e) =>
												setFormData((p) => ({
													...p,
													animation_out_duration:
														parseInt(e.target.value, 10) || 300,
												}))
											}
										/>
									</div>
								</div>
							</div>
						</div>

						{/* 푸터 */}
						<div className="overlay-editor-footer">
							<button
								className="btn-modal-cancel"
								onClick={() => setShowCreateModal(false)}
								disabled={saving}
							>
								취소
							</button>
							<button
								className="btn-modal-save"
								onClick={handleSaveTemplate}
								disabled={saving || !formData.name.trim()}
							>
								{saving ? (
									<>
										<Loader2
											size={14}
											className="wizard-loading-spinner"
											style={{ width: 14, height: 14 }}
										/>{" "}
										저장 중...
									</>
								) : editingTemplate ? (
									"저장"
								) : (
									<>
										<Plus size={14} /> 생성
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
			{/* 그래픽 편집기 */}
			{editorTarget && (
				<OverlayEditor
					name={editorTarget.name}
					elements={editorTarget.graphic_data ?? []}
					canvasWidth={editorTarget.zone_bounds?.width ?? 1920}
					canvasHeight={editorTarget.zone_bounds?.height ?? 1080}
					onSave={handleEditorSave}
					onClose={() => {
						setEditorTarget(null);
						queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
					}}
				/>
			)}
		</>
	);
}

// ─── HtmlPluginThumbnail ───────────────────────────────────────────
// HTML 플러그인 갤러리 썸네일
// ■ Why iframe + transform scale?
//   플러그인은 순수 HTML/CSS/JS이므로 iframe srcdoc으로 렌더링.
//   썸네일 영역(약 280x158)에 맞게 1920x1080을 CSS scale로 축소.
//   렌더링 비용이 낮고 실제 플러그인과 동일한 시각 결과를 보여줌.
function HtmlPluginThumbnail({
	sourceCode,
	replicantDefaults,
	isHovered = false,
}: {
	sourceCode: { html: string; css: string; js: string };
	replicantDefaults?: Record<string, unknown>;
	isHovered?: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [scale, setScale] = useState(0.146); // 280/1920 ≈ 0.146 기본값

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setScale(Math.min(width / 1920, height / 1080));
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// 호버 애니메이션 루프 제어 및 초기 데이터 주입
	useEffect(() => {
		const iframeWin = iframeRef.current?.contentWindow;
		if (!iframeWin) return;

		// 1. 디폴트 데이터가 있으면 먼저 주입
		if (replicantDefaults) {
			iframeWin.postMessage({ type: "INIT", payload: replicantDefaults }, "*");
		}

		// 2. 마우스가 안 올라가있거나 초기 렌더링 시에는 강제로 SHOW 호출하여 보여주기
		iframeWin.postMessage({ type: "SHOW" }, "*");

		if (isHovered) {
			let isShowing = true;
			// 2초마다 SHOW / HIDE 토글
			const interval = setInterval(() => {
				isShowing = !isShowing;
				iframeWin.postMessage({ type: isShowing ? "SHOW" : "HIDE" }, "*");
			}, 2000);
			return () => {
				clearInterval(interval);
				// 호버 아웃 시 다시 SHOW 호출하여 썸네일에 내용이 남도록 보장
				iframeWin.postMessage({ type: "SHOW" }, "*");
			};
		}
	}, [isHovered, replicantDefaults]);

	const srcdoc = buildPluginSrcdoc({
		html: sourceCode.html,
		css: sourceCode.css,
		js: sourceCode.js,
		previewBackground: "checkerboard",
	});

	return (
		<div
			ref={containerRef}
			style={{
				width: "100%",
				height: "100%",
				backgroundColor: "#808080",
				backgroundImage:
					"linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%)",
				backgroundSize: "12px 12px",
				backgroundPosition: "0 0,0 6px,6px -6px,-6px 0px",
				position: "relative",
				overflow: "hidden",
			}}
		>
			<iframe
				ref={iframeRef}
				sandbox="allow-scripts"
				srcDoc={srcdoc}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "1920px",
					height: "1080px",
					border: "none",
					background: "transparent",
					transformOrigin: "top left",
					transform: `scale(${scale})`,
					pointerEvents: "none", // 썸네일은 인터랙션 불필요
				}}
				title="Plugin Thumbnail"
			/>
		</div>
	);
}

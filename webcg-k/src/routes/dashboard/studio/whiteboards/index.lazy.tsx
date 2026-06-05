import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, Loader2, PenTool, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../../lib/auth";
import { fetchWhiteboards, createWhiteboardWithWorkspace, deleteWhiteboard } from "../../../../services/whiteboardService";
import { formatDateWithTime } from "../../../../lib/utils/dateFormat";
import { ANNOTATION_VIEWPORT, coerceAnnotationDocument, getStrokeSvgPath } from "../../../../lib/annotation/annotationDocument";
import type { AnnotationStroke } from "../../../../lib/annotation/annotationDocument";

import "../overlays/index.css"; // Reuse overlay styles for grid

export const Route = createLazyFileRoute("/dashboard/studio/whiteboards/")({
	component: WhiteboardsPage,
});

function WhiteboardThumbnail({ documentState }: { documentState: unknown }) {
	const paths = useMemo(() => {
		const doc = coerceAnnotationDocument(documentState);
		if (doc.strokes.length === 0) return null;
		return doc.strokes.map((stroke: AnnotationStroke) => ({
			id: stroke.id,
			path: getStrokeSvgPath(stroke),
			color: stroke.color,
			opacity: stroke.opacity,
			tool: stroke.tool,
			width: stroke.width,
		}));
	}, [documentState]);

	if (!paths) {
		return <PenTool size={32} style={{ opacity: 0.2 }} />;
	}

	return (
		<svg
			viewBox={`0 0 ${ANNOTATION_VIEWPORT.width} ${ANNOTATION_VIEWPORT.height}`}
			width="100%"
			height="100%"
			preserveAspectRatio="xMidYMid meet"
			style={{ display: "block", background: "transparent" }}
		>
			{paths.map((s) => (
				<path
					key={s.id}
					d={s.path}
					fill={s.tool === "eraser" ? "none" : s.color}
					opacity={s.tool === "highlighter" ? 0.35 : s.opacity}
					stroke={s.tool === "eraser" ? "rgba(255,255,255,0.65)" : "none"}
					strokeDasharray={s.tool === "eraser" ? "12 10" : undefined}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={s.width}
					style={{
						mixBlendMode: s.tool === "highlighter" ? "screen" : "normal",
					}}
				/>
			))}
		</svg>
	);
}

function WhiteboardsPage() {
	const { t } = useTranslation("whiteboards");
	const { user, activeWorkspaceId } = useAuth();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: whiteboards = [], isLoading: loading } = useQuery({
		queryKey: ["whiteboards", activeWorkspaceId],
		queryFn: () => fetchWhiteboards(activeWorkspaceId!),
		enabled: !!user && !!activeWorkspaceId,
	});

	const [showCreateModal, setShowCreateModal] = useState(false);
	const [saving, setSaving] = useState(false);
	const [name, setName] = useState("");
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	const handleCreateNew = async () => {
		console.log("handleCreateNew called", { name, activeWorkspaceId });
		if (!name.trim()) {
			alert(t("alertEnterName"));
			return;
		}
		if (!activeWorkspaceId) {
			alert(t("alertNoWorkspace"));
			return;
		}
		setSaving(true);
		try {
			const newBoard = await createWhiteboardWithWorkspace(name.trim(), activeWorkspaceId);
			console.log("Whiteboard created successfully", newBoard);
			setShowCreateModal(false);
			setName("");
			queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
            // 이동
			navigate({ to: "/dashboard/studio/whiteboards/$whiteboardId" as any, params: { whiteboardId: newBoard.id } as any });
		} catch (err) {
			console.error("Create whiteboard error:", err);
			alert(t("alertCreateFailed") + ": " + (err instanceof Error ? err.message : String(err)));
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteWhiteboard(id);
			setDeleteConfirm(null);
			queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
		} catch (err) {
			console.error("Delete whiteboard error:", err);
			alert(t("alertDeleteFailed"));
		}
	};

	if (loading) {
		return (
			<div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
				<Loader2 size={24} className="animate-spin" style={{ color: "#818cf8" }} />
			</div>
		);
	}

	return (
		<>
			<div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<PenTool size={18} />
						</div>
						{t("title")}
					</div>
					<div className="dash-page-subtitle">
						{t("subtitle")}
					</div>
				</div>
				<div className="dash-page-actions">
					<button className="dash-btn accent" onClick={() => setShowCreateModal(true)}>
						<Plus size={16} /> {t("newBoard")}
					</button>
				</div>
			</div>

			{whiteboards.length === 0 ? (
				<div className="overlay-empty-state">
					<div className="overlay-empty-icon">
						<PenTool size={48} />
					</div>
					<div className="overlay-empty-title">{t("noBoard")}</div>
					<div className="overlay-empty-desc">{t("noBoardDesc")}</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button className="btn-overlay-create primary" onClick={() => setShowCreateModal(true)}>
							<Plus size={16} /> {t("createBoard")}
						</button>
					</div>
				</div>
			) : (
				<div className="overlay-cards-grid">
					{whiteboards.map((board) => (
						<div
							key={board.id}
							className="overlay-card"
							onClick={() => navigate({ to: "/dashboard/studio/whiteboards/$whiteboardId" as any, params: { whiteboardId: board.id } as any })}
						>
							<div className="overlay-card-thumb" style={{ background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                                {board.thumbnail_url ? (
                                    <img src={board.thumbnail_url} alt="thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                    <WhiteboardThumbnail documentState={board.document_state} />
                                )}
								<span className="overlay-card-html-badge">{t("broadcastBoard")}</span>
							</div>
							<div className="overlay-card-body">
								<div className="overlay-card-name">{board.name}</div>
							</div>
							<div className="overlay-card-footer">
								<div className="overlay-card-date">
									<Clock size={10} />
									{formatDateWithTime(board.created_at)}
								</div>
								<div className="overlay-card-actions">
									<button
										className="btn-overlay-action delete"
										onClick={(e) => {
											e.stopPropagation();
											setDeleteConfirm(board.id);
										}}
										title={t("delete")}
									>
										<Trash2 size={12} />
									</button>
								</div>
							</div>
							{deleteConfirm === board.id && (
								<div className="overlay-card-delete-confirm">
									<p>{t("deleteConfirm", { name: board.name })}</p>
									<div className="confirm-btns">
										<button
											className="btn-delete-cancel"
											onClick={(e) => {
												e.stopPropagation();
												setDeleteConfirm(null);
											}}
										>
											{t("cancel")}
										</button>
										<button
											className="btn-delete-confirm"
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(board.id);
											}}
										>
											{t("delete")}
										</button>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{showCreateModal && (
				<div className="overlay-editor-backdrop" onClick={() => setShowCreateModal(false)}>
					<div className="overlay-meta-modal" onClick={(e) => e.stopPropagation()}>
						<div className="overlay-editor-header">
							<h3>
								<PenTool size={16} />
								{t("newBoard")}
							</h3>
							<button className="overlay-editor-close" onClick={() => setShowCreateModal(false)}>
								<X size={16} />
							</button>
						</div>
						<div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
							<div className="csm-field">
								<label>{t("nameLabel")}</label>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t("namePlaceholder")}
									autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && name.trim()) handleCreateNew();
                                    }}
								/>
							</div>
						</div>
						<div className="overlay-editor-footer">
							<button className="btn-modal-cancel" onClick={() => setShowCreateModal(false)} disabled={saving}>
								{t("cancel")}
							</button>
							<button className="btn-modal-save" onClick={handleCreateNew} disabled={saving || !name.trim()}>
								{saving ? (
									<><Loader2 size={14} className="wizard-loading-spinner" style={{ width: 14, height: 14 }} /> {t("creating")}</>
								) : (
									<><Plus size={14} /> {t("create")}</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

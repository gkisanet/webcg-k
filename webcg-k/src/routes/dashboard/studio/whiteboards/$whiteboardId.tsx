import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, PenTool } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnnotationCanvas } from "../../../../components/Annotation/AnnotationCanvas";
import { VisibilityToggle } from "../../../../components/Common/VisibilityToggle";
import { useAnnotationDocument } from "../../../../hooks/useAnnotationDocument";
import { useAuth } from "../../../../lib/auth";
import { supabase } from "../../../../lib/supabase";
import { updateWhiteboardVisibility } from "../../../../services/whiteboardService";

export const Route = createFileRoute("/dashboard/studio/whiteboards/$whiteboardId")({
	validateSearch: (search: Record<string, unknown>) => ({
		sessionId: typeof search.sessionId === "string" ? search.sessionId : null,
	}),
	component: WhiteboardEditorPage,
});

function WhiteboardEditorPage() {
	const { t } = useTranslation("whiteboards");
	const { whiteboardId } = Route.useParams();
	const { sessionId } = Route.useSearch();
	const router = useRouter();
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const {
		document,
		status,
		error,
		appendLocalStroke,
		beginLocalStroke,
		publishStrokePoints,
		finishLocalStroke,
		cancelLocalStroke,
		publishCursor,
		remoteDraftStrokes,
		undoLastStroke,
		clearDocument,
	} = useAnnotationDocument(whiteboardId);
	const renderBackgroundUrl = sessionId
		? `/render?sessionId=${encodeURIComponent(sessionId)}&resolution=1080p&hideAnnotation=1&passive=1`
		: null;

	const { data: board, isLoading } = useQuery({
		queryKey: ["whiteboard", whiteboardId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("whiteboards")
				.select("id, name, visibility, owner_id")
				.eq("id", whiteboardId)
				.single();
			if (error) throw error;
			return data;
		},
		enabled: !!whiteboardId,
	});

	const handleVisibilityToggle = async (nextVis: string) => {
		try {
			await updateWhiteboardVisibility(whiteboardId, nextVis as "private" | "workspace" | "public");
			queryClient.invalidateQueries({ queryKey: ["whiteboard", whiteboardId] });
			queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
		} catch (e) {
			console.error("Failed to update visibility", e);
		}
	};

	if (!user) return null;

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 50,
				display: "flex",
				flexDirection: "column",
				backgroundColor: "var(--app-bg-primary, #111827)",
			}}
		>
			<header
				style={{
					height: 56,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 16px",
					borderBottom: "1px solid rgba(255,255,255,0.1)",
					backgroundColor: "var(--app-bg-secondary, #18181b)",
					flexShrink: 0,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<button
						type="button"
						onClick={() => router.history.back()}
						style={{
							width: 36,
							height: 36,
							display: "grid",
							placeItems: "center",
							background: "rgba(255,255,255,0.04)",
							border: "1px solid rgba(255,255,255,0.1)",
							borderRadius: 8,
							color: "#fff",
							cursor: "pointer",
						}}
						title={t("backToList")}
					>
						<ArrowLeft size={18} />
					</button>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<PenTool size={18} style={{ color: "var(--accent-primary, #60a5fa)" }} />
						<div>
							<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
								<h1 style={{ fontSize: 16, fontWeight: 650, color: "#fff", margin: 0 }}>
									{isLoading ? t("loading") : board?.name || t("newBoard")}
								</h1>
								{board && (
									<VisibilityToggle 
										visibility={board.visibility}
										onToggle={handleVisibilityToggle}
										size={16}
									/>
								)}
							</div>
							<div style={{ fontSize: 12, color: "var(--text-tertiary, #a1a1aa)" }}>
								{t("newBoardDesc")}
							</div>
						</div>
					</div>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						color: "var(--text-secondary, #d4d4d8)",
						fontSize: 12,
					}}
				>
					<span>{t("strokeCount", { count: document.strokes.length })}</span>
					{status === "loading" && <Loader2 size={14} className="animate-spin" />}
				</div>
			</header>

			<div style={{ flex: 1, minHeight: 0 }}>
				<AnnotationCanvas
					document={document}
					status={status}
					error={error}
					onAppendStroke={appendLocalStroke}
					onBeginStroke={beginLocalStroke}
					onStreamStrokePoints={publishStrokePoints}
					onFinishStroke={finishLocalStroke}
					onCancelStroke={cancelLocalStroke}
					onPublishCursor={publishCursor}
					onUndo={undoLastStroke}
					onClear={clearDocument}
					remoteDraftStrokes={remoteDraftStrokes}
					backgroundRenderUrl={renderBackgroundUrl}
				/>
			</div>
		</div>
	);
}

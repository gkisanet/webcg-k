/**
 * WhiteboardPanel — 컨트롤러 판서 레이어 송출 패널
 *
 * 대시보드에서 생성한 판서 레이어를 카드 목록으로 표시하고,
 * PGM 송출 ON/OFF 제어를 수행한다.
 * 실제 드로잉/편집은 /dashboard/studio/whiteboards/$id 에서 수행.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
	ExternalLink,
	Eye,
	Loader2,
	Monitor,
	PenTool,
	RefreshCw,
	StopCircle,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "../../lib/auth";
import {
	fetchWhiteboards,
	updateWhiteboardVisibility,
	type WhiteboardMeta,
} from "../../services/whiteboardService";
import {
	type GraphicBlock,
	pushToHistory,
	timelineStore,
} from "../../stores/timelineStore";
import { VisibilityToggle } from "../Common/VisibilityToggle";

const WB_TRACK_ID = 99; // dedicated top-most whiteboard bus
const WB_PREVIEW_PREFIX = "wb-pvw-";
const WB_PROGRAM_PREFIX = "wb-pgm-";

export type WhiteboardPlayoutState = "off" | "preview" | "program";

function makeWhiteboardBlock(
	board: WhiteboardMeta,
	mode: Exclude<WhiteboardPlayoutState, "off">,
	position: number,
): GraphicBlock {
	const isProgram = mode === "program";
	return {
		id: `${isProgram ? WB_PROGRAM_PREFIX : WB_PREVIEW_PREFIX}${board.id}`,
		name: board.name,
		trackId: WB_TRACK_ID,
		startPosition: position,
		width: 200,
		color: isProgram ? "rgba(239, 68, 68, 0.65)" : "rgba(245, 158, 11, 0.65)",
		transitionIn: "fade",
		transitionOut: "fade",
		sourceType: "whiteboard",
		sourceId: board.id,
		sourceData: { whiteboardId: board.id },
	};
}

interface WhiteboardPanelProps {
	sessionId?: string | null;
	isPlayoutActive?: boolean;
	onPlayoutStateChange?: (
		nextState: WhiteboardPlayoutState,
	) => void | Promise<void>;
}

export function WhiteboardPanel({
	sessionId,
	isPlayoutActive = false,
	onPlayoutStateChange,
}: WhiteboardPanelProps) {
	const { activeWorkspaceId } = useAuth();
	const queryClient = useQueryClient();
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const pgmBlockIds = useStore(timelineStore, (state) => state.pgmBlockIds);

	const { data: whiteboards = [], isLoading } = useQuery({
		queryKey: ["whiteboards", activeWorkspaceId],
		queryFn: () => fetchWhiteboards(activeWorkspaceId!),
		enabled: !!activeWorkspaceId,
	});

	const previewWhiteboardIds = useMemo(() => {
		const ids = new Set<string>();
		for (const block of blocks) {
			if (block.id.startsWith(WB_PREVIEW_PREFIX)) {
				ids.add(block.id.slice(WB_PREVIEW_PREFIX.length));
			}
		}
		return ids;
	}, [blocks]);

	const programWhiteboardIds = useMemo(() => {
		const ids = new Set<string>();
		for (const blockId of pgmBlockIds.values()) {
			if (blockId.startsWith(WB_PROGRAM_PREFIX)) {
				ids.add(blockId.slice(WB_PROGRAM_PREFIX.length));
			}
		}
		return ids;
	}, [pgmBlockIds]);

	const getPlayoutState = (boardId: string): WhiteboardPlayoutState => {
		if (programWhiteboardIds.has(boardId)) return "program";
		if (previewWhiteboardIds.has(boardId)) return "preview";
		return "off";
	};

	const toggleVisibility = async (boardId: string, nextVis: string) => {
		try {
			await updateWhiteboardVisibility(
				boardId,
				nextVis as "private" | "workspace" | "public",
			);
			queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
		} catch (e) {
			console.error("Failed to update visibility", e);
		}
	};

	const setWhiteboardPlayoutState = (
		board: WhiteboardMeta,
		nextState: WhiteboardPlayoutState,
	) => {
		// [의도 기반 방어 로직] 판서 송출 상태 변경 전에 히스토리에 현재 상태 기록 (Undo 가능하도록 백업)
		pushToHistory();

		timelineStore.setState((state) => {
			const idsForBoard = new Set([
				`${WB_PREVIEW_PREFIX}${board.id}`,
				`${WB_PROGRAM_PREFIX}${board.id}`,
			]);
			const nextBlocks = state.blocks.filter((block) => {
				if (idsForBoard.has(block.id)) return false;
				if (nextState === "preview" && block.id.startsWith(WB_PREVIEW_PREFIX))
					return false;
				if (nextState === "program" && block.id.startsWith(WB_PROGRAM_PREFIX))
					return false;
				return true;
			});
			const newPgmIds = new Map(state.pgmBlockIds);

			for (const [trackId, blockId] of newPgmIds) {
				if (
					idsForBoard.has(blockId) ||
					(nextState === "program" && blockId.startsWith(WB_PROGRAM_PREFIX))
				) {
					newPgmIds.delete(trackId);
				}
			}

			if (nextState === "preview") {
				nextBlocks.push(
					makeWhiteboardBlock(board, "preview", state.playheadPosition),
				);
			}

			if (nextState === "program") {
				const programBlock = makeWhiteboardBlock(
					board,
					"program",
					state.playheadPosition,
				);
				nextBlocks.push(programBlock);
				newPgmIds.set(WB_TRACK_ID, programBlock.id);
			}

			return { ...state, blocks: nextBlocks, pgmBlockIds: newPgmIds };
		});

		void onPlayoutStateChange?.(nextState);
	};

	if (isLoading) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					padding: "2rem",
				}}
			>
				<Loader2
					size={20}
					className="animate-spin"
					style={{ color: "var(--accent-primary)" }}
				/>
			</div>
		);
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				overflow: "hidden",
			}}
		>
			{/* 헤더 */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "0.75rem 1rem",
					borderBottom: "1px solid var(--border-default)",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
						fontSize: "0.875rem",
						fontWeight: 600,
						color: "var(--text-primary)",
					}}
				>
					<PenTool size={16} />
					판서 레이어 ({whiteboards.length})
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
					<span
						style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}
					>
						PVW 확인 후 PGM 송출
					</span>
					<button
						type="button"
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ["whiteboards"] })
						}
						style={{
							background: "none",
							border: "1px solid var(--border-default)",
							cursor: "pointer",
							padding: "4px",
							color: "var(--text-tertiary)",
							borderRadius: "4px",
						}}
						title="새로고침"
					>
						<RefreshCw size={14} />
					</button>
				</div>
			</div>

			{/* 카드 목록 */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "0.5rem",
				}}
			>
				{whiteboards.length === 0 ? (
					<div
						style={{
							textAlign: "center",
							padding: "2rem",
							color: "var(--text-tertiary)",
							fontSize: "0.8125rem",
						}}
					>
						<PenTool
							size={24}
							style={{ marginBottom: "0.5rem", opacity: 0.5 }}
						/>
						<p>사용 가능한 판서 레이어가 없습니다</p>
						<p style={{ fontSize: "0.75rem" }}>
							대시보드 → 판서 레이어에서 먼저 생성하세요
						</p>
					</div>
				) : (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
							gap: "0.5rem",
						}}
					>
						{whiteboards.map((board) => {
							const playoutState = getPlayoutState(board.id);
							const isPreview = playoutState === "preview";
							const isOnAir = playoutState === "program";
							return (
								<div
									key={board.id}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "0.5rem",
										padding: "0.75rem",
										borderRadius: "8px",
										border: isOnAir
											? "1px solid var(--accent-primary)"
											: isPreview
												? "1px solid #f59e0b"
												: "1px solid var(--border-default)",
										backgroundColor: isOnAir
											? "var(--accent-muted)"
											: isPreview
												? "rgba(245, 158, 11, 0.08)"
												: "var(--app-bg-alt)",
									}}
								>
									{/* 상단: 이름 + 상태 + 가시성 */}
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
										}}
									>
										<PenTool
											size={14}
											style={{
												color: isOnAir
													? "var(--accent-primary)"
													: "var(--text-tertiary)",
											}}
										/>
										<span
											style={{
												flex: 1,
												fontSize: "0.8125rem",
												fontWeight: 600,
												color: "var(--text-primary)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{board.name}
										</span>
										{isOnAir && (
											<span
												style={{
													fontSize: "0.625rem",
													color: "var(--accent-primary)",
													display: "flex",
													alignItems: "center",
													gap: "2px",
												}}
											>
												<Monitor size={10} />
												ON AIR
											</span>
										)}
										{isPreview && (
											<span
												style={{
													fontSize: "0.625rem",
													color: "#f59e0b",
													display: "flex",
													alignItems: "center",
													gap: "2px",
												}}
											>
												<Eye size={10} />
												PVW
											</span>
										)}
										<VisibilityToggle
											visibility={board.visibility || "workspace"}
											onToggle={(nextVis) =>
												toggleVisibility(board.id, nextVis)
											}
											size={14}
										/>
									</div>

									<div
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr 1fr auto",
											gap: "0.375rem",
										}}
									>
										<button
											type="button"
											onClick={() =>
												setWhiteboardPlayoutState(
													board,
													isPreview ? "off" : "preview",
												)
											}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												gap: "0.25rem",
												padding: "0.5rem",
												borderRadius: "6px",
												border: "none",
												cursor: "pointer",
												fontSize: "0.75rem",
												fontWeight: 700,
												backgroundColor: isPreview
													? "#f59e0b"
													: "var(--app-bg-muted)",
												color: isPreview ? "#000" : "var(--text-tertiary)",
											}}
											title="PVW 모니터에만 표시"
										>
											<Eye size={14} />
											PVW
										</button>
										<button
											type="button"
											onClick={() =>
												setWhiteboardPlayoutState(
													board,
													isOnAir ? "off" : "program",
												)
											}
											disabled={!isPlayoutActive}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												gap: "0.25rem",
												padding: "0.5rem",
												borderRadius: "6px",
												border: "none",
												cursor: !isPlayoutActive ? "not-allowed" : "pointer",
												fontSize: "0.75rem",
												fontWeight: 700,
												backgroundColor: isOnAir
													? "#ef4444"
													: "var(--accent-primary)",
												color: isOnAir ? "#fff" : "#fff",
												opacity: !isPlayoutActive ? 0.45 : 1,
											}}
											title={
												!isPlayoutActive
													? "리허설 중이거나 실제 송출 중일 때만 PGM 반영이 가능합니다"
													: "PGM과 renderer에 송출"
											}
										>
											<Monitor size={14} />
											PGM
										</button>
										<button
											type="button"
											onClick={() => setWhiteboardPlayoutState(board, "off")}
											disabled={playoutState === "off"}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												gap: "0.25rem",
												padding: "0.5rem",
												borderRadius: "6px",
												border: "1px solid var(--border-default)",
												cursor:
													playoutState === "off" ? "not-allowed" : "pointer",
												fontSize: "0.75rem",
												fontWeight: 700,
												backgroundColor: "transparent",
												color:
													playoutState === "off"
														? "var(--text-tertiary)"
														: "var(--text-danger)",
												opacity: playoutState === "off" ? 0.45 : 1,
											}}
											title="PVW/PGM에서 제거"
										>
											<StopCircle size={14} />
											OFF
										</button>
										<a
											href={
												sessionId
													? `/dashboard/studio/whiteboards/${board.id}?sessionId=${encodeURIComponent(sessionId)}`
													: `/dashboard/studio/whiteboards/${board.id}`
											}
											target="_blank"
											rel="noreferrer"
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												width: "34px",
												borderRadius: "6px",
												border: "1px solid var(--border-default)",
												color: "var(--text-tertiary)",
												textDecoration: "none",
											}}
											title="편집 화면 열기"
										>
											<ExternalLink size={14} />
										</a>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

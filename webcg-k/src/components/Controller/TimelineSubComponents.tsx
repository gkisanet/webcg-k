/**
 * 타임라인 서브 컴포넌트
 * Timeline.tsx에서 분리 — TrackRow, GridLines, ZoomedGap, Playhead,
 * RemotePlayhead, LastBroadcastLine, AddTrackButton, TimelineHeader,
 * TransitionLegend, KeyboardHint
 */

import { useMemo } from "react";
import { Play, Plus, Wind, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { SNAP_UNIT } from "../../stores/blockManipulation";
import {
	addTrack,
	type GraphicBlock,
	type AutoFollowMode,
	type Track,
	cycleAutoFollow,
} from "../../stores/timelineStore";
import { DraggableBlock } from "./DraggableBlock";
import {
	getBlockEdgeStates,
	TRACK_HEADER_WIDTH,
	ZOOM_MAX,
	ZOOM_MIN,
	useZoom,
} from "./timelineConstants";

// ─── TimelineHeader ─────────────────────────────────────────────

export function TimelineHeader({
	zoomLevel,
	onZoomIn,
	onZoomOut,
	onZoomReset,
	autoFollow,
	hasSegments,
}: {
	zoomLevel: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomReset: () => void;
	autoFollow?: AutoFollowMode;
	hasSegments?: boolean;
}) {
	return (
		<div className="timeline-header">
			<span
				className="text-sm font-medium"
				style={{ color: "var(--text-secondary)" }}
			>
				타임라인
			</span>
			<div className="ml-auto flex items-center gap-4">
				<TransitionLegend />

				{/* Auto-follow 토글 — 세그먼트가 있을 때만 표시 */}
				{hasSegments && (
					<button
						type="button"
						onClick={cycleAutoFollow}
						className="flex items-center gap-1 text-xs"
						style={{
							padding: "2px 8px",
							borderRadius: "4px",
							border: `1px solid ${autoFollow === "off" ? "var(--border-default)" : autoFollow === "soft" ? "rgba(245, 158, 11, 0.5)" : "rgba(0, 212, 255, 0.5)"}`,
							background: autoFollow === "off" ? "transparent" : autoFollow === "soft" ? "rgba(245, 158, 11, 0.12)" : "rgba(0, 212, 255, 0.12)",
							color: autoFollow === "off" ? "var(--text-tertiary)" : autoFollow === "soft" ? "#f59e0b" : "var(--accent-primary)",
							cursor: "pointer",
							transition: "all 0.15s",
							minWidth: "60px",
							justifyContent: "center",
						}}
						title={
							autoFollow === "off" ? "Auto-follow OFF — 클릭하여 Soft 모드로"
							: autoFollow === "soft" ? "Soft-prompt — 힌트만 표시, 자동 전환 없음. 클릭하여 Auto로"
							: "Auto-switch — 세그먼트 완료 시 자동 전환. 클릭하여 OFF로"
						}
					>
						<Play size={10} />
						{autoFollow === "off" ? "OFF" : autoFollow === "soft" ? "Soft" : "Auto"}
					</button>
				)}

				{/* 줌 컨트롤 */}
				<div className="zoom-controls">
					<button
						type="button"
						onClick={onZoomOut}
						disabled={zoomLevel <= ZOOM_MIN}
						className="zoom-btn"
						title="줌 아웃 (Ctrl+스크롤↓)"
					>
						<ZoomOut size={13} />
					</button>
					<button
						type="button"
						onClick={onZoomReset}
						disabled={zoomLevel === ZOOM_MAX}
						className="zoom-btn zoom-btn-label"
						title="기본 줌으로 복원"
					>
						{Math.round(zoomLevel * 100)}%
					</button>
					<button
						type="button"
						onClick={onZoomIn}
						disabled={zoomLevel >= ZOOM_MAX}
						className="zoom-btn"
						title="줌 인 (Ctrl+스크롤↑) — 기본 줌까지"
					>
						<ZoomIn size={13} />
					</button>
				</div>

				<KeyboardHint keys={["←", "→"]} label="탐색" />
				<KeyboardHint keys={["Space"]} label="송출" />
				<KeyboardHint keys={["Del"]} label="삭제/갭 닫기" />
				<KeyboardHint keys={["Ctrl+C/V"]} label="복사" />
				<KeyboardHint keys={["Ctrl+↑↓"]} label="트랙 이동" />
				<KeyboardHint keys={["Ctrl+←→"]} label="처음/끝" />
			</div>
		</div>
	);
}

// ─── TransitionLegend ───────────────────────────────────────────

function TransitionLegend() {
	return (
		<div className="flex items-center gap-3 text-xs">
			<span className="flex items-center gap-1">
				<Wind className="w-3 h-3" style={{ color: "#a855f7" }} />
				Fade
			</span>
			<span className="flex items-center gap-1">
				<Zap className="w-3 h-3" style={{ color: "#f59e0b" }} />
				Cut
			</span>
		</div>
	);
}

// ─── KeyboardHint ───────────────────────────────────────────────

function KeyboardHint({ keys, label }: { keys: string[]; label: string }) {
	return (
		<div className="flex items-center gap-1">
			{keys.map((key) => (
				<span key={key} className="keyboard-hint">
					{key}
				</span>
			))}
			<span className="text-xs ml-1" style={{ color: "var(--text-tertiary)" }}>
				{label}
			</span>
		</div>
	);
}

// ─── TrackRow ───────────────────────────────────────────────────

export function TrackRow({
	track,
	blocks,
	selectedBlockId,
	deleteAttemptBlockId,
	selectedGap,
	overlappingDuringDrag,
	setOverlappingDuringDrag,
	onTrackClick,
	completedBlockIds,
	maxBlockEnd,
	onBlockDoubleClick,
	activeSegmentTab,
}: {
	track: Track;
	blocks: GraphicBlock[];
	selectedBlockId: string | null;
	deleteAttemptBlockId: string | null;
	selectedGap: { trackId: number; startPosition: number; endPosition: number } | null;
	overlappingDuringDrag: string[];
	setOverlappingDuringDrag: (ids: string[]) => void;
	onTrackClick: (trackId: number, e: React.MouseEvent<HTMLDivElement>) => void;
	completedBlockIds: Set<string>;
	maxBlockEnd: number;
	/** 블록 더블클릭 시 핫 수정 드로어 열기 */
	onBlockDoubleClick?: (block: GraphicBlock) => void;
	/** 현재 활성 세그먼트 탭 (딤 처리용) */
	activeSegmentTab?: string | null;
}) {
	const edgeStates = useMemo(() => getBlockEdgeStates(blocks), [blocks]);

	// 이 트랙에 선택된 갭이 있는지 확인
	const isGapSelected = selectedGap && selectedGap.trackId === track.id;

	return (
		<div className={`track ${track.isLogoTrack ? "track-logo" : ""}`} data-track-id={track.id}>
			<div className="track-header" style={track.isLogoTrack ? { background: "rgba(251, 191, 36, 0.12)" } : undefined}>
				<span>{track.isLogoTrack ? `👑 ${track.name}` : track.name}</span>
			</div>
			<div
				className="track-content"
				onClick={(e) => onTrackClick(track.id, e)}
				style={{ cursor: "crosshair" }}
			>
				<GridLines maxBlockEnd={maxBlockEnd} />

				{/* 선택된 갭 표시 (줌 적용) */}
				{isGapSelected && (
					<ZoomedGap gap={selectedGap} />
				)}

				{blocks.map((block) => {
					// ■ 세그먼트 딤 로직:
					//   활성 세그먼트가 있고, 이 블록이 다른 세그먼트에 속하면 딤 처리
					//   로고 트랙(trackId=0) 블록은 딤 대상에서 제외
					const isSegmentDimmed = activeSegmentTab != null
						&& block.segmentId !== activeSegmentTab
						&& block.segmentId != null
						&& block.trackId !== 0;
					return (
						<DraggableBlock
							key={block.id}
							block={block}
							isSelected={block.id === selectedBlockId}
							isDeleteAttempt={block.id === deleteAttemptBlockId}
							isDimmed={overlappingDuringDrag.includes(block.id) || isSegmentDimmed}
							isCompleted={completedBlockIds.has(block.id)}
							edgeState={
								edgeStates.get(block.id) || {
									hasLeftNeighbor: false,
									hasRightNeighbor: false,
								}
							}
							setOverlappingDuringDrag={setOverlappingDuringDrag}
							onDoubleClick={onBlockDoubleClick}
						/>
					);
				})}
			</div>
		</div>
	);
}

// ─── ZoomedGap ──────────────────────────────────────────────────

function ZoomedGap({ gap }: { gap: { startPosition: number; endPosition: number } }) {
	const zoom = useZoom();
	return (
		<div
			style={{
				position: "absolute",
				left: `${gap.startPosition * zoom}px`,
				width: `${(gap.endPosition - gap.startPosition) * zoom}px`,
				top: 0,
				bottom: 0,
				background: "rgba(239, 68, 68, 0.3)",
				border: "2px dashed #ef4444",
				borderRadius: "4px",
				pointerEvents: "none",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 5,
			}}
			title="Delete 키로 갭 삭제 (Ripple Delete)"
		>
			<span style={{ fontSize: "10px", color: "#ef4444", fontWeight: "bold" }}>
				Del: 갭 닫기
			</span>
		</div>
	);
}

// ─── GridLines ──────────────────────────────────────────────────

export function GridLines({ maxBlockEnd }: { maxBlockEnd: number }) {
	const zoom = useZoom();
	// 1. 콘텐츠 기반: 블록이 존재하는 영역까지 그리드라인
	// 2. 뷰포트 기반: 큰 모니터에서도 빈 영역까지 그리드라인이 그려짐
	//    (window.innerWidth를 줌으로 나눠 논리적 SNAP_UNIT 개수를 계산)
	const viewportUnits = typeof window !== "undefined"
		? Math.ceil(window.innerWidth / (SNAP_UNIT * zoom)) + 2
		: 40;
	const lineCount = Math.max(
		Math.ceil(maxBlockEnd / SNAP_UNIT),  // 콘텐츠 기반
		viewportUnits,                        // 뷰포트 기반 (큰 모니터 대응)
	);
	const lines = [];
	for (let i = 0; i <= lineCount; i++) {
		lines.push(
			<div
				key={i}
				style={{
					position: "absolute",
					left: `${i * SNAP_UNIT * zoom}px`,
					top: 0,
					bottom: 0,
					width: "1px",
					backgroundColor: "rgba(255,255,255,0.1)",
					pointerEvents: "none",
				}}
			/>,
		);
	}
	return <>{lines}</>;
}

// ─── Playhead ───────────────────────────────────────────────────

export function Playhead({ position, color, isScrubbing = false }: { position: number; color: string; isScrubbing?: boolean }) {
	const zoom = useZoom();
	return (
		<div
			className={`playhead${isScrubbing ? " playhead--scrub" : ""}`}
			style={{
				left: `${position * zoom + TRACK_HEADER_WIDTH}px`,
				"--playhead-color": isScrubbing ? "#f59e0b" : color,
				"--playhead-glow": isScrubbing
					? "rgba(251, 191, 36, 0.5)"
					: `${color}80`,
				height: isScrubbing ? "60%" : "100%",
				top: isScrubbing ? "20%" : "0",
				opacity: isScrubbing ? 0.85 : 1,
			} as React.CSSProperties}
			title={isScrubbing ? "스크러빙 모드" : undefined}
		/>
	);
}

// ─── RemotePlayhead ─────────────────────────────────────────────

export function RemotePlayhead({ position, color, displayName, isScrubbing = false }: {
	position: number;
	color: string;
	displayName: string;
	isScrubbing?: boolean;
}) {
	const zoom = useZoom();
	return (
		<div
			style={{
				position: "absolute",
				left: `${position * zoom + TRACK_HEADER_WIDTH}px`,
				top: 0,
				bottom: 0,
				width: isScrubbing ? "3px" : "2px",
				backgroundColor: isScrubbing ? "#f59e0b" : color,
				boxShadow: isScrubbing
					? "0 0 6px 2px rgba(251, 191, 36, 0.35)"
					: `0 0 4px 1px ${color}80`,
				borderLeft: isScrubbing ? "2px dashed rgba(251, 191, 36, 0.5)" : "none",
				zIndex: 4,
				pointerEvents: "none",
			}}
			title={`${displayName}${isScrubbing ? " (스크러빙)" : ""}의 플레이헤드`}
		>
			{/* 사용자 이름 라벨 */}
			<div
				style={{
					position: "absolute",
					top: "-18px",
					left: "50%",
					transform: "translateX(-50%)",
					padding: "2px 6px",
					backgroundColor: isScrubbing ? "#f59e0b" : color,
					borderRadius: "3px",
					fontSize: "9px",
					color: "#fff",
					whiteSpace: "nowrap",
					fontWeight: 600,
				}}
			>
				{displayName}{isScrubbing ? " (SCRUB)" : ""}
			</div>
		</div>
	);
}

// ─── LastBroadcastLine ──────────────────────────────────────────

export function LastBroadcastLine({ position }: { position: number }) {
	const zoom = useZoom();
	if (position <= 0) return null;

	return (
		<div
			style={{
				position: "absolute",
				left: `${position * zoom + TRACK_HEADER_WIDTH}px`,
				top: 0,
				bottom: 0,
				width: "2px",
				backgroundColor: "rgba(239, 68, 68, 0.8)",
				boxShadow: "0 0 4px 1px rgba(239, 68, 68, 0.5)",
				zIndex: 5,
				pointerEvents: "none",
			}}
			title={`마지막 송출: ${position}px`}
		/>
	);
}

// ─── AddTrackButton ─────────────────────────────────────────────

export function AddTrackButton() {
	return (
		<button
			type="button"
			onClick={addTrack}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.5rem",
				width: "100%",
				padding: "0.5rem",
				marginTop: "0.25rem",
				backgroundColor: "var(--app-bg-muted)",
				border: "1px dashed var(--border-default)",
				borderRadius: "4px",
				color: "var(--text-tertiary)",
				fontSize: "0.75rem",
				cursor: "pointer",
			}}
		>
			<Plus className="w-4 h-4" />
			트랙 추가
		</button>
	);
}

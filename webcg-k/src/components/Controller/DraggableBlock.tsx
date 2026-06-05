/**
 * DraggableBlock — 타임라인 그래픽 블록 (드래그/리사이즈/트랜지션)
 * Timeline.tsx에서 분리 — 가장 큰 단일 컴포넌트
 */

import { Wind, Zap } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	usesBroadcastPackageMotion,
	usesBroadcastPackagePhaseMotion,
} from "../../lib/graphicLifecyclePolicy";
import {
	changeBlockTrack,
	findOverlappingBlockIds,
	moveBlockFinal,
	moveBlockTemporary,
	resizeBlockAbsolute,
	SNAP_UNIT,
	snapToGrid,
} from "../../stores/blockManipulation";
import {
	type GraphicBlock,
	pushToHistory,
	selectBlock,
	type TransitionType,
	toggleBlockTransition,
} from "../../stores/timelineStore";
import {
	type BlockEdgeState,
	TRANSITION_ZONE_WIDTH,
	useZoom,
} from "./timelineConstants";

const PACKAGE_MOTION_TITLE =
	"패키지 모션 사용: In/Out은 그래픽 내부 SHOW/HIDE lifecycle이 제어합니다. 타임라인 Fade/Cut은 legacy fallback 블록에서만 적용됩니다.";

// ─── 트랜지션 아이콘 ────────────────────────────────────────────

function TransitionIcon({
	type,
	disabled = false,
}: {
	type: TransitionType;
	disabled?: boolean;
}) {
	const iconStyle = {
		width: "12px",
		height: "12px",
		color: type === "fade" ? "#a855f7" : "#f59e0b",
		opacity: disabled ? 0.35 : 1,
	};

	return type === "fade" ? (
		<Wind style={iconStyle} />
	) : (
		<Zap style={iconStyle} />
	);
}

// ─── Props ──────────────────────────────────────────────────────

interface DraggableBlockProps {
	block: GraphicBlock;
	isSelected: boolean;
	isDeleteAttempt: boolean;
	isDimmed: boolean;
	isCompleted: boolean;
	edgeState: BlockEdgeState;
	setOverlappingDuringDrag: (ids: string[]) => void;
	/** 블록 더블클릭 시 핫 수정 드로어 열기 */
	onDoubleClick?: (block: GraphicBlock) => void;
	readOnly?: boolean;
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function DraggableBlock({
	block,
	isSelected,
	isDeleteAttempt,
	isDimmed,
	isCompleted,
	edgeState,
	setOverlappingDuringDrag,
	onDoubleClick,
	readOnly = false,
}: DraggableBlockProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState<"left" | "right" | null>(null);
	const [willRevert, setWillRevert] = useState(false);
	const [hoveringZone, setHoveringZone] = useState<"in" | "out" | null>(null);
	const dragStartRef = useRef<{
		x: number;
		y: number;
		startPos: number;
		originalPos: number;
		originalTrackId: number;
		currentTrackId: number;
	} | null>(null);
	const blockRef = useRef<HTMLDivElement>(null);

	const gridCells = Math.round(block.width / SNAP_UNIT);
	const transitionZoneWidth = TRANSITION_ZONE_WIDTH;
	const usesPackageMotion = useMemo(
		() => usesBroadcastPackageMotion(block.sourceType, block.sourceData),
		[block.sourceType, block.sourceData],
	);
	const usesPackageEnterMotion = useMemo(
		() =>
			usesBroadcastPackagePhaseMotion(
				block.sourceType,
				block.sourceData,
				"enter",
			),
		[block.sourceType, block.sourceData],
	);
	const usesPackageExitMotion = useMemo(
		() =>
			usesBroadcastPackagePhaseMotion(
				block.sourceType,
				block.sourceData,
				"exit",
			),
		[block.sourceType, block.sourceData],
	);

	// 줌 적용
	const zoom = useZoom();
	// ref로 최신 줌 레벨 참조 (이벤트 핸들러 클로저용)
	const zoomLevelRef = useRef(zoom);
	zoomLevelRef.current = zoom;
	const renderedWidth = block.width * zoom;
	const compactLabel = renderedWidth < 80;
	const inTransitionDisabled = readOnly || usesPackageEnterMotion;
	const outTransitionDisabled = readOnly || usesPackageExitMotion;

	// 트랜지션 영역 클릭
	const handleTransitionClick = useCallback(
		(side: "in" | "out", e: React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			const sideDisabled =
				readOnly ||
				(side === "in" ? usesPackageEnterMotion : usesPackageExitMotion);
			if (sideDisabled) return;
			pushToHistory(); // 트랜지션 변경 전 상태를 히스토리에 백업
			toggleBlockTransition(block.id, side);
		},
		[block.id, readOnly, usesPackageEnterMotion, usesPackageExitMotion],
	);

	const getTransitionTitle = useCallback(
		(side: "in" | "out", type: TransitionType) => {
			const usesPackagePhaseMotion =
				side === "in" ? usesPackageEnterMotion : usesPackageExitMotion;
			if (usesPackagePhaseMotion) return PACKAGE_MOTION_TITLE;
			const label = side === "in" ? "In" : "Out";
			return readOnly
				? `${label}: ${type}`
				: `${label}: ${type} fallback (클릭하여 전환)`;
		},
		[readOnly, usesPackageEnterMotion, usesPackageExitMotion],
	);

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			if (readOnly) return;
			pushToHistory(); // 드래그 시작 전 상태를 히스토리에 백업
			selectBlock(block.id);
			setIsDragging(true);
			setWillRevert(false);
			dragStartRef.current = {
				x: e.clientX,
				y: e.clientY,
				startPos: block.startPosition,
				originalPos: block.startPosition,
				originalTrackId: block.trackId,
				currentTrackId: block.trackId,
			};

			const handleMouseMove = (moveEvent: MouseEvent) => {
				if (!dragStartRef.current) return;
				// 줌 보정: 화면 이동 거리를 논리 거리로 변환
				const currentZoom = zoomLevelRef.current;
				const delta =
					(moveEvent.clientX - dragStartRef.current.x) / currentZoom;
				const newPos = dragStartRef.current.startPos + delta;
				const snappedPos = snapToGrid(Math.max(0, newPos));

				moveBlockTemporary(block.id, newPos);

				// Y축 트랙 감지: 마우스 아래 .track[data-track-id] 요소 찾기
				const elems = document.elementsFromPoint(
					moveEvent.clientX,
					moveEvent.clientY,
				);
				const trackEl = elems.find((el) => el.hasAttribute("data-track-id")) as
					| HTMLElement
					| undefined;
				if (trackEl) {
					const targetTrackId = Number(trackEl.getAttribute("data-track-id"));
					if (targetTrackId !== dragStartRef.current.currentTrackId) {
						changeBlockTrack(block.id, targetTrackId);
						dragStartRef.current.currentTrackId = targetTrackId;
					}
				}

				const overlapping = findOverlappingBlockIds(
					block.id,
					snappedPos,
					block.width,
				);
				setOverlappingDuringDrag(overlapping);
				setWillRevert(overlapping.length > 0);
			};

			const handleMouseUp = () => {
				if (dragStartRef.current) {
					const finalSuccess = moveBlockFinal(
						block.id,
						dragStartRef.current.originalPos,
					);
					// 위치 겹침으로 X축 복귀 시 트랙도 원복
					if (
						!finalSuccess &&
						dragStartRef.current.currentTrackId !==
							dragStartRef.current.originalTrackId
					) {
						changeBlockTrack(block.id, dragStartRef.current.originalTrackId);
					}
				}

				setIsDragging(false);
				setWillRevert(false);
				setOverlappingDuringDrag([]);
				dragStartRef.current = null;
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[
			block.id,
			block.startPosition,
			block.width,
			block.trackId,
			readOnly,
			setOverlappingDuringDrag,
		],
	);

	const handleResizeStart = useCallback(
		(e: React.MouseEvent, handle: "left" | "right") => {
			e.stopPropagation();
			e.preventDefault();
			if (readOnly) return;
			pushToHistory(); // 리사이즈 시작 전 상태를 히스토리에 백업
			selectBlock(block.id);
			setIsResizing(handle);

			const trackContent = (e.target as HTMLElement).closest(".track-content");
			if (!trackContent) return;
			const trackRect = trackContent.getBoundingClientRect();

			const handleMouseMove = (moveEvent: MouseEvent) => {
				// 줌 보정: 화면 좌표를 논리 좌표로 변환
				const currentZoom = zoomLevelRef.current;
				const mouseX = (moveEvent.clientX - trackRect.left) / currentZoom;
				resizeBlockAbsolute(block.id, handle, mouseX);
			};

			const handleMouseUp = () => {
				setIsResizing(null);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[block.id, readOnly],
	);

	// 스타일 계산
	const shakeStyle = isDeleteAttempt
		? {
				animation: "shake 0.4s ease-in-out",
				background: `linear-gradient(90deg, ${block.color || "#3b82f6"}, #ef4444, ${block.color || "#3b82f6"})`,
				backgroundSize: "200% 100%",
			}
		: {};

	let borderStyle = "1px solid rgba(255,255,255,0.2)";
	let opacity = 1;
	let bgColor = block.color || "var(--surface-block)";

	if (isDimmed) {
		opacity = 0.4;
		bgColor = "#333";
	} else if (isCompleted) {
		// 송출 완료: 회색 + 반투명
		opacity = 0.5;
		bgColor = "#555";
		borderStyle = "1px solid rgba(255,255,255,0.1)";
	} else if (willRevert) {
		opacity = 0.6;
		borderStyle = "2px dashed #ef4444";
	} else if (isSelected) {
		borderStyle = "2px solid var(--accent-primary)";
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: timeline block is a drag surface; keyboard editing is handled by surrounding timeline controls.
		<div
			ref={blockRef}
			className={`graphic-block ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
			style={{
				left: `${block.startPosition * zoom}px`,
				width: `${block.width * zoom}px`,
				backgroundColor: isDeleteAttempt ? undefined : bgColor,
				position: "absolute",
				overflow: "visible",
				cursor: readOnly ? "default" : isDragging ? "grabbing" : "grab",
				opacity: isDragging && !willRevert ? 0.8 : opacity,
				zIndex: isDragging || isSelected ? 10 : 1,
				border: borderStyle,
				transition: isDragging
					? "none"
					: "opacity 0.15s, background-color 0.15s",
				...shakeStyle,
			}}
			onMouseDown={handleDragStart}
			onDoubleClick={(e) => {
				// 트랜지션/리사이즈 영역 더블클릭은 무시
				e.stopPropagation();
				if (!readOnly && onDoubleClick) onDoubleClick(block);
			}}
			title={
				readOnly
					? `${block.name} (${gridCells}칸)`
					: `${block.name} (${gridCells}칸) — 더블클릭: 텍스트 편집`
			}
		>
			{/* Left Transition Zone (In) */}
			<button
				type="button"
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: 0,
					width: `${transitionZoneWidth}px`,
					background: usesPackageEnterMotion
						? "rgba(6, 182, 212, 0.14)"
						: hoveringZone === "in"
							? "rgba(0,0,0,0.4)"
							: "rgba(0,0,0,0.2)",
					borderRadius: "4px 0 0 4px",
					cursor: inTransitionDisabled ? "default" : "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					transition: "background 0.15s",
					zIndex: 15,
					padding: 0,
					border: 0,
					color: "inherit",
					borderRight: usesPackageEnterMotion
						? "1px solid rgba(6, 182, 212, 0.35)"
						: undefined,
				}}
				aria-disabled={inTransitionDisabled}
				onMouseEnter={() => setHoveringZone("in")}
				onMouseLeave={() => setHoveringZone(null)}
				onClick={(e) => handleTransitionClick("in", e)}
				onMouseDown={(e) => e.stopPropagation()}
				title={getTransitionTitle("in", block.transitionIn)}
			>
				<TransitionIcon
					type={block.transitionIn}
					disabled={usesPackageEnterMotion}
				/>
			</button>

			{/* Left Glow */}
			{edgeState.hasLeftNeighbor && !isDimmed && (
				<div
					style={{
						position: "absolute",
						left: "-2px",
						top: 0,
						bottom: 0,
						width: "4px",
						background:
							"linear-gradient(90deg, rgba(168, 85, 247, 0.8), transparent)",
						boxShadow: "-2px 0 8px rgba(168, 85, 247, 0.6)",
						borderRadius: "2px 0 0 2px",
						pointerEvents: "none",
						zIndex: 5,
					}}
				/>
			)}

			{/* Left Resize Handle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: resize handle is pointer-drag only in the timeline editor. */}
			<div
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					bottom: 0,
					width: "8px",
					cursor: readOnly ? "default" : "ew-resize",
					backgroundColor:
						isResizing === "left" ? "rgba(96, 165, 250, 0.5)" : "transparent",
					borderRadius: "4px 0 0 4px",
					zIndex: 25,
				}}
				onMouseDown={(e) => handleResizeStart(e, "left")}
			/>

			{/* 블록 이름 */}
			<span
				style={{
					position: "absolute",
					left: "50%",
					top: "50%",
					transform: "translate(-50%, -50%)",
					zIndex: 1,
					pointerEvents: "none",
					userSelect: "none",
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
					fontSize: compactLabel ? "10px" : "11px",
					fontWeight: compactLabel ? 700 : 500,
					maxWidth: `${Math.max(20, renderedWidth - transitionZoneWidth * 2 - 10)}px`,
					display: "flex",
					alignItems: "center",
					gap: "4px",
				}}
			>
				{compactLabel ? `T${block.trackId}` : block.name}
				{usesPackageMotion && (
					<span
						title={PACKAGE_MOTION_TITLE}
						style={{
							padding: compactLabel ? "0 3px" : "1px 4px",
							borderRadius: "999px",
							border: "1px solid rgba(6, 182, 212, 0.45)",
							background: "rgba(6, 182, 212, 0.14)",
							color: "#67e8f9",
							fontSize: compactLabel ? "8px" : "9px",
							fontWeight: 800,
							letterSpacing: "0.04em",
						}}
					>
						{compactLabel ? "M" : "PKG"}
					</span>
				)}
				{/* 송출 완료 표시 */}
				{isCompleted && (
					<span style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px" }}>
						✓
					</span>
				)}
				{/* 해상도 불완전 경고 */}
				{block.sourceData?.elements?.some(
					(el: Record<string, unknown>) =>
						el.type === "image" && (el.src_2k || el.src) && !el.src_4k,
				) && (
					<span title="4K 이미지 누락" style={{ color: "#eab308" }}>
						⚠
					</span>
				)}
			</span>

			{/* Right Resize Handle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: resize handle is pointer-drag only in the timeline editor. */}
			<div
				style={{
					position: "absolute",
					right: 0,
					top: 0,
					bottom: 0,
					width: "8px",
					cursor: readOnly ? "default" : "ew-resize",
					backgroundColor:
						isResizing === "right" ? "rgba(96, 165, 250, 0.5)" : "transparent",
					borderRadius: "0 4px 4px 0",
					zIndex: 25,
				}}
				onMouseDown={(e) => handleResizeStart(e, "right")}
			/>

			{/* Right Glow */}
			{edgeState.hasRightNeighbor && !isDimmed && (
				<div
					style={{
						position: "absolute",
						right: "-2px",
						top: 0,
						bottom: 0,
						width: "4px",
						background:
							"linear-gradient(270deg, rgba(168, 85, 247, 0.8), transparent)",
						boxShadow: "2px 0 8px rgba(168, 85, 247, 0.6)",
						borderRadius: "0 2px 2px 0",
						pointerEvents: "none",
						zIndex: 5,
					}}
				/>
			)}

			{/* Right Transition Zone (Out) */}
			<button
				type="button"
				style={{
					position: "absolute",
					right: 0,
					top: 0,
					bottom: 0,
					width: `${transitionZoneWidth}px`,
					background: usesPackageExitMotion
						? "rgba(6, 182, 212, 0.14)"
						: hoveringZone === "out"
							? "rgba(0,0,0,0.4)"
							: "rgba(0,0,0,0.2)",
					borderRadius: "0 4px 4px 0",
					cursor: outTransitionDisabled ? "default" : "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					transition: "background 0.15s",
					zIndex: 15,
					padding: 0,
					border: 0,
					color: "inherit",
					borderLeft: usesPackageExitMotion
						? "1px solid rgba(6, 182, 212, 0.35)"
						: undefined,
				}}
				aria-disabled={outTransitionDisabled}
				onMouseEnter={() => setHoveringZone("out")}
				onMouseLeave={() => setHoveringZone(null)}
				onClick={(e) => handleTransitionClick("out", e)}
				onMouseDown={(e) => e.stopPropagation()}
				title={getTransitionTitle("out", block.transitionOut)}
			>
				<TransitionIcon
					type={block.transitionOut}
					disabled={usesPackageExitMotion}
				/>
			</button>

			<style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
      `}</style>
		</div>
	);
}

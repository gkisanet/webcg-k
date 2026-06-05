/**
 * Timeline Component (오케스트레이터)
 * 타임라인 그리드 기반 줌 + 플레이헤드 + 트랙 레이아웃
 *
 * ■ Segment 확장 (2026-04-16)
 *   Premiere Nested Sequence 탭 패턴 적용.
 *   NRCS 미연동: 세그먼트 0개 → 탭 바 숨김 → 기존과 100% 동일
 *   NRCS 연동: 세그먼트 N개 → 탭 바 활성 → 아이템별 탭 전환
 *
 * 서브 컴포넌트: DraggableBlock, TimelineSubComponents, SegmentTabBar
 * 상수/타입: timelineConstants.ts
 */

import { useStore } from "@tanstack/react-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	SNAP_UNIT,
} from "../../stores/blockManipulation";
import {
	clearGapSelection,
	type GraphicBlock,
	reorderBlocksBySegments,
	selectGapAtPosition,
	setActiveSegmentTab,
	setPlayheadPosition,
	timelineStore,
} from "../../stores/timelineStore";
import type { SegmentBand } from "../../lib/types/segment";
import { LogoGallery, LogoGalleryToggle } from "./LogoGallery";
import { SegmentTabBar } from "./SegmentTabBar";
import {
	type RemotePlayheadData,
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STEP,
	TRACK_HEADER_WIDTH,
	ZoomContext,
} from "./timelineConstants";
import {
	TimelineHeader,
	ZoomControls,
	TrackRow,
	Playhead,
	RemotePlayhead,
	LastBroadcastLine,
	AddTrackButton,
} from "./TimelineSubComponents";

// 원격 플레이헤드 타입 re-export
export type { RemotePlayheadData } from "./timelineConstants";

interface TimelineProps {
	remotePlayheads?: RemotePlayheadData[];
	myColor?: string;
	readOnly?: boolean;
	undoAvailable?: boolean;
	redoAvailable?: boolean;
	onUndo?: () => void;
	onRedo?: () => void;
	onOpenShortcutHelp?: () => void;
	/** 블록 더블클릭 시 핫 수정 드로어 열기 */
	onBlockDoubleClick?: (block: GraphicBlock) => void;
}

export function Timeline({
	remotePlayheads = [],
	myColor = "#ec4899",
	readOnly = false,
	undoAvailable = false,
	redoAvailable = false,
	onUndo,
	onRedo,
	onOpenShortcutHelp,
	onBlockDoubleClick,
}: TimelineProps) {
	const tracks = useStore(timelineStore, (state) => state.tracks);
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const playheadPosition = useStore(
		timelineStore,
		(state) => state.playheadPosition,
	);
	const selectedBlockId = useStore(
		timelineStore,
		(state) => state.selectedBlockId,
	);
	const deleteAttemptBlockId = useStore(
		timelineStore,
		(state) => state.deleteAttemptBlockId,
	);
	const selectedGap = useStore(timelineStore, (state) => state.selectedGap);
	const lastBroadcastPosition = useStore(
		timelineStore,
		(state) => state.lastBroadcastPosition,
	);
	const completedBlockIds = useStore(
		timelineStore,
		(state) => state.completedBlockIds,
	);

	// ─── 세그먼트 상태 구독 ───
	const segments = useStore(timelineStore, (state) => state.segments);
	const activeSegmentTab = useStore(timelineStore, (state) => state.activeSegmentTab);
	const pgmBlockIds = useStore(timelineStore, (state) => state.pgmBlockIds);
	const skippedBlockIds = useStore(timelineStore, (state) => state.skippedBlockIds);
	const autoFollow = useStore(timelineStore, (state) => state.autoFollow);
	const isScrubbing = useStore(timelineStore, (state) => state.isScrubbing);

	const hasSegments = segments.length > 0;

	const [overlappingDuringDrag, setOverlappingDuringDrag] = useState<string[]>(
		[],
	);

	// ===== 줌 상태 =====
	const [zoomLevel, setZoomLevel] = useState(ZOOM_MAX);
	const tracksRef = useRef<HTMLDivElement>(null);
	const lastAutoScrollAtRef = useRef(0);

	const handleZoomIn = useCallback(() => {
		setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
	}, []);

	const handleZoomOut = useCallback(() => {
		setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
	}, []);

	const handleZoomReset = useCallback(() => {
		setZoomLevel(ZOOM_MAX);
	}, []);

	// Ctrl+마우스휠 줌
	useEffect(() => {
		const container = tracksRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();

			if (e.deltaY < 0) {
				// 위로 스크롤 = 줌인 (최대 1.0까지)
				setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
			} else {
				// 아래로 스크롤 = 줌아웃
				setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, []);

	// ─── 블록 필터링 제거: 항상 모든 블록 표시 ───
	// ■ Why 필터링 제거?
	//   세그먼트 탭 전환 시 다른 블록이 사라지면 전체 맥락을 잃는다.
	//   대신 비활성 세그먼트 블록을 딤(Dim) 처리하여 포커스를 구분한다.
	const filteredBlocks = blocks;

	// ─── 세그먼트 배경 밴드 계산 (모든 탭에서 표시) ───
	const segmentBands: SegmentBand[] = useMemo(() => {
		if (!hasSegments) return [];
		return segments
			.map((seg) => {
				const segBlocks = blocks.filter((b) => b.segmentId === seg.id);
				if (segBlocks.length === 0) return null;
				const minStart = Math.min(...segBlocks.map((b) => b.startPosition));
				const maxEnd = Math.max(...segBlocks.map((b) => b.startPosition + b.width));
				return {
					id: seg.id,
					label: seg.label,
					color: seg.color,
					order: seg.order,
					startPx: minStart,
					endPx: maxEnd,
					blockCount: segBlocks.length,
				};
			})
			.filter((band): band is SegmentBand => band !== null);
	}, [segments, blocks, hasSegments]);

	// ─── Playhead 위치 기반 세그먼트 탭 자동 활성화 ───
	// ■ Why? 크롬 브라우저 탭처럼 playhead가 세그먼트 영역에 들어가면 해당 탭을 자동 하이라이트.
	//   운영자가 수동으로 탭을 클릭하지 않아도 현재 위치의 맥락을 즉시 파악 가능.
	useEffect(() => {
		if (!hasSegments) return;

		// playhead가 속한 세그먼트 찾기
		const currentBand = segmentBands.find(
			(band) => playheadPosition >= band.startPx && playheadPosition < band.endPx,
		);

		if (currentBand) {
			// 이미 같은 탭이면 무시
			if (activeSegmentTab !== currentBand.id) {
				setActiveSegmentTab(currentBand.id);
			}
		} else {
			// 세그먼트 밖이면 "전체" 탭으로
			if (activeSegmentTab !== null) {
				setActiveSegmentTab(null);
			}
		}
	}, [playheadPosition, segmentBands, hasSegments]); // activeSegmentTab은 의도적 제외 — 무한 루프 방지

	// ─── Auto-follow 3단계 로직 ───
	// ■ "off": 아무 동작 없음
	// ■ "soft": 탭 전환 없이 NextSegmentHint 강조 펄스 + Preview 자동 장전
	// ■ "auto": 마지막 CG 완료 0.5초 후 다음 세그먼트로 자동 전환

	// Soft-prompt 펄스 상태: 현재 세그먼트 완료 → 다음 세그먼트 힌트 깜빡
	const [softPromptActive, setSoftPromptActive] = useState(false);

	useEffect(() => {
		if (autoFollow === "off" || !activeSegmentTab || !hasSegments) {
			setSoftPromptActive(false);
			return;
		}

		const currentSeg = segments.find((s) => s.id === activeSegmentTab);
		if (!currentSeg) return;

		const segBlocks = blocks.filter((b) => b.segmentId === activeSegmentTab);
		if (segBlocks.length === 0) return;

		// 이 세그먼트의 모든 블록이 완료되었는지 확인
		const allDone = segBlocks.every((b) => completedBlockIds.has(b.id));
		if (!allDone) {
			setSoftPromptActive(false);
			return;
		}

		// 다음 세그먼트 찾기
		const sorted = [...segments].sort((a, b) => a.order - b.order);
		const currentIdx = sorted.findIndex((s) => s.id === activeSegmentTab);
		const nextSeg = sorted[currentIdx + 1];
		if (!nextSeg) return;

		if (autoFollow === "soft") {
			// ■ Soft-prompt 모드:
			//   탭은 전환하지 않음 → 운영자 통제권 유지
			//   NextSegmentHint에 펄스 애니메이션 활성화
			//   Preview에 다음 세그먼트의 첫 번째 블록을 자동 장전
			setSoftPromptActive(true);

			// Preview 자동 장전: 다음 세그먼트의 첫 블록을 Preview에 표시
			const nextSegBlocks = blocks
				.filter((b) => b.segmentId === nextSeg.id)
				.sort((a, b) => a.startPosition - b.startPosition);

			if (nextSegBlocks.length > 0) {
				const firstBlock = nextSegBlocks[0];
				timelineStore.setState((s) => ({
					...s,
					previewBlockId: firstBlock.id,
				}));
			}
		} else {
			// ■ Auto-switch 모드:
			//   0.5초 후 다음 세그먼트 첫 블록으로 playhead 자동 이동
			//   → playhead 기반 자동 탭 활성화가 나머지를 처리
			setSoftPromptActive(false);
			const nextSegBlocks = blocks
				.filter((b) => b.segmentId === nextSeg.id)
				.sort((a, b) => a.startPosition - b.startPosition);
			if (nextSegBlocks.length > 0) {
				const timer = setTimeout(() => {
					setPlayheadPosition(nextSegBlocks[0].startPosition);
				}, 500);
				return () => clearTimeout(timer);
			}
		}
	}, [completedBlockIds, activeSegmentTab, autoFollow, segments, blocks, hasSegments]);

	// ─── NextSegmentHint 계산 (세그먼트 탭에서만) ───
	const nextSegmentInfo = useMemo(() => {
		if (!activeSegmentTab || !hasSegments) return null;
		const sorted = [...segments].sort((a, b) => a.order - b.order);
		const currentIdx = sorted.findIndex((s) => s.id === activeSegmentTab);
		if (currentIdx < 0 || currentIdx >= sorted.length - 1) return null;

		const nextSeg = sorted[currentIdx + 1];
		// 현재 세그먼트의 마지막 블록 끝 위치
		const segBlocks = blocks.filter((b) => b.segmentId === activeSegmentTab);
		if (segBlocks.length === 0) return null;
		const segEnd = Math.max(...segBlocks.map((b) => b.startPosition + b.width));

		return { nextSeg, segEndPx: segEnd };
	}, [activeSegmentTab, segments, blocks, hasSegments]);

	// ─── 더블클릭 핸들러: 핫 수정 드로어 열기 ───
	// ■ 변경: 세그먼트 탭 전환 로직 제거 (playhead 기반 자동 전환으로 대체)
	const handleBlockDoubleClick = useCallback(
		(block: GraphicBlock) => {
			onBlockDoubleClick?.(block);
		},
		[onBlockDoubleClick],
	);

	// 전체 블록의 최대 끝 위치 (스크롤 영역 너비 계산용)
	// 큰 모니터에서 빈 공간이 발생하지 않도록 뷰포트 너비도 고려
	const maxBlockEnd = useMemo(() => {
		const targetBlocks = filteredBlocks;
		const contentEnd = targetBlocks.length === 0
			? 20 * SNAP_UNIT
			: Math.max(...targetBlocks.map((b) => b.startPosition + b.width)) + SNAP_UNIT * 5;

		// 뷰포트 전체를 커버하는 최소 너비 (줌 고려)
		const viewportMin = typeof window !== "undefined"
			? Math.ceil(window.innerWidth / zoomLevel) + SNAP_UNIT * 2
			: contentEnd;

		return Math.max(contentEnd, viewportMin);
	}, [filteredBlocks, zoomLevel]);

	// 줌 적용된 트랙 콘텐츠 너비
	const trackContentWidth = maxBlockEnd * zoomLevel;

	// 클릭 처리 (빈 공간 클릭 시 갭 선택)
	const handleTrackClick = (trackId: number, e: React.MouseEvent<HTMLDivElement>) => {
		if (readOnly) return;
		const target = e.target as HTMLElement;
		if (target.closest(".graphic-block")) return;

		const rect = e.currentTarget.getBoundingClientRect();
		// 줌 보정: 화면 px → 논리 px
		const x = (e.clientX - rect.left) / zoomLevel;
		const snappedPos = Math.round(x / SNAP_UNIT) * SNAP_UNIT;

		// 갭 선택 시도
		const gapSelected = selectGapAtPosition(trackId, x);

		if (!gapSelected) {
			clearGapSelection();
			setPlayheadPosition(Math.max(0, snappedPos));
		}
	};

	const getBlocksForTrack = (trackId: number) => {
		return filteredBlocks.filter((block) => block.trackId === trackId);
	};

	const playheadReadout = useMemo(() => {
		const playableBlocks = [...blocks]
			.filter((block) => block.trackId !== 0)
			.sort((a, b) => a.startPosition - b.startPosition || a.trackId - b.trackId);
		const activeBlock = playableBlocks
			.filter((block) =>
				playheadPosition >= block.startPosition &&
				playheadPosition < block.startPosition + block.width,
			)
			.sort((a, b) => b.trackId - a.trackId)[0];

		if (!activeBlock) return `위치 ${playheadPosition}px`;
		const sequenceIndex = playableBlocks.findIndex((block) => block.id === activeBlock.id) + 1;
		return `${sequenceIndex}/${playableBlocks.length} ${activeBlock.name}`;
	}, [blocks, playheadPosition]);

	// 로고 갤러리 열기/닫기
	const [galleryOpen, setGalleryOpen] = useState(false);

	// 플레이헤드 이동 시 스크롤 자동 추적
	useEffect(() => {
		const container = tracksRef.current;
		if (!container) return;

		const now = performance.now();
		const scrollBehavior: ScrollBehavior =
			now - lastAutoScrollAtRef.current < 200 ? "auto" : "smooth";
		lastAutoScrollAtRef.current = now;

		// 맨 처음(position=0)이면 스크롤도 맨 왼쪽으로
		if (playheadPosition === 0) {
			container.scrollTo({ left: 0, behavior: scrollBehavior });
			return;
		}

		// 플레이헤드의 화면상 px 위치
		const playheadPx = playheadPosition * zoomLevel + TRACK_HEADER_WIDTH;
		const scrollLeft = container.scrollLeft;
		const viewportWidth = container.clientWidth;

		// 여유 마진 (뷰포트 양쪽 80px)
		const SCROLL_MARGIN = 80;

		// 플레이헤드가 뷰포트 오른쪽 밖으로 벗어났을 때
		if (playheadPx > scrollLeft + viewportWidth - SCROLL_MARGIN) {
			container.scrollTo({
				left: playheadPx - viewportWidth + SCROLL_MARGIN * 2,
				behavior: scrollBehavior,
			});
		}
		// 플레이헤드가 뷰포트 왼쪽 밖으로 벗어났을 때
		else if (playheadPx < scrollLeft + SCROLL_MARGIN) {
			container.scrollTo({
				left: Math.max(0, playheadPx - SCROLL_MARGIN),
				behavior: scrollBehavior,
			});
		}
	}, [playheadPosition, zoomLevel]);

	return (
		<ZoomContext.Provider value={zoomLevel}>
			<div
				className="timeline-container"
				style={{ position: "relative" }}
			>
				<TimelineHeader
					playheadReadout={playheadReadout}
					autoFollow={autoFollow}
					hasSegments={hasSegments}
					showEditActions={!readOnly}
					undoAvailable={undoAvailable}
					redoAvailable={redoAvailable}
					onUndo={onUndo}
					onRedo={onRedo}
					onOpenShortcutHelp={onOpenShortcutHelp}
				/>

					{/* 세그먼트 탭 바 — 항상 표시 (세그먼트 없으면 "전체" 탭만) */}
				{/* ■ Why 항상 표시? 수동 섹션 추가 시에도 세그먼트 탭이 활성화되어야 하고,
				     세그먼트가 없어도 "전체" 탭이 기본으로 존재해야 운영자에게 일관된 UX 제공. */}
				<SegmentTabBar
					segments={segments}
					activeTab={activeSegmentTab}
					onTabChange={readOnly ? () => undefined : setActiveSegmentTab}
					onTabClick={(segmentId) => {
						if (readOnly) return;
						if (!segmentId) {
							// "전체" 탭 클릭 → playhead를 position 0으로
							setPlayheadPosition(0);
						} else {
							// 세그먼트 탭 클릭 → 해당 세그먼트 첫 블록으로 playhead 이동
							const segBlocks = blocks
								.filter((b) => b.segmentId === segmentId)
								.sort((a, b) => a.startPosition - b.startPosition);
							if (segBlocks.length > 0) {
								setPlayheadPosition(segBlocks[0].startPosition);
							}
						}
					}}
					blocks={blocks}
					completedBlockIds={completedBlockIds}
					pgmBlockIds={new Set(pgmBlockIds.values())}
					skippedBlockIds={skippedBlockIds}
					onReorderSegments={readOnly ? undefined : reorderBlocksBySegments}
					readOnly={readOnly}
				/>

				{/* 갤러리 + 트랙 영역 — 이 영역만 수직 스크롤 가능 */}
				<div style={{ display: "flex", flex: 1, overflow: "hidden", overflowY: "auto", position: "relative" }}>
					{/* 로고 갤러리 사이드바 (접이식) */}
					{!readOnly && <LogoGallery isOpen={galleryOpen} onToggle={() => setGalleryOpen(false)} />}
					{!readOnly && !galleryOpen && <LogoGalleryToggle onClick={() => setGalleryOpen(true)} />}

					{/* 트랙 영역 */}
					<div
						ref={tracksRef}
						style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "auto", overflowY: "hidden" }}
						className="timeline-scroll-area"
					>
						<div className="timeline-tracks" style={{ position: "relative", minWidth: `${trackContentWidth + TRACK_HEADER_WIDTH}px` }}>
							{/* 세그먼트 배경 밴드 — 항상 렌더링, 비활성 밴드는 딤 오버레이 */}
							{segmentBands.map((band) => {
								const isActiveBand = activeSegmentTab === band.id;
								const hasActiveTab = activeSegmentTab !== null;
								return (
									<div
										key={band.id}
										className={`segment-band ${isActiveBand ? "segment-band--active" : ""}`}
										style={{
											position: "absolute",
											left: `${band.startPx * zoomLevel + TRACK_HEADER_WIDTH}px`,
											width: `${(band.endPx - band.startPx) * zoomLevel}px`,
											top: 0,
											bottom: 0,
											background: isActiveBand
												? band.color.replace("0.12", "0.18")
												: band.color,
											borderLeft: `2px solid ${band.color.replace("0.12", isActiveBand ? "0.5" : "0.35")}`,
											borderRight: `2px solid ${band.color.replace("0.12", isActiveBand ? "0.5" : "0.35")}`,
											pointerEvents: "none",
											zIndex: 0,
											transition: "background 0.3s, border-color 0.3s",
										}}
									>
										{/* 세그먼트 라벨 (상단) */}
										<span
											style={{
												position: "absolute",
												top: "2px",
												left: "4px",
												fontSize: "0.5625rem",
												fontWeight: 600,
												color: band.color.replace("0.12", isActiveBand ? "0.9" : "0.7"),
												whiteSpace: "nowrap",
												pointerEvents: "none",
												transition: "color 0.3s",
											}}
										>
											{isActiveBand ? "▶ " : ""}{band.label}
										</span>
										{/* 비활성 세그먼트 딤 오버레이 */}
										{hasActiveTab && !isActiveBand && (
											<div
												className="segment-dim-overlay"
												style={{
													position: "absolute",
													inset: 0,
													background: "rgba(0, 0, 0, 0.45)",
													pointerEvents: "none",
													transition: "opacity 0.3s",
													borderRadius: "2px",
												}}
											/>
										)}
									</div>
								);
							})}

							{tracks.map((track) => (
								<TrackRow
									key={track.id}
									track={track}
									blocks={getBlocksForTrack(track.id)}
									selectedBlockId={selectedBlockId}
									deleteAttemptBlockId={deleteAttemptBlockId}
									selectedGap={selectedGap}
									overlappingDuringDrag={overlappingDuringDrag}
									setOverlappingDuringDrag={setOverlappingDuringDrag}
									onTrackClick={handleTrackClick}
									completedBlockIds={completedBlockIds}
									maxBlockEnd={maxBlockEnd}
									onBlockDoubleClick={handleBlockDoubleClick}
									activeSegmentTab={activeSegmentTab}
									readOnly={readOnly}
								/>
							))}


							<Playhead position={playheadPosition} color={myColor} isScrubbing={isScrubbing} />
							{/* 원격 플레이헤드 (다른 사용자) */}
							{remotePlayheads.map((remote) => (
								<RemotePlayhead
									key={remote.userId}
									position={remote.position}
									color={remote.color}
									displayName={remote.displayName}
									isScrubbing={remote.isScrubbing}
								/>
							))}

							<LastBroadcastLine position={lastBroadcastPosition} />

							{/* 다음 세그먼트 힌트 — 세그먼트 탭에서만 표시 */}
							{nextSegmentInfo && (
								<div
									className={`next-segment-hint${softPromptActive ? " next-segment-hint--pulse" : ""}`}
									onClick={() => {
										if (readOnly) return;
										// 다음 세그먼트 첫 블록으로 playhead 이동 → 자동 탭 활성화
										const nextSegBlocks = blocks
											.filter((b) => b.segmentId === nextSegmentInfo.nextSeg.id)
											.sort((a, b) => a.startPosition - b.startPosition);
										if (nextSegBlocks.length > 0) {
											setPlayheadPosition(nextSegBlocks[0].startPosition);
										}
										setSoftPromptActive(false);
									}}
									style={{
										position: "absolute",
										left: `${nextSegmentInfo.segEndPx * zoomLevel + TRACK_HEADER_WIDTH}px`,
										top: 0,
										bottom: 0,
										width: "140px",
										background: `linear-gradient(to right, ${nextSegmentInfo.nextSeg.color.replace("0.12", softPromptActive ? "0.45" : "0.25")}, transparent)`,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										cursor: readOnly ? "default" : "pointer",
										zIndex: 3,
										transition: "opacity 0.2s, background 0.3s",
										opacity: softPromptActive ? 1 : 0.8,
									}}
									onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
									onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = softPromptActive ? "1" : "0.8"; }}
									title={`다음: ${nextSegmentInfo.nextSeg.label}${softPromptActive ? " (클릭하여 전환)" : ""}`}
								>
									<span
										style={{
											fontSize: softPromptActive ? "0.75rem" : "0.6875rem",
											fontWeight: 600,
											color: softPromptActive ? "var(--accent-primary)" : "var(--text-secondary)",
											whiteSpace: "nowrap",
											display: "flex",
											alignItems: "center",
											gap: "4px",
										}}
									>
										{softPromptActive ? "▶ " : ""}{nextSegmentInfo.nextSeg.label} →
									</span>
								</div>
							)}
						</div>

						<ZoomControls
							zoomLevel={zoomLevel}
							onZoomIn={handleZoomIn}
							onZoomOut={handleZoomOut}
							onZoomReset={handleZoomReset}
						/>
						<AddTrackButton />
					</div>
				</div>
			</div>
		</ZoomContext.Provider>
	);
}

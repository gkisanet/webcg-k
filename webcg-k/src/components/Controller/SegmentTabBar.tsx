/**
 * SegmentTabBar — Premiere 스타일 Nested Sequence 탭 바
 *
 * ■ Why 탭 바?
 *   Dual-Panel(안 C)은 화면을 좌/우로 분할하여 타임라인 공간을 잃는다.
 *   Premiere의 시퀀스 탭 패턴은 30px 탭 바만 추가하면서
 *   각 세그먼트를 독립 뷰로 전환할 수 있어 공간 효율이 극대화된다.
 *
 * ■ 표시 정보 (방송 운용에 필요한 핵심 메타데이터)
 *   - 순번: NRCS item_order 기반 원번호 ❶❷❸
 *   - 제목: 뉴스 아이템 Slug (12자 초과 시 줄임)
 *   - 기자명: 부제
 *   - CG 수: 배지
 *   - 진행 상태: ✅완료 / 🟡PGM중 / ○대기
 */

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Segment } from "../../lib/types/segment";
import type { GraphicBlock } from "../../stores/timelineStore";
import "./segment-tab-bar.css";

// ─── 원형 번호 유틸 ──────────────────────────────────────────────
const CIRCLED_NUMBERS = ["⓪","❶","❷","❸","❹","❺","❻","❼","❽","❾","❿"];
function getCircledNumber(n: number): string {
	return n < CIRCLED_NUMBERS.length ? CIRCLED_NUMBERS[n] : `(${n})`;
}

// ─── 진행 상태 도트 ──────────────────────────────────────────────
function ProgressDots({
	blocks,
	completedBlockIds,
	pgmBlockIds,
	skippedBlockIds,
}: {
	blocks: GraphicBlock[];
	completedBlockIds: Set<string>;
	pgmBlockIds: Set<string>;
	skippedBlockIds: Set<string>;
}) {
	if (blocks.length === 0) return <span className="seg-tab-status">—</span>;
	return (
		<span className="seg-tab-status">
			{blocks.map((b) => {
				if (completedBlockIds.has(b.id)) return <span key={b.id} className="dot done">✓</span>;
				if (pgmBlockIds.has(b.id)) return <span key={b.id} className="dot onair">●</span>;
				if (skippedBlockIds.has(b.id)) return <span key={b.id} className="dot skipped">▲</span>;
				return <span key={b.id} className="dot idle">○</span>;
			})}
		</span>
	);
}

// ─── SegmentTabBar ──────────────────────────────────────────────

interface SegmentTabBarProps {
	segments: Segment[];
	activeTab: string | null;
	onTabChange: (segmentId: string | null) => void;
	/** 탭 클릭 시 playhead를 해당 세그먼트로 이동 */
	onTabClick?: (segmentId: string | null) => void;
	blocks: GraphicBlock[];
	completedBlockIds: Set<string>;
	pgmBlockIds: Set<string>;
	skippedBlockIds: Set<string>;
	onReorderSegments?: (reordered: Segment[]) => void;
	readOnly?: boolean;
}

export function SegmentTabBar({
	segments,
	activeTab,
	onTabChange,
	onTabClick,
	blocks,
	completedBlockIds,
	pgmBlockIds,
	skippedBlockIds,
	onReorderSegments,
	readOnly = false,
}: SegmentTabBarProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// ─── 드래그 상태 ────────────────────────────────────────────
	const [dragId, setDragId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [dragSide, setDragSide] = useState<"left" | "right" | null>(null);

	// 정렬된 세그먼트 (order 기준)
	const sorted = useMemo(
		() => [...segments].sort((a, b) => a.order - b.order),
		[segments],
	);

	// 활성 탭이 변경되면 해당 탭이 보이도록 스크롤
	useEffect(() => {
		if (!scrollRef.current || !activeTab) return;
		const el = scrollRef.current.querySelector(`[data-seg-id="${activeTab}"]`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
		}
	}, [activeTab]);

	// 현재 PGM 블록이 속한 세그먼트 ID (onair 탭 표시용)
	const onairSegmentId = useMemo(() => {
		if (pgmBlockIds.size === 0) return null;
		// 모든 활성 PGM 블록 중 세그먼트에 속한 첫 블록의 segmentId
		for (const bid of pgmBlockIds) {
			const block = blocks.find((b) => b.id === bid);
			if (block?.segmentId) return block.segmentId;
		}
		return null;
	}, [pgmBlockIds, blocks]);

	const scrollLeft = () => {
		scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
	};
	const scrollRight = () => {
		scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });
	};

	// ─── 드래그 앤 드롭 핸들러 ─────────────────────────────────
	const handleDragStart = useCallback((e: React.DragEvent, segId: string) => {
		if (readOnly) {
			e.preventDefault();
			return;
		}
		setDragId(segId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", segId);
	}, [readOnly]);

	const handleDragOver = useCallback((e: React.DragEvent, segId: string) => {
		if (readOnly) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (segId === dragId) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		setDragOverId(segId);
		setDragSide(e.clientX < midX ? "left" : "right");
	}, [dragId, readOnly]);

	const handleDragLeave = useCallback(() => {
		setDragOverId(null);
		setDragSide(null);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent, targetSegId: string) => {
		if (readOnly) return;
		e.preventDefault();
		const sourceId = e.dataTransfer.getData("text/plain");
		if (!sourceId || sourceId === targetSegId || !onReorderSegments) {
			setDragId(null); setDragOverId(null); setDragSide(null);
			return;
		}
		const srcIdx = sorted.findIndex((s) => s.id === sourceId);
		const tgtIdx = sorted.findIndex((s) => s.id === targetSegId);
		if (srcIdx === -1 || tgtIdx === -1) return;

		const reordered = sorted.filter((s) => s.id !== sourceId);
		const insertAt = reordered.findIndex((s) => s.id === targetSegId);
		reordered.splice(dragSide === "right" ? insertAt + 1 : insertAt, 0, sorted[srcIdx]);
		onReorderSegments(reordered.map((s, i) => ({ ...s, order: i })));

		setDragId(null); setDragOverId(null); setDragSide(null);
	}, [sorted, dragSide, onReorderSegments, readOnly]);

	const handleDragEnd = useCallback(() => {
		setDragId(null); setDragOverId(null); setDragSide(null);
	}, []);

	return (
		<div className="segment-tab-bar">
			{/* 좌측 스크롤 화살표 */}
			<button type="button" className="seg-scroll-btn" onClick={scrollLeft} title="이전 세그먼트">
				<ChevronLeft size={14} />
			</button>

			{/* 탭 스크롤 영역 */}
			<div ref={scrollRef} className="seg-tab-scroll">
				{/* "전체" 탭 */}
				<button
					type="button"
					className={`seg-tab ${activeTab === null ? "active" : ""}`}
					onClick={() => {
						if (readOnly) return;
						onTabClick ? onTabClick(null) : onTabChange(null);
					}}
				>
					<div className="seg-tab-row1">
						<span className="seg-tab-order">●</span>
						<span className="seg-tab-label">전체</span>
						<span className="seg-cg-count">{blocks.length}</span>
					</div>
				</button>

				{/* 세그먼트 탭들 */}
				{sorted.map((seg) => {
					const segBlocks = blocks.filter((b) => b.segmentId === seg.id);
					const isActive = activeTab === seg.id;
					const isOnair = onairSegmentId === seg.id;
					const allDone = segBlocks.length > 0 && segBlocks.every((b) => completedBlockIds.has(b.id));
					const isDragging = dragId === seg.id;
					const isOverLeft = dragOverId === seg.id && dragSide === "left";
					const isOverRight = dragOverId === seg.id && dragSide === "right";

					return (
						<button
							key={seg.id}
							type="button"
							data-seg-id={seg.id}
							draggable={!readOnly}
							className={[
								"seg-tab",
								isActive && "active",
								isOnair && "onair",
								allDone && "done",
								isDragging && "dragging",
								isOverLeft && "drag-over-left",
								isOverRight && "drag-over-right",
							].filter(Boolean).join(" ")}
							onClick={() => {
								if (readOnly) return;
								onTabClick ? onTabClick(seg.id) : onTabChange(seg.id);
							}}
							onDragStart={(e) => handleDragStart(e, seg.id)}
							onDragOver={(e) => handleDragOver(e, seg.id)}
							onDragLeave={handleDragLeave}
							onDrop={(e) => handleDrop(e, seg.id)}
							onDragEnd={handleDragEnd}
							style={isActive ? { borderColor: seg.color.replace("0.12", "0.6") } : undefined}
						>
							<div className="seg-tab-row1">
								<span className="seg-tab-order">{getCircledNumber(seg.order)}</span>
								<span className="seg-tab-label" title={seg.label}>
									{seg.label.length > 10 ? `${seg.label.slice(0, 10)}…` : seg.label}
								</span>
								<span className="seg-cg-count">{segBlocks.length}</span>
							</div>
							<div className="seg-tab-row2">
								{seg.reporter && (
									<span className="seg-tab-reporter">{seg.reporter}</span>
								)}
								<ProgressDots
									blocks={segBlocks}
									completedBlockIds={completedBlockIds}
									pgmBlockIds={pgmBlockIds}
									skippedBlockIds={skippedBlockIds}
								/>
							</div>
						</button>
					);
				})}
			</div>

			{/* 우측 스크롤 화살표 */}
			<button type="button" className="seg-scroll-btn" onClick={scrollRight} title="다음 세그먼트">
				<ChevronRight size={14} />
			</button>
		</div>
	);
}

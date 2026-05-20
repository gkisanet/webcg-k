/**
 * Timeline Store
 * 타임라인 상태 관리 (TanStack Store)
 *
 * ■ Segment 확장 (2026-04-16)
 *   NLE 타임라인에 방송 큐시트 세그먼트 개념을 접목.
 *   Premiere의 Nested Sequence 탭 패턴을 차용하여
 *   NRCS 연동 시 뉴스 아이템별 탭 전환을 지원.
 */

import { Store } from "@tanstack/store";
import type { Segment } from "../lib/types/segment";

// 트랜지션 타입
export type TransitionType = "cut" | "fade";

/**
 * Auto-follow 3단계 모드
 * ■ Why 3단계?
 *   외부 비판(WEBCGK_COMPREHENSIVE_GUIDE §10.3) 수용:
 *   "탭이 자동 전환되면 운영자가 맥락을 잃는다"
 *   → Soft-prompt(기본값)로 운영자 통제권을 유지하면서 보조 기능만 제공.
 *
 *   비유: 자동차의 차선 유지 보조
 *   - OFF: 보조 없음 (수동 운전)
 *   - Soft-prompt: 차선 이탈 시 경고등만 (핸들은 운전자가)
 *   - Auto-switch: 차선 자동 복귀 (완전 자동)
 */
export type AutoFollowMode = "off" | "soft" | "auto";

// 텍스트 위치 타입
export type TextPosition = "north" | "south" | "east" | "west" | "center";

// 그래픽 블록 타입
export interface GraphicBlock {
	id: string;
	name: string;
	trackId: number;
	startPosition: number; // 픽셀 단위
	width: number; // 픽셀 단위
	color?: string;
	htmlContent?: string;
	transitionIn: TransitionType;
	transitionOut: TransitionType;
	textPosition?: TextPosition;
	// 그래픽 소스 정보 (세션 데이터에서 로드)
	sourceType?: "image" | "graphic" | "template" | "overlay" | "whiteboard";
	sourceId?: string;
	sourceData?: any;
	// ─── 역추적 필드 (핫 수정 / NRCS 변경 알림용) ───
	// ■ Why? 타임라인 블록에서 원본 큐시트 아이템/번들 슬롯으로 되돌아가야
	//   방송 중 텍스트 수정 + NRCS 변경 Diff 비교가 가능하다.
	cuesheetItemId?: string;  // 원본 큐시트 아이템 ID (nrcs_cuesheet_items.id)
	bundleSlotId?: string;    // 번들 슬롯 ID (bundles.slots[].id)
	// ─── 세그먼트 소속 (Nested Sequence Tab 모델) ───
	// ■ Why? 여러 트랙에 걸친 CG 블록들을 뉴스 아이템 단위로 묶어
	//   NRCS 순서 변경 시 세그먼트 단위로 재배치할 수 있게 한다.
	segmentId?: string;       // 소속 세그먼트 ID (broadcast_segments.id)
}

// 트랙 타입
export interface Track {
	id: number;
	name: string;
	type: "background" | "subtitle" | "urgent" | "logo";
	isLogoTrack?: boolean; // 로고 전용 트랙 플래그
}

// 타임라인 상태
export interface TimelineState {
	// 트랙 목록
	tracks: Track[];
	// 그래픽 블록 목록
	blocks: GraphicBlock[];
	// Playhead 위치 (픽셀)
	playheadPosition: number;
	// 현재 Preview에 표시 중인 블록 ID
	previewBlockId: string | null;
	// 현재 PGM에 송출 중인 블록 ID (트랙별 독립)
	// ■ Why Map? 멀티트랙 동시 송출: Track 1(배경)은 유지하면서 Track 2(자막)만 교체.
	pgmBlockIds: Map<number, string>;
	// 마지막 송출 지점 (↑ 키로 복귀)
	lastBroadcastPosition: number;
	// 선택된 블록 ID
	selectedBlockId: string | null;
	// 선택된 갭 정보 (리플 삭제용)
	selectedGap: {
		trackId: number;
		startPosition: number;
		endPosition: number;
	} | null;
	// 스냅 임계값 (픽셀)
	snapThreshold: number;
	// 기본 블록 너비 (트랙 수에 따라 동적 계산)
	baseBlockWidth: number;
	// Fade 애니메이션 지속 시간 (ms)
	fadeDuration: number;
	// 삭제 시도 피드백용 블록 ID (삭제 불가 블록)
	deleteAttemptBlockId: string | null;
	// 송출 라이프사이클 완료된 블록 ID 집합 (PGM→STOP 완료 시 회색 전환)
	completedBlockIds: Set<string>;
	// PGM에 한 번이라도 올라간 블록 ID 집합 (스킵 감지용)
	airedBlockIds: Set<string>;
	// 스킵된 블록 ID 집합 (나타남 없이 건너뛰어진 블록)
	skippedBlockIds: Set<string>;
	// ─── 세그먼트 (Nested Sequence Tab) ───
	/** 세그먼트 목록 (NRCS 연동 시 자동 생성, 미연동 시 빈 배열) */
	segments: Segment[];
	/** 현재 활성 세그먼트 탭 ID (null = "전체" 탭) */
	activeSegmentTab: string | null;
	/**
	 * Auto-follow 모드 (3단계)
	 * - "off": 아무 동작 없음
	 * - "soft": 탭 전환 없이 NextSegmentHint 강조 펄스 + Preview 자동 장전 (기본값)
	 * - "auto": 마지막 CG 완료 0.5초 후 다음 탭 자동 전환 + Zoom-to-Fit
	 */
	autoFollow: AutoFollowMode;
		// ─── 멀티유저 스크러빙 ───
		/** 사용자가 개인 PVW 탐색(스크러빙) 중인지 여부 */
		isScrubbing: boolean;
}

// 초기 샘플 데이터 (그리드 정규화: 50px 단위)
// 기본 블록 너비 = 150px (스냅 단위 50px * 3 = 내부 스냅 2개)
const initialState: TimelineState = {
	tracks: [
		{ id: 0, name: "Logo", type: "logo", isLogoTrack: true },
		{ id: 1, name: "Track 1 [배경]", type: "background" },
		{ id: 2, name: "Track 2 [자막]", type: "subtitle" },
		{ id: 3, name: "Track 3 [긴급]", type: "urgent" },
	],
	blocks: [
		{
			id: "block-1",
			name: "채널 로고",
			trackId: 1,
			startPosition: 50,
			width: 500, // 10 스냅 단위
			color: "rgba(59, 130, 246, 0.7)",
			transitionIn: "fade",
			transitionOut: "fade",
			textPosition: "north",
		},
		{
			id: "block-2",
			name: "뉴스 자막 1",
			trackId: 2,
			startPosition: 100,
			width: 200,
			color: "rgba(16, 185, 129, 0.7)",
			transitionIn: "fade",
			transitionOut: "cut",
			textPosition: "south",
		},
		{
			id: "block-3",
			name: "뉴스 자막 2",
			trackId: 2,
			startPosition: 350,
			width: 200,
			color: "rgba(16, 185, 129, 0.7)",
			transitionIn: "cut",
			transitionOut: "cut",
			textPosition: "south",
		},
		{
			id: "block-4",
			name: "뉴스 자막 3",
			trackId: 2,
			startPosition: 600,
			width: 200,
			color: "rgba(16, 185, 129, 0.7)",
			transitionIn: "cut",
			transitionOut: "fade",
			textPosition: "south",
		},
		{
			id: "block-5",
			name: "속보 배너",
			trackId: 3,
			startPosition: 450,
			width: 250,
			color: "rgba(239, 68, 68, 0.7)",
			transitionIn: "fade",
			transitionOut: "fade",
			textPosition: "north",
		},
	],
	playheadPosition: 0,
	previewBlockId: null,
	pgmBlockIds: new Map<number, string>(),
	lastBroadcastPosition: 0,
	selectedBlockId: null,
	selectedGap: null,
	snapThreshold: 10,
	baseBlockWidth: 150,
	fadeDuration: 800,
	deleteAttemptBlockId: null,
	completedBlockIds: new Set<string>(),
	airedBlockIds: new Set<string>(),
	skippedBlockIds: new Set<string>(),
	// 세그먼트 초기값 (NRCS 미연동 = 빈 배열 → 탭 바 숨김)
	segments: [],
	activeSegmentTab: null,
	autoFollow: "soft",  // 기본값: Soft-prompt (운영자 통제권 유지)
		isScrubbing: false,
};

// 타임라인 스토어 생성
export const timelineStore = new Store<TimelineState>(initialState);

/**
 * 블록 경계점(시작/끝) 목록 가져오기
 * Playhead 스냅에 사용
 */
export function getBlockEdges(state: TimelineState): number[] {
	const edges: Set<number> = new Set([0]); // 시작점 포함

	for (const block of state.blocks) {
		edges.add(block.startPosition);
		edges.add(block.startPosition + block.width);
	}

	return Array.from(edges).sort((a, b) => a - b);
}

/**
 * 가장 가까운 스냅 포인트 찾기
 */
export function findNearestSnapPoint(
	position: number,
	edges: number[],
	threshold: number,
): number {
	for (const edge of edges) {
		if (Math.abs(position - edge) <= threshold) {
			return edge;
		}
	}
	return position;
}

/**
 * 현재 Playhead 위치의 블록 찾기 (가장 위 트랙 우선)
 */
export function getBlockAtPosition(
	state: TimelineState,
	position: number,
): GraphicBlock | null {
	// 트랙 ID가 높을수록 위에 있음 (Z-index 높음)
	const sortedBlocks = [...state.blocks].sort((a, b) => b.trackId - a.trackId);

	for (const block of sortedBlocks) {
		const start = block.startPosition;
		const end = block.startPosition + block.width;
		if (position >= start && position < end) {
			return block;
		}
	}

	return null;
}

/**
 * 다음 블록 경계로 이동 (→ 키)
 */
export function moveToNextEdge(): void {
	timelineStore.setState((state) => {
		const edges = getBlockEdges(state);
		const currentPos = state.playheadPosition;

		// 현재 위치보다 큰 첫 번째 경계 찾기
		const nextEdge = edges.find((edge) => edge > currentPos);
		const newPosition = nextEdge ?? edges[edges.length - 1];

		// Preview 블록 업데이트
		const previewBlock = getBlockAtPosition(
			{ ...state, playheadPosition: newPosition },
			newPosition,
		);

		return {
			...state,
			playheadPosition: newPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * 이전 블록 경계로 이동 (← 키)
 */
export function moveToPrevEdge(): void {
	timelineStore.setState((state) => {
		const edges = getBlockEdges(state);
		const currentPos = state.playheadPosition;

		// 현재 위치보다 작은 마지막 경계 찾기
		const prevEdges = edges.filter((edge) => edge < currentPos);
		const newPosition =
			prevEdges.length > 0 ? prevEdges[prevEdges.length - 1] : edges[0];

		// Preview 블록 업데이트
		const previewBlock = getBlockAtPosition(
			{ ...state, playheadPosition: newPosition },
			newPosition,
		);

		return {
			...state,
			playheadPosition: newPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * 타임라인 맨 처음으로 이동 (Ctrl+← 키)
 * 플레이헤드를 position 0으로 이동
 */
export function moveToStart(): void {
	timelineStore.setState((state) => {
		const newPosition = 0;
		const previewBlock = getBlockAtPosition(
			{ ...state, playheadPosition: newPosition },
			newPosition,
		);

		return {
			...state,
			playheadPosition: newPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * 타임라인 맨 끝으로 이동 (Ctrl+→ 키)
 * 플레이헤드를 마지막 블록의 끝 경계로 이동
 */
export function moveToEnd(): void {
	timelineStore.setState((state) => {
		const edges = getBlockEdges(state);
		const newPosition = edges.length > 0 ? edges[edges.length - 1] : 0;
		const previewBlock = getBlockAtPosition(
			{ ...state, playheadPosition: newPosition },
			newPosition,
		);

		return {
			...state,
			playheadPosition: newPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * Preview → PGM 송출 (Space 키) — 멀티트랙 위치 기반 상태 재구성
 *
 * ■ Why 위치 기반?
 *   비유: NLE 타임라인의 "어느 지점에서든 Play" — 특정 시점의 모든
 *   활성 그래픽이 동시에 PGM에 올라가야 한다. 단일 트랙만 활성화하는
 *   기존 방식은 Track 1(배경) + Track 2(자막) 동시 송출을 보장하지 못한다.
 *
 *   1. 현재 playhead 위치에 걸쳐있는 **모든** 트랙의 블록을 찾는다.
 *   2. 해당 블록들을 일괄 PGM 등록 (트랙별 독립 슬롯).
 *   3. 범위가 끝난 트랙의 이전 PGM은 completed로 전환.
 *   4. 동일 트랙의 동일 블록이면 변화 없음 (중복 송출 방지).
 */
export function broadcastToPGM(): void {
	timelineStore.setState((state) => {
		const position = state.playheadPosition;
		const newCompleted = new Set(state.completedBlockIds);
		const newAired = new Set(state.airedBlockIds);
		const newPgmBlockIds = new Map(state.pgmBlockIds);

		// 현재 playhead 위치에 포함되는 **모든** 블록 찾기
		const activeBlocks = state.blocks.filter((block) => {
			const start = block.startPosition;
			const end = block.startPosition + block.width;
			return position >= start && position < end;
		});

		// 블록이 하나도 없으면 모든 PGM 소거
		if (activeBlocks.length === 0) {
			if (newPgmBlockIds.size === 0) return state;
			for (const [, blockId] of newPgmBlockIds) {
				newCompleted.add(blockId);
			}
			return {
				...state,
				pgmBlockIds: new Map(),
				lastBroadcastPosition: position,
				completedBlockIds: newCompleted,
				airedBlockIds: newAired,
			};
		}

		// 모든 활성 블록을 트랙별로 PGM 등록
		for (const block of activeBlocks) {
			const trackId = block.trackId;
			const prevPgmId = newPgmBlockIds.get(trackId);

			// 같은 블록이면 건너뜀 (중복 송출 방지)
			if (prevPgmId === block.id) continue;

			// 이전 PGM을 completed로 전환
			if (prevPgmId) {
				newCompleted.add(prevPgmId);
			}

			newPgmBlockIds.set(trackId, block.id);
			newAired.add(block.id);
			newCompleted.delete(block.id);
		}

		// 범위가 끝난 트랙의 PGM 정리
		// (현재 위치에 더 이상 블록이 없는 트랙의 PGM을 completed로)
		for (const [trackId, blockId] of newPgmBlockIds) {
			const stillActive = activeBlocks.some((b) => b.trackId === trackId);
			if (!stillActive) {
				newCompleted.add(blockId);
				newPgmBlockIds.delete(trackId);
			}
		}

		return {
			...state,
			pgmBlockIds: newPgmBlockIds,
			lastBroadcastPosition: position,
			completedBlockIds: newCompleted,
			airedBlockIds: newAired,
		};
	});
}

/**
 * 송출 완료/스킵 상태 전체 초기화
 * 모든 회색/스킵 블록 원복
 */
export function resetCompletedBlocks(): void {
	timelineStore.setState((state) => ({
		...state,
		completedBlockIds: new Set<string>(),
		airedBlockIds: new Set<string>(),
		skippedBlockIds: new Set<string>(),
	}));
}

/**
 * 마지막 송출 지점으로 복귀 (↑ 키)
 */
export function returnToLastBroadcast(): void {
	timelineStore.setState((state) => {
		const newPosition = state.lastBroadcastPosition;
		const previewBlock = getBlockAtPosition(state, newPosition);

		return {
			...state,
			playheadPosition: newPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * 블록 선택
 */
export function selectBlock(blockId: string | null): void {
	timelineStore.setState((state) => ({
		...state,
		selectedBlockId: blockId,
	}));
}

/**
 * 블록 sourceData 핫 업데이트 (방송 중 텍스트 수정용)
 * ■ Why 옵션 B (큐시트/런다운 우회)?
 *   onair 상태에서 propagateToRundown()은 차단됨.
 *   타임라인 블록의 인메모리 sourceData만 직접 교체하면
 *   DB 트랜잭션 없이 즉시 렌더러 반영이 가능하다.
 *   방송 종료 후 큐시트에 역동기화하는 것은 별도 처리.
 *
 * @returns 변경 대상이 현재 PGM 블록인지 여부 (렌더러 재발행 판단용)
 */
export function updateBlockSourceData(
	blockId: string,
	newSourceData: any,
	newName?: string,
): boolean {
	let isPgmBlock = false;

	timelineStore.setState((state) => {
		// 블록을 먼저 찾아 trackId를 얻고, pgmBlockIds에서 해당 트랙의 PGM인지 확인
		isPgmBlock = [...state.pgmBlockIds.values()].includes(blockId);
		return {
			...state,
			blocks: state.blocks.map((b) =>
				b.id === blockId
					? {
							...b,
							sourceData: newSourceData,
							...(newName ? { name: newName } : {}),
						}
					: b,
			),
		};
	});

	return isPgmBlock;
}

/**
 * Fade 애니메이션 지속 시간 설정
 */
export function setFadeDuration(duration: number): void {
	timelineStore.setState((state) => ({
		...state,
		fadeDuration: Math.max(100, Math.min(3000, duration)), // 100ms ~ 3000ms
	}));
}

/**
 * Playhead 위치 직접 설정
 */
export function setPlayheadPosition(position: number): void {
	timelineStore.setState((state) => {
		const edges = getBlockEdges(state);
		const snappedPosition = findNearestSnapPoint(
			position,
			edges,
			state.snapThreshold,
		);

		const previewBlock = getBlockAtPosition(state, snappedPosition);

		return {
			...state,
			playheadPosition: snappedPosition,
			previewBlockId: previewBlock?.id ?? null,
		};
	});
}

/**
 * 트랙 추가
 */
export function addTrack(): void {
	timelineStore.setState((state) => {
		const newTrackId = state.tracks.length + 1;
		const newTrack: Track = {
			id: newTrackId,
			name: `Track ${newTrackId}`,
			type: "subtitle",
		};

		return {
			...state,
			tracks: [...state.tracks, newTrack],
		};
	});
}

/**
 * 트랙 수에 따른 블록 내부 스냅 포인트 개수
 * 트랙 2개 = 1개, 3개 = 2개, 4개 = 3개...
 */
export function getInnerSnapPointCount(trackCount: number): number {
	return Math.max(0, trackCount - 1);
}

/**
 * 블록 내부의 스냅 포인트 위치 계산
 * 블록을 (트랙 수)등분하여 경계선 위치 반환
 */
export function getBlockInnerSnapPoints(
	block: GraphicBlock,
	trackCount: number,
): number[] {
	const snapCount = getInnerSnapPointCount(trackCount);
	if (snapCount === 0) return [];

	const segmentWidth = block.width / trackCount;
	const snapPoints: number[] = [];

	for (let i = 1; i <= snapCount; i++) {
		snapPoints.push(block.startPosition + segmentWidth * i);
	}

	return snapPoints;
}

/**
 * 트랙 수에 따른 블록 너비 계산 (반응형)
 * 트랙이 늘어나면 블록 너비도 늘어남
 */
export function calculateBlockWidth(
	baseWidth: number,
	trackCount: number,
): number {
	// 트랙 3개 기준으로 정규화, 트랙이 늘어나면 블록도 넓어짐
	return baseWidth * (trackCount / 3);
}

/**
 * 블록 트랜지션 설정
 */
export function setBlockTransition(
	blockId: string,
	side: "in" | "out",
	type: TransitionType,
): void {
	timelineStore.setState((state) => ({
		...state,
		blocks: state.blocks.map((b) =>
			b.id === blockId
				? side === "in"
					? { ...b, transitionIn: type }
					: { ...b, transitionOut: type }
				: b,
		),
	}));
}

/**
 * 블록 트랜지션 토글 (cut ↔ fade)
 */
export function toggleBlockTransition(
	blockId: string,
	side: "in" | "out",
): void {
	timelineStore.setState((state) => {
		const block = state.blocks.find((b) => b.id === blockId);
		if (!block) return state;

		const currentType =
			side === "in" ? block.transitionIn : block.transitionOut;
		const newType: TransitionType = currentType === "fade" ? "cut" : "fade";

		return {
			...state,
			blocks: state.blocks.map((b) =>
				b.id === blockId
					? side === "in"
						? { ...b, transitionIn: newType }
						: { ...b, transitionOut: newType }
					: b,
			),
		};
	});
}

// 클립보드 저장용 변수 (모듈 스코프)
let clipboardBlock: GraphicBlock | null = null;

/**
 * 선택된 블록 복사 (Ctrl+C)
 */
export function copySelectedBlock(): boolean {
	const state = timelineStore.state;
	const selectedBlock = state.blocks.find((b) => b.id === state.selectedBlockId);
	
	if (selectedBlock) {
		clipboardBlock = { ...selectedBlock };
		console.log("Block copied:", selectedBlock.name);
		return true;
	}
	return false;
}

/**
 * 블록 붙여넣기 (Ctrl+V)
 * - 같은 트랙에 붙여넣기
 * - 기존 블록과 겹치지 않도록 우측에 배치
 */
export function pasteBlock(): boolean {
	if (!clipboardBlock) return false;

	const state = timelineStore.state;
	
	// 같은 트랙에서 가장 오른쪽 블록 찾기
	const sameTrackBlocks = state.blocks.filter(
		(b) => b.trackId === clipboardBlock!.trackId
	);
	
	// 새 블록의 시작 위치 계산 (가장 오른쪽 블록 끝 + 50px 간격)
	let newStartPosition = 50; // 기본 시작 위치
	if (sameTrackBlocks.length > 0) {
		const maxEnd = Math.max(
			...sameTrackBlocks.map((b) => b.startPosition + b.width)
		);
		newStartPosition = maxEnd + 50; // 50px 간격
	}

	// 새 블록 생성
	const newBlock: GraphicBlock = {
		...clipboardBlock,
		id: `block-${Date.now()}`,
		name: `${clipboardBlock.name} (복사본)`,
		startPosition: newStartPosition,
	};

	timelineStore.setState((state) => ({
		...state,
		blocks: [...state.blocks, newBlock],
		selectedBlockId: newBlock.id,
	}));

	console.log("Block pasted:", newBlock.name);
	return true;
}

/**
 * 선택된 블록을 위 트랙으로 이동 (Ctrl+↑)
 */
export function moveBlockToUpperTrack(): boolean {
	const state = timelineStore.state;
	const selectedBlock = state.blocks.find((b) => b.id === state.selectedBlockId);
	
	if (!selectedBlock) return false;

	// ■ 로고 트랙 블록은 이동 불가
	const currentTrack = state.tracks.find((t) => t.id === selectedBlock.trackId);
	if (currentTrack?.isLogoTrack) {
		console.log("[Block] 로고 트랙 블록은 이동할 수 없습니다.");
		return false;
	}

	// 현재 트랙보다 ID가 높은 트랙 찾기 (로고 트랙 제외)
	const upperTrack = state.tracks.find((t) => t.id > selectedBlock.trackId && !t.isLogoTrack);
	
	if (!upperTrack) {
		console.log("No upper track available");
		return false;
	}

	// 이동할 위치에서 겹치는 블록이 있는지 확인
	const wouldOverlap = state.blocks.some((b) => {
		if (b.id === selectedBlock.id || b.trackId !== upperTrack.id) return false;
		const bStart = b.startPosition;
		const bEnd = b.startPosition + b.width;
		const sStart = selectedBlock.startPosition;
		const sEnd = selectedBlock.startPosition + selectedBlock.width;
		return !(sEnd <= bStart || sStart >= bEnd);
	});

	if (wouldOverlap) {
		console.log("Cannot move: overlapping block in upper track");
		return false;
	}

	// 블록 이동
	timelineStore.setState((state) => ({
		...state,
		blocks: state.blocks.map((b) =>
			b.id === selectedBlock.id ? { ...b, trackId: upperTrack.id } : b
		),
	}));

	console.log("Block moved to track:", upperTrack.name);
	return true;
}

/**
 * 선택된 블록을 아래 트랙으로 이동 (Ctrl+↓)
 */
export function moveBlockToLowerTrack(): boolean {
	const state = timelineStore.state;
	const selectedBlock = state.blocks.find((b) => b.id === state.selectedBlockId);
	
	if (!selectedBlock) return false;

	// ■ 로고 트랙 블록은 이동 불가
	const currentTrack = state.tracks.find((t) => t.id === selectedBlock.trackId);
	if (currentTrack?.isLogoTrack) {
		console.log("[Block] 로고 트랙 블록은 이동할 수 없습니다.");
		return false;
	}

	// 현재 트랙보다 ID가 낮은 트랙 찾기 (로고 트랙 제외)
	const lowerTrack = [...state.tracks]
		.reverse()
		.find((t) => t.id < selectedBlock.trackId && !t.isLogoTrack);
	
	if (!lowerTrack) {
		console.log("No lower track available");
		return false;
	}

	// 이동할 위치에서 겹치는 블록이 있는지 확인
	const wouldOverlap = state.blocks.some((b) => {
		if (b.id === selectedBlock.id || b.trackId !== lowerTrack.id) return false;
		const bStart = b.startPosition;
		const bEnd = b.startPosition + b.width;
		const sStart = selectedBlock.startPosition;
		const sEnd = selectedBlock.startPosition + selectedBlock.width;
		return !(sEnd <= bStart || sStart >= bEnd);
	});

	if (wouldOverlap) {
		console.log("Cannot move: overlapping block in lower track");
		return false;
	}

	// 블록 이동
	timelineStore.setState((state) => ({
		...state,
		blocks: state.blocks.map((b) =>
			b.id === selectedBlock.id ? { ...b, trackId: lowerTrack.id } : b
		),
	}));

	console.log("Block moved to track:", lowerTrack.name);
	return true;
}

/**
 * 선택된 블록 삭제 (Delete)
 * 첫 블록(startPosition=0)은 삭제 불가 - 삭제 시도 시 피드백 제공
 */
export function deleteSelectedBlock(): boolean {
	const state = timelineStore.state;
	if (!state.selectedBlockId) return false;

	// 삭제하려는 블록 찾기
	const blockToDelete = state.blocks.find((b) => b.id === state.selectedBlockId);
	if (!blockToDelete) return false;

	// 첫 블록(startPosition=0)은 삭제 불가
	if (blockToDelete.startPosition === 0) {
		// 삭제 시도 피드백 - 잠시 후 자동 해제
		timelineStore.setState((s) => ({
			...s,
			deleteAttemptBlockId: state.selectedBlockId,
		}));
		setTimeout(() => {
			timelineStore.setState((s) => ({
				...s,
				deleteAttemptBlockId: null,
			}));
		}, 500);
		return false;
	}

	// PGM에서도 제거
	const newPgmBlockIds = new Map(timelineStore.state.pgmBlockIds);
	for (const [trackId, bid] of newPgmBlockIds) {
		if (bid === state.selectedBlockId) {
			newPgmBlockIds.delete(trackId);
		}
	}

	timelineStore.setState((state) => ({
		...state,
		blocks: state.blocks.filter((b) => b.id !== state.selectedBlockId),
		selectedBlockId: null,
		pgmBlockIds: newPgmBlockIds,
		previewBlockId: state.previewBlockId === state.selectedBlockId ? null : state.previewBlockId,
	}));

	return true;
}

/**
 * 특정 트랙의 갭을 선택 (클릭 위치 기반)
 * @param trackId 트랙 ID
 * @param clickPosition 클릭 위치 (픽셀)
 */
export function selectGapAtPosition(trackId: number, clickPosition: number): boolean {
	const state = timelineStore.state;
	
	// 해당 트랙의 블록들을 시작 위치 순으로 정렬
	const trackBlocks = state.blocks
		.filter((b) => b.trackId === trackId)
		.sort((a, b) => a.startPosition - b.startPosition);

	// 클릭 위치가 블록 위인지 확인
	for (const block of trackBlocks) {
		if (clickPosition >= block.startPosition && clickPosition < block.startPosition + block.width) {
			// 블록 위를 클릭 - 갭 선택 취소
			return false;
		}
	}

	// 갭 찾기: 클릭 위치가 어떤 갭에 있는지 확인
	for (let i = 0; i < trackBlocks.length; i++) {
		const currentBlock = trackBlocks[i];
		const currentEnd = currentBlock.startPosition + currentBlock.width;
		
		// 다음 블록이 있으면 그 블록의 시작점까지가 갭
		if (i < trackBlocks.length - 1) {
			const nextBlock = trackBlocks[i + 1];
			if (clickPosition >= currentEnd && clickPosition < nextBlock.startPosition) {
				// 갭 발견
				timelineStore.setState((state) => ({
					...state,
					selectedBlockId: null, // 블록 선택 해제
					selectedGap: {
						trackId,
						startPosition: currentEnd,
						endPosition: nextBlock.startPosition,
					},
				}));
				console.log("Gap selected:", { start: currentEnd, end: nextBlock.startPosition });
				return true;
			}
		}
	}

	// 첫 번째 블록 앞의 갭
	if (trackBlocks.length > 0 && clickPosition < trackBlocks[0].startPosition && clickPosition >= 0) {
		timelineStore.setState((state) => ({
			...state,
			selectedBlockId: null,
			selectedGap: {
				trackId,
				startPosition: 0,
				endPosition: trackBlocks[0].startPosition,
			},
		}));
		console.log("Gap selected (before first block):", { start: 0, end: trackBlocks[0].startPosition });
		return true;
	}

	return false;
}

/**
 * 선택된 갭 삭제 (Ripple Delete)
 * - 갭 삭제 후 뒤에 있는 모든 블록을 갭 크기만큼 앞으로 당김
 * - 첫 번째 gap(startPosition=0)은 삭제 불가 (타임라인 기준점 보호)
 */
export function rippleDeleteGap(): boolean {
	const state = timelineStore.state;
	if (!state.selectedGap) return false;

	const { trackId, startPosition, endPosition } = state.selectedGap;
	const gapSize = endPosition - startPosition;

	if (gapSize <= 0) return false;

	// 첫 번째 gap(startPosition=0)은 삭제 불가
	if (startPosition === 0) {
		console.log("첫 번째 gap은 삭제할 수 없습니다.");
		return false;
	}

	timelineStore.setState((state) => ({
		...state,
		blocks: state.blocks.map((block) => {
			// 같은 트랙이고 갭 뒤에 있는 블록만 이동
			if (block.trackId === trackId && block.startPosition >= endPosition) {
				return {
					...block,
					startPosition: block.startPosition - gapSize,
				};
			}
			return block;
		}),
		selectedGap: null, // 갭 선택 해제
	}));

	console.log("Ripple delete completed:", { gapSize });
	return true;
}

/**
 * 갭 선택 해제
 */
export function clearGapSelection(): void {
	timelineStore.setState((state) => ({
		...state,
		selectedGap: null,
	}));
}

// ─── 세그먼트 (Nested Sequence Tab) 액션 ──────────────────────────

/**
 * 활성 세그먼트 탭 전환
 * null = "전체 런다운" 탭
 */
export function setActiveSegmentTab(segmentId: string | null): void {
	timelineStore.setState((state) => ({
		...state,
		activeSegmentTab: segmentId,
	}));
}

/**
 * Auto-follow 3단계 사이클 토글
 * OFF → Soft-prompt → Auto-switch → OFF ...
 *
 * ■ Why 3단계 사이클?
 *   방송 중 PD가 한 손으로 빠르게 전환할 수 있도록
 *   단일 버튼 클릭으로 3개 모드를 순환한다.
 *   별도 드롭다운이나 모달은 방송 중 인지 부하를 높인다.
 */
const AUTO_FOLLOW_CYCLE: AutoFollowMode[] = ["off", "soft", "auto"];

export function cycleAutoFollow(): void {
	timelineStore.setState((state) => {
		const currentIdx = AUTO_FOLLOW_CYCLE.indexOf(state.autoFollow);
		const nextIdx = (currentIdx + 1) % AUTO_FOLLOW_CYCLE.length;
		return {
			...state,
			autoFollow: AUTO_FOLLOW_CYCLE[nextIdx],
		};
	});
}

/** 호환성을 위한 별칭 — 기존 toggleAutoFollow를 호출하는 코드 대응 */
export const toggleAutoFollow = cycleAutoFollow;

/**
 * 세그먼트 목록 설정 (세션 로드 시 또는 NRCS 동기화 시 호출)
 */
export function setSegments(segments: Segment[]): void {
	timelineStore.setState((state) => ({
		...state,
		segments,
	}));
}

/**
 * 로고 블록을 세그먼트 전체 CG 구간으로 확장 (Expand)
 *
 * ■ Why?
 *   세그먼트 탭에서 로고는 해당 뉴스 아이템의 모든 CG가
 *   송출되는 동안 표시되어야 한다. 수동으로 위치/너비를 맞추는 건
 *   반복적이고 오류 가능성이 높으므로, 단축키 한 번으로
 *   세그먼트 내 전체 블록 범위(min~max)에 자동 맞춤한다.
 *
 * @param logoBlockId 확장할 로고 블록 ID
 * @param segmentId 대상 세그먼트 ID
 */
export function expandLogoToSegment(logoBlockId: string, segmentId: string): void {
	const state = timelineStore.state;

	// 1. 이 세그먼트에 속한 모든 블록의 시작/끝 범위 계산
	const segBlocks = state.blocks.filter(
		(b) => b.segmentId === segmentId && b.id !== logoBlockId,
	);
	if (segBlocks.length === 0) return;

	const segMinStart = Math.min(...segBlocks.map((b) => b.startPosition));
	const segMaxEnd = Math.max(...segBlocks.map((b) => b.startPosition + b.width));

	// 2. 로고 블록을 해당 범위로 확장
	timelineStore.setState((s) => ({
		...s,
		blocks: s.blocks.map((b) =>
			b.id === logoBlockId
				? { ...b, startPosition: segMinStart, width: segMaxEnd - segMinStart }
				: b,
		),
	}));
}

// ─── NRCS 순서 변경 → 블록 자동 재배치 ──────────────────────────

/**
 * 세그먼트 순서에 맞게 블록의 startPosition을 자동 재계산
 *
 * ■ Why 재배치?
 *   NRCS에서 뉴스 아이템 순서를 변경하면, 세그먼트 탭 순서는 자동 반영되지만
 *   기존 블록의 절대좌표(startPosition)는 변하지 않아
 *   "탭 순서와 타임라인 블록 순서가 불일치"하는 문제가 발생한다.
 *
 * ■ 핵심 원칙
 *   1. 세그먼트 내부의 블록 간 상대 간격은 보존 (세그먼트 그룹만 이동)
 *   2. 세그먼트에 속하지 않은 블록(로고 등)은 그대로 유지
 *   3. 방송 중 PGM 블록이 이동되어도 PGM 상태는 유지 (블록 ID 기반)
 *
 * @param newSegments 새로운 순서의 세그먼트 목록
 */
export function reorderBlocksBySegments(newSegments: Segment[]): void {
	const GAP = 50; // 세그먼트 간 간격 (px)

	timelineStore.setState((state) => {
		const sorted = [...newSegments].sort((a, b) => a.order - b.order);
		const reordered: GraphicBlock[] = [];
		let cursor = GAP; // 첫 세그먼트 시작 위치

		// 1. 세그먼트 순서대로 블록 그룹을 재배치
		for (const seg of sorted) {
			// 이 세그먼트에 속한 블록을 원래 순서(startPosition) 대로 추출
			const segBlocks = state.blocks
				.filter((b) => b.segmentId === seg.id)
				.sort((a, b) => a.startPosition - b.startPosition);

			if (segBlocks.length === 0) continue;

			// 2. 세그먼트 내 상대 간격 보존하며 새 위치 계산
			//    originalStart를 기준으로 offset을 유지
			const originalStart = segBlocks[0].startPosition;

			for (const block of segBlocks) {
				const relativeOffset = block.startPosition - originalStart;
				reordered.push({
					...block,
					startPosition: cursor + relativeOffset,
				});
			}

			// 3. 다음 세그먼트 시작점 = 마지막 블록 끝 + 간격
			const lastBlock = segBlocks[segBlocks.length - 1];
			const lastRelativeEnd = (lastBlock.startPosition - originalStart) + lastBlock.width;
			cursor = cursor + lastRelativeEnd + GAP;
		}

		// 4. 세그먼트에 속하지 않은 블록(로고, 미분류)은 그대로 유지
		const unassigned = state.blocks.filter(
			(b) => !b.segmentId || !sorted.some((s) => s.id === b.segmentId),
		);

		return {
			...state,
			blocks: [...reordered, ...unassigned],
			segments: newSegments,
		};
	});
}

// ─── 스크러빙 모드 (다중 사용자 독립 탐색) ─────────────────────

/** 스크러빙 모드 토글 (S 키) */
export function toggleScrubbing(): void {
	timelineStore.setState((s) => ({ ...s, isScrubbing: !s.isScrubbing }));
}

/** 스크러빙 모드 즉시 종료 (Escape 키) */
export function exitScrubbing(): void {
	timelineStore.setState((s) => ({ ...s, isScrubbing: false }));
}

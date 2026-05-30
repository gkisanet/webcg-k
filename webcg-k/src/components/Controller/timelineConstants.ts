/**
 * 타임라인 상수, 타입, Context, 헬퍼
 * Timeline.tsx, DraggableBlock.tsx, TimelineSubComponents.tsx에서 공유
 */

import { createContext, useContext } from "react";
import { SNAP_UNIT } from "../../stores/blockManipulation";
import type { GraphicBlock } from "../../stores/timelineStore";

// ===== 트랜지션 영역 상수 =====
/** 트랜지션 영역 크기 (그리드 1칸의 50% = 25px) */
export const TRANSITION_ZONE_WIDTH = SNAP_UNIT * 0.5;

// ===== 줌 관련 상수 =====
export const ZOOM_MIN = 0.25;     // 최대 줌아웃 (25%)
export const ZOOM_MAX = 1.0;      // 최대 줌인 = 기본 화면 (100%)
export const ZOOM_STEP = 0.25;    // 줌 단계
export const TRACK_HEADER_WIDTH = 120; // 트랙 헤더 너비(px)

// ===== 줌 레벨 Context =====
export const ZoomContext = createContext<number>(1.0);
export const useZoom = () => useContext(ZoomContext);

// ===== 원격 플레이헤드 타입 =====
export interface RemotePlayheadData {
	userId: string;
	displayName: string;
	color: string;
	position: number;
	canBroadcast?: boolean;
	isScrubbing?: boolean;
}

// ===== 블록 인접 상태 =====
export interface BlockEdgeState {
	hasLeftNeighbor: boolean;
	hasRightNeighbor: boolean;
}

/**
 * 블록 배열에서 좌/우 인접 블록 여부를 Map으로 반환
 * 트랜지션 glow 표시에 사용
 */
export function getBlockEdgeStates(
	blocks: GraphicBlock[],
): Map<string, BlockEdgeState> {
	const states = new Map<string, BlockEdgeState>();

	for (const block of blocks) {
		states.set(block.id, { hasLeftNeighbor: false, hasRightNeighbor: false });
	}

	for (let i = 0; i < blocks.length; i++) {
		for (let j = 0; j < blocks.length; j++) {
			if (i === j) continue;
			const blockEnd = blocks[i].startPosition + blocks[i].width;

			if (blockEnd === blocks[j].startPosition) {
				const stateI = states.get(blocks[i].id)!;
				stateI.hasRightNeighbor = true;
				const stateJ = states.get(blocks[j].id)!;
				stateJ.hasLeftNeighbor = true;
			}
		}
	}

	return states;
}

/**
 * Block Manipulation Utilities
 * 타임라인 그리드 기반 블록 드래그/리사이즈
 */

import { timelineStore } from "./timelineStore";

// 그리드 스냅 단위 (픽셀)
export const SNAP_UNIT = 50;

// 기본 블록 너비 = 3 스냅 단위
export const DEFAULT_BLOCK_WIDTH = SNAP_UNIT * 3; // 150px

// 최소 블록 너비 = 2 스냅 단위
export const MIN_BLOCK_WIDTH = SNAP_UNIT * 2; // 100px

// 예약된 영역 (첫 번째 그리드 칸) - 블록 배치 금지
export const RESERVED_ZONE = SNAP_UNIT; // 50px

/**
 * 스냅 단위 가져오기
 */
export function getSnapUnit(): number {
	return SNAP_UNIT;
}

/**
 * 위치를 그리드에 스냅
 */
export function snapToGrid(position: number): number {
	return Math.round(position / SNAP_UNIT) * SNAP_UNIT;
}

/**
 * 같은 트랙 내 블록 겹침 감지
 */
export function detectBlockOverlap(
	block1Start: number,
	block1Width: number,
	block2Start: number,
	block2Width: number,
): boolean {
	const block1End = block1Start + block1Width;
	const block2End = block2Start + block2Width;
	return !(block1End <= block2Start || block2End <= block1Start);
}

/**
 * 블록이 같은 트랙 내 다른 블록과 겹치는지 확인
 */
export function wouldBlockOverlap(
	blockId: string,
	newStart: number,
	newWidth: number,
): boolean {
	const state = timelineStore.state;
	const block = state.blocks.find((b) => b.id === blockId);
	if (!block) return false;

	const sameTrackBlocks = state.blocks.filter(
		(b) => b.trackId === block.trackId && b.id !== blockId,
	);

	for (const other of sameTrackBlocks) {
		if (
			detectBlockOverlap(newStart, newWidth, other.startPosition, other.width)
		) {
			return true;
		}
	}

	return false;
}

/**
 * 겹치는 블록 ID 찾기
 */
export function findOverlappingBlockIds(
	blockId: string,
	newStart: number,
	newWidth: number,
): string[] {
	const state = timelineStore.state;
	const block = state.blocks.find((b) => b.id === blockId);
	if (!block) return [];

	const overlapping: string[] = [];
	const sameTrackBlocks = state.blocks.filter(
		(b) => b.trackId === block.trackId && b.id !== blockId,
	);

	for (const other of sameTrackBlocks) {
		if (
			detectBlockOverlap(newStart, newWidth, other.startPosition, other.width)
		) {
			overlapping.push(other.id);
		}
	}

	return overlapping;
}

/**
 * 블록 이동 (그리드 스냅) - 임시 이동 (드래그 중)
 */
export function moveBlockTemporary(blockId: string, newPosition: number): void {
	timelineStore.setState((state) => {
		const block = state.blocks.find((b) => b.id === blockId);
		if (!block) return state;

		let snappedPosition = snapToGrid(newPosition);
		// 예약된 영역 (50px) 이하로 이동 금지
		snappedPosition = Math.max(RESERVED_ZONE, snappedPosition);

		return {
			...state,
			blocks: state.blocks.map((b) =>
				b.id === blockId ? { ...b, startPosition: snappedPosition } : b,
			),
		};
	});
}

/**
 * 블록 이동 확정 - 겹침 시 원위치 복귀
 * @returns 이동 성공 여부
 */
export function moveBlockFinal(
	blockId: string,
	originalPosition: number,
): boolean {
	const state = timelineStore.state;
	const block = state.blocks.find((b) => b.id === blockId);
	if (!block) return false;

	// 겹침 확인
	if (wouldBlockOverlap(blockId, block.startPosition, block.width)) {
		// 원위치 복귀
		timelineStore.setState((s) => ({
			...s,
			blocks: s.blocks.map((b) =>
				b.id === blockId ? { ...b, startPosition: originalPosition } : b,
			),
		}));
		return false;
	}

	return true;
}

/**
 * 블록 크기 조절 - 절대 위치 기반
 * 최소 크기 = 트랙 수 * 스냅 단위
 * @returns 리사이즈 성공 여부
 */
export function resizeBlockAbsolute(
	blockId: string,
	handle: "left" | "right",
	absolutePosition: number,
): boolean {
	let success = true;

	timelineStore.setState((state) => {
		const block = state.blocks.find((b) => b.id === blockId);
		if (!block) return state;

		// ■ 최소 블록 너비 = MIN_BLOCK_WIDTH (100px = 2칸 고정)
		// Why 고정값? 이전에는 state.tracks.length * SNAP_UNIT이었는데,
		//   트랙이 5개면 최소 250px(5칸)이 되어 3칸으로 줄일 수 없는 버그 발생.
		//   블록 너비는 트랙 수와 무관하게 최소 2칸까지 줄일 수 있어야 한다.
		const minWidth = MIN_BLOCK_WIDTH;
		const snappedPos = snapToGrid(absolutePosition);

		let newStart = block.startPosition;
		let newWidth = block.width;

		if (handle === "left") {
			// 예약된 영역 (50px) 이하로 리사이즈 금지
			const adjustedStart = Math.max(RESERVED_ZONE, snappedPos);
			const adjustedWidth = block.startPosition + block.width - adjustedStart;

			if (adjustedWidth >= minWidth) {
				// 겹침 확인
				if (
					!wouldBlockOverlapWithNewBounds(
						blockId,
						adjustedStart,
						adjustedWidth,
						block.trackId,
					)
				) {
					newStart = adjustedStart;
					newWidth = adjustedWidth;
				} else {
					success = false;
				}
			} else {
				success = false;
			}
		} else {
			const adjustedWidth = snappedPos - block.startPosition;

			if (adjustedWidth >= minWidth) {
				// 겹침 확인
				if (
					!wouldBlockOverlapWithNewBounds(
						blockId,
						block.startPosition,
						adjustedWidth,
						block.trackId,
					)
				) {
					newWidth = adjustedWidth;
				} else {
					success = false;
				}
			} else {
				success = false;
			}
		}

		if (!success) return state;

		return {
			...state,
			blocks: state.blocks.map((b) =>
				b.id === blockId
					? { ...b, startPosition: newStart, width: newWidth }
					: b,
			),
		};
	});

	return success;
}

/**
 * 새로운 범위로 겹침 확인 (리사이즈용)
 */
function wouldBlockOverlapWithNewBounds(
	blockId: string,
	newStart: number,
	newWidth: number,
	trackId: number,
): boolean {
	const state = timelineStore.state;
	const sameTrackBlocks = state.blocks.filter(
		(b) => b.trackId === trackId && b.id !== blockId,
	);

	for (const other of sameTrackBlocks) {
		if (
			detectBlockOverlap(newStart, newWidth, other.startPosition, other.width)
		) {
			return true;
		}
	}

	return false;
}

/**
 * 블록 트랙 변경
 * ■ 로고 트랙(isLogoTrack) 보호:
 *   로고 트랙은 LogoGallery에서만 블록을 추가/제거하는 전용 트랙.
 *   일반 블록이 드래그로 로고 트랙에 진입하면
 *   savePlayheadState()가 해당 블록을 logoBlocks[]에 포함시켜
 *   새로고침 시 timeline_data 원본과 중복 복원 → "유령 블록" 발생.
 *   따라서 로고 트랙 ↔ 일반 트랙 간 이동을 구조적으로 차단한다.
 */
export function changeBlockTrack(blockId: string, newTrackId: number): void {
	const state = timelineStore.state;
	const block = state.blocks.find((b) => b.id === blockId);
	if (!block) return;

	// 1. 로고 트랙으로 이동 차단 (일반 블록 → 로고 트랙)
	const targetTrack = state.tracks.find((t) => t.id === newTrackId);
	if (targetTrack?.isLogoTrack) {
		console.log("[Block] 로고 트랙으로는 블록을 이동할 수 없습니다. LogoGallery를 사용하세요.");
		return;
	}

	// 2. 로고 트랙에서 이탈 차단 (로고 블록 → 일반 트랙)
	const currentTrack = state.tracks.find((t) => t.id === block.trackId);
	if (currentTrack?.isLogoTrack) {
		console.log("[Block] 로고 트랙의 블록은 다른 트랙으로 이동할 수 없습니다.");
		return;
	}

	timelineStore.setState((s) => ({
		...s,
		blocks: s.blocks.map((b) =>
			b.id === blockId ? { ...b, trackId: newTrackId } : b,
		),
	}));
}

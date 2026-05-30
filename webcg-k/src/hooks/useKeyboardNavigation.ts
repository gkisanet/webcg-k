/**
 * useKeyboardNavigation Hook
 * 타임라인 키보드 단축키 처리
 *
 * ■ Segment 확장 (2026-04-16)
 *   Alt+←/→: 세그먼트 탭 이동
 *   Ctrl+Shift+L: 로고 Expand (segmentId 기준)
 *
 * ■ 송출 상태 연동 (2026-04-23)
 *   Space 누를 때 isBroadcasting=false이면 broadcastToPGM 대신 경고 콜백 호출
 */

import { useEffect } from "react";
import {
	clearGapSelection,
	copySelectedBlock,
	deleteSelectedBlock,
	exitScrubbing,
	expandLogoToSegment,
	moveBlockToLowerTrack,
	moveBlockToUpperTrack,
	moveToEnd,
	moveToNextEdge,
	moveToPrevEdge,
	moveToStart,
	pasteBlock,
	returnToLastBroadcast,
	rippleDeleteGap,
	selectBlock,
	setPlayheadPosition,
	timelineStore,
	toggleScrubbing,
	undo,
	redo,
} from "../stores/timelineStore";

export function useKeyboardNavigation(
	enabled = true,
	isBroadcasting = true,
	onNotBroadcasting?: () => void,
	isScrubbing = false,
	onScrubSpaceBlocked?: () => void,
	onBroadcastToPgm?: () => void | Promise<void>,
	onUndo: () => void = undo,
	onRedo: () => void = redo,
) {
	useEffect(() => {
		if (!enabled) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			// 입력 필드에서는 동작하지 않음
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			// Ctrl/Cmd 조합키
			const isModifier = e.ctrlKey || e.metaKey;

			// ─── 세그먼트 단축키 (Alt 조합) ───
			// ■ Why playhead 이동? 탭은 playhead 위치에 따라 자동 활성화되므로
			//   직접 탭을 전환하는 대신 해당 세그먼트의 시작 위치로 playhead를 이동.

			// Alt+←: 이전 세그먼트로 playhead 이동
			// Alt+→: 다음 세그먼트로 playhead 이동
			if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
				e.preventDefault();
				const state = timelineStore.state;
				if (state.segments.length === 0) return;

				const sorted = [...state.segments].sort((a, b) => a.order - b.order);
				const currentIdx = state.activeSegmentTab
					? sorted.findIndex((s) => s.id === state.activeSegmentTab)
					: -1; // -1 = "전체" 탭

				let targetSeg: typeof sorted[0] | null = null;

				if (e.key === "ArrowRight") {
					const nextIdx = currentIdx + 1;
					if (nextIdx < sorted.length) {
						targetSeg = sorted[nextIdx];
					}
				} else {
					if (currentIdx <= 0) {
						// 첫 세그먼트 이전이면 position 0으로
						setPlayheadPosition(0);
						return;
					}
					targetSeg = sorted[currentIdx - 1];
				}

				// 대상 세그먼트의 첫 블록 시작 위치로 playhead 이동
				if (targetSeg) {
					const segBlocks = state.blocks
						.filter((b) => b.segmentId === targetSeg!.id)
						.sort((a, b) => a.startPosition - b.startPosition);
					if (segBlocks.length > 0) {
						setPlayheadPosition(segBlocks[0].startPosition);
					}
				}
				return;
			}

			// Ctrl+Shift+L: 로고 블록을 현재 세그먼트 전체 CG 구간으로 확장
			// ■ Why? 세그먼트 탭에서 로고는 해당 뉴스 아이템의 모든 CG를
			//   커버해야 함. 수동 조정은 반복적이라 단축키로 자동화.
			if (isModifier && e.shiftKey && e.key === "L") {
				e.preventDefault();
				const state = timelineStore.state;
				if (!state.activeSegmentTab || !state.selectedBlockId) return;

				const selectedBlock = state.blocks.find((b) => b.id === state.selectedBlockId);
				if (!selectedBlock) return;

				// 로고 트랙(트랙 ID 0)의 블록만 Expand 가능
				const logoTrack = state.tracks.find((t) => t.isLogoTrack);
				if (!logoTrack || selectedBlock.trackId !== logoTrack.id) {
					console.log("[Shortcut] Ctrl+Shift+L: 로고 트랙의 블록만 Expand 가능");
					return;
				}

				expandLogoToSegment(selectedBlock.id, state.activeSegmentTab);
				console.log("[Shortcut] Logo expanded to segment:", state.activeSegmentTab);
				return;
			}

			// Ctrl + 방향키: 트랙 간 이동
			// ■ UI 좌표계: 위 = 작은 trackId, 아래 = 큰 trackId
			//   따라서 ↑키 = 더 작은 ID로 이동(Lower), ↓키 = 더 큰 ID로 이동(Upper)
			if (isModifier && e.key === "ArrowUp") {
				e.preventDefault();
				moveBlockToLowerTrack();
				return;
			}

			if (isModifier && e.key === "ArrowDown") {
				e.preventDefault();
				moveBlockToUpperTrack();
				return;
			}

			// Ctrl+←: 타임라인 맨 처음으로 이동
			if (isModifier && e.key === "ArrowLeft") {
				e.preventDefault();
				moveToStart();
				return;
			}

			// Ctrl+→: 타임라인 맨 끝으로 이동
			if (isModifier && e.key === "ArrowRight") {
				e.preventDefault();
				moveToEnd();
				return;
			}

			// Ctrl+C: 복사
			if (isModifier && e.key === "c") {
				e.preventDefault();
				copySelectedBlock();
				return;
			}

			// Ctrl+V: 붙여넣기
			if (isModifier && e.key === "v") {
				e.preventDefault();
				pasteBlock();
				return;
			}

			// Ctrl+Z: 실행 취소 (Undo)
			if (isModifier && !e.shiftKey && e.key === "z") {
				e.preventDefault();
				onUndo();
				return;
			}

			// Ctrl+Shift+Z 또는 Ctrl+Y: 다시 실행 (Redo)
			if (isModifier && ((e.shiftKey && e.key === "z") || e.key === "y")) {
				e.preventDefault();
				onRedo();
				return;
			}

			// 일반 단축키 (Modifier 없이)
			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					moveToNextEdge();
					break;

				case "ArrowLeft":
					e.preventDefault();
					moveToPrevEdge();
					break;

				case " ": // Space
					e.preventDefault();
					if (isScrubbing) {
						// 스크러빙 모드에서는 송출 차단
						onScrubSpaceBlocked?.();
					} else if (!isBroadcasting) {
						onNotBroadcasting?.();
					} else {
						void onBroadcastToPgm?.();
					}
					break;

				case "ArrowUp":
					// Ctrl 없이 ↑: 마지막 송출로 복귀
					e.preventDefault();
					returnToLastBroadcast();
					break;

				case "s":
				case "S":
					e.preventDefault();
					toggleScrubbing();
					break;

				case "Delete":
				case "Backspace":
					e.preventDefault();
					// 갭이 선택되어 있으면 리플 삭제, 아니면 블록 삭제
					const state = timelineStore.state;
					if (state.selectedGap) {
						rippleDeleteGap();
					} else {
						deleteSelectedBlock();
					}
					break;

				case "Escape":
					// ESC: 선택 해제 + 스크러빙 해제 (캡슐화된 도메인 액션 호출)
					e.preventDefault();
					selectBlock(null);
					clearGapSelection();
					exitScrubbing();
					break;

				default:
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [enabled, isBroadcasting, onNotBroadcasting, isScrubbing, onScrubSpaceBlocked, onBroadcastToPgm, onUndo, onRedo]);
}

import { useCallback, useEffect, useRef } from "react";
import type { GraphicBlock } from "../stores/timelineStore";
import { timelineStore } from "../stores/timelineStore";
import type { PlayoutPayload } from "./useSessionController";

interface UsePlayoutBridgeOptions {
	sessionId: string;
	isChannelReady: boolean;
	isBroadcasting: boolean;
	canBroadcast: boolean;
	pgmBlockIds: Map<number, string>;
	blocks: GraphicBlock[];
	broadcast: (payload: PlayoutPayload) => Promise<void>;
	autoBroadcastOnPgmChange?: boolean;
}

export function usePlayoutBridge({
	sessionId,
	isChannelReady,
	isBroadcasting,
	canBroadcast,
	pgmBlockIds,
	blocks,
	broadcast,
	autoBroadcastOnPgmChange = false,
}: UsePlayoutBridgeOptions) {
	const pgmBlockIdsRef = useRef(pgmBlockIds);
	const blocksRef = useRef(blocks);
	const suppressNextAutoBroadcastRef = useRef(false);

	useEffect(() => {
		pgmBlockIdsRef.current = pgmBlockIds;
	}, [pgmBlockIds]);

	useEffect(() => {
		blocksRef.current = blocks;
	}, [blocks]);

	const buildPlayoutPayload = useCallback((): PlayoutPayload => {
		const seqNum = Date.now();
		const currentFadeDuration = timelineStore.state.fadeDuration;
		const currentBlocks = blocksRef.current;
		const currentPgmBlockIds = timelineStore.state.pgmBlockIds;

		// ■ 판서 블록 이중 방어: blocks 배열에 없는 wb-pgm-* 블록은 합성 아이템으로 폴백
		//   Why? WhiteboardPanel이 blocks 배열을 필터링하면서 판서 블록이 누락될 수 있다.
		//   이 경우에도 PLAY_MULTI items에 판서가 포함되어야 render.tsx에서 exit 방지.
		const activeItems = [...currentPgmBlockIds.entries()]
			.map(([trackId, blockId]) => {
				const block = currentBlocks.find((b) => b.id === blockId);
				if (block) {
					return {
						id: block.id,
						name: block.name,
						trackId: block.trackId,
						color: block.color || "",
						transitionIn: block.transitionIn,
						sourceType: block.sourceType,
						sourceData: block.sourceData,
					};
				}
				// 판서 블록 폴백: blocks에 없지만 pgmBlockIds에 있는 wb-pgm-* 처리
				if (blockId.startsWith("wb-pgm-")) {
					const boardId = blockId.slice("wb-pgm-".length);
					return {
						id: blockId,
						name: "판서 레이어",
						trackId,
						color: "",
						transitionIn: "fade" as const,
						sourceType: "whiteboard" as const,
						sourceData: { whiteboardId: boardId },
					};
				}
				return null;
			})
			.filter(Boolean);

		return activeItems.length > 0
			? { action: "PLAY_MULTI", items: activeItems, fadeDuration: currentFadeDuration, seqNum }
			: { action: "CLEAR", fadeDuration: currentFadeDuration, seqNum };
	}, []);

	const broadcastToRenderer = useCallback(async () => {
		if (!canBroadcast) {
			console.warn("[RBAC] 송출 권한 없음 — broadcastToRenderer 차단");
			return;
		}
		const payload = buildPlayoutPayload();
		console.log("[Controller] Broadcasting to renderer:", payload);
		await broadcast(payload);
	}, [broadcast, buildPlayoutPayload, canBroadcast]);

	const suppressNextAutoBroadcast = useCallback(() => {
		suppressNextAutoBroadcastRef.current = true;
	}, []);

	const clearAutoBroadcastSuppression = useCallback(() => {
		suppressNextAutoBroadcastRef.current = false;
	}, []);

	useEffect(() => {
		if (!autoBroadcastOnPgmChange) return;
		if (!sessionId || !isChannelReady) return;

		if (suppressNextAutoBroadcastRef.current) {
			suppressNextAutoBroadcastRef.current = false;
			return;
		}

		if (!isBroadcasting) return;
		broadcastToRenderer();
	}, [autoBroadcastOnPgmChange, pgmBlockIds, sessionId, isChannelReady, isBroadcasting, broadcastToRenderer]);

	return {
		broadcastToRenderer,
		clearAutoBroadcastSuppression,
		suppressNextAutoBroadcast,
	};
}

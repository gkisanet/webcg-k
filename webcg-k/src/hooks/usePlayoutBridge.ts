import { useCallback, useEffect, useRef } from "react";
import {
	compilePlayoutIntent,
	playoutIntentToRendererPayload,
} from "../lib/playoutIntent";
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
	const pgmBlockIdsKey = [...pgmBlockIds.entries()]
		.map(([trackId, blockId]) => `${trackId}:${blockId}`)
		.join("|");

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
		const intent = compilePlayoutIntent({
			blocks: currentBlocks,
			pgmBlockIds: currentPgmBlockIds,
			fadeDuration: currentFadeDuration,
		});

		if (intent.missingTargets.length > 0) {
			console.warn(
				"[Controller] Missing playout targets:",
				intent.missingTargets,
			);
		}

		return playoutIntentToRendererPayload(intent, seqNum);
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
		void pgmBlockIdsKey;
		if (!autoBroadcastOnPgmChange) return;
		if (!sessionId || !isChannelReady) return;

		if (suppressNextAutoBroadcastRef.current) {
			suppressNextAutoBroadcastRef.current = false;
			return;
		}

		if (!isBroadcasting) return;
		broadcastToRenderer();
	}, [
		autoBroadcastOnPgmChange,
		pgmBlockIdsKey,
		sessionId,
		isChannelReady,
		isBroadcasting,
		broadcastToRenderer,
	]);

	return {
		broadcastToRenderer,
		clearAutoBroadcastSuppression,
		suppressNextAutoBroadcast,
	};
}

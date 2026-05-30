import { useCallback, useEffect, useMemo } from "react";
import type { PlayheadState, SavedLogoBlock } from "../lib/types/broadcast";
import { timelineStore, type GraphicBlock } from "../stores/timelineStore";

interface UsePlayheadPersistenceOptions {
	sessionId: string;
	isChannelReady: boolean;
	blocks: GraphicBlock[];
	pgmBlockIds: Map<number, string>;
	savePlayheadStateToDb: (playheadState: PlayheadState) => Promise<void>;
	enabled?: boolean;
}

export function usePlayheadPersistence({
	sessionId,
	isChannelReady,
	blocks,
	pgmBlockIds,
	savePlayheadStateToDb,
	enabled = true,
}: UsePlayheadPersistenceOptions) {
	const buildPlayheadState = useCallback((): PlayheadState => {
		const state = timelineStore.state;
		const logoTrack = state.tracks.find((track) => track.isLogoTrack);
		const logoBlocks: SavedLogoBlock[] = logoTrack
			? state.blocks
				.filter((block) => block.trackId === logoTrack.id)
				.map((block) => ({
					id: block.id,
					name: block.name,
					startPosition: block.startPosition,
					width: block.width,
					color: block.color,
					sourceId: block.sourceId,
				}))
			: [];

		return {
			playheadPosition: state.playheadPosition,
			pgmBlockIds: Object.fromEntries(state.pgmBlockIds),
			lastBroadcastPosition: state.lastBroadcastPosition,
			completedBlockIds: Array.from(state.completedBlockIds),
			airedBlockIds: Array.from(state.airedBlockIds),
			skippedBlockIds: Array.from(state.skippedBlockIds),
			logoBlocks,
		};
	}, []);

	const savePlayheadState = useCallback(async () => {
		await savePlayheadStateToDb(buildPlayheadState());
	}, [buildPlayheadState, savePlayheadStateToDb]);

	useEffect(() => {
		if (!enabled || !isChannelReady) return;
		savePlayheadState();
	}, [enabled, pgmBlockIds, isChannelReady, savePlayheadState]);

	const logoBlockKey = useMemo(() => {
		const logoTrack = timelineStore.state.tracks.find((track) => track.isLogoTrack);
		if (!logoTrack) return "";
		return blocks
			.filter((block) => block.trackId === logoTrack.id)
			.map((block) => `${block.id}:${block.startPosition}:${block.width}`)
			.join("|");
	}, [blocks]);

	useEffect(() => {
		if (!enabled || !isChannelReady || !logoBlockKey) return;
		savePlayheadState();
	}, [enabled, logoBlockKey, isChannelReady, savePlayheadState]);

	useEffect(() => {
		if (!enabled || !sessionId) return;

		const handleBeforeUnload = () => {
			void savePlayheadStateToDb(buildPlayheadState());
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			void savePlayheadState();
		};
	}, [enabled, sessionId, savePlayheadState, savePlayheadStateToDb, buildPlayheadState]);

	return { buildPlayheadState, savePlayheadState };
}

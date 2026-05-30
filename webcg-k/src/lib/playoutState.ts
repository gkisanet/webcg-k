import type { GraphicBlock, TimelineState } from "../stores/timelineStore";
import { parsePlayheadState } from "./schemas";
import type { PlayheadState } from "./types/broadcast";

export interface AuthoritativePlayoutState extends PlayheadState {
	revision: number;
	originClientId?: string;
	updatedBy?: string;
	updatedAt?: string;
}

export type PlayoutSnapshotApplyMode = "hydrate" | "realtime";

export function getPlayoutRevision(raw: unknown): number {
	if (!raw || typeof raw !== "object") return 0;
	const revision = (raw as { revision?: unknown }).revision;
	return typeof revision === "number" && Number.isFinite(revision)
		? revision
		: 0;
}

export function createAuthoritativePlayoutState(
	state: TimelineState,
	metadata: {
		revision: number;
		originClientId: string;
		updatedBy?: string;
		updatedAt?: string;
	},
): AuthoritativePlayoutState {
	return {
		playheadPosition: state.playheadPosition,
		pgmBlockIds: Object.fromEntries(state.pgmBlockIds),
		lastBroadcastPosition: state.lastBroadcastPosition,
		completedBlockIds: Array.from(state.completedBlockIds),
		airedBlockIds: Array.from(state.airedBlockIds),
		skippedBlockIds: Array.from(state.skippedBlockIds),
		logoBlocks: state.blocks
			.filter((block) => block.trackId === 0)
			.map((block) => ({
				id: block.id,
				name: block.name,
				startPosition: block.startPosition,
				width: block.width,
				color: block.color,
				sourceId: block.sourceId,
			})),
		whiteboardPreviewId:
			state.blocks.find((block) => block.id.startsWith("wb-pvw-"))?.id ?? null,
		whiteboardProgramId:
			Array.from(state.pgmBlockIds.values()).find((blockId) =>
				blockId.startsWith("wb-pgm-"),
			) ?? null,
		revision: metadata.revision,
		originClientId: metadata.originClientId,
		updatedBy: metadata.updatedBy,
		updatedAt: metadata.updatedAt ?? new Date().toISOString(),
	};
}

export function parseAuthoritativePlayoutState(
	raw: unknown,
): AuthoritativePlayoutState {
	const parsed = parsePlayheadState(raw);
	return {
		playheadPosition: Number(
			(parsed as any).playheadPosition ?? (parsed as any).position ?? 0,
		),
		pgmBlockIds: parsed.pgmBlockIds ?? {},
		lastBroadcastPosition: Number((parsed as any).lastBroadcastPosition ?? 0),
		completedBlockIds: Array.isArray((parsed as any).completedBlockIds)
			? (parsed as any).completedBlockIds
			: [],
		airedBlockIds: Array.isArray((parsed as any).airedBlockIds)
			? (parsed as any).airedBlockIds
			: [],
		skippedBlockIds: Array.isArray((parsed as any).skippedBlockIds)
			? (parsed as any).skippedBlockIds
			: [],
		logoBlocks: Array.isArray((parsed as any).logoBlocks)
			? (parsed as any).logoBlocks
			: [],
		whiteboardPreviewId:
			typeof (parsed as any).whiteboardPreviewId === "string"
				? (parsed as any).whiteboardPreviewId
				: null,
		whiteboardProgramId:
			typeof (parsed as any).whiteboardProgramId === "string"
				? (parsed as any).whiteboardProgramId
				: null,
		revision: getPlayoutRevision(raw),
		originClientId:
			typeof (parsed as any).originClientId === "string"
				? (parsed as any).originClientId
				: undefined,
		updatedBy:
			typeof (parsed as any).updatedBy === "string"
				? (parsed as any).updatedBy
				: undefined,
		updatedAt:
			typeof (parsed as any).updatedAt === "string"
				? (parsed as any).updatedAt
				: undefined,
	};
}

function makeWhiteboardBlock(
	blockId: string,
	position: number,
): GraphicBlock | null {
	const isPreview = blockId.startsWith("wb-pvw-");
	const isProgram = blockId.startsWith("wb-pgm-");
	if (!isPreview && !isProgram) return null;

	const boardId = blockId.slice(
		isPreview ? "wb-pvw-".length : "wb-pgm-".length,
	);
	if (!boardId) return null;

	return {
		id: blockId,
		name: "판서 레이어",
		trackId: 99,
		startPosition: position,
		width: 200,
		color: isProgram ? "rgba(239, 68, 68, 0.65)" : "rgba(245, 158, 11, 0.65)",
		transitionIn: "fade",
		transitionOut: "fade",
		sourceType: "whiteboard",
		sourceId: boardId,
		sourceData: { whiteboardId: boardId },
	};
}

export function hydrateBlocksWithPlayoutSyntheticBlocks(
	blocks: GraphicBlock[],
	snapshot: AuthoritativePlayoutState,
): GraphicBlock[] {
	const nextBlocks = blocks.filter(
		(block) =>
			!block.id.startsWith("wb-pvw-") && !block.id.startsWith("wb-pgm-"),
	);
	const existingIds = new Set(nextBlocks.map((block) => block.id));
	const whiteboardIds = [
		snapshot.whiteboardPreviewId,
		snapshot.whiteboardProgramId,
		...Object.values(snapshot.pgmBlockIds ?? {}).filter((blockId) =>
			blockId.startsWith("wb-pgm-"),
		),
	].filter(
		(blockId): blockId is string =>
			typeof blockId === "string" && blockId.length > 0,
	);

	for (const blockId of whiteboardIds) {
		if (existingIds.has(blockId)) continue;
		const block = makeWhiteboardBlock(blockId, snapshot.playheadPosition);
		if (!block) continue;
		nextBlocks.push(block);
		existingIds.add(blockId);
	}

	return nextBlocks;
}

export function shouldApplyPlayoutSnapshot(
	currentRevision: number,
	next: AuthoritativePlayoutState,
	mode: PlayoutSnapshotApplyMode,
): boolean {
	if (mode === "hydrate") return true;
	return next.revision > currentRevision;
}

export function snapshotToTimelinePatch(
	snapshot: AuthoritativePlayoutState,
	blocks: GraphicBlock[],
	isPlayoutActive: boolean,
) {
	const hydratedBlocks = hydrateBlocksWithPlayoutSyntheticBlocks(
		blocks,
		snapshot,
	);
	const pgmBlockIds = new Map<number, string>();
	if (isPlayoutActive) {
		for (const [trackIdStr, blockId] of Object.entries(
			snapshot.pgmBlockIds ?? {},
		)) {
			if (hydratedBlocks.some((block) => block.id === blockId)) {
				pgmBlockIds.set(Number(trackIdStr), blockId);
			}
		}
	}

	const firstPgmId = pgmBlockIds.size > 0 ? [...pgmBlockIds.values()][0] : null;
	const previewBlockId =
		snapshot.whiteboardPreviewId ??
		(firstPgmId
			? (hydratedBlocks.find(
					(block) => block.startPosition > snapshot.playheadPosition,
				)?.id ?? null)
			: (hydratedBlocks[0]?.id ?? null));

	return {
		blocks: hydratedBlocks,
		playheadPosition: snapshot.playheadPosition,
		previewBlockId,
		pgmBlockIds,
		lastBroadcastPosition: isPlayoutActive ? snapshot.lastBroadcastPosition : 0,
		completedBlockIds: new Set(snapshot.completedBlockIds ?? []),
		airedBlockIds: new Set(snapshot.airedBlockIds ?? []),
		skippedBlockIds: new Set(snapshot.skippedBlockIds ?? []),
	};
}

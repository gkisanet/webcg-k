import { describe, expect, it } from "vitest";
import type { GraphicBlock, TimelineState } from "../../stores/timelineStore";
import {
	createAuthoritativePlayoutState,
	parseAuthoritativePlayoutState,
	shouldApplyPlayoutSnapshot,
	snapshotToTimelinePatch,
} from "../playoutState";

function block(id: string, startPosition: number, trackId = 1): GraphicBlock {
	return {
		id,
		name: id,
		trackId,
		startPosition,
		width: 100,
		transitionIn: "fade",
		transitionOut: "fade",
	};
}

function state(overrides: Partial<TimelineState> = {}): TimelineState {
	return {
		tracks: [],
		blocks: [block("intro", 0), block("lower", 120, 2)],
		playheadPosition: 120,
		previewBlockId: "lower",
		pgmBlockIds: new Map([[2, "lower"]]),
		lastBroadcastPosition: 120,
		selectedBlockId: null,
		selectedGap: null,
		snapThreshold: 10,
		baseBlockWidth: 100,
		fadeDuration: 300,
		deleteAttemptBlockId: null,
		completedBlockIds: new Set(["intro"]),
		airedBlockIds: new Set(["lower"]),
		skippedBlockIds: new Set<string>(),
		segments: [],
		activeSegmentTab: null,
		autoFollow: "soft",
		isScrubbing: false,
		historyVersion: 0,
		...overrides,
	};
}

describe("authoritative playout state", () => {
	it("serializes timeline state with revision and origin metadata", () => {
		const snapshot = createAuthoritativePlayoutState(state(), {
			revision: 3,
			originClientId: "client-a",
			updatedBy: "user-a",
			updatedAt: "2026-05-24T00:00:00.000Z",
		});

		expect(snapshot.revision).toBe(3);
		expect(snapshot.originClientId).toBe("client-a");
		expect(snapshot.pgmBlockIds).toEqual({ "2": "lower" });
		expect(snapshot.completedBlockIds).toEqual(["intro"]);
		expect(snapshot.airedBlockIds).toEqual(["lower"]);
	});

	it("serializes dynamic whiteboard PVW and PGM ids", () => {
		const snapshot = createAuthoritativePlayoutState(
			state({
				blocks: [
					block("intro", 0),
					{
						...block("wb-pvw-board-a", 120, 99),
						sourceType: "whiteboard",
						sourceId: "board-a",
						sourceData: { whiteboardId: "board-a" },
					},
				],
				pgmBlockIds: new Map([[99, "wb-pgm-board-b"]]),
			}),
			{
				revision: 5,
				originClientId: "client-a",
			},
		);

		expect(snapshot.whiteboardPreviewId).toBe("wb-pvw-board-a");
		expect(snapshot.whiteboardProgramId).toBe("wb-pgm-board-b");
	});

	it("applies only newer realtime snapshots", () => {
		const snapshot = parseAuthoritativePlayoutState({
			revision: 4,
			pgmBlockIds: {},
		});

		expect(shouldApplyPlayoutSnapshot(3, snapshot, "realtime")).toBe(true);
		expect(shouldApplyPlayoutSnapshot(4, snapshot, "realtime")).toBe(false);
		expect(shouldApplyPlayoutSnapshot(5, snapshot, "realtime")).toBe(false);
		expect(shouldApplyPlayoutSnapshot(5, snapshot, "hydrate")).toBe(true);
	});

	it("does not restore PGM blocks when the session is not in active playout", () => {
		const snapshot = parseAuthoritativePlayoutState({
			playheadPosition: 120,
			lastBroadcastPosition: 120,
			pgmBlockIds: { "2": "lower" },
			completedBlockIds: ["intro"],
			airedBlockIds: ["lower"],
			skippedBlockIds: [],
			revision: 2,
		});

		const patch = snapshotToTimelinePatch(
			snapshot,
			[block("intro", 0), block("lower", 120, 2)],
			false,
		);

		expect(patch.pgmBlockIds.size).toBe(0);
		expect(patch.lastBroadcastPosition).toBe(0);
		expect(patch.completedBlockIds).toEqual(new Set(["intro"]));
	});

	it("restores PGM blocks during live or rehearsal playout", () => {
		const snapshot = parseAuthoritativePlayoutState({
			playheadPosition: 120,
			lastBroadcastPosition: 120,
			pgmBlockIds: { "2": "lower" },
			completedBlockIds: ["intro"],
			airedBlockIds: ["lower"],
			skippedBlockIds: [],
			revision: 2,
		});

		const patch = snapshotToTimelinePatch(
			snapshot,
			[block("intro", 0), block("lower", 120, 2)],
			true,
		);

		expect(patch.pgmBlockIds).toEqual(new Map([[2, "lower"]]));
		expect(patch.lastBroadcastPosition).toBe(120);
	});

	it("hydrates dynamic whiteboard PVW and PGM blocks from snapshots", () => {
		const snapshot = parseAuthoritativePlayoutState({
			playheadPosition: 240,
			lastBroadcastPosition: 240,
			pgmBlockIds: { "99": "wb-pgm-board-b" },
			whiteboardPreviewId: "wb-pvw-board-a",
			whiteboardProgramId: "wb-pgm-board-b",
			revision: 6,
		});

		const patch = snapshotToTimelinePatch(snapshot, [block("intro", 0)], true);

		expect(
			patch.blocks.find((item) => item.id === "wb-pvw-board-a")?.sourceData,
		).toEqual({
			whiteboardId: "board-a",
		});
		expect(
			patch.blocks.find((item) => item.id === "wb-pgm-board-b")?.sourceData,
		).toEqual({
			whiteboardId: "board-b",
		});
		expect(patch.previewBlockId).toBe("wb-pvw-board-a");
		expect(patch.pgmBlockIds).toEqual(new Map([[99, "wb-pgm-board-b"]]));
	});
});

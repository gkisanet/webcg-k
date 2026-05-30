import { beforeEach, describe, expect, it } from "vitest";
import {
	broadcastToPGM,
	clearHistory,
	rippleDeleteGap,
	timelineStore,
	type GraphicBlock,
} from "../timelineStore";

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

function resetTimeline(overrides: Partial<typeof timelineStore.state> = {}) {
	clearHistory();
	timelineStore.setState((state) => ({
		...state,
		blocks: [],
		playheadPosition: 0,
		previewBlockId: null,
		pgmBlockIds: new Map<number, string>(),
		lastBroadcastPosition: 0,
		selectedBlockId: null,
		selectedGap: null,
		completedBlockIds: new Set<string>(),
		airedBlockIds: new Set<string>(),
		skippedBlockIds: new Set<string>(),
		...overrides,
	}));
}

describe("timelineStore playout actions", () => {
	beforeEach(() => {
		resetTimeline();
	});

	it("marks unaired blocks between broadcasts as skipped", () => {
		resetTimeline({
			blocks: [block("intro", 50), block("lower-third", 200), block("outro", 350)],
			playheadPosition: 50,
		});

		broadcastToPGM();
		timelineStore.setState((state) => ({ ...state, playheadPosition: 350 }));
		broadcastToPGM();

		expect(timelineStore.state.airedBlockIds).toEqual(new Set(["intro", "outro"]));
		expect(timelineStore.state.completedBlockIds).toContain("intro");
		expect(timelineStore.state.skippedBlockIds).toEqual(new Set(["lower-third"]));
	});

	it("adjusts playhead and last broadcast positions after ripple deleting a gap", () => {
		resetTimeline({
			blocks: [block("before", 50), block("after", 250)],
			playheadPosition: 350,
			lastBroadcastPosition: 300,
			pgmBlockIds: new Map([[1, "after"]]),
			selectedGap: {
				trackId: 1,
				startPosition: 150,
				endPosition: 250,
			},
		});

		expect(rippleDeleteGap()).toBe(true);

		expect(timelineStore.state.blocks.find((b) => b.id === "after")?.startPosition).toBe(150);
		expect(timelineStore.state.playheadPosition).toBe(250);
		expect(timelineStore.state.lastBroadcastPosition).toBe(200);
		expect(timelineStore.state.pgmBlockIds.get(1)).toBe("after");
	});

});

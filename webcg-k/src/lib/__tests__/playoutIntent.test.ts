import { describe, expect, it } from "vitest";
import type { GraphicBlock } from "../../stores/timelineStore";
import {
	compilePlayoutIntent,
	playoutIntentToRendererPayload,
} from "../playoutIntent";

function block(id: string, trackId = 1): GraphicBlock {
	return {
		id,
		name: id,
		trackId,
		startPosition: 0,
		width: 100,
		color: "#123456",
		transitionIn: "fade",
		transitionOut: "cut",
		sourceType: "graphic",
		sourceData: { headline: "속보" },
	};
}

describe("playout intent compiler", () => {
	it("compiles PGM block state into lifecycle-aware playout intent", () => {
		const intent = compilePlayoutIntent({
			blocks: [block("headline", 2)],
			pgmBlockIds: new Map([[2, "headline"]]),
			fadeDuration: 500,
		});

		expect(intent.protocol).toBe("webcgk.playout-intent.v1");
		expect(intent.action).toBe("play-multi");
		expect(intent.items).toEqual([
			expect.objectContaining({
				id: "headline",
				trackId: 2,
				transitionIn: "fade",
				transitionOut: "cut",
				sourceType: "graphic",
				sourceData: { headline: "속보" },
				lifecycle: {
					verb: "take",
					phase: "program",
					timing: "immediate",
				},
			}),
		]);
	});

	it("adapts playout intent to the current renderer PLAY_MULTI payload", () => {
		const intent = compilePlayoutIntent({
			blocks: [block("headline", 2)],
			pgmBlockIds: new Map([[2, "headline"]]),
			fadeDuration: 500,
		});

		expect(playoutIntentToRendererPayload(intent, 12)).toEqual({
			action: "PLAY_MULTI",
			items: [
				{
					id: "headline",
					name: "headline",
					trackId: 2,
					color: "#123456",
					transitionIn: "fade",
					transitionOut: "cut",
					sourceType: "graphic",
					sourceData: { headline: "속보" },
				},
			],
			fadeDuration: 500,
			seqNum: 12,
		});
	});

	it("returns CLEAR when there are no renderable PGM targets", () => {
		const intent = compilePlayoutIntent({
			blocks: [],
			pgmBlockIds: new Map(),
			fadeDuration: 300,
		});

		expect(intent.action).toBe("clear");
		expect(playoutIntentToRendererPayload(intent, 13)).toEqual({
			action: "CLEAR",
			fadeDuration: 300,
			seqNum: 13,
		});
	});

	it("synthesizes missing whiteboard PGM blocks from the PGM target id", () => {
		const intent = compilePlayoutIntent({
			blocks: [],
			pgmBlockIds: new Map([[99, "wb-pgm-board-a"]]),
			fadeDuration: 300,
		});

		expect(intent.action).toBe("play-multi");
		expect(intent.items).toEqual([
			expect.objectContaining({
				id: "wb-pgm-board-a",
				name: "판서 레이어",
				trackId: 99,
				transitionIn: "fade",
				transitionOut: "fade",
				sourceType: "whiteboard",
				sourceData: { whiteboardId: "board-a" },
			}),
		]);
		expect(intent.missingTargets).toEqual([]);
	});

	it("reports missing non-whiteboard PGM targets without inventing payload items", () => {
		const intent = compilePlayoutIntent({
			blocks: [],
			pgmBlockIds: new Map([[2, "missing"]]),
			fadeDuration: 300,
		});

		expect(intent.action).toBe("clear");
		expect(intent.items).toEqual([]);
		expect(intent.missingTargets).toEqual([
			{ trackId: 2, blockId: "missing", reason: "block-not-found" },
		]);
	});
});

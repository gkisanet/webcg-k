import { describe, expect, it } from "vitest";
import type { RendererGraphicCommandDispatch } from "../rendererGraphicCommand";
import {
	initialRendererPlayoutState,
	isBlockOnProgram,
	pickRendererTopItemId,
	type RendererTrack,
	rendererPlayoutReducer,
	WHITEBOARD_TRACK_ID,
} from "../rendererPlayoutReducer";
import type { BroadcastItemPayload } from "../types/broadcast";

function item(
	overrides: Partial<BroadcastItemPayload> & { id: string },
): BroadcastItemPayload {
	return {
		id: overrides.id,
		name: overrides.name ?? overrides.id,
		trackId: overrides.trackId ?? 0,
		sourceType: overrides.sourceType,
		sourceData: overrides.sourceData,
	};
}

function track(t: RendererTrack): [number, RendererTrack] {
	return [t.item.trackId ?? 0, t];
}

function dispatch(
	state: ReturnType<typeof rendererPlayoutReducer>,
	action: Parameters<typeof rendererPlayoutReducer>[1],
) {
	return rendererPlayoutReducer(state, action);
}

describe("rendererPlayoutReducer", () => {
	describe("PLAY_MULTI", () => {
		it("enters new items and preserves whiteboard track", () => {
			const wb = {
				item: item({ id: "wb-1", trackId: 99 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(wb)]),
			});

			const next = dispatch(start, {
				type: "PLAY_MULTI",
				items: [item({ id: "lower", trackId: 1 })],
			});

			expect(next.tracks.get(1)?.phase).toBe("enter");
			expect(next.tracks.get(1)?.item.id).toBe("lower");
			// Whiteboard preserved untouched
			expect(next.tracks.get(99)).toEqual(wb);
		});

		it("keeps idle phase when same item re-asserts on the same track", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, {
				type: "PLAY_MULTI",
				items: [item({ id: "lower", trackId: 1 })],
			});

			expect(next.tracks.get(1)?.phase).toBe("idle");
		});

		it("re-enters when the same track gets a different item", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, {
				type: "PLAY_MULTI",
				items: [item({ id: "lower-v2", trackId: 1 })],
			});

			expect(next.tracks.get(1)?.item.id).toBe("lower-v2");
			expect(next.tracks.get(1)?.phase).toBe("enter");
		});

		it("moves evicted tracks to exit but protects the whiteboard", () => {
			const wb = {
				item: item({ id: "wb-1", trackId: 99 }),
				phase: "idle",
			} as const;
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower), track(wb)]),
			});

			const next = dispatch(start, {
				type: "PLAY_MULTI",
				items: [item({ id: "new", trackId: 2 })],
			});

			expect(next.tracks.get(1)?.phase).toBe("exit");
			expect(next.tracks.get(99)).toEqual(wb);
			expect(next.tracks.get(2)?.item.id).toBe("new");
		});
	});

	describe("PLAY_SINGLE", () => {
		it("places the legacy single item and preserves whiteboard", () => {
			const wb = {
				item: item({ id: "wb-1", trackId: 99 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(wb)]),
			});

			const next = dispatch(start, {
				type: "PLAY_SINGLE",
				item: item({ id: "headline", trackId: 0 }),
			});

			expect(next.tracks.get(0)?.phase).toBe("enter");
			expect(next.tracks.get(0)?.item.id).toBe("headline");
			expect(next.tracks.get(99)).toEqual(wb);
		});
	});

	describe("STOP_OR_CLEAR / EXIT_ALL_TRACKS", () => {
		it("exits every track except the whiteboard", () => {
			const wb = {
				item: item({ id: "wb-1", trackId: 99 }),
				phase: "idle",
			} as const;
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower), track(wb)]),
			});

			const next = dispatch(start, { type: "STOP_OR_CLEAR" });

			expect(next.tracks.get(1)?.phase).toBe("exit");
			expect(next.tracks.get(99)).toEqual(wb);
		});

		it("EXIT_ALL_TRACKS behaves identically for non-whiteboard tracks", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "enter",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, { type: "EXIT_ALL_TRACKS" });

			expect(next.tracks.get(1)?.phase).toBe("exit");
		});
	});

	describe("ENTER_COMPLETE / EXIT_COMPLETE", () => {
		it("moves an entering track to idle on enter complete", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "enter",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, { type: "ENTER_COMPLETE", trackId: 1 });

			expect(next.tracks.get(1)?.phase).toBe("idle");
		});

		it("ignores enter complete for a non-enter track", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "idle",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, { type: "ENTER_COMPLETE", trackId: 1 });

			expect(next.tracks.get(1)?.phase).toBe("idle");
		});

		it("removes a track on exit complete", () => {
			const lower = {
				item: item({ id: "lower", trackId: 1 }),
				phase: "exit",
			} as const;
			const start = dispatch(initialRendererPlayoutState, {
				type: "HYDRATE_TRACKS",
				tracks: new Map([track(lower)]),
			});

			const next = dispatch(start, { type: "EXIT_COMPLETE", trackId: 1 });

			expect(next.tracks.has(1)).toBe(false);
		});
	});

	describe("graphic command dispatch", () => {
		const cmd = (overrides: Partial<RendererGraphicCommandDispatch> = {}) =>
			({
				protocol: "webcgk.renderer-graphic-command.v1",
				targetBlockId: "lower-1",
				kind: "step",
				seqNum: 1,
				...overrides,
			}) as RendererGraphicCommandDispatch;

		it("stores a graphic command keyed by targetBlockId", () => {
			const next = dispatch(initialRendererPlayoutState, {
				type: "SET_GRAPHIC_COMMAND",
				command: cmd({ seqNum: 5 }),
			});

			expect(next.graphicCommands.get("lower-1")?.seqNum).toBe(5);
		});

		it("clears only when the seqNum matches (stale completion safe)", () => {
			const start = dispatch(initialRendererPlayoutState, {
				type: "SET_GRAPHIC_COMMAND",
				command: cmd({ seqNum: 5 }),
			});
			const stale = dispatch(start, {
				type: "CLEAR_GRAPHIC_COMMAND",
				targetBlockId: "lower-1",
				seqNum: 4,
			});
			expect(stale.graphicCommands.has("lower-1")).toBe(true);

			const cleared = dispatch(stale, {
				type: "CLEAR_GRAPHIC_COMMAND",
				targetBlockId: "lower-1",
				seqNum: 5,
			});
			expect(cleared.graphicCommands.has("lower-1")).toBe(false);
		});
	});

	describe("helpers", () => {
		it("pickRendererTopItemId returns the highest trackId's item id", () => {
			const map = new Map<number, RendererTrack>([
				[1, { item: item({ id: "lower" }), phase: "idle" }],
				[3, { item: item({ id: "logo" }), phase: "idle" }],
				[WHITEBOARD_TRACK_ID, { item: item({ id: "wb" }), phase: "idle" }],
			]);
			expect(pickRendererTopItemId(map)).toBe("wb");
		});

		it("isBlockOnProgram finds the target regardless of track", () => {
			const map = new Map<number, RendererTrack>([
				[2, { item: item({ id: "headline" }), phase: "idle" }],
			]);
			expect(isBlockOnProgram(map, "headline")).toBe(true);
			expect(isBlockOnProgram(map, "missing")).toBe(false);
		});
	});

	it("RESET clears all state", () => {
		const start = dispatch(initialRendererPlayoutState, {
			type: "SET_GRAPHIC_COMMAND",
			command: {
				targetBlockId: "x",
				kind: "step",
				seqNum: 1,
				protocol: "webcgk.renderer-graphic-command.v1",
			},
		});
		const next = dispatch(start, { type: "RESET" });
		expect(next.tracks.size).toBe(0);
		expect(next.graphicCommands.size).toBe(0);
	});
});

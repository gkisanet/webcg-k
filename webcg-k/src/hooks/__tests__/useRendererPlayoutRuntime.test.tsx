/**
 * Integration tests for useRendererPlayoutRuntime.
 *
 * The hook is a thin glue layer that wires Supabase Realtime + ACK +
 * heartbeat + memory monitor to the pure `rendererPlayoutReducer`. We
 * mock the heavy transport (`supabase`, `useOverlayStore`,
 * `startHeartbeat`, `startMemoryMonitor`) and verify the runtime contract
 * that the view layer relies on:
 *   - reducer actions are dispatched correctly from the view handlers
 *   - passive mode disables heartbeat + memory monitor side-effects
 *   - tag-filtered overlays are exposed for the view
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGraphicCustomActionCommandPayload } from "../../lib/rendererGraphicCommand";

const { mocks } = vi.hoisted(() => {
	const startHeartbeatMock = vi.fn(() => () => {});
	const startMemoryMonitorMock = vi.fn(() => () => {});
	const calibrateClockOffsetMock = vi.fn(async () => 0);
	const broadcastHandlers: Array<{
		event: string;
		callback: (payload: unknown) => void;
	}> = [];
	const postgresHandlers: Array<{ callback: (payload: unknown) => void }> = [];

	const channelStub = {
		unsubscribe: vi.fn(),
		subscribe: vi.fn(function (this: unknown, cb?: (status: string) => void) {
			cb?.("SUBSCRIBED");
			return this;
		}),
		on: vi.fn(function (
			this: unknown,
			_type: string,
			opts: { event: string },
			callback: (payload: unknown) => void,
		) {
			if (opts.event === "playout") {
				broadcastHandlers.push({ event: opts.event, callback });
			}
			return this;
		}),
		send: vi.fn(async () => "ok"),
		httpSend: vi.fn(async () => ({ success: true })),
		state: "joined",
		socket: { isConnected: vi.fn(() => true) },
	};

	const statusChannelStub = {
		unsubscribe: vi.fn(),
		subscribe: vi.fn(function (this: unknown, cb?: (status: string) => void) {
			cb?.("SUBSCRIBED");
			return this;
		}),
		on: vi.fn(function (
			this: unknown,
			_type: string,
			_filter: unknown,
			callback: (payload: unknown) => void,
		) {
			postgresHandlers.push({ callback });
			return this;
		}),
	};

	const supabaseChannel = vi.fn((name: string) => {
		if (name.startsWith("renderer-status")) return statusChannelStub;
		return channelStub;
	});

	const supabaseFrom = vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				single: vi.fn(async () => ({ data: null, error: null })),
			})),
		})),
	}));

	return {
		mocks: {
			startHeartbeatMock,
			startMemoryMonitorMock,
			calibrateClockOffsetMock,
			broadcastHandlers,
			postgresHandlers,
			channelStub,
			statusChannelStub,
			supabaseChannel,
			supabaseFrom,
		},
	};
});

vi.mock("../../lib/supabase", () => ({
	supabase: {
		channel: mocks.supabaseChannel,
		from: mocks.supabaseFrom,
	},
}));

vi.mock("../../lib/ackProtocol", async () => {
	const actual = await vi.importActual<typeof import("../../lib/ackProtocol")>(
		"../../lib/ackProtocol",
	);
	return {
		...actual,
		startHeartbeat: mocks.startHeartbeatMock as never,
		startMemoryMonitor: mocks.startMemoryMonitorMock as never,
		restoreMicroFlushState: () => null,
		sendAck: vi.fn(),
	};
});

vi.mock("../../lib/clockSync", () => ({
	calibrateClockOffset: () => mocks.calibrateClockOffsetMock(),
	getClockOffset: () => 0,
}));

const overlayStoreMock = {
	overlays: [],
	svgOverlays: [],
	htmlOverlays: [],
	previewOverlays: [],
	programOverlays: [],
	loading: false,
	setPlayoutState: vi.fn(),
	updateReplicantData: vi.fn(),
	updateGroupData: vi.fn(),
	setGroupPlayoutState: vi.fn(),
	reportRenderState: vi.fn(),
	handlePluginAction: vi.fn(),
	addOverlay: vi.fn(),
	removeOverlay: vi.fn(),
	executeAction: vi.fn(),
	reload: vi.fn(),
};

vi.mock("../useOverlayStore", () => ({
	useOverlayStore: () => overlayStoreMock,
}));

import { useRendererPlayoutRuntime } from "../useRendererPlayoutRuntime";

function getBroadcastHandler() {
	const handler = mocks.broadcastHandlers[mocks.broadcastHandlers.length - 1];
	if (!handler) throw new Error("broadcast handler not registered");
	return handler;
}

function getStatusHandler() {
	const handler = mocks.postgresHandlers[mocks.postgresHandlers.length - 1];
	if (!handler) throw new Error("status handler not registered");
	return handler;
}

function dispatchPlayout(payload: Record<string, unknown>) {
	getBroadcastHandler().callback({ payload });
}

beforeEach(() => {
	mocks.broadcastHandlers.length = 0;
	mocks.postgresHandlers.length = 0;
	mocks.startHeartbeatMock.mockClear();
	mocks.startMemoryMonitorMock.mockClear();
	mocks.calibrateClockOffsetMock.mockClear();
	mocks.channelStub.on.mockClear();
	mocks.channelStub.unsubscribe.mockClear();
	mocks.channelStub.subscribe.mockClear();
	mocks.statusChannelStub.unsubscribe.mockClear();
	mocks.supabaseChannel.mockClear();
});

afterEach(() => {
	vi.clearAllMocks();
});

const baseOptions = {
	sessionId: "session-1",
	resolution: "1080p" as const,
	tag: null,
	hideAnnotation: false,
	passive: false,
};

describe("useRendererPlayoutRuntime", () => {
	it("returns the expected initial runtime shape", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		expect(result.current.tracks.size).toBe(0);
		expect(result.current.graphicCommands.size).toBe(0);
		expect(result.current.fadeDuration).toBe(800);
		expect(result.current.isPlayoutActive).toBe(false);
		expect(result.current.isRehearsal).toBe(false);
	});

	it("starts heartbeat + memory monitor when not passive", async () => {
		renderHook(() => useRendererPlayoutRuntime(baseOptions));
		await waitFor(() => {
			expect(mocks.startHeartbeatMock).toHaveBeenCalled();
			expect(mocks.startMemoryMonitorMock).toHaveBeenCalled();
		});
	});

	it("skips heartbeat + memory monitor when passive", async () => {
		renderHook(() =>
			useRendererPlayoutRuntime({ ...baseOptions, passive: true }),
		);
		await new Promise((r) => setTimeout(r, 10));
		expect(mocks.startHeartbeatMock).not.toHaveBeenCalled();
		expect(mocks.startMemoryMonitorMock).not.toHaveBeenCalled();
	});

	it("transitions a track to idle on enter complete", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [{ id: "lower", name: "lower", trackId: 1 }],
				seqNum: 1,
			});
		});
		expect(result.current.tracks.get(1)?.phase).toBe("enter");

		act(() => {
			result.current.onTrackEnterComplete(1);
		});
		expect(result.current.tracks.get(1)?.phase).toBe("idle");
	});

	it("removes a track on exit complete", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [{ id: "x", name: "x", trackId: 1 }],
				seqNum: 1,
			});
		});
		act(() => {
			dispatchPlayout({ action: "STOP", seqNum: 2 });
		});
		expect(result.current.tracks.get(1)?.phase).toBe("exit");

		act(() => {
			result.current.onTrackExitComplete(1);
		});
		expect(result.current.tracks.has(1)).toBe(false);
	});

	it("protects the whiteboard track from PLAY_MULTI evictions", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [
					{
						id: "wb-pgm-board",
						name: "판서",
						trackId: 99,
						sourceType: "whiteboard",
						sourceData: { whiteboardId: "board" },
					},
				],
				seqNum: 1,
			});
		});
		// Mark it stable so the next PLAY_MULTI keeps it idle.
		act(() => {
			result.current.onTrackEnterComplete(99);
		});
		expect(result.current.tracks.get(99)?.item.id).toBe("wb-pgm-board");

		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [{ id: "lower", name: "lower", trackId: 1 }],
				seqNum: 2,
			});
		});
		expect(result.current.tracks.get(99)?.item.id).toBe("wb-pgm-board");
		expect(result.current.tracks.get(99)?.phase).toBe("idle");
		expect(result.current.tracks.get(1)?.phase).toBe("enter");
	});

	it("stores a graphic command for a block on PGM and clears it on handled", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [{ id: "lower", name: "lower", trackId: 1 }],
				seqNum: 1,
			});
		});
		const commandPayload = createGraphicCustomActionCommandPayload({
			targetBlockId: "lower",
			actionId: "show",
			seqNum: 9,
		});
		act(() => {
			dispatchPlayout(commandPayload as unknown as Record<string, unknown>);
		});
		expect(result.current.graphicCommands.get("lower")?.seqNum).toBe(9);

		act(() => {
			const command = result.current.graphicCommands.get("lower");
			if (!command) throw new Error("command not stored");
			result.current.onGraphicCommandHandled(command, {
				status: "handled",
			});
		});
		expect(result.current.graphicCommands.has("lower")).toBe(false);
	});

	it("ignores graphic command for a block not on PGM", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		const commandPayload = createGraphicCustomActionCommandPayload({
			targetBlockId: "missing",
			actionId: "show",
			seqNum: 11,
		});
		act(() => {
			dispatchPlayout(commandPayload as unknown as Record<string, unknown>);
		});
		expect(result.current.graphicCommands.size).toBe(0);
	});

	it("exits all tracks (except whiteboard) when status drops to ended", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [
					{ id: "lower", name: "lower", trackId: 1 },
					{
						id: "wb-pgm-board",
						name: "판서",
						trackId: 99,
						sourceType: "whiteboard",
						sourceData: { whiteboardId: "board" },
					},
				],
				seqNum: 1,
			});
		});
		expect(result.current.tracks.get(1)?.phase).toBe("enter");
		expect(result.current.tracks.get(99)?.phase).toBe("enter");

		act(() => {
			getStatusHandler().callback({ new: { status: "ended" } });
		});
		expect(result.current.tracks.get(1)?.phase).toBe("exit");
		expect(result.current.tracks.get(99)?.phase).toBe("enter");
	});

	it("rehydrates tracks from the broadcast session DB on mount", async () => {
		const single = vi.fn(async () => ({
			data: {
				status: "live",
				playhead_state: { pgmBlockIds: { 1: "lower", 99: "wb-pgm-board" } },
				timeline_data: [
					{
						id: "lower",
						name: "lower",
						trackId: 1,
						startPosition: 0,
						width: 100,
						source_type: "graphic",
						data: { headline: "속보" },
					},
				],
			},
			error: null,
		}));
		mocks.supabaseFrom.mockReturnValueOnce({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({ single })),
			})),
		} as never);

		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		await waitFor(() => {
			expect(result.current.tracks.get(1)?.item.id).toBe("lower");
		});
		expect(result.current.tracks.get(99)?.item.id).toBe("wb-pgm-board");
		expect(result.current.isPlayoutActive).toBe(true);
	});

	it("updates fadeDuration when the controller sends it", () => {
		const { result } = renderHook(() => useRendererPlayoutRuntime(baseOptions));
		expect(result.current.fadeDuration).toBe(800);
		act(() => {
			dispatchPlayout({
				action: "PLAY_MULTI",
				items: [{ id: "x", name: "x", trackId: 1 }],
				fadeDuration: 1500,
				seqNum: 1,
			});
		});
		expect(result.current.fadeDuration).toBe(1500);
	});
});

/**
 * Renderer Playout Reducer
 *
 * Pure state machine for the renderer-side playout runtime.
 * Tracks + graphic commands live here so the view (`/render`) and the
 * transport layer (Supabase Realtime) can be tested independently.
 *
 * ■ Why a pure reducer?
 *   - Tracks phase transitions are the renderer's "realtime state machine".
 *   - Pure reducer → unit tests are trivial (no React, no Supabase).
 *   - Side-effects (ACK, heartbeat, Micro-Flush) live in the runtime hook,
 *     not in this file.
 *
 * ■ Phase semantics:
 *   - "enter" : freshly taken from PGM, fade-in not yet completed.
 *   - "idle"  : fully on PGM.
 *   - "exit"  : fade-out requested, will be removed on completion.
 *
 * ■ Whiteboard track protection (track 99):
 *   The whiteboard layer is controlled by a separate "whiteboard" event
 *   and must not be evicted by timeline-driven PLAY_MULTI/STOP/CLEAR.
 *   The reducer treats it as immutable when computing new track maps.
 */

import type { RendererGraphicCommandDispatch } from "./rendererGraphicCommand";
import type { BroadcastItemPayload } from "./types/broadcast";

export type RendererTrackPhase = "enter" | "idle" | "exit";

export interface RendererTrack {
	item: BroadcastItemPayload;
	phase: RendererTrackPhase;
}

export const WHITEBOARD_TRACK_ID = 99;

export interface RendererPlayoutState {
	tracks: ReadonlyMap<number, RendererTrack>;
	graphicCommands: ReadonlyMap<string, RendererGraphicCommandDispatch>;
}

export const initialRendererPlayoutState: RendererPlayoutState = {
	tracks: new Map(),
	graphicCommands: new Map(),
};

export type RendererPlayoutAction =
	| { type: "HYDRATE_TRACKS"; tracks: ReadonlyMap<number, RendererTrack> }
	| {
			type: "PLAY_MULTI";
			items: readonly BroadcastItemPayload[];
			whiteboardTrackId?: number;
	  }
	| {
			type: "PLAY_SINGLE";
			item: BroadcastItemPayload;
			whiteboardTrackId?: number;
	  }
	| { type: "STOP_OR_CLEAR"; whiteboardTrackId?: number }
	| { type: "ENTER_COMPLETE"; trackId: number }
	| { type: "EXIT_COMPLETE"; trackId: number }
	| { type: "EXIT_ALL_TRACKS"; whiteboardTrackId?: number }
	| { type: "SET_GRAPHIC_COMMAND"; command: RendererGraphicCommandDispatch }
	| {
			type: "CLEAR_GRAPHIC_COMMAND";
			targetBlockId: string;
			seqNum: number;
	  }
	| { type: "RESET" };

function resolveWhiteboardTrackId(explicit?: number): number {
	return explicit ?? WHITEBOARD_TRACK_ID;
}

function isSameIdleTrack(
	prev: RendererTrack | undefined,
	nextItem: BroadcastItemPayload,
): boolean {
	if (!prev) return false;
	if (prev.phase !== "idle") return false;
	return prev.item.id === nextItem.id;
}

export function rendererPlayoutReducer(
	state: RendererPlayoutState,
	action: RendererPlayoutAction,
): RendererPlayoutState {
	switch (action.type) {
		case "HYDRATE_TRACKS": {
			if (action.tracks.size === 0) return state;
			return { ...state, tracks: new Map(action.tracks) };
		}

		case "PLAY_MULTI": {
			const wbId = resolveWhiteboardTrackId(action.whiteboardTrackId);
			const next = new Map<number, RendererTrack>();
			for (const item of action.items) {
				const trackId = item.trackId ?? 0;
				const existing = state.tracks.get(trackId);
				next.set(trackId, {
					item,
					phase: isSameIdleTrack(existing, item) ? "idle" : "enter",
				});
			}
			// Preserve any track that wasn't replaced (notably the whiteboard track).
			for (const [trackId, track] of state.tracks) {
				if (next.has(trackId)) continue;
				if (trackId === wbId) {
					next.set(trackId, track);
				} else {
					next.set(trackId, { ...track, phase: "exit" });
				}
			}
			return { ...state, tracks: next };
		}

		case "PLAY_SINGLE": {
			const wbId = resolveWhiteboardTrackId(action.whiteboardTrackId);
			const trackId = action.item.trackId ?? 0;
			const next = new Map<number, RendererTrack>();
			next.set(trackId, { item: action.item, phase: "enter" });
			const wb = state.tracks.get(wbId);
			if (wb) next.set(wbId, wb);
			return { ...state, tracks: next };
		}

		case "STOP_OR_CLEAR": {
			const wbId = resolveWhiteboardTrackId(action.whiteboardTrackId);
			const next = new Map<number, RendererTrack>();
			for (const [trackId, track] of state.tracks) {
				if (trackId === wbId) {
					next.set(trackId, track);
				} else {
					next.set(trackId, { ...track, phase: "exit" });
				}
			}
			return { ...state, tracks: next };
		}

		case "EXIT_ALL_TRACKS": {
			const wbId = resolveWhiteboardTrackId(action.whiteboardTrackId);
			const next = new Map<number, RendererTrack>();
			for (const [trackId, track] of state.tracks) {
				if (trackId === wbId) {
					next.set(trackId, track);
				} else {
					next.set(trackId, { ...track, phase: "exit" });
				}
			}
			return { ...state, tracks: next };
		}

		case "ENTER_COMPLETE": {
			const current = state.tracks.get(action.trackId);
			if (!current || current.phase !== "enter") return state;
			const next = new Map(state.tracks);
			next.set(action.trackId, { ...current, phase: "idle" });
			return { ...state, tracks: next };
		}

		case "EXIT_COMPLETE": {
			if (!state.tracks.has(action.trackId)) return state;
			const next = new Map(state.tracks);
			next.delete(action.trackId);
			return { ...state, tracks: next };
		}

		case "SET_GRAPHIC_COMMAND": {
			const next = new Map(state.graphicCommands);
			next.set(action.command.targetBlockId, action.command);
			return { ...state, graphicCommands: next };
		}

		case "CLEAR_GRAPHIC_COMMAND": {
			const current = state.graphicCommands.get(action.targetBlockId);
			if (!current || current.seqNum !== action.seqNum) return state;
			const next = new Map(state.graphicCommands);
			next.delete(action.targetBlockId);
			return { ...state, graphicCommands: next };
		}

		case "RESET": {
			return initialRendererPlayoutState;
		}
	}
}

/** Highest-trackId renderer id used for heartbeat reporting. */
export function pickRendererTopItemId(
	tracks: ReadonlyMap<number, RendererTrack>,
): string | null {
	if (tracks.size === 0) return null;
	let topId: string | null = null;
	let topTrackId = -Infinity;
	for (const [trackId, track] of tracks) {
		if (trackId > topTrackId) {
			topTrackId = trackId;
			topId = track.item.id;
		}
	}
	return topId;
}

/** True when the given blockId is currently on PGM. */
export function isBlockOnProgram(
	tracks: ReadonlyMap<number, RendererTrack>,
	blockId: string,
): boolean {
	for (const track of tracks.values()) {
		if (track.item.id === blockId) return true;
	}
	return false;
}

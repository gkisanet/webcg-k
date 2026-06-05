/**
 * useRendererPlayoutRuntime
 *
 * Renderer's realtime playout runtime. Owns every concern that used to
 * live inside `/render` (session status, Realtime broadcast subscription,
 * track phase machine, graphic command dispatch, ACK, heartbeat, memory
 * monitor, clock offset calibration, timer interpolation).
 *
 * The view component consumes this hook and renders layers.
 * Side effects (network, intervals) are isolated here so the view stays
 * declarative and the state machine stays unit-testable.
 *
 * ■ Returned API
 *   - isPlayoutActive / isRehearsal: derived from session status
 *   - tracks / graphicCommands / fadeDuration: state machine output
 *   - filteredOverlays: tag-filtered overlay subset
 *   - overlayStore: pass-through `useOverlayStore` (timer plugin / render
 *     state reporting). The view only needs the relevant slices.
 *   - onTrackEnterComplete / onTrackExitComplete / onGraphicCommandHandled:
 *     forward fade-animation lifecycle events from layers.
 *
 * ■ Passive mode
 *   When `passive=true` (mirror preview) the hook never sends ACKs and
 *   never starts heartbeat/memory monitor — those are OBS-only concerns.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { OGrafCommandExecutionResult } from "../components/Renderer/OGrafWebComponentHost";
import {
	restoreMicroFlushState,
	sendAck,
	startHeartbeat,
	startMemoryMonitor,
} from "../lib/ackProtocol";
import { calibrateClockOffset, getClockOffset } from "../lib/clockSync";
import { sendRealtimeBroadcast } from "../lib/realtimeBroadcast";
import {
	createGraphicCommandResultPayload,
	isRendererGraphicCommandPayload,
	type RendererGraphicCommandDispatch,
	toRendererGraphicCommandDispatch,
} from "../lib/rendererGraphicCommand";
import {
	initialRendererPlayoutState,
	isBlockOnProgram,
	pickRendererTopItemId,
	type RendererTrack,
	rendererPlayoutReducer,
	WHITEBOARD_TRACK_ID,
} from "../lib/rendererPlayoutReducer";
import { parsePlayheadState, parseTimelineData } from "../lib/schemas";
import { supabase } from "../lib/supabase";
import { computeRemaining, isTimerReplicant } from "../lib/timerUtils";
import type {
	BroadcastItemPayload,
	Resolution,
	SessionStatus,
} from "../lib/types/broadcast";
import type { OverlayStateItem } from "./useOverlayStore";
import { useOverlayStore } from "./useOverlayStore";

export interface RendererPlayoutRuntimeOptions {
	sessionId: string | null;
	resolution: Resolution;
	tag: string | null;
	hideAnnotation: boolean;
	passive: boolean;
}

export interface RendererPlayoutRuntime {
	isPlayoutActive: boolean;
	isRehearsal: boolean;
	tracks: ReadonlyMap<number, RendererTrack>;
	graphicCommands: ReadonlyMap<string, RendererGraphicCommandDispatch>;
	fadeDuration: number;
	programOverlays: OverlayStateItem[];
	filteredOverlays: OverlayStateItem[];
	overlayStore: ReturnType<typeof useOverlayStore>;
	onTrackEnterComplete: (trackId: number) => void;
	onTrackExitComplete: (trackId: number) => void;
	onGraphicCommandHandled: (
		command: RendererGraphicCommandDispatch,
		result: OGrafCommandExecutionResult,
	) => void;
}

type OverlayStateItemWithTags = OverlayStateItem & {
	tags?: string[];
	group_tag?: string | null;
};

interface SessionStatusChangePayload {
	new?: { status?: unknown };
}

const DEFAULT_FADE_DURATION_MS = 800;
const HEARTBEAT_INTERVAL_MS = 1000;
const TIMER_TICK_INTERVAL_MS = 1000;
const TIMER_PUBLISH_THRESHOLD_SEC = 0.5;

export function useRendererPlayoutRuntime(
	options: RendererPlayoutRuntimeOptions,
): RendererPlayoutRuntime {
	const { sessionId, tag, passive } = options;

	const [state, dispatch] = useReducer(
		rendererPlayoutReducer,
		initialRendererPlayoutState,
	);
	const [fadeDuration, setFadeDuration] = useState<number>(
		DEFAULT_FADE_DURATION_MS,
	);
	const [playoutStatus, setPlayoutStatus] = useState<SessionStatus>("ready");

	// Tracks-ref is read inside broadcast handlers (latest snapshot of phase map).
	const tracksRef = useRef<ReadonlyMap<number, RendererTrack>>(state.tracks);
	useEffect(() => {
		tracksRef.current = state.tracks;
	}, [state.tracks]);

	// Active broadcast channel ref for ACK + graphic command result.
	const broadcastChannelRef = useRef<RealtimeChannel | null>(null);

	const isPlayoutActive =
		playoutStatus === "live" || playoutStatus === "rehearsal";
	const isRehearsal = playoutStatus === "rehearsal";

	// ── Overlay store (single Realtime channel per session) ─────────────
	const overlayStore = useOverlayStore(sessionId ?? undefined);
	const { programOverlays, updateReplicantData } = overlayStore;

	const filteredOverlays = useMemo<OverlayStateItem[]>(() => {
		if (!tag) return programOverlays;
		return programOverlays.filter(
			(o) =>
				(o as OverlayStateItemWithTags).tags?.includes(tag) ||
				(o as OverlayStateItemWithTags).group_tag === tag,
		);
	}, [programOverlays, tag]);

	// ── Session status: live / rehearsal / ended ─────────────────────────
	useEffect(() => {
		if (!sessionId) {
			setPlayoutStatus("ready");
			return;
		}
		const statusChannel = supabase
			.channel(`renderer-status:${sessionId}`)
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "broadcast_sessions",
					filter: `id=eq.${sessionId}`,
				},
				(payload: SessionStatusChangePayload) => {
					const raw = payload.new?.status;
					const next = (
						typeof raw === "string" ? raw : "ready"
					) as SessionStatus;
					setPlayoutStatus(next);
					if (next !== "live" && next !== "rehearsal") {
						dispatch({
							type: "EXIT_ALL_TRACKS",
							whiteboardTrackId: WHITEBOARD_TRACK_ID,
						});
					}
				},
			)
			.subscribe();
		return () => {
			statusChannel.unsubscribe();
		};
	}, [sessionId]);

	// ── Initial state hydration: read timeline + playhead from DB ───────
	useEffect(() => {
		if (!sessionId) return;
		let cancelled = false;
		(async () => {
			const { data, error } = await supabase
				.from("broadcast_sessions")
				.select("status, playhead_state, timeline_data")
				.eq("id", sessionId)
				.single();
			if (cancelled || error || !data) return;
			setPlayoutStatus((data.status as SessionStatus) ?? "ready");
			const ps = parsePlayheadState(data.playhead_state);
			const pgmBlockIds = ps.pgmBlockIds ?? {};
			const active = data.status === "live" || data.status === "rehearsal";
			if (active && Object.keys(pgmBlockIds).length > 0 && data.timeline_data) {
				const blocks = parseTimelineData(data.timeline_data);
				const restored = new Map<number, RendererTrack>();
				for (const [trackIdStr, blockId] of Object.entries(pgmBlockIds)) {
					const blk = blocks.find((b) => b.id === blockId);
					if (!blk && blockId.startsWith("wb-pgm-")) {
						restored.set(Number(trackIdStr), {
							item: whiteboardItem(blockId, Number(trackIdStr)),
							phase: "idle",
						});
						continue;
					}
					if (blk) {
						restored.set(Number(trackIdStr), {
							item: blockToItem(blk, Number(trackIdStr)),
							phase: "idle",
						});
					}
				}
				if (restored.size > 0) {
					dispatch({ type: "HYDRATE_TRACKS", tracks: restored });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [sessionId]);

	// ── Broadcast channel: PLAY/PLAY_MULTI/STOP/CLEAR/GRAPHIC_COMMAND ──
	const sendGraphicCommandResult = useCallback(
		(
			command: RendererGraphicCommandDispatch,
			result: OGrafCommandExecutionResult,
		) => {
			if (passive) return;
			const channel = broadcastChannelRef.current;
			if (!channel) return;
			const resultPayload = createGraphicCommandResultPayload({
				command,
				status: result.status,
				message: result.message,
				statusCode: result.statusCode,
				currentStep: result.currentStep,
			});
			void sendRealtimeBroadcast(
				channel,
				"graphic-command-result",
				resultPayload as unknown as Record<string, unknown>,
				{ restFallback: true },
			);
		},
		[passive],
	);

	useEffect(() => {
		if (!sessionId) return;
		const channel = supabase.channel(`broadcast:${sessionId}`);
		broadcastChannelRef.current = channel;

		channel
			.on("broadcast", { event: "playout" }, ({ payload }) => {
				const data = payload as Record<string, unknown> | null;
				if (!data) return;

				if (typeof data.fadeDuration === "number") {
					setFadeDuration(data.fadeDuration);
				}

				if (isRendererGraphicCommandPayload(data)) {
					const command = toRendererGraphicCommandDispatch(data);
					const onPgm = isBlockOnProgram(
						tracksRef.current,
						command.targetBlockId,
					);
					if (!onPgm) {
						console.warn(
							"[Renderer] Graphic command target is not on PGM:",
							command.targetBlockId,
						);
						if (!passive && typeof data.seqNum === "number") {
							sendAck(
								channel,
								data.seqNum,
								"error",
								"Graphic command target is not on PGM",
							);
						}
						sendGraphicCommandResult(command, {
							status: "error",
							message: "Graphic command target is not on PGM",
						});
						return;
					}
					dispatch({ type: "SET_GRAPHIC_COMMAND", command });
					if (!passive && typeof data.seqNum === "number") {
						sendAck(channel, data.seqNum, "received");
					}
					return;
				}

				const action = data.action;
				const seqNum = typeof data.seqNum === "number" ? data.seqNum : null;

				if (action === "PLAY_MULTI" && Array.isArray(data.items)) {
					dispatch({
						type: "PLAY_MULTI",
						items: data.items as BroadcastItemPayload[],
						whiteboardTrackId: WHITEBOARD_TRACK_ID,
					});
					if (!passive && seqNum !== null) sendAck(channel, seqNum, "rendered");
					return;
				}

				if (action === "PLAY" && data.item) {
					dispatch({
						type: "PLAY_SINGLE",
						item: data.item as BroadcastItemPayload,
						whiteboardTrackId: WHITEBOARD_TRACK_ID,
					});
					if (!passive && seqNum !== null) sendAck(channel, seqNum, "rendered");
					return;
				}

				if (action === "STOP" || action === "CLEAR") {
					dispatch({
						type: "STOP_OR_CLEAR",
						whiteboardTrackId: WHITEBOARD_TRACK_ID,
					});
					if (!passive && seqNum !== null) sendAck(channel, seqNum, "received");
					return;
				}
			})
			.subscribe((status) => {
				if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					console.warn(`[Renderer] 채널 ${status} — 3초 후 재연결 시도`);
					setTimeout(() => {
						channel.unsubscribe();
						channel.subscribe();
					}, 3000);
				}
			});

		const stopHeartbeat = passive
			? () => {}
			: startHeartbeat(
					channel,
					() => pickRendererTopItemId(tracksRef.current),
					HEARTBEAT_INTERVAL_MS,
				);

		return () => {
			stopHeartbeat();
			channel.unsubscribe();
			if (broadcastChannelRef.current === channel) {
				broadcastChannelRef.current = null;
			}
		};
	}, [passive, sendGraphicCommandResult, sessionId]);

	// ── Memory monitor + Micro-Flush restore (OBS-only) ───────────────
	useEffect(() => {
		if (passive) return;
		const restored = restoreMicroFlushState();
		if (restored) {
			console.log("[Health] Micro-Flush 후 PGM 복원 시도:", restored);
		}
		return startMemoryMonitor(() => pickRendererTopItemId(tracksRef.current));
	}, [passive]);

	// ── Clock offset calibration (one-shot) ────────────────────────────
	useEffect(() => {
		calibrateClockOffset().then((offset) => {
			console.log("[Renderer] Clock offset calibrated:", offset, "ms");
		});
	}, []);

	// ── Timer interpolation tick (1s) ─────────────────────────────────
	useEffect(() => {
		if (!sessionId) return;
		const tick = () => {
			const offset = getClockOffset();
			for (const overlay of programOverlays) {
				const data = overlay.replicant_data;
				if (!isTimerReplicant(data)) continue;
				if (!data.running) continue;
				const remaining = computeRemaining(data, offset);
				if (
					Math.abs(remaining - data.remaining) >= TIMER_PUBLISH_THRESHOLD_SEC
				) {
					void updateReplicantData(
						overlay.id,
						{ ...data, remaining },
						{ skipDb: true },
					);
				}
			}
		};
		const interval = setInterval(tick, TIMER_TICK_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [sessionId, programOverlays, updateReplicantData]);

	// ── View handlers ─────────────────────────────────────────────────
	const onTrackEnterComplete = useCallback((trackId: number) => {
		dispatch({ type: "ENTER_COMPLETE", trackId });
	}, []);
	const onTrackExitComplete = useCallback((trackId: number) => {
		dispatch({ type: "EXIT_COMPLETE", trackId });
	}, []);
	const onGraphicCommandHandled = useCallback(
		(
			command: RendererGraphicCommandDispatch,
			result: OGrafCommandExecutionResult,
		) => {
			dispatch({
				type: "CLEAR_GRAPHIC_COMMAND",
				targetBlockId: command.targetBlockId,
				seqNum: command.seqNum,
			});
			sendGraphicCommandResult(command, result);
		},
		[sendGraphicCommandResult],
	);

	return {
		isPlayoutActive,
		isRehearsal,
		tracks: state.tracks,
		graphicCommands: state.graphicCommands,
		fadeDuration,
		programOverlays,
		filteredOverlays,
		overlayStore,
		onTrackEnterComplete,
		onTrackExitComplete,
		onGraphicCommandHandled,
	};
}

function whiteboardItem(
	blockId: string,
	trackId: number,
): BroadcastItemPayload {
	const boardId = blockId.slice("wb-pgm-".length);
	return {
		id: blockId,
		name: "판서 레이어",
		trackId,
		sourceType: "whiteboard",
		sourceData: { whiteboardId: boardId },
	};
}

interface ParsedTimelineBlock {
	id: string;
	name: string;
	trackId: number;
	source_type?: string;
	data?: unknown;
	sourceData?: unknown;
	transitionIn?: string;
	transitionOut?: string;
}

function normalizeTransition(value: string | undefined): "fade" | "cut" {
	return value === "cut" ? "cut" : "fade";
}

function blockToItem(
	blk: ParsedTimelineBlock,
	trackId: number,
): BroadcastItemPayload {
	return {
		id: blk.id,
		name: blk.name,
		trackId: blk.trackId ?? trackId,
		sourceType: blk.source_type as BroadcastItemPayload["sourceType"],
		sourceData: (blk.data ??
			blk.sourceData) as BroadcastItemPayload["sourceData"],
		transitionIn: normalizeTransition(blk.transitionIn),
		transitionOut: normalizeTransition(blk.transitionOut),
	};
}

/**
 * Render Page
 * OBS 브라우저 소스용 투명 배경 렌더러
 * URL: /render?sessionId=xxx&resolution=1080p
 * 
 * 스케일링 파이프라인 (리팩토링 완료):
 * - CSS transform: scale() 제거 → sub-pixel jitter 원천 차단
 * - SVG viewBox 네이티브 스케일링만 사용 (GraphicPreviewRenderer)
 * - AnimatedGraphicRenderer: 자체 ResizeObserver 기반 scale 처리
 * 
 * 상세 문서: docs/RENDERER_RESOLUTION.md
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { GraphicPreviewRenderer } from "../components/GraphicPreviewRenderer";
import { AnimatedGraphicRenderer } from "../components/AnimatedGraphicRenderer";
import { CompositorLayer } from "../components/Compositor/CompositorLayer";
import { ThemeProvider } from "../components/SemanticRenderer/ThemeProvider";
import { useOverlayStore } from "../hooks/useOverlayStore";
import { computeRemaining, isTimerReplicant } from "../lib/timerUtils";
import { AiCharacterLayer } from "../components/Controller/AiCharacterLayer";
import { type Resolution, type BroadcastItemPayload, type SessionStatus } from "../lib/types/broadcast";
import { parsePlayheadState, parseTimelineData } from "../lib/schemas";
import { RendererWhiteboard } from "../components/Renderer/RendererWhiteboard";
import { BroadcastHtmlOverlay } from "../components/Renderer/BroadcastHtmlOverlay";
import { SilentErrorBoundary } from "../components/ErrorBoundary";
import { normalizeBroadcastSourceData } from "../lib/broadcastSourceData";
import {
	startHeartbeat,
	sendAck,
	startMemoryMonitor,
	restoreMicroFlushState,
} from "../lib/ackProtocol";
import { calibrateClockOffset, getClockOffset } from "../lib/clockSync";

// 라우트 정의
export const Route = createFileRoute("/render")({
	validateSearch: (search: Record<string, unknown>) => {
		const resolution = search.resolution as string;
		const sessionId = search.sessionId as string;
		// ■ tag 안전 변환: URL에서 "null", "undefined" 문자열이 들어오는 경우 실제 null로 변환
		// Why? 브라우저 주소창에 tag=null이 문자열로 남아 있으면
		//   필터가 "null"이라는 존재하지 않는 태그를 찾아 오버레이가 전부 사라진다.
		const rawTag = search.tag as string;
		const tag = (rawTag && rawTag !== "null" && rawTag !== "undefined") ? rawTag : null;
		const hideAnnotation =
			search.hideAnnotation === "1" ||
			search.hideAnnotation === "true" ||
			search.hideAnnotation === true;
		const passive =
			search.passive === "1" ||
			search.passive === "true" ||
			search.passive === true;
		return {
			resolution: (resolution === "4k" ? "4k" : "1080p") as Resolution,
			sessionId: sessionId || null,
			tag: tag || null,
			hideAnnotation,
			passive,
		};
	},
	component: RenderPage,
});

function RenderPage() {
	const { sessionId, resolution, tag, hideAnnotation, passive } = Route.useSearch();

	// 세션 상태 — 실제 송출과 리허설 모두 렌더러 출력 대상이다.
	const [playoutStatus, setPlayoutStatus] = useState<SessionStatus>("ready");
	const isPlayoutActive = playoutStatus === "live" || playoutStatus === "rehearsal";
	const isRehearsal = playoutStatus === "rehearsal";

	// ■ 오버레이 단일 진실점 — 렌더러 독립 인스턴스
	// 컨트롤러와 별도의 Realtime 채널 1개만 구독
	const { programOverlays, handlePluginAction, updateReplicantData, reportRenderState } = useOverlayStore(sessionId ?? undefined);

	// ■ 오버레이 디버그 로그: 오버레이 상태 변경 추적
	useEffect(() => {
		console.log(
			"[Renderer] 오버레이 상태:",
			`sessionId=${sessionId}`,
			`isPlayoutActive=${isPlayoutActive}`,
			`programOverlays=${programOverlays.length}개`,
			`tag=${tag ?? "없음"}`,
			programOverlays.map(o => `${o.id.slice(0,8)}(active=${o.is_active})`),
		);
	}, [sessionId, isPlayoutActive, programOverlays, tag]);

	// ■ 태그 필터: tag 파라미터가 있으면 해당 태그 오버레이만 표시
	// Why useMemo? programOverlays가 변경될 때만 필터 재실행.
	// 비유: OBS 브라우저 소스마다 "viewer" / "candidate" 태그를 지정하여
	//       같은 세션의 다른 오버레이 서브셋을 물리적으로 다른 화면에 표시.
	const filteredOverlays = useMemo(() => {
		if (!tag) return programOverlays; // 태그 없으면 전체 (기존 동작)
		return programOverlays.filter((o) =>
			(o as any).tags?.includes(tag) || (o as any).group_tag === tag
		);
	}, [programOverlays, tag]);

	// ■ 멀티트랙 동시 송출: trackId → { item, phase } 맵
	// Why TrackState? 각 트랙이 독립적인 fade-in/fade-out 페이즈를 가짐.
	// Track 1(배경) 유지 중 Track 2(자막)만 교체 시 Track 1이 재페이드되지 않는다.
	interface TrackState {
		item: BroadcastItemPayload;
		phase: "enter" | "idle" | "exit";
	}
	const [tracks, setTracks] = useState<Map<number, TrackState>>(new Map());
	// ■ 컨트롤러에서 설정한 fade 듀레이션 (기본값: 800ms)
	// Why state? 매 송출 명령마다 컨트롤러가 설정값을 함께 보내므로
	// 운영자가 런타임에 fade 시간을 변경해도 즉시 반영된다.
	const [fadeDuration, setFadeDuration] = useState(800);

	// Per-track exit 애니메이션 완료 후 해당 트랙만 제거
	const handleTrackExitComplete = useCallback((trackId: number) => {
		setTracks(prev => {
			const next = new Map(prev);
			next.delete(trackId);
			return next;
		});
	}, []);

	// Heartbeat용 ref
	const tracksRef = useRef<Map<number, TrackState>>(new Map());
	useEffect(() => {
		tracksRef.current = tracks;
	}, [tracks]);

	// 세션 상태 구독 — live/rehearsal/ended 변경 실시간 감지
	useEffect(() => {
		if (!sessionId) return;

		const loadInitialState = async () => {
			try {
				const { data, error } = await supabase
					.from("broadcast_sessions")
					.select("status, playhead_state, timeline_data")
					.eq("id", sessionId)
					.single();

				if (error || !data) {
					console.warn("[Renderer] 세션 조회 실패:", error);
					return;
				}

				const status = data.status as SessionStatus;
				const active = status === "live" || status === "rehearsal";
				setPlayoutStatus(status);

				// ■ 멀티트랙 복원: pgmBlockIds에서 모든 활성 블록 복원
				const ps = parsePlayheadState(data.playhead_state);
				const pgmBlockIds = ps.pgmBlockIds ?? {};
				if (active && Object.keys(pgmBlockIds).length > 0 && data.timeline_data) {
					const blocks = parseTimelineData(data.timeline_data);
					const restoredItems = new Map<number, BroadcastItemPayload>();
					for (const [trackIdStr, blockId] of Object.entries(pgmBlockIds)) {
						const blk = blocks.find((b) => b.id === blockId);
						
						if (!blk && blockId.startsWith("wb-pgm-")) {
							const boardId = blockId.slice("wb-pgm-".length);
							restoredItems.set(Number(trackIdStr), {
								id: blockId,
								name: "판서 레이어",
								trackId: Number(trackIdStr),
								sourceType: "whiteboard",
								sourceData: { whiteboardId: boardId } as any,
							});
							continue;
						}

						if (blk) {
							const graphicData = blk.data ?? blk.sourceData ?? undefined;
							restoredItems.set(Number(trackIdStr), {
								id: blk.id,
								name: blk.name,
								trackId: blk.trackId,
								sourceType: blk.source_type as any,
								sourceData: graphicData as any,
							});
						}
					}
					if (restoredItems.size > 0) {
						console.log("[Renderer] 멀티트랙 PGM 복원:", restoredItems.size, "개");
						const restoredTracks = new Map<number, TrackState>();
						for (const [tid, item] of restoredItems) {
							restoredTracks.set(tid, { item, phase: "idle" as const });
						}
						setTracks(restoredTracks);
					}
				}
			} catch (err) {
				console.error("[Renderer] 초기 상태 로드 오류:", err);
			}
		};

		loadInitialState();

		const statusChannel = supabase
			.channel(`renderer-status:${sessionId}`)
			.on(
				"postgres_changes" as any,
				{
					event: "UPDATE",
					schema: "public",
					table: "broadcast_sessions",
					filter: `id=eq.${sessionId}`,
				},
				(payload: any) => {
					const newStatus = payload.new?.status;
					const active = newStatus === "live" || newStatus === "rehearsal";
					setPlayoutStatus((newStatus as SessionStatus) ?? "ready");
					if (!active) setTracks(prev => {
						const next = new Map(prev);
						for (const [id, ts] of next) next.set(id, { ...ts, phase: "exit" as const });
						return next;
					});
				},
			)
			.subscribe();

		return () => { statusChannel.unsubscribe(); };
	}, [sessionId]);

	// Realtime 채널 구독
	useEffect(() => {
		if (!sessionId) return;

		const channel = supabase.channel(`broadcast:${sessionId}`);

		channel
			.on("broadcast", { event: "playout" }, (payload) => {
				console.log("[Renderer] Received playout:", payload.payload);
				const data = payload.payload;

				// 컨트롤러에서 전달한 fade 듀레이션 반영
				if (data.fadeDuration != null) {
					setFadeDuration(data.fadeDuration);
				}

				if (data.action === "PLAY_MULTI" && data.items) {
					// ■ 멀티트랙: 새 아이템만 enter, 기존 idle 유지 (재진입 깜빡임 방지)
					// ■ 판서 트랙(99) 보호: 판서는 WhiteboardPanel에서 독립 제어되므로
					//   타임라인 그래픽 PLAY_MULTI 명령에서 절대 exit 시키지 않는다.
					//   비유: 화이트보드는 별도 리모컨으로 조작하는 독립 화면 — CG 전환과 무관.
					setTracks((prev) => {
						const newTracks = new Map<number, TrackState>();
						for (const item of data.items) {
							const trackId = item.trackId ?? 0;
							const existing = prev.get(trackId);
							const phase =
								existing && existing.item.id === item.id && existing.phase === "idle"
									? "idle"
									: "enter";
							newTracks.set(trackId, { item, phase });
						}
						for (const [trackId, ts] of prev) {
							if (!newTracks.has(trackId)) {
								// ■ trackId 99(판서) 보호: 타임라인 그래픽 변경으로 인한 exit를 방지
								if (trackId === 99) {
									newTracks.set(trackId, ts); // 기존 상태 유지
								} else {
									newTracks.set(trackId, { ...ts, phase: "exit" });
								}
							}
						}
						return newTracks;
					});

					if (!passive && data.seqNum != null) sendAck(channel, data.seqNum, "rendered");
				} else if (data.action === "PLAY" && data.item) {
					// 레거시 단일 PLAY 호환
					// ■ 판서 트랙(99) 보호: 레거시 PLAY도 판서 상태를 보존
					setTracks((prev) => {
						const newTracks = new Map<number, TrackState>();
						newTracks.set(data.item.trackId ?? 0, { item: data.item, phase: "enter" });
						// 판서 트랙 보존
						const wb = prev.get(99);
						if (wb) newTracks.set(99, wb);
						return newTracks;
					});
					if (!passive && data.seqNum != null) sendAck(channel, data.seqNum, "rendered");
				} else if (data.action === "STOP" || data.action === "CLEAR") {
					// ■ 판서 트랙(99) 보호: STOP/CLEAR는 타임라인 그래픽만 소거
					//   판서는 별도 "whiteboard" 이벤트로 제어된다.
					setTracks(prev => {
						const next = new Map(prev);
						for (const [id, ts] of next) {
							if (id === 99) continue; // 판서 보호
							next.set(id, { ...ts, phase: "exit" });
						}
						return next;
					});
					if (!passive && data.seqNum != null) sendAck(channel, data.seqNum, "received");
				}
			})
			.subscribe((status) => {
				console.log("[Renderer] Channel subscription status:", status);

				// ■ 채널 자동 재연결 (T1-4)
				// Why? OBS 브라우저 소스가 24시간 가동 시 네트워크 순간 끊김 발생 가능.
				// CHANNEL_ERROR/TIMED_OUT 시 3초 후 자동 재구독.
				if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					console.warn(`[Renderer] 채널 ${status} — 3초 후 재연결 시도`);
					setTimeout(() => {
						channel.unsubscribe();
						channel.subscribe();
					}, 3000);
				}
			});

		// Heartbeat: 최상위 트랙 아이템 ID 반환
		const stopHeartbeat = passive
			? () => {}
			: startHeartbeat(
					channel,
					() => {
						const items = tracksRef.current;
						if (items.size === 0) return null;
						// 가장 높은 trackId의 아이템 ID 반환
						const sorted = [...items.entries()].sort(([a], [b]) => b - a);
						return sorted[0]?.[1]?.item?.id ?? null;
					},
					1000,
				);

		return () => {
			stopHeartbeat();
			channel.unsubscribe();
		};
	}, [passive, sessionId]);

	// Micro-Flush 복원 + 메모리 감시
	useEffect(() => {
		const restoredId = restoreMicroFlushState();
		if (restoredId) {
			console.log("[Health] Micro-Flush 후 PGM 복원 시도:", restoredId);
		}

		const stopMemoryMonitor = startMemoryMonitor(
			() => {
				const items = tracksRef.current;
				if (items.size === 0) return null;
				const sorted = [...items.entries()].sort(([a], [b]) => b - a);
				return sorted[0]?.[1]?.item?.id ?? null;
			},
		);

		return stopMemoryMonitor;
	}, []);

	// ■ Clock Offset 캘리브레이션 — 초기 로드 시 1회
	useEffect(() => {
		calibrateClockOffset().then((offset) => {
			console.log("[Renderer] Clock offset calibrated:", offset, "ms");
		});
	}, []);

	// ■ 타이머 틱 루프 — 1초 주기로 remaining 갱신하여 모든 iframe에 전파
	useEffect(() => {
		if (!sessionId) return;

		const tick = () => {
			for (const overlay of programOverlays) {
				const data = overlay.replicant_data;
				if (!isTimerReplicant(data)) continue;
				if (!data.running) continue;

				const offset = getClockOffset();
				const remaining = computeRemaining(data, offset);

				// remaining이 DB 값과 다를 때만 업데이트 (불필요한 re-render 방지)
				// ■ skipDb: Controller가 DB 단일 진실점 — Renderer는 로컬 interpolation만 수행
				if (Math.abs(remaining - data.remaining) >= 0.5) {
					updateReplicantData(overlay.id, {
						...data,
						remaining,
					}, { skipDb: true });
				}
			}
		};

		const interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
	}, [sessionId, programOverlays, updateReplicantData]);

	// 개별 아이템 렌더링 함수
	const renderGraphicItem = useCallback((item: BroadcastItemPayload, phase: TrackState["phase"] = "enter") => {
		if (!item || !item.sourceData) return null;

		const source = normalizeBroadcastSourceData(item.sourceType, item.sourceData);

		if (source.kind === "whiteboard") {
			if (hideAnnotation) return null;
			return <RendererWhiteboard whiteboardId={source.whiteboardId} phase={phase} />;
		}

		if (source.kind === "overlay") {
			return <BroadcastHtmlOverlay payload={source.overlay} title={item.name} />;
		}

		if (source.kind === "template" || source.kind === "image") {
			const needsDomRenderer = source.kind === "template" && source.elements.some(
				(el: any) => el.animation || el.type === "html_plugin"
			);

			return (
				<div style={{ position: "absolute", inset: 0 }}>
					{source.kind === "template" ? (
						needsDomRenderer ? (
							<AnimatedGraphicRenderer
								elements={source.elements}
								canvasWidth={source.canvasWidth}
								canvasHeight={source.canvasHeight}
								phase={phase === "exit" ? "exit" : "enter"}
								style={{ width: "100%", height: "100%" }}
								resolution={resolution}
								// ■ onExitComplete 의도적 생략: 외부 래퍼 div의 onAnimationEnd가 cleanup 담당
							/>
						) : (
							<GraphicPreviewRenderer
								elements={source.elements}
								canvasWidth={source.canvasWidth}
								canvasHeight={source.canvasHeight}
								resolution={resolution}
							/>
						)
					) : (
						<img
							src={source.imageUrl}
							alt={source.imageName || item.name}
							style={
								source.imageX !== undefined && source.imageY !== undefined
									? {
											position: "absolute",
											left: `${(source.imageX / 1920) * 100}%`,
											top: `${(source.imageY / 1080) * 100}%`,
											width: source.imageW ? `${(source.imageW / 1920) * 100}%` : "100%",
											height: source.imageH ? `${(source.imageH / 1080) * 100}%` : "100%",
											objectFit: "contain",
											pointerEvents: "none",
									  }
									: { width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }
							}
						/>
					)}
				</div>
			);
		}

		return (
			<div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "24px" }}>
				{item.name} (No Graphic Data)
			</div>
		);
	}, [hideAnnotation, resolution]);

	return (
		<div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
			<ThemeProvider>
				<div style={{ width: "100vw", height: "100vh", position: "relative", backgroundColor: "transparent" }}>
				{/* ■ 멀티트랙 동시 렌더링: trackId 오름차순 Z-index, per-track phase */}
				{isPlayoutActive && tracks.size > 0 && (
					[...tracks.entries()]
						.sort(([a], [b]) => a - b)
						.map(([trackId, { item, phase }]) => (
							<div
								key={trackId}
								style={{
									position: "absolute",
									inset: 0,
									zIndex: trackId * 10 + 10,
									animation:
										phase === "enter"
											? `fadeIn ${fadeDuration}ms ease-out forwards`
											: phase === "exit"
												? `fadeOut ${fadeDuration}ms ease-in forwards`
												: undefined,
									opacity: phase === "idle" ? 1 : undefined,
								}}
								onAnimationEnd={() => {
									if (phase === "exit") handleTrackExitComplete(trackId);
								}}
							>
								{renderGraphicItem(item, phase)}
							</div>
						))
				)}

				{isRehearsal && (
					<div
						style={{
							position: "absolute",
							top: 16,
							right: 16,
							zIndex: 10000,
							padding: "4px 8px",
							borderRadius: 4,
							background: "rgba(96, 165, 250, 0.72)",
							border: "1px solid rgba(96, 165, 250, 0.6)",
							color: "white",
							fontSize: 11,
							fontWeight: 700,
							letterSpacing: 0,
							lineHeight: 1,
							pointerEvents: "none",
						}}
					>
						REHEARSAL
					</div>
				)}

				{/* 대기 상태 (sessionId 없을 때만 표시) */}
				{!sessionId && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "rgba(255,255,255,0.3)",
							fontSize: "24px",
							flexDirection: "column",
							gap: "16px",
						}}
					>
						<span>세션 ID가 필요합니다</span>
						<span style={{ fontSize: "14px" }}>
							/render?sessionId=xxx 형식으로 접속하세요
						</span>
					</div>
				)}

				{/* Layer 2+: 오버레이 — 송출 또는 리허설 중일 때만 표시 */}
				{/* 🛡️ 각 레이어를 SilentErrorBoundary로 격리 — 하나가 크래시해도 다른 레이어/송출 유지 */}
				{isPlayoutActive && sessionId && filteredOverlays.length > 0 && (
					<SilentErrorBoundary componentName="CompositorLayer">
						<CompositorLayer
							overlays={filteredOverlays}
							onPluginAction={handlePluginAction}
							onRenderStateChange={passive ? undefined : reportRenderState}
						/>
					</SilentErrorBoundary>
				)}
				{isPlayoutActive && sessionId && (
					<SilentErrorBoundary componentName="AiCharacterLayer">
						<AiCharacterLayer sessionId={sessionId} mode="pgm" />
					</SilentErrorBoundary>
				)}
			</div>
		</ThemeProvider>

			{/* CSS 애니메이션 */}
			<style>{`
				body {
					margin: 0;
					padding: 0;
					background: transparent !important;
					overflow: hidden;
				}
				
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				
				@keyframes fadeOut {
					from { opacity: 1; }
					to { opacity: 0; }
				}
			`}</style>
		</div>
	);
}

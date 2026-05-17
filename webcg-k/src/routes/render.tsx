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
import { buildPluginSrcdoc } from "../lib/webcgkSrcdoc";
import { ThemeProvider } from "../components/SemanticRenderer/ThemeProvider";
import { useOverlayStore } from "../hooks/useOverlayStore";
import { computeRemaining, isTimerReplicant } from "../lib/timerUtils";
import { AiCharacterLayer } from "../components/Controller/AiCharacterLayer";
import { SilentErrorBoundary } from "../components/ErrorBoundary";
import { type Resolution, type BroadcastItemPayload } from "../lib/types/broadcast";
import { parsePlayheadState, parseTimelineData } from "../lib/schemas";
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
		// ■ tag 파라미터: 특정 태그의 오버레이만 렌더링
		// 예: /render?sessionId=xxx&tag=viewer → "viewer" 태그 오버레이만 표시
		// 태그 없으면 기존 동작(모든 오버레이 표시)
		const tag = search.tag as string;
		return {
			resolution: (resolution === "4k" ? "4k" : "1080p") as Resolution,
			sessionId: sessionId || null,
			tag: tag || null,
		};
	},
	component: RenderPage,
});

function RenderPage() {
	const { sessionId, resolution, tag } = Route.useSearch();

	// 세션 상태 — live일 때만 그래픽 표시
	const [isLive, setIsLive] = useState(false);

	// ■ 오버레이 단일 진실점 — 렌더러 독립 인스턴스
	// 컨트롤러와 별도의 Realtime 채널 1개만 구독
	const { programOverlays, handlePluginAction, updateReplicantData, reportRenderState } = useOverlayStore(sessionId ?? undefined);

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

	// 세션 상태 구독 — live/ended 변경 실시간 감지
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

				const live = data.status === "live";
				setIsLive(live);

				// ■ 멀티트랙 복원: pgmBlockIds에서 모든 활성 블록 복원
				const ps = parsePlayheadState(data.playhead_state);
				const pgmBlockIds = ps.pgmBlockIds ?? {};
				if (live && Object.keys(pgmBlockIds).length > 0 && data.timeline_data) {
					const blocks = parseTimelineData(data.timeline_data);
					const restoredItems = new Map<number, BroadcastItemPayload>();
					for (const [trackIdStr, blockId] of Object.entries(pgmBlockIds)) {
						const blk = blocks.find((b) => b.id === blockId);
						if (blk) {
							const graphicData = blk.data ?? blk.sourceData ?? undefined;
							restoredItems.set(Number(trackIdStr), {
								id: blk.id,
								name: blk.name,
								trackId: blk.trackId,
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
					const nowLive = newStatus === "live";
					setIsLive(nowLive);
					if (!nowLive) setTracks(prev => {
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
					setIsLive(true);
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
								newTracks.set(trackId, { ...ts, phase: "exit" });
							}
						}
						return newTracks;
					});

					if (data.seqNum != null) sendAck(channel, data.seqNum, "rendered");
				} else if (data.action === "PLAY" && data.item) {
					// 레거시 단일 PLAY 호환
					setIsLive(true);
					const newTracks = new Map<number, TrackState>();
					newTracks.set(data.item.trackId ?? 0, { item: data.item, phase: "enter" });
					setTracks(newTracks);
					if (data.seqNum != null) sendAck(channel, data.seqNum, "rendered");
				} else if (data.action === "STOP" || data.action === "CLEAR") {
					setTracks(prev => {
						const next = new Map(prev);
						for (const [id, ts] of next) next.set(id, { ...ts, phase: "exit" });
						return next;
					});
					if (data.seqNum != null) sendAck(channel, data.seqNum, "received");
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
		const stopHeartbeat = startHeartbeat(
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
	}, [sessionId]);

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

		const isOverlay = item.sourceType === "overlay" && (item.sourceData.html || item.sourceData.css);
		const isTemplate = item.sourceData.elements && item.sourceData.elements.length > 0;
		const isImage = item.sourceType === "image" && item.sourceData.imageUrl;


		// AI Cuesheet overlay: render iframe directly from HTML+CSS payload
		if (isOverlay) {
			const overlayHtml = item.sourceData.html || "";
			const overlayCss = item.sourceData.css || "";
			const srcdoc = buildPluginSrcdoc({
				html: overlayHtml, css: overlayCss, js: "",
				width: 1920, height: 1080, autoShow: true,
			});
			return (
				<div style={{ position: "absolute", inset: 0 }}>
					<iframe
						srcDoc={srcdoc}
						style={{ width: "100%", height: "100%", border: "none" }}
						sandbox="allow-scripts"
						title={item.name}
					/>
				</div>
			);
		}

		if (isTemplate || isImage) {
			const cw = item.sourceData.canvasWidth || 1920;
			const ch = item.sourceData.canvasHeight || 1080;

			const needsDomRenderer = isTemplate && item.sourceData.elements?.some(
				(el: any) => el.animation || el.type === "html_plugin"
			);

			return (
				<div style={{ position: "absolute", inset: 0 }}>
					{isTemplate ? (
						needsDomRenderer ? (
							<AnimatedGraphicRenderer
								elements={item.sourceData.elements || []}
								canvasWidth={cw}
								canvasHeight={ch}
								phase={phase === "exit" ? "exit" : "enter"}
								style={{ width: "100%", height: "100%" }}
								resolution={resolution}
								// ■ onExitComplete 의도적 생략: 외부 래퍼 div의 onAnimationEnd가 cleanup 담당
							/>
						) : (
							<GraphicPreviewRenderer
								elements={item.sourceData.elements || []}
								canvasWidth={cw}
								canvasHeight={ch}
								resolution={resolution}
							/>
						)
					) : (
						<img
							src={item.sourceData.imageUrl}
							alt={item.sourceData.imageName || item.name}
							style={
								item.sourceData.imageX !== undefined && item.sourceData.imageY !== undefined
									? {
											position: "absolute",
											left: `${(item.sourceData.imageX / 1920) * 100}%`,
											top: `${(item.sourceData.imageY / 1080) * 100}%`,
											width: item.sourceData.imageW ? `${(item.sourceData.imageW / 1920) * 100}%` : "100%",
											height: item.sourceData.imageH ? `${(item.sourceData.imageH / 1080) * 100}%` : "100%",
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
	}, [resolution]);

	return (
		<div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
			<ThemeProvider>
				<div style={{ width: "100vw", height: "100vh", position: "relative", backgroundColor: "transparent" }}>
				{/* ■ 멀티트랙 동시 렌더링: trackId 오름차순 Z-index, per-track phase */}
				{isLive && tracks.size > 0 && (
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

				{/* Layer 2+: 오버레이 — 송출 중(isLive)일 때만 표시 */}
				{/* 🛡️ 각 레이어를 SilentErrorBoundary로 격리 — 하나가 크래시해도 다른 레이어/송출 유지 */}
				{isLive && sessionId && filteredOverlays.length > 0 && (
					<SilentErrorBoundary componentName="CompositorLayer">
						<CompositorLayer overlays={filteredOverlays} onPluginAction={handlePluginAction} onRenderStateChange={reportRenderState} />
					</SilentErrorBoundary>
				)}
				{isLive && sessionId && (
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

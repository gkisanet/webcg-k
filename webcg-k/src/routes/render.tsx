/**
 * Render Page
 * OBS 브라우저 소스용 투명 배경 렌더러
 * URL: /render?sessionId=xxx&resolution=1080p
 *
 * ■ 책임 분리 (Renderer Playout Runtime 추출)
 *   이 라우트는 "view" 역할만 담당한다.
 *   - session hydration, Realtime 구독, ACK, heartbeat, memory monitor,
 *     timer interpolation, track phase 머신, graphic command dispatch는
 *     `useRendererPlayoutRuntime` 훅이 담당.
 *   - 라우트는 훅이 반환한 상태를 받아 레이어를 렌더링하고,
 *     fade 애니메이션 lifecycle 이벤트를 다시 훅으로 전달한다.
 *
 * ■ 스케일링 파이프라인
 *   - CSS transform: scale() 제거 → sub-pixel jitter 원천 차단
 *   - SVG viewBox 네이티브 스케일링만 사용 (GraphicPreviewRenderer)
 *   - AnimatedGraphicRenderer: 자체 ResizeObserver 기반 scale 처리
 *
 * 상세 문서: docs/RENDERER_RESOLUTION.md
 */

import { createFileRoute } from "@tanstack/react-router";
import { CompositorLayer } from "../components/Compositor/CompositorLayer";
import { AiCharacterLayer } from "../components/Controller/AiCharacterLayer";
import { SilentErrorBoundary } from "../components/ErrorBoundary";
import { BroadcastGraphicLayer } from "../components/Renderer/BroadcastGraphicLayer";
import { ThemeProvider } from "../components/SemanticRenderer/ThemeProvider";
import { useRendererPlayoutRuntime } from "../hooks/useRendererPlayoutRuntime";
import type { Resolution } from "../lib/types/broadcast";

export const Route = createFileRoute("/render")({
	validateSearch: (search: Record<string, unknown>) => {
		const resolution = search.resolution as string;
		const sessionId = search.sessionId as string;
		// ■ tag 안전 변환: URL에서 "null", "undefined" 문자열이 들어오는 경우 실제 null로 변환
		// Why? 브라우저 주소창에 tag=null이 문자열로 남아 있으면
		//   필터가 "null"이라는 존재하지 않는 태그를 찾아 오버레이가 전부 사라진다.
		const rawTag = search.tag as string;
		const tag =
			rawTag && rawTag !== "null" && rawTag !== "undefined" ? rawTag : null;
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
	const { sessionId, resolution, tag, hideAnnotation, passive } =
		Route.useSearch();

	const runtime = useRendererPlayoutRuntime({
		sessionId,
		resolution,
		tag,
		hideAnnotation,
		passive,
	});

	const {
		isPlayoutActive,
		isRehearsal,
		tracks,
		graphicCommands,
		fadeDuration,
		filteredOverlays,
		overlayStore,
		onTrackEnterComplete,
		onTrackExitComplete,
		onGraphicCommandHandled,
	} = runtime;

	const { handlePluginAction, reportRenderState } = overlayStore;

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
				backgroundColor: "transparent",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<ThemeProvider>
				<div
					style={{
						width: "100vw",
						height: "100vh",
						position: "relative",
						backgroundColor: "transparent",
					}}
				>
					{/* ■ 멀티트랙 동시 렌더링: trackId 오름차순 Z-index, per-track phase */}
					{isPlayoutActive &&
						tracks.size > 0 &&
						[...tracks.entries()]
							.sort(([a], [b]) => a - b)
							.map(([trackId, { item, phase }]) => (
								<BroadcastGraphicLayer
									key={trackId}
									item={item}
									phase={phase}
									resolution={resolution}
									fadeDurationMs={fadeDuration}
									zIndex={trackId * 10 + 10}
									hideAnnotation={hideAnnotation}
									command={graphicCommands.get(item.id) ?? null}
									onCommandHandled={onGraphicCommandHandled}
									onEnterComplete={() => onTrackEnterComplete(trackId)}
									onExitComplete={() => onTrackExitComplete(trackId)}
								/>
							))}

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

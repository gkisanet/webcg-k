/**
 * Preview Monitor Component
 * Playhead 위치의 모든 블록을 z-index에 따라 겹쳐서 표시 (fade 효과 포함)
 * + 세션 내 오버레이 프리뷰 (추가된 오버레이 전부 표시)
 * + 영상 입력 배경 (SDI/NDI/UVC → z-index: 0)
 *
 * ■ 멀티유저 스크러빙 확장 (2026-05-12)
 *   isScrubbing prop: true일 때 SCRUB MODE 뱃지 + 주황 테두리로 시각적 구분.
 */

import { useStore } from "@tanstack/react-store";
import { MonitorPlay, Camera } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type GraphicBlock,
	timelineStore,
} from "../../stores/timelineStore";
import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";
import { AnimatedGraphicRenderer } from "../AnimatedGraphicRenderer";
import { CompositorLayer } from "../Compositor/CompositorLayer";
import type { OverlayStateItem } from "../../hooks/useOverlayStore";
import type { PluginAction } from "../../lib/webcgkSrcdoc";
import { normalizeBroadcastSourceData } from "../../lib/broadcastSourceData";
import { BroadcastHtmlOverlay } from "../Renderer/BroadcastHtmlOverlay";
import { RendererWhiteboard } from "../Renderer/RendererWhiteboard";
// ■ AiCharacterLayer는 렌더러(render.tsx)에서만 표시 (PGM/PVW 미리보기에서 제외)
import { VideoInputLayer } from "./VideoInputLayer";
import { loadVideoInputConfig } from "../../services/videoInputService";

const WB_PROGRAM_PREFIX = "wb-pgm-";

// Track ID로 z-index 계산 (Track 1이 가장 높음)
function getZIndexFromTrack(trackId: number, _maxTracks?: number): number {
	return trackId * 10 + 10;
}

// Playhead 위치의 모든 블록 가져오기 (z-index 순서로 정렬, Track 1 = 최상위)
function getBlocksAtPosition(
	blocks: GraphicBlock[],
	position: number,
): GraphicBlock[] {
	return blocks
		.filter((block) => {
			const start = block.startPosition;
			const end = block.startPosition + block.width;
			return position >= start && position < end;
		})
		.sort((a, b) => a.trackId - b.trackId);
}

// 개별 레이어 애니메이션 상태
interface LayerState {
	block: GraphicBlock;
	isVisible: boolean;
	animationPhase: "none" | "fading-in" | "fading-out" | "stable";
}

export function PreviewMonitor({ sessionId: _sessionId, videoRef, previewOverlays, onPluginAction, isScrubbing = false }: {
	sessionId?: string;
	/** 외부에서 전달받은 ref — VideoInputLayer의 <video>에 연결 (클린 영상 캡쳐용) */
	videoRef?: React.RefObject<HTMLVideoElement | null>;
	previewOverlays?: OverlayStateItem[];
	/** iframe PluginAction 콜백 — 부모(Controller)의 handlePluginAction에 연결 */
	onPluginAction?: (overlayId: string, action: PluginAction) => void;
	/** 스크러빙 모드 여부 — true일 때 PVW에 SCRUB MODE 뱃지 + 주황 테두리 */
	isScrubbing?: boolean;
}) {
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const tracks = useStore(timelineStore, (state) => state.tracks);
	const playheadPosition = useStore(
		timelineStore,
		(state) => state.playheadPosition,
	);
	const fadeDuration = useStore(timelineStore, (state) => state.fadeDuration);

	// 영상 입력 설정 (localStorage에서 불러오기)
	const [videoInputConfig, setVideoInputConfig] = useState(() => loadVideoInputConfig());

	// 설정 변경 감지 (다른 컴포넌트에서 변경 시 동기화)
	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === "webcg-k-video-input-config" && e.newValue) {
				try {
					setVideoInputConfig(JSON.parse(e.newValue));
				} catch { /* 무시 */ }
			}
		};
		// 커스텀 이벤트로도 동기화 (같은 탭 내)
		const handleCustom = () => setVideoInputConfig(loadVideoInputConfig());
		window.addEventListener("storage", handleStorageChange);
		window.addEventListener("videoInputConfigChanged", handleCustom);
		return () => {
			window.removeEventListener("storage", handleStorageChange);
			window.removeEventListener("videoInputConfigChanged", handleCustom);
		};
	}, []);

	// 현재 위치의 블록 IDs
	const activeBlockIds = useMemo(() => {
		const activeBlocks = getBlocksAtPosition(blocks, playheadPosition);
		return new Set(
			activeBlocks
				.filter((block) => !block.id.startsWith(WB_PROGRAM_PREFIX))
				.map((block) => block.id),
		);
	}, [blocks, playheadPosition]);

	// 레이어 상태 관리
	const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(
		new Map(),
	);

	// 블록 변경 감지 및 애니메이션 처리
	useEffect(() => {
		const newLayerStates = new Map<string, LayerState>();

		// 현재 활성 블록들 처리
		for (const block of blocks) {
			const isActive = activeBlockIds.has(block.id);
			// ■ layerStates 기반 wasActive: prevActiveIdsRef 대신 기존 상태 맵에서 도출
			const existingState = layerStates.get(block.id);
			const wasActive = existingState != null;

			if (isActive && !wasActive) {
				// 새로 들어온 블록 - fade in
				newLayerStates.set(block.id, {
					block,
					isVisible: true,
					animationPhase:
						block.transitionIn === "fade" ? "fading-in" : "stable",
				});
			} else if (isActive && wasActive && existingState?.animationPhase === "fading-out") {
				// ■ fading-out 중인 블록이 다시 활성화 → fade-out 리셋, 즉시 stable
				newLayerStates.set(block.id, {
					block,
					isVisible: true,
					animationPhase: "stable",
				});
			} else if (!isActive && wasActive) {
				// 나가는 블록 - fade out
				if (block.transitionOut === "fade") {
					newLayerStates.set(block.id, {
						block,
						isVisible: true,
						animationPhase: "fading-out",
					});
				}
				// cut이면 즉시 제거 (newLayerStates에 추가 안 함)
			} else if (isActive) {
				// 기존 활성 블록 유지
				newLayerStates.set(
					block.id,
					existingState || {
						block,
						isVisible: true,
						animationPhase: "stable",
					},
				);
			}
		}

		setLayerStates(newLayerStates);

		// 애니메이션 완료 후 상태 정리
		const hasAnimations = Array.from(newLayerStates.values()).some(
			(s) =>
				s.animationPhase === "fading-in" || s.animationPhase === "fading-out",
		);

		if (hasAnimations) {
			const timeoutId = setTimeout(() => {
				setLayerStates((current) => {
					const cleaned = new Map<string, LayerState>();
					for (const [id, state] of current) {
						if (state.animationPhase === "fading-out") {
							// fade out 완료 - 제거
							continue;
						}
						cleaned.set(id, {
							...state,
							animationPhase: "stable",
						});
					}
					return cleaned;
				});
			}, fadeDuration);
			return () => clearTimeout(timeoutId);
		}
	}, [activeBlockIds, blocks, fadeDuration]);

	const layers = Array.from(layerStates.values());

	return (
		<div
			className="monitor monitor-preview"
			style={isScrubbing ? {
				borderColor: "rgba(251, 191, 36, 0.5)",
				boxShadow: "inset 0 0 8px rgba(251, 191, 36, 0.12)",
			} : undefined}
		>
			<div className="monitor-label">
				<MonitorPlay className="w-3 h-3 inline-block mr-1" />
				PREVIEW ({layers.length}개)
				{isScrubbing && (
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: "0.25rem",
							marginLeft: "0.5rem",
							padding: "1px 6px",
							background: "rgba(251, 191, 36, 0.2)",
							border: "1px solid rgba(251, 191, 36, 0.5)",
							borderRadius: "4px",
							fontSize: "0.625rem",
							fontWeight: 700,
							color: "#f59e0b",
						}}
					>
						SCRUB MODE
					</span>
				)}
				{videoInputConfig.mode !== "off" && (
					<span className="ml-1" style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: "var(--accent-primary)", fontSize: "0.625rem" }}>
						<Camera size={8} />
						{videoInputConfig.mode === "ndi" ? (videoInputConfig.ndiSourceName || "NDI") : "UVC"}
					</span>
				)}
			</div>

			{/* 📹 영상 입력 배경 (모든 CG 레이어 아래, z-index: 0) */}
			<VideoInputLayer
				ref={videoRef}
				mode={videoInputConfig.mode}
				ndiSourceId={videoInputConfig.ndiSourceId}
				uvcDeviceId={videoInputConfig.uvcDeviceId}
				opacity={videoInputConfig.opacity}
			/>

			{layers.length > 0 ? (
				layers
					.sort((a, b) => b.block.trackId - a.block.trackId)
					.map((layerState) => (
						<GraphicLayer
							key={layerState.block.id}
							block={layerState.block}
							zIndex={getZIndexFromTrack(
								layerState.block.trackId,
								tracks.length,
							)}
							animationPhase={layerState.animationPhase}
							fadeDuration={fadeDuration}
						/>
					))
			) : (
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{ color: "var(--text-tertiary)" }}
				>
					<div className="text-center">
						<MonitorPlay className="w-12 h-12 mx-auto mb-2 opacity-50" />
						<p className="text-sm">← → 방향키로 탐색</p>
					</div>
				</div>
			)}

			{/* 오버레이 프리뷰 — CompositorLayer 통합 렌더러
			   ■ Why 통합?
			     기존 OverlayPlayoutLayer(SVG) + PluginOverlayLayer(iframe)를
			     하나의 CompositorLayer로 합쳐 코드 중복과 Realtime 채널 낭비 제거. */}
			{previewOverlays && previewOverlays.length > 0 && (
				<CompositorLayer overlays={previewOverlays} onPluginAction={onPluginAction} />
			)}
			{/* AI 캐릭터 레이어는 렌더러(render.tsx)에서만 표시 — PVW 미리보기에서 제외 */}

			<style>{`
				@keyframes previewFadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@keyframes previewFadeOut {
					from { opacity: 1; }
					to { opacity: 0; }
				}
			`}</style>
		</div>
	);
}

/**
 * 개별 그래픽 레이어 컴포넌트
 * sourceData가 있으면 실제 그래픽 렌더링, 없으면 플레이스홀더
 */
function GraphicLayer({
	block,
	zIndex,
	animationPhase,
	fadeDuration,
}: {
	block: GraphicBlock;
	zIndex: number;
	animationPhase: "none" | "fading-in" | "fading-out" | "stable";
	fadeDuration: number;
}) {
	const animationStyle =
		animationPhase === "fading-in"
			? `previewFadeIn ${fadeDuration}ms ease-out forwards`
			: animationPhase === "fading-out"
				? `previewFadeOut ${fadeDuration}ms ease-in forwards`
				: "none";

	const source = normalizeBroadcastSourceData(block.sourceType, block.sourceData);

	const needsDomRenderer = source.kind === "template" && source.elements.some(
		(el: any) => el.animation || el.type === "html_plugin"
	);

	return (
		<div
			className="absolute inset-0"
			style={{
				zIndex: zIndex,
				animation: animationStyle,
			}}
		>
			{source.kind === "whiteboard" ? (
				<RendererWhiteboard whiteboardId={source.whiteboardId} phase="idle" />
			) : source.kind === "overlay" ? (
				<BroadcastHtmlOverlay payload={source.overlay} title={block.name} />
			) : source.kind === "template" || source.kind === "image" ? (
				source.kind === "template" ? (
					// 실제 그래픽 렌더링
					needsDomRenderer ? (
						<AnimatedGraphicRenderer
							elements={source.elements}
							canvasWidth={source.canvasWidth}
							canvasHeight={source.canvasHeight}
							phase="idle"
							style={{ width: "100%", height: "100%" }}
						/>
					) : (
						<GraphicPreviewRenderer
							elements={source.elements}
							canvasWidth={source.canvasWidth}
							canvasHeight={source.canvasHeight}
							style={{ width: "100%", height: "100%" }}
						/>
					)
				) : (
					// 순수 이미지 에셋 렌더링
					<img
						src={source.imageUrl}
						alt={source.imageName || block.name}
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
				)
			) : (
				// 플레이스홀더 (그래픽 데이터 없음)
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{
						backgroundColor: block.color?.replace(/[\d.]+\)$/, "0.15)") || "rgba(100, 100, 100, 0.15)",
					}}
				>
					<div className="text-center">
						<div
							className="text-lg font-bold mb-1"
							style={{
								color: "var(--text-primary)",
								textShadow: "0 1px 3px rgba(0,0,0,0.5)",
							}}
						>
							{block.name}
						</div>
						<div
							className="text-xs opacity-70"
							style={{ color: "var(--text-secondary)" }}
						>
							T{block.trackId} | {block.sourceType || "unknown"}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

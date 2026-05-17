/**
 * PGM Monitor Component
 * 송출된 블록들을 z-index에 따라 겹쳐서 표시 (fade 효과 포함)
 * + 활성 오버레이 합성 (OverlayPlayoutLayer)
 * + 영상 입력 배경 (SDI/NDI/UVC → z-index: 0)
 */

import { useStore } from "@tanstack/react-store";
import { Tv, Camera } from "lucide-react";
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
// ■ AiCharacterLayer는 렌더러(render.tsx)에서만 표시
// Why? PGM 모니터는 400px 미리보기 패널인데, Rive 캔버스가
//   inset:0 + z-index:100으로 전체를 덮어 UI가 파괴됨.
//   Rive 렌더링은 1920×1080 전용 렌더러에서만 수행.
import { VideoInputLayer } from "./VideoInputLayer";
import { loadVideoInputConfig } from "../../services/videoInputService";

// Track ID로 z-index 계산 (Track 1이 가장 높음)
function getZIndexFromTrack(trackId: number, _maxTracks?: number): number {
	return trackId * 10 + 10;
}

// 위치의 모든 블록 가져오기
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

export function PGMMonitor({ sessionId, isBroadcasting = false, notBroadcastingWarning = false, scrubWarning = false, programOverlays, onPluginAction }: {
	sessionId?: string;
	/** 송출 중 여부 — false이면 그래픽을 표시하지 않음 */
	isBroadcasting?: boolean;
	/** 송출 중이 아닌데 Space를 누른 경우 경고 메시지 표시 */
	notBroadcastingWarning?: boolean;
	/** 스크러빙 모드에서 Space를 누른 경우 경고 메시지 표시 */
	scrubWarning?: boolean;
	/** PGM 상태(is_active=true)인 오버레이 목록 */
	programOverlays?: OverlayStateItem[];
	/** iframe PluginAction 콜백 — 부모(Controller)의 handlePluginAction에 연결 */
	onPluginAction?: (overlayId: string, action: PluginAction) => void;
}) {
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const tracks = useStore(timelineStore, (state) => state.tracks);
	const lastBroadcastPosition = useStore(
		timelineStore,
		(state) => state.lastBroadcastPosition,
	);
	const fadeDuration = useStore(timelineStore, (state) => state.fadeDuration);

	// 영상 입력 설정 (PVW와 동일한 설정 공유)
	const [videoInputConfig, setVideoInputConfig] = useState(() => loadVideoInputConfig());

	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === "webcg-k-video-input-config" && e.newValue) {
				try { setVideoInputConfig(JSON.parse(e.newValue)); } catch { /* 무시 */ }
			}
		};
		const handleCustom = () => setVideoInputConfig(loadVideoInputConfig());
		window.addEventListener("storage", handleStorageChange);
		window.addEventListener("videoInputConfigChanged", handleCustom);
		return () => {
			window.removeEventListener("storage", handleStorageChange);
			window.removeEventListener("videoInputConfigChanged", handleCustom);
		};
	}, []);

	// 현재 송출 위치의 블록 IDs
	const activeBlockIds = useMemo(() => {
		const activeBlocks = getBlocksAtPosition(blocks, lastBroadcastPosition);
		return new Set(activeBlocks.map((b) => b.id));
	}, [blocks, lastBroadcastPosition]);

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
			//   prevActiveIdsRef는 매 이펙트마다 덮어쓰기되어 fade-out 중인 블록 정보가 소실됨.
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
		<div className="monitor monitor-pgm">
			<div className="monitor-label">
				<Tv className="w-3 h-3 inline-block mr-1" />
				PGM ({layers.length}개)
				{layers.length > 0 && (
					<span className="ml-2 text-xs text-red-400">● LIVE</span>
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
				mode={videoInputConfig.mode}
				ndiSourceId={videoInputConfig.ndiSourceId}
				uvcDeviceId={videoInputConfig.uvcDeviceId}
				opacity={videoInputConfig.opacity}
			/>

			{/* 송출 중이 아닐 때: 대기 화면 */}
			{!isBroadcasting ? (
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{ color: "var(--text-tertiary)" }}
				>
					<div className="text-center">
						<Tv className="w-12 h-12 mx-auto mb-2 opacity-50" />
						<p className="text-sm" style={{ color: "var(--text-secondary)" }}>송출 대기 중</p>
						<p className="text-xs" style={{ marginTop: "4px", opacity: 0.6 }}>송출 버튼을 눌러 시작하세요</p>
					</div>
				</div>
			) : layers.length > 0 ? (
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
						<Tv className="w-12 h-12 mx-auto mb-2 opacity-50" />
						<p className="text-sm">Space로 송출</p>
					</div>
				</div>
			)}

			{/* ■ 송출 중이 아닌데 Space를 눌렀을 때 경고 메시지 */}
			{notBroadcastingWarning && (
				<div
					style={{
						position: "absolute",
						bottom: 0,
						left: 0,
						right: 0,
						padding: "6px 12px",
						background: "rgba(245, 158, 11, 0.9)",
						color: "#000",
						fontSize: "0.75rem",
						fontWeight: 600,
						textAlign: "center",
						zIndex: 100,
						animation: "pgmWarningSlideUp 0.3s ease-out",
					}}
				>
					⚠️ 송출 중이 아닙니다. 먼저 송출 버튼을 눌러주세요.
				</div>
			)}
			{scrubWarning && (
				<div
					style={{
						position: "absolute",
						bottom: 0,
						left: 0,
						right: 0,
						padding: "6px 12px",
						background: "rgba(245, 158, 11, 0.9)",
						color: "#000",
						fontSize: "0.75rem",
						fontWeight: 600,
						textAlign: "center",
						zIndex: 100,
						animation: "pgmWarningSlideUp 0.3s ease-out",
					}}
				>
					⚠️ 스크러빙 모드에서는 송출할 수 없습니다
				</div>
			)}

			{/* 오버레이 합성 레이어 — CompositorLayer 통합 렌더러 */}
			{programOverlays && programOverlays.length > 0 && (
				<CompositorLayer overlays={programOverlays} onPluginAction={onPluginAction} />
			)}
			{/* AI 캐릭터 레이어는 렌더러(render.tsx)에서만 표시 — PGM 미리보기에서 제외 */}

			<style>{`
                @keyframes pgmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes pgmFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes pgmWarningSlideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
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
			? `pgmFadeIn ${fadeDuration}ms ease-out forwards`
			: animationPhase === "fading-out"
				? `pgmFadeOut ${fadeDuration}ms ease-in forwards`
				: "none";

	// sourceData가 있으면 실제 그래픽 렌더링
	const isTemplate = block.sourceData?.elements?.length > 0;
	const isImage = block.sourceType === "image" && block.sourceData?.imageUrl;
	const hasGraphicData = isTemplate || isImage;

	const needsDomRenderer = isTemplate && block.sourceData?.elements?.some(
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
			{hasGraphicData ? (
				isTemplate ? (
					// 실제 그래픽 렌더링
					needsDomRenderer ? (
						<AnimatedGraphicRenderer
							elements={block.sourceData.elements}
							canvasWidth={block.sourceData.canvasWidth || 1920}
							canvasHeight={block.sourceData.canvasHeight || 1080}
							phase="idle"
							style={{ width: "100%", height: "100%" }}
						/>
					) : (
						<GraphicPreviewRenderer
							elements={block.sourceData.elements}
							canvasWidth={block.sourceData.canvasWidth || 1920}
							canvasHeight={block.sourceData.canvasHeight || 1080}
							style={{ width: "100%", height: "100%" }}
						/>
					)
				) : (
					// 순수 이미지 에셋 렌더링
					<img
						src={block.sourceData.imageUrl}
						alt={block.sourceData.imageName || block.name}
						style={
							block.sourceData.imageX !== undefined && block.sourceData.imageY !== undefined
								? {
										position: "absolute",
										left: `${(block.sourceData.imageX / 1920) * 100}%`,
										top: `${(block.sourceData.imageY / 1080) * 100}%`,
										width: block.sourceData.imageW ? `${(block.sourceData.imageW / 1920) * 100}%` : "100%",
										height: block.sourceData.imageH ? `${(block.sourceData.imageH / 1080) * 100}%` : "100%",
										objectFit: "contain",
										pointerEvents: "none",
								  }
								: { width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }
						}
					/>
				)
			) : (
				// 플레이스홀더 (그래픽 데이터 없음) - 빨간 테두리로 LIVE 표시
				<div
					className="absolute inset-0 flex items-center justify-center"
					style={{
						backgroundColor: block.color?.replace(/[\d.]+\)$/, "0.15)") || "rgba(100, 100, 100, 0.15)",
						border: "2px solid rgba(239, 68, 68, 0.5)",
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
							className="px-2 py-1 rounded text-xs inline-block"
							style={{
								backgroundColor: "rgba(239, 68, 68, 0.3)",
								color: "var(--accent-danger)",
							}}
						>
							🔴 LIVE | T{block.trackId}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}


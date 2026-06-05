/**
 * PGM Monitor Component
 * 송출된 블록들을 z-index에 따라 겹쳐서 표시 (fade 효과 포함)
 * + 활성 오버레이 합성 (OverlayPlayoutLayer)
 * + 영상 입력 배경 (SDI/NDI/UVC → z-index: 0)
 */

import { useStore } from "@tanstack/react-store";
import { Camera, Tv } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OverlayStateItem } from "../../hooks/useOverlayStore";
import { usesBroadcastPackagePhaseMotion } from "../../lib/graphicLifecyclePolicy";
import type { PluginAction } from "../../lib/webcgkSrcdoc";
import { loadVideoInputConfig } from "../../services/videoInputService";
import { type GraphicBlock, timelineStore } from "../../stores/timelineStore";
import { CompositorLayer } from "../Compositor/CompositorLayer";
import {
	BroadcastGraphicLayer,
	type BroadcastGraphicLayerPhase,
} from "../Renderer/BroadcastGraphicLayer";
// ■ AiCharacterLayer는 렌더러(render.tsx)에서만 표시
// Why? PGM 모니터는 400px 미리보기 패널인데, Rive 캔버스가
//   inset:0 + z-index:100으로 전체를 덮어 UI가 파괴됨.
//   Rive 렌더링은 1920×1080 전용 렌더러에서만 수행.
import { VideoInputLayer } from "./VideoInputLayer";

const WB_PREVIEW_PREFIX = "wb-pvw-";

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

function shouldRunBlockMotion(
	block: GraphicBlock,
	phase: "enter" | "exit",
): boolean {
	return usesBroadcastPackagePhaseMotion(
		block.sourceType,
		block.sourceData,
		phase,
	);
}

function getEnterAnimationPhase(
	block: GraphicBlock,
): LayerState["animationPhase"] {
	return block.transitionIn === "fade" || shouldRunBlockMotion(block, "enter")
		? "fading-in"
		: "stable";
}

function getExitAnimationPhase(
	block: GraphicBlock,
): LayerState["animationPhase"] {
	return block.transitionOut === "fade" || shouldRunBlockMotion(block, "exit")
		? "fading-out"
		: "none";
}

function toBroadcastLayerPhase(
	phase: LayerState["animationPhase"],
): BroadcastGraphicLayerPhase {
	if (phase === "fading-out") return "exit";
	if (phase === "fading-in") return "enter";
	return "idle";
}

export function PGMMonitor({
	sessionId: _sessionId,
	isBroadcasting = false,
	notBroadcastingWarning = false,
	scrubWarning = false,
	programOverlays,
	skipExitOverlayIds,
	onPluginAction,
}: {
	sessionId?: string;
	/** 송출 중 여부 — false이면 그래픽을 표시하지 않음 */
	isBroadcasting?: boolean;
	/** 송출 중이 아닌데 Space를 누른 경우 경고 메시지 표시 */
	notBroadcastingWarning?: boolean;
	/** 스크러빙 모드에서 Space를 누른 경우 경고 메시지 표시 */
	scrubWarning?: boolean;
	/** PGM 상태(is_active=true)인 오버레이 목록 */
	programOverlays?: OverlayStateItem[];
	/** PVW로 이동한 overlay는 PGM에서 out iframe을 돌리지 않는다 */
	skipExitOverlayIds?: ReadonlySet<string>;
	/** iframe PluginAction 콜백 — 부모(Controller)의 handlePluginAction에 연결 */
	onPluginAction?: (overlayId: string, action: PluginAction) => void;
}) {
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const tracks = useStore(timelineStore, (state) => state.tracks);
	const lastBroadcastPosition = useStore(
		timelineStore,
		(state) => state.lastBroadcastPosition,
	);
	const pgmBlockIds = useStore(timelineStore, (state) => state.pgmBlockIds);
	const fadeDuration = useStore(timelineStore, (state) => state.fadeDuration);

	// 영상 입력 설정 (PVW와 동일한 설정 공유)
	const [videoInputConfig, setVideoInputConfig] = useState(() =>
		loadVideoInputConfig(),
	);

	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === "webcg-k-video-input-config" && e.newValue) {
				try {
					setVideoInputConfig(JSON.parse(e.newValue));
				} catch {
					/* 무시 */
				}
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
		if (pgmBlockIds.size > 0) {
			return new Set(
				Array.from(pgmBlockIds.values()).filter(
					(blockId) => !blockId.startsWith(WB_PREVIEW_PREFIX),
				),
			);
		}
		const activeBlocks = getBlocksAtPosition(blocks, lastBroadcastPosition);
		return new Set(
			activeBlocks
				.filter((block) => !block.id.startsWith(WB_PREVIEW_PREFIX))
				.map((block) => block.id),
		);
	}, [blocks, lastBroadcastPosition, pgmBlockIds]);

	// 레이어 상태 관리
	const [layerStates, setLayerStates] = useState<Map<string, LayerState>>(
		new Map(),
	);
	const layerStatesRef = useRef(layerStates);

	useEffect(() => {
		layerStatesRef.current = layerStates;
	}, [layerStates]);

	// 블록 변경 감지 및 애니메이션 처리
	useEffect(() => {
		const newLayerStates = new Map<string, LayerState>();

		// 현재 활성 블록들 처리
		for (const block of blocks) {
			const isActive = activeBlockIds.has(block.id);
			// ■ layerStates 기반 wasActive: prevActiveIdsRef 대신 기존 상태 맵에서 도출
			//   prevActiveIdsRef는 매 이펙트마다 덮어쓰기되어 fade-out 중인 블록 정보가 소실됨.
			const existingState = layerStatesRef.current.get(block.id);
			const wasActive = existingState != null;

			if (isActive && !wasActive) {
				// 새로 들어온 블록 - fade in
				newLayerStates.set(block.id, {
					block,
					isVisible: true,
					animationPhase: getEnterAnimationPhase(block),
				});
			} else if (
				isActive &&
				wasActive &&
				existingState?.animationPhase === "fading-out"
			) {
				// ■ fading-out 중인 블록이 다시 활성화 → enter lifecycle 재시작
				newLayerStates.set(block.id, {
					block,
					isVisible: true,
					animationPhase: getEnterAnimationPhase(block),
				});
			} else if (!isActive && wasActive) {
				// 나가는 블록 - fade out
				const exitPhase = getExitAnimationPhase(block);
				if (exitPhase === "fading-out") {
					newLayerStates.set(block.id, {
						block,
						isVisible: true,
						animationPhase: exitPhase,
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
	}, [activeBlockIds, blocks]);

	const handleLayerEnterComplete = useCallback((blockId: string) => {
		setLayerStates((current) => {
			const state = current.get(blockId);
			if (!state || state.animationPhase !== "fading-in") return current;
			const next = new Map(current);
			next.set(blockId, { ...state, animationPhase: "stable" });
			return next;
		});
	}, []);

	const handleLayerExitComplete = useCallback((blockId: string) => {
		setLayerStates((current) => {
			const state = current.get(blockId);
			if (!state || state.animationPhase !== "fading-out") return current;
			const next = new Map(current);
			next.delete(blockId);
			return next;
		});
	}, []);

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
					<span
						className="ml-1"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: "0.2rem",
							color: "var(--accent-primary)",
							fontSize: "0.625rem",
						}}
					>
						<Camera size={8} />
						{videoInputConfig.mode === "ndi"
							? videoInputConfig.ndiSourceName || "NDI"
							: "UVC"}
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
						<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
							송출 대기 중
						</p>
						<p className="text-xs" style={{ marginTop: "4px", opacity: 0.6 }}>
							송출 버튼을 눌러 시작하세요
						</p>
					</div>
				</div>
			) : layers.length > 0 ? (
				layers
					.sort((a, b) => b.block.trackId - a.block.trackId)
					.map((layerState) => (
						<BroadcastGraphicLayer
							key={layerState.block.id}
							item={layerState.block}
							zIndex={getZIndexFromTrack(
								layerState.block.trackId,
								tracks.length,
							)}
							phase={toBroadcastLayerPhase(layerState.animationPhase)}
							fadeDurationMs={fadeDuration}
							fadeInKeyframesName="pgmFadeIn"
							fadeOutKeyframesName="pgmFadeOut"
							placeholderBorder="2px solid rgba(239, 68, 68, 0.5)"
							onEnterComplete={() =>
								handleLayerEnterComplete(layerState.block.id)
							}
							onExitComplete={() =>
								handleLayerExitComplete(layerState.block.id)
							}
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
				<CompositorLayer
					overlays={programOverlays}
					skipExitOverlayIds={skipExitOverlayIds}
					onPluginAction={onPluginAction}
				/>
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

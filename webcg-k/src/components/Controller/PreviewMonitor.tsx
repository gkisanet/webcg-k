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
import { Camera, MonitorPlay } from "lucide-react";
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
// ■ AiCharacterLayer는 렌더러(render.tsx)에서만 표시 (PGM/PVW 미리보기에서 제외)
import { VideoInputLayer } from "./VideoInputLayer";

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

export function PreviewMonitor({
	sessionId: _sessionId,
	videoRef,
	previewOverlays,
	skipExitOverlayIds,
	onPluginAction,
	previewPosition,
	isScrubbing = false,
}: {
	sessionId?: string;
	/** 외부에서 전달받은 ref — VideoInputLayer의 <video>에 연결 (클린 영상 캡쳐용) */
	videoRef?: React.RefObject<HTMLVideoElement | null>;
	previewOverlays?: OverlayStateItem[];
	/** PGM으로 이동한 overlay는 PVW에서 out iframe을 돌리지 않는다 */
	skipExitOverlayIds?: ReadonlySet<string>;
	/** iframe PluginAction 콜백 — 부모(Controller)의 handlePluginAction에 연결 */
	onPluginAction?: (overlayId: string, action: PluginAction) => void;
	/** 읽기 전용 팔로우 화면처럼 로컬 playhead 대신 사용할 preview 위치 */
	previewPosition?: number;
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
	const effectivePlayheadPosition = previewPosition ?? playheadPosition;

	// 영상 입력 설정 (localStorage에서 불러오기)
	const [videoInputConfig, setVideoInputConfig] = useState(() =>
		loadVideoInputConfig(),
	);

	// 설정 변경 감지 (다른 컴포넌트에서 변경 시 동기화)
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
		const activeBlocks = getBlocksAtPosition(blocks, effectivePlayheadPosition);
		return new Set(
			activeBlocks
				.filter((block) => !block.id.startsWith(WB_PROGRAM_PREFIX))
				.map((block) => block.id),
		);
	}, [blocks, effectivePlayheadPosition]);

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
		<div
			className="monitor monitor-preview"
			style={
				isScrubbing
					? {
							borderColor: "rgba(251, 191, 36, 0.5)",
							boxShadow: "inset 0 0 8px rgba(251, 191, 36, 0.12)",
						}
					: undefined
			}
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
						<BroadcastGraphicLayer
							key={layerState.block.id}
							item={layerState.block}
							zIndex={getZIndexFromTrack(
								layerState.block.trackId,
								tracks.length,
							)}
							phase={toBroadcastLayerPhase(layerState.animationPhase)}
							fadeDurationMs={fadeDuration}
							fadeInKeyframesName="previewFadeIn"
							fadeOutKeyframesName="previewFadeOut"
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
				<CompositorLayer
					overlays={previewOverlays}
					skipExitOverlayIds={skipExitOverlayIds}
					onPluginAction={onPluginAction}
				/>
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

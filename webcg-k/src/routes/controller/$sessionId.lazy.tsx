/**
 * Session-based Controller Page
 * 프로젝트(세션) 기반 타임라인 송출 컨트롤러
 */

import { createLazyFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	ArrowLeft,
	Bot,
	Copy,
	ExternalLink,
	Layers,
	PenTool,
	Radio,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AiCharacterPanel } from "../../components/Controller/AiCharacterPanel";
import { BlockEditDrawer } from "../../components/Controller/BlockEditDrawer";
import { BroadcastButton } from "../../components/Controller/BroadcastButton";
import { ControllerActivityPanel } from "../../components/Controller/ControllerActivityPanel";
import {
	GraphicDetailControl,
	type GraphicRuntimeCommandState,
} from "../../components/Controller/GraphicDetailControl";
import { KeyboardShortcutModal } from "../../components/Controller/KeyboardShortcutModal";
import { MonitorActionBar } from "../../components/Controller/MonitorActionBar";
import { OverlayPanel } from "../../components/Controller/OverlayPanel";
import { PGMMonitor } from "../../components/Controller/PGMMonitor";
import { PreviewMonitor } from "../../components/Controller/PreviewMonitor";
import { SettingsPanel } from "../../components/Controller/SettingsPanel";
import {
	type RemotePlayheadData,
	Timeline,
} from "../../components/Controller/Timeline";
import { UserAvatars } from "../../components/Controller/UserAvatars";
import { WhiteboardPanel } from "../../components/Controller/WhiteboardPanel";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { RoleGuard, useCanPerform } from "../../components/RoleGuard";
import { useClipboard } from "../../hooks/useClipboard";
import { useCuesheetSync } from "../../hooks/useCuesheetSync";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import { useMainOperatorLease } from "../../hooks/useMainOperatorLease";
import { useOverlayStore } from "../../hooks/useOverlayStore";
import { usePlayheadPersistence } from "../../hooks/usePlayheadPersistence";
import { usePlayoutBridge } from "../../hooks/usePlayoutBridge";
import { useSessionController } from "../../hooks/useSessionController";
import { useSessionPresence } from "../../hooks/useSessionPresence";
import { useAuth } from "../../lib/auth";
import { calibrateClockOffset, getClockOffset } from "../../lib/clockSync";
import {
	createAuthoritativePlayoutState,
	hydrateBlocksWithPlayoutSyntheticBlocks,
	parseAuthoritativePlayoutState,
	shouldApplyPlayoutSnapshot,
	snapshotToTimelinePatch,
} from "../../lib/playoutState";
import {
	createGraphicCustomActionCommandPayload,
	createGraphicStepCommandPayload,
} from "../../lib/rendererGraphicCommand";
import { computeRemaining, isTimerReplicant } from "../../lib/timerUtils";
import type {
	SavedLogoBlock,
	SessionStatus,
	TimelineBlockData,
} from "../../lib/types/broadcast";
import { addActionLog } from "../../stores/actionLogStore";
import {
	broadcastToPGM,
	futureStates,
	type GraphicBlock,
	pastStates,
	redo,
	type TransitionType,
	timelineStore,
	undo,
	updateBlockSourceData,
} from "../../stores/timelineStore";

function getColorByType(type: string): string {
	switch (type) {
		case "image":
			return "rgba(59, 130, 246, 0.7)";
		case "graphic":
			return "rgba(16, 185, 129, 0.7)";
		case "template":
			return "rgba(139, 92, 246, 0.7)";
		case "overlay":
			return "rgba(236, 72, 153, 0.7)";
		default:
			return "rgba(100, 100, 100, 0.7)";
	}
}

function normalizeTransitionType(value: unknown): TransitionType {
	return value === "cut" || value === "fade" ? value : "fade";
}

export const Route = createLazyFileRoute("/controller/$sessionId")({
	component: SessionControllerPage,
});

// 타입은 lib/types/broadcast.ts에서 import

function SessionControllerPage() {
	const { sessionId } = Route.useParams();
	const { output: outputTag } = Route.useSearch();
	const { user, loading: authLoading } = useAuth();
	const playoutRevisionRef = useRef(0);
	const controllerClientIdRef = useRef<string>("");

	if (!controllerClientIdRef.current && typeof window !== "undefined") {
		const key = `webcg-k:controller-client:${sessionId}`;
		const existing = window.localStorage.getItem(key);
		const next = existing || crypto.randomUUID();
		window.localStorage.setItem(key, next);
		controllerClientIdRef.current = next;
	}

	// ─── 세션 + 채널 hook ────────────────────────────────────────────
	const {
		session,
		segments: sessionSegments,
		loading: sessionLoading,
		error: sessionError,
		isChannelReady,
		broadcast,
		graphicCommandResults,
		savePlayheadState: savePlayheadStateToDb,
		saveSessionPlayoutState,
		setSession, // 🆕 수신
	} = useSessionController(sessionId);
	const { copied, copyToClipboard } = useClipboard();
	const [graphicCommandStates, setGraphicCommandStates] = useState<
		Record<string, GraphicRuntimeCommandState>
	>({});

	useEffect(() => {
		const results = Object.values(graphicCommandResults);
		if (results.length === 0) return;

		setGraphicCommandStates((current) => {
			let next = current;

			for (const result of results) {
				const existing = current[result.targetBlockId];
				if (existing && existing.seqNum > result.seqNum) continue;

				if (next === current) next = { ...current };
				next[result.targetBlockId] = {
					seqNum: result.seqNum,
					status: result.status,
					message: result.message,
					currentStep: result.currentStep,
					updatedAt: result.completedAt,
				};
			}

			return next;
		});
	}, [graphicCommandResults]);

	// ■ 오버레이 단일 진실점 — useOverlayStore
	// Realtime 1개만 구독, 모든 모니터/패널이 같은 데이터 참조
	const overlayStore = useOverlayStore(sessionId);

	// ■ 모니터 출력 필터: output 쿼리 파라미터로 특정 태그만 PVW/PGM에 표시
	// Why? /controller/xxx?output=viewer 로 접속하면 시청자용 출력만 확인.
	//       태그 없으면 기존 동작(모든 오버레이 표시)
	const filteredPreviewOverlays = useMemo(() => {
		if (!outputTag) return overlayStore.previewOverlays;
		return overlayStore.previewOverlays.filter(
			(o) =>
				(o as any).tags?.includes(outputTag) ||
				(o as any).group_tag === outputTag,
		);
	}, [overlayStore.previewOverlays, outputTag]);

	const filteredProgramOverlays = useMemo(() => {
		if (!outputTag) return overlayStore.programOverlays;
		return overlayStore.programOverlays.filter(
			(o) =>
				(o as any).tags?.includes(outputTag) ||
				(o as any).group_tag === outputTag,
		);
	}, [overlayStore.programOverlays, outputTag]);
	const filteredPreviewOverlayIds = useMemo(
		() => new Set(filteredPreviewOverlays.map((overlay) => overlay.id)),
		[filteredPreviewOverlays],
	);
	const filteredProgramOverlayIds = useMemo(
		() => new Set(filteredProgramOverlays.map((overlay) => overlay.id)),
		[filteredProgramOverlays],
	);

	// ■ Clock Offset 캘리브레이션 — 초기 로드 시 1회
	useEffect(() => {
		calibrateClockOffset().then((offset) => {
			console.log("[Controller] Clock offset calibrated:", offset, "ms");
		});
	}, []);

	// 탭 상태 (타임라인/오버레이/AI 캐릭터/판서 레이어)
	const [activeTab, setActiveTab] = useState<
		"timeline" | "overlay" | "character" | "whiteboard"
	>("timeline");
	// 단축키 도움말 모달
	const [showShortcutHelp, setShowShortcutHelp] = useState(false);

	// ■ 송출 상태 (BroadcastButton에서 끌어올려 PGM 모니터와 동기화)
	// Why? PGM 모니터와 최종 렌더러(/render)를 완전히 동기화하기 위해
	//   송출 중이 아니면 PGM 모니터도 그래픽을 표시하지 않음.
	const [isBroadcasting, setIsBroadcasting] = useState(false);
	// 송출 중이 아닌데 Space를 눌렀을 때 경고 표시
	const [notBroadcastingWarning, setNotBroadcastingWarning] = useState(false);
	const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 스크러빙 모드에서 Space를 눌렀을 때 경고 표시
	const [scrubSpaceWarning, setScrubSpaceWarning] = useState(false);
	const scrubWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	// 텍스트 핫 수정 드로어 상태
	const [editingBlock, setEditingBlock] = useState<GraphicBlock | null>(null);

	// Supabase Presence로 접속자 관리
	const {
		connectedUsers,
		myColor,
		canBroadcast: canBroadcastPresence,
		updatePlayheadPosition,
		setIsScrubbing,
		updateLastBroadcastAt,
	} = useSessionPresence(sessionId);

	// ─── 영상 캡쳐용 video ref (PVW 모니터의 클린 영상) ───
	const previewVideoRef = useRef<HTMLVideoElement | null>(null);

	// ─── 영상 입력 설정 (MonitorActionBar에서 모드 체크용) ───
	const [videoInputMode, setVideoInputMode] = useState<"off" | "ndi" | "uvc">(
		"off",
	);
	useEffect(() => {
		// SettingsPanel이 localStorage에 저장한 설정 읽기
		try {
			const saved = localStorage.getItem("webcg-k-video-input-config");
			if (saved) setVideoInputMode(JSON.parse(saved).mode || "off");
		} catch {
			/* 무시 */
		}
		const handleChange = () => {
			try {
				const saved = localStorage.getItem("webcg-k-video-input-config");
				if (saved) setVideoInputMode(JSON.parse(saved).mode || "off");
			} catch {
				/* 무시 */
			}
		};
		window.addEventListener("videoInputConfigChanged", handleChange);
		return () =>
			window.removeEventListener("videoInputConfigChanged", handleChange);
	}, []);
	// 원격 플레이헤드 데이터 (내 정보 제외)
	const remotePlayheads: RemotePlayheadData[] = connectedUsers
		.filter((u) => !u.isCurrentUser && u.canBroadcast)
		.map((u) => ({
			userId: u.id,
			displayName: u.displayName,
			color: u.color,
			position: u.playheadPosition,
			canBroadcast: u.canBroadcast,
			isScrubbing: u.isScrubbing,
		}));

	// ─── 멀티유저 스크러빙 ───
	const isScrubbing = useStore(timelineStore, (state) => state.isScrubbing);
	const playheadPosition = useStore(
		timelineStore,
		(state) => state.playheadPosition,
	);

	// 히스토리 카운터 구독 (버튼의 disabled reactive 갱신용)
	const historyVersion = useStore(
		timelineStore,
		(state) => state.historyVersion,
	);
	const undoAvailable = pastStates.length > 0;
	const redoAvailable = futureStates.length > 0;

	// historyVersion 디버그 리드 (unused warning 해결)
	if (historyVersion < 0) {
		console.debug("History version triggered:", historyVersion);
	}

	// Presence playhead는 참석자 위치 표시 전용이다.
	// 내 로컬 playhead를 다른 사용자의 Presence 값으로 덮어쓰면 preview와 송출 기준이 섞인다.

	// ─── Playhead 위치 변화 Presence 실시간 동기화 ───
	useEffect(() => {
		if (sessionId) {
			updatePlayheadPosition(playheadPosition);
		}
	}, [playheadPosition, updatePlayheadPosition, sessionId]);

	// ─── 스크러빙 상태 Presence 동기화 ───
	const prevScrubbingRef = useRef<boolean>(false);
	useEffect(() => {
		if (prevScrubbingRef.current !== isScrubbing) {
			prevScrubbingRef.current = isScrubbing;
			setIsScrubbing(isScrubbing);
			updatePlayheadPosition(timelineStore.state.playheadPosition);
		}
	}, [isScrubbing, setIsScrubbing, updatePlayheadPosition]);

	// ─── 송출 상태 (isBroadcasting) 실시간 DB 동기화 ───
	const sessionStatus = session?.status;
	useEffect(() => {
		const isPlayoutActive =
			sessionStatus === "live" || sessionStatus === "rehearsal";
		setIsBroadcasting(isPlayoutActive);
	}, [sessionStatus]);

	// PGM 블록 상태 구독 (Realtime 발행용) — 멀티트랙
	const pgmBlockIds = useStore(timelineStore, (state) => state.pgmBlockIds);
	const blocks = useStore(timelineStore, (state) => state.blocks);
	const selectedBlockId = useStore(
		timelineStore,
		(state) => state.selectedBlockId,
	);
	const completedBlockIds = useStore(
		timelineStore,
		(state) => state.completedBlockIds,
	);
	const airedBlockIds = useStore(timelineStore, (state) => state.airedBlockIds);
	const skippedBlockIds = useStore(
		timelineStore,
		(state) => state.skippedBlockIds,
	);

	// 기록 초기화 버튼 카운트: PGM/송출완료/스킵/리허설 진행 상태를 한 번에 센다.
	const playoutProgressCount = new Set([
		...airedBlockIds,
		...completedBlockIds,
		...skippedBlockIds,
		...pgmBlockIds.values(),
	]).size;
	const totalPlayableBlocks = blocks.filter(
		(block) => block.trackId !== 0,
	).length;
	const airedCount = airedBlockIds.size;
	const skippedCount = skippedBlockIds.size;
	const remainingCount = Math.max(
		0,
		totalPlayableBlocks -
			new Set([...airedBlockIds, ...completedBlockIds, ...skippedBlockIds])
				.size,
	);

	// ─── RBAC: 송출 권한 가드 ───
	// ■ Why 컴포넌트 내부에서도 체크?
	//   RoleGuard가 라우트 레벨에서 차단하지만,
	//   broadcastToRenderer()는 키보드 단축키(Space)에서도 호출되므로
	//   함수 레벨에서도 이중 방어한다.
	const canBroadcast = useCanPerform(["playout_operator", "system_admin"]);
	const operatorCount = useMemo(() => {
		const connectedOperatorCount = connectedUsers.filter(
			(u) => u.canBroadcast,
		).length;
		return canBroadcast
			? Math.max(1, connectedOperatorCount)
			: connectedOperatorCount;
	}, [canBroadcast, connectedUsers]);
	const {
		activeLease: mainOperatorLease,
		isMainOperator,
		isWritingLease,
		needsOperatorSelection,
		claimMainOperator,
	} = useMainOperatorLease({
		sessionId,
		playheadState: session?.playhead_state,
		canBroadcast,
		user,
		clientId: controllerClientIdRef.current,
		operatorCount,
		setSession, // 🆕 로컬 세션 즉시 동기화 콜백 주입
	});
	const canControlController = canBroadcast && isMainOperator;
	const isStandbyOperator = canBroadcast && !isMainOperator;
	const isReadOnlyParticipant = !canControlController;
	const isLiveBroadcasting = session?.status === "live";
	const isRehearsing = session?.status === "rehearsal";
	const isPlayoutActive = isLiveBroadcasting || isRehearsing;
	const followedPreviewOperator = useMemo(() => {
		if (mainOperatorLease) {
			return (
				connectedUsers.find((u) => u.id === mainOperatorLease.userId) ?? null
			);
		}

		const operators = connectedUsers.filter((u) => u.canBroadcast);
		if (operators.length === 0) return null;

		const latestBroadcaster = operators
			.filter((u) => u.lastBroadcastAt != null)
			.sort(
				(a, b) =>
					Date.parse(b.lastBroadcastAt ?? "") -
					Date.parse(a.lastBroadcastAt ?? ""),
			)[0];

		return latestBroadcaster ?? operators[0];
	}, [connectedUsers, mainOperatorLease]);
	const readOnlyPreviewPosition = isReadOnlyParticipant
		? followedPreviewOperator?.playheadPosition
		: undefined;
	const previewMonitorIsScrubbing = isReadOnlyParticipant
		? (followedPreviewOperator?.isScrubbing ?? false)
		: isScrubbing;
	const mainOperatorLabel =
		mainOperatorLease?.displayName || mainOperatorLease?.email || "미지정";
	const handleClaimMainOperator = useCallback(async () => {
		if (!canBroadcast) return;
		if (mainOperatorLease && mainOperatorLease.userId !== user?.id) {
			const ok = window.confirm(
				`${mainOperatorLabel} 오퍼레이터가 현재 운영권을 가지고 있습니다. 운영권을 가져오면 타임라인, Take, 오버레이, 판서 제어 권한이 이 브라우저로 이동합니다.`,
			);
			if (!ok) return;
		}
		const updated = await claimMainOperator({ force: true });
		if (updated) {
			setSession(updated); // 🆕 즉시 로컬 세션 갱신 (실시간 지연 우회)
		}
	}, [
		canBroadcast,
		claimMainOperator,
		mainOperatorLease,
		mainOperatorLabel,
		user?.id,
		setSession,
	]);

	useEffect(() => {
		if (isReadOnlyParticipant && activeTab !== "timeline") {
			setActiveTab("timeline");
		}
	}, [activeTab, isReadOnlyParticipant]);

	// ■ 타이머 tick write는 메인 오퍼레이터 1명만 수행한다.
	// 여러 컨트롤러가 동시에 replicant_data를 쓰면 타이머가 last-write-wins로 흔들린다.
	useEffect(() => {
		if (!sessionId || !canControlController) return;

		const tick = () => {
			for (const overlay of overlayStore.overlays) {
				const data = overlay.replicant_data;
				if (!isTimerReplicant(data)) continue;
				if (!data.running) continue;

				const offset = getClockOffset();
				const remaining = computeRemaining(data, offset);

				if (Math.abs(remaining - data.remaining) >= 0.5) {
					overlayStore.updateReplicantData(overlay.id, {
						...data,
						remaining,
					});
				}
			}
		};

		const interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
	}, [
		canControlController,
		sessionId,
		overlayStore.overlays,
		overlayStore.updateReplicantData,
	]);

	// ─── 송출: payload 빌드 + renderer bridge ───────────────────────

	const {
		broadcastToRenderer,
		clearAutoBroadcastSuppression,
		suppressNextAutoBroadcast,
	} = usePlayoutBridge({
		sessionId,
		isChannelReady,
		isBroadcasting,
		canBroadcast: canControlController,
		pgmBlockIds,
		blocks,
		broadcast,
	});

	const saveAuthoritativePlayoutState = useCallback(
		async (status?: SessionStatus) => {
			const nextRevision = playoutRevisionRef.current + 1;
			const snapshot = {
				...createAuthoritativePlayoutState(timelineStore.state, {
					revision: nextRevision,
					originClientId: controllerClientIdRef.current,
					updatedBy: user?.id,
				}),
				mainOperatorLease,
			};

			await saveSessionPlayoutState(snapshot, status);
			playoutRevisionRef.current = nextRevision;
			return snapshot;
		},
		[mainOperatorLease, saveSessionPlayoutState, user?.id],
	);

	const resetPlayoutProgressState = useCallback((resetPlayhead = true) => {
		timelineStore.setState((state) => {
			const previewId = state.blocks.length > 0 ? state.blocks[0].id : null;
			return {
				...state,
				playheadPosition: resetPlayhead ? 0 : state.playheadPosition,
				pgmBlockIds: new Map<number, string>(),
				lastBroadcastPosition: 0,
				completedBlockIds: new Set<string>(),
				airedBlockIds: new Set<string>(),
				skippedBlockIds: new Set<string>(),
				previewBlockId: resetPlayhead ? previewId : state.previewBlockId,
			};
		});
	}, []);

	const handleBroadcastStart = useCallback(async () => {
		if (!canControlController) return;
		await saveAuthoritativePlayoutState("live");
		setIsBroadcasting(true);
	}, [canControlController, saveAuthoritativePlayoutState]);

	const handleBroadcastStop = useCallback(async () => {
		if (!canControlController) return;
		await broadcast({ action: "STOP" as const, seqNum: Date.now() });
		console.log("[Controller] STOP sent via persistent channel");

		timelineStore.setState((state) => ({
			...state,
			pgmBlockIds: new Map<number, string>(),
			lastBroadcastPosition: 0,
		}));

		await saveAuthoritativePlayoutState("ended");
		setIsBroadcasting(false);
	}, [broadcast, canControlController, saveAuthoritativePlayoutState]);

	const handleRehearsalStart = useCallback(async () => {
		if (!canControlController) return;
		await broadcast({ action: "STOP" as const, seqNum: Date.now() });
		resetPlayoutProgressState(true);
		await saveAuthoritativePlayoutState("rehearsal");
		setIsBroadcasting(true);
	}, [
		broadcast,
		canControlController,
		resetPlayoutProgressState,
		saveAuthoritativePlayoutState,
	]);

	const handleRehearsalStop = useCallback(async () => {
		if (!canControlController) return;
		await broadcast({ action: "STOP" as const, seqNum: Date.now() });
		resetPlayoutProgressState(true);
		await saveAuthoritativePlayoutState("ready");
		setIsBroadcasting(false);
	}, [
		broadcast,
		canControlController,
		resetPlayoutProgressState,
		saveAuthoritativePlayoutState,
	]);

	const handlePlayoutProgressReset = useCallback(async () => {
		if (!canControlController) return;
		await broadcast({ action: "STOP" as const, seqNum: Date.now() });
		resetPlayoutProgressState(true);
		await saveAuthoritativePlayoutState("ready");
		setIsBroadcasting(false);
	}, [
		broadcast,
		canControlController,
		resetPlayoutProgressState,
		saveAuthoritativePlayoutState,
	]);

	const handleBroadcastToPgm = useCallback(async () => {
		if (!canControlController) return;

		broadcastToPGM();
		await saveAuthoritativePlayoutState();
		updateLastBroadcastAt();
		await broadcastToRenderer();
	}, [
		broadcastToRenderer,
		canControlController,
		saveAuthoritativePlayoutState,
		updateLastBroadcastAt,
	]);

	const handleWhiteboardPlayoutStateChange = useCallback(
		async (nextState: "off" | "preview" | "program") => {
			if (!canControlController) return;
			await saveAuthoritativePlayoutState();
			if (nextState !== "preview" && isPlayoutActive) {
				await broadcastToRenderer();
			}
		},
		[
			broadcastToRenderer,
			canControlController,
			isPlayoutActive,
			saveAuthoritativePlayoutState,
		],
	);

	const handleGraphicDetailDataApply = useCallback(
		(blockId: string, nextSourceData: Record<string, unknown>) => {
			if (!canControlController) return;

			const isPgmBlock = updateBlockSourceData(blockId, nextSourceData);
			if (isPgmBlock && isPlayoutActive) {
				void broadcastToRenderer();
			}

			const userName = user?.email?.split("@")[0] || "User";
			const userId = user?.id || "unknown";
			const editedBlock = timelineStore.state.blocks.find(
				(b) => b.id === blockId,
			);
			if (editedBlock) {
				addActionLog(
					"text_edit",
					userId,
					userName,
					editedBlock.name,
					"Graphic Detail data update",
					sessionId,
				);
			}
		},
		[
			broadcastToRenderer,
			canControlController,
			isPlayoutActive,
			sessionId,
			user?.email,
			user?.id,
		],
	);

	const markGraphicCommandPending = useCallback(
		(blockId: string, seqNum: number, message: string) => {
			setGraphicCommandStates((current) => ({
				...current,
				[blockId]: {
					seqNum,
					status: "pending",
					message,
					updatedAt: Date.now(),
				},
			}));

			window.setTimeout(() => {
				setGraphicCommandStates((current) => {
					const existing = current[blockId];
					if (
						!existing ||
						existing.seqNum !== seqNum ||
						existing.status !== "pending"
					) {
						return current;
					}

					return {
						...current,
						[blockId]: {
							...existing,
							status: "error",
							message: "Renderer command result timeout",
							updatedAt: Date.now(),
						},
					};
				});
			}, 4000);
		},
		[],
	);

	const handleGraphicCustomAction = useCallback(
		async (block: GraphicBlock, actionId: string) => {
			if (!canControlController || !isPlayoutActive) return;
			if (![...timelineStore.state.pgmBlockIds.values()].includes(block.id)) {
				return;
			}

			const payload = createGraphicCustomActionCommandPayload({
				targetBlockId: block.id,
				targetTrackId: block.trackId,
				actionId,
			});
			markGraphicCommandPending(
				block.id,
				payload.seqNum,
				`customAction ${actionId} 실행 대기`,
			);
			await broadcast(payload);

			const userName = user?.email?.split("@")[0] || "User";
			const userId = user?.id || "unknown";
			addActionLog(
				"overlay_update",
				userId,
				userName,
				block.name,
				`Graphic customAction: ${actionId}`,
				sessionId,
			);
		},
		[
			broadcast,
			canControlController,
			isPlayoutActive,
			markGraphicCommandPending,
			sessionId,
			user?.email,
			user?.id,
		],
	);

	const handleGraphicStep = useCallback(
		async (block: GraphicBlock, delta: number) => {
			if (!canControlController || !isPlayoutActive) return;
			if (![...timelineStore.state.pgmBlockIds.values()].includes(block.id)) {
				return;
			}

			const payload = createGraphicStepCommandPayload({
				targetBlockId: block.id,
				targetTrackId: block.trackId,
				delta,
			});
			markGraphicCommandPending(
				block.id,
				payload.seqNum,
				`step ${delta > 0 ? "+" : ""}${delta} 실행 대기`,
			);
			await broadcast(payload);

			const userName = user?.email?.split("@")[0] || "User";
			const userId = user?.id || "unknown";
			addActionLog(
				"overlay_update",
				userId,
				userName,
				block.name,
				`Graphic step delta: ${delta}`,
				sessionId,
			);
		},
		[
			broadcast,
			canControlController,
			isPlayoutActive,
			markGraphicCommandPending,
			sessionId,
			user?.email,
			user?.id,
		],
	);

	useEffect(() => {
		if (!session?.playhead_state) return;

		const snapshot = parseAuthoritativePlayoutState(session.playhead_state);
		if (
			!shouldApplyPlayoutSnapshot(
				playoutRevisionRef.current,
				snapshot,
				"realtime",
			)
		) {
			return;
		}

		suppressNextAutoBroadcast();
		const patch = snapshotToTimelinePatch(
			snapshot,
			blocks,
			session.status === "live" || session.status === "rehearsal",
		);
		timelineStore.setState((state) => ({
			...state,
			...patch,
		}));
		playoutRevisionRef.current = snapshot.revision;
	}, [
		blocks,
		session?.playhead_state,
		session?.status,
		suppressNextAutoBroadcast,
	]);

	const runHistoryRestore = useCallback(
		(restore: () => boolean, label: string) => {
			suppressNextAutoBroadcast();
			const restored = restore();
			if (!restored) {
				clearAutoBroadcastSuppression();
				return;
			}

			if (!isPlayoutActive) return;

			const restoredNames = [...timelineStore.state.pgmBlockIds.values()]
				.map(
					(blockId) =>
						timelineStore.state.blocks.find((block) => block.id === blockId)
							?.name,
				)
				.filter(Boolean)
				.join(", ");
			const target = restoredNames || "CLEAR";
			const shouldBroadcast = window.confirm(
				`${label}로 PGM 상태가 ${target}(으)로 복원되었습니다. 렌더러에 다시 송출할까요?`,
			);
			if (shouldBroadcast) {
				void broadcastToRenderer();
			}
		},
		[
			broadcastToRenderer,
			clearAutoBroadcastSuppression,
			isPlayoutActive,
			suppressNextAutoBroadcast,
		],
	);

	const handleUndo = useCallback(() => {
		runHistoryRestore(undo, "Undo");
	}, [runHistoryRestore]);

	const handleRedo = useCallback(() => {
		runHistoryRestore(redo, "Redo");
	}, [runHistoryRestore]);

	// 키보드 내비게이션 활성화 (AI 캐릭터 탭에서는 비활성화)
	useKeyboardNavigation(
		activeTab !== "character" && canControlController,
		isBroadcasting,
		() => {
			// ■ 송출 중이 아닌데 Space를 눌렀을 때 경고 표시
			setNotBroadcastingWarning(true);
			if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
			warningTimerRef.current = setTimeout(
				() => setNotBroadcastingWarning(false),
				2500,
			);
		},
		isScrubbing,
		() => {
			// 스크러빙 모드에서 Space 차단 경고
			setScrubSpaceWarning(true);
			if (scrubWarningTimerRef.current)
				clearTimeout(scrubWarningTimerRef.current);
			scrubWarningTimerRef.current = setTimeout(
				() => setScrubSpaceWarning(false),
				2500,
			);
		},
		handleBroadcastToPgm,
		handleUndo,
		handleRedo,
	);

	// PGM 변경 시 액션 로그 기록
	const prevPgmRef = useRef<string | null>(null);
	useEffect(() => {
		if (!canControlController) return;
		// 이전 값과 동일하면 무시 (초기 로드 등)
		// 멀티트랙: pgmBlockIds의 모든 값을 직렬화하여 변경 감지
		const pgmIdsKey = [...pgmBlockIds.entries()]
			.map(([t, b]) => `${t}:${b}`)
			.sort()
			.join("|");
		if (prevPgmRef.current === pgmIdsKey) return;
		prevPgmRef.current = pgmIdsKey;

		const userName = user?.email?.split("@")[0] || "User";
		const userId = user?.id || "unknown";

		// 새 PGM 블록 ON 기록 (모든 활성 트랙)
		for (const [, blockId] of pgmBlockIds) {
			const newBlock = blocks.find((b) => b.id === blockId);
			if (newBlock) {
				addActionLog(
					"pgm_on",
					userId,
					userName,
					newBlock.name,
					undefined,
					sessionId,
				);
			}
		}
	}, [canControlController, pgmBlockIds, blocks, user, sessionId]);

	// ─── 세션 데이터 → timelineStore 초기화 ──────────────────────────
	// Hook이 session + segments 로딩을 담당. Route는 timelineStore 초기화만.
	const loadedSessionRef = useRef<string | null>(null);
	const timelineInitRef = useRef(false);

	useEffect(() => {
		if (sessionLoading || sessionError || !session) {
			return;
		}
		// 이미 이 세션으로 초기화했으면 건너뜀
		if (
			timelineInitRef.current === true &&
			loadedSessionRef.current === sessionId
		)
			return;
		timelineInitRef.current = true;
		loadedSessionRef.current = sessionId;

		const blocks: GraphicBlock[] = ((session.timeline_data || []) as any[]).map(
			(item: TimelineBlockData) => ({
				id: item.id,
				name: item.name,
				trackId: item.trackId || 1,
				startPosition: item.startPosition,
				width: item.width || 100,
				color: getColorByType(item.source_type),
				transitionIn: normalizeTransitionType(item.transitionIn),
				transitionOut: normalizeTransitionType(item.transitionOut),
				sourceType: item.source_type,
				sourceId: item.source_id,
				sourceData: item.data,
				cuesheetItemId: item.cuesheet_item_id,
				bundleSlotId: item.bundle_slot_id,
				segmentId: item.segment_id,
			}),
		);

		const ps = parseAuthoritativePlayoutState(session.playhead_state);
		playoutRevisionRef.current = ps.revision;
		const restoredPlayhead = ps.playheadPosition;
		const restoredPgmIds: Record<string, string> = ps.pgmBlockIds ?? {};
		const restoredLastPos = ps.lastBroadcastPosition;
		const restoredCompleted = new Set<string>(ps.completedBlockIds ?? []);
		const restoredAired = new Set<string>(ps.airedBlockIds ?? []);
		const restoredSkipped = new Set<string>(ps.skippedBlockIds ?? []);

		const isSessionPlayoutActive =
			session.status === "live" || session.status === "rehearsal";
		const hydratedBlocks = hydrateBlocksWithPlayoutSyntheticBlocks(blocks, ps);
		const finalPgmIds = new Map<number, string>();
		if (isSessionPlayoutActive) {
			for (const [trackIdStr, blockId] of Object.entries(restoredPgmIds)) {
				if (hydratedBlocks.some((b) => b.id === blockId)) {
					finalPgmIds.set(Number(trackIdStr), blockId);
				}
			}
		}
		const finalLastPos = isSessionPlayoutActive ? restoredLastPos : 0;

		const firstPgmId =
			finalPgmIds.size > 0 ? [...finalPgmIds.values()][0] : null;
		const previewId = firstPgmId
			? (hydratedBlocks.find((b) => b.startPosition > restoredPlayhead)?.id ??
				null)
			: (ps.whiteboardPreviewId ??
				(hydratedBlocks.length > 0 ? hydratedBlocks[0].id : null));

		const savedLogoBlocks: GraphicBlock[] = ((ps as any)?.logoBlocks ?? []).map(
			(lb: SavedLogoBlock) => ({
				id: lb.id,
				name: lb.name,
				trackId: 0,
				startPosition: lb.startPosition,
				width: lb.width,
				color: lb.color,
				transitionIn: "cut" as TransitionType,
				transitionOut: "cut" as TransitionType,
				sourceType: "image" as const,
				sourceId: lb.sourceId,
			}),
		);

		timelineStore.setState((state) => ({
			...state,
			blocks: [...hydratedBlocks, ...savedLogoBlocks],
			playheadPosition: restoredPlayhead,
			previewBlockId: previewId,
			pgmBlockIds: finalPgmIds,
			lastBroadcastPosition: finalLastPos,
			selectedBlockId: null,
			completedBlockIds: restoredCompleted,
			airedBlockIds: restoredAired,
			skippedBlockIds: restoredSkipped,
		}));

		// Hook이 이미 segments를 로드했으므로 timelineStore에 반영
		if (sessionSegments.length > 0) {
			timelineStore.setState((state) => ({
				...state,
				segments: sessionSegments.map((s) => ({
					id: s.id,
					cuesheetItemId: s.cuesheetItemId,
					label: s.label,
					reporter: s.reporter,
					order: s.order,
					color: s.color,
					slug: s.slug,
				})),
				activeSegmentTab: null,
			}));
		}

		console.log("[Session] Timeline initialized:", {
			blocksCount: blocks.length,
			segmentsCount: sessionSegments.length,
		});
	}, [session, sessionSegments, sessionLoading, sessionError, sessionId]);

	// === Playhead 상태 DB 영속화 (hook의 savePlayheadStateToDb 사용) ===

	usePlayheadPersistence({
		sessionId,
		isChannelReady,
		blocks,
		pgmBlockIds,
		savePlayheadStateToDb,
		enabled: false,
	});

	// ─── 큐시트 런다운 텍스트 변경 실시간 감지 ──────────────────────
	useCuesheetSync(session?.rundown_id, () => timelineStore.state.blocks);

	// 렌더러 URL
	const rendererUrl = useMemo(() => {
		if (typeof window === "undefined") return "";
		return `${window.location.origin}/render?sessionId=${sessionId}&resolution=1080p`;
	}, [sessionId]);

	// 렌더러 URL 복사 — useClipboard 훅 활용
	const copyRendererUrl = () => {
		copyToClipboard(rendererUrl);
	};

	// 로딩 중
	if (authLoading || sessionLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div
						className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4"
						style={{
							borderColor: "var(--border-default)",
							borderTopColor: "var(--accent-primary)",
						}}
					/>
					<p style={{ color: "var(--text-secondary)" }}>세션 로드 중...</p>
				</div>
			</div>
		);
	}

	// 미인증 → 로그인 페이지로 리다이렉트
	if (!user) {
		return <Navigate to="/login" />;
	}

	// 에러 또는 세션 없음
	if (sessionError || !session) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
						{sessionError || "세션을 찾을 수 없습니다."}
					</p>
					<Link
						to="/dashboard/broadcast"
						className={buttonVariants({ variant: "default" })}
					>
						송출 목록으로 돌아가기
					</Link>
				</div>
			</div>
		);
	}

	// 현재 PGM 블록 정보 (가장 위 트랙 우선)
	const currentPgmBlock =
		pgmBlockIds.size > 0
			? (() => {
					const topEntry = [...pgmBlockIds.entries()].sort(
						([a], [b]) => b - a,
					)[0];
					return topEntry
						? blocks.find((b) => b.id === topEntry[1]) || null
						: null;
				})()
			: null;
	const selectedDetailBlock =
		(selectedBlockId
			? blocks.find((block) => block.id === selectedBlockId)
			: null) ?? currentPgmBlock;
	const selectedDetailBlockIsProgram = selectedDetailBlock
		? [...pgmBlockIds.values()].includes(selectedDetailBlock.id)
		: false;
	const selectedDetailRuntimeCommandState = selectedDetailBlock
		? (graphicCommandStates[selectedDetailBlock.id] ?? null)
		: null;

	return (
		<RoleGuard
			requiredRoles={[
				"playout_operator",
				"cg_designer",
				"cuesheet_editor",
				"viewer",
				"system_admin",
			]}
		>
			<div className="app-container">
				{/* Header */}
				<header className="header">
					<div className="flex items-center gap-4">
						<Link
							to="/dashboard/broadcast"
							className={buttonVariants({ variant: "secondary" })}
							style={{ padding: "0.5rem" }}
						>
							<ArrowLeft size={18} />
						</Link>
						<div>
							<h1
								className="text-lg font-semibold"
								style={{ color: "var(--text-primary)" }}
							>
								{session.title}
							</h1>
							<div
								className="flex items-center gap-2"
								style={{ fontSize: "0.75rem" }}
							>
								{isChannelReady && (
									<span
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.25rem",
											color: "var(--accent-success)",
										}}
									>
										<Radio size={10} />
										Realtime 준비됨
									</span>
								)}
								<span style={{ color: "var(--text-tertiary)" }}>
									{session.timeline_data?.length || 0}개 아이템
								</span>
								<span style={{ color: "var(--accent-success)" }}>
									{airedCount}/{totalPlayableBlocks} 송출
								</span>
								<span
									style={{
										color:
											skippedCount > 0
												? "var(--accent-warning)"
												: "var(--text-tertiary)",
									}}
								>
									{skippedCount} 스킵
								</span>
								<span style={{ color: "var(--text-tertiary)" }}>
									{remainingCount} 남음
								</span>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						{isReadOnlyParticipant && (
							<span
								style={{
									padding: "0.35rem 0.6rem",
									borderRadius: "999px",
									background: "rgba(107, 114, 128, 0.15)",
									border: "1px solid rgba(107, 114, 128, 0.35)",
									color: "var(--text-secondary)",
									fontSize: "0.75rem",
									fontWeight: 600,
								}}
							>
								읽기 전용
							</span>
						)}

						{/* 렌더러 URL */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "0.5rem",
								padding: "0.25rem 0.5rem",
								background: "var(--app-bg-muted)",
								borderRadius: "4px",
								fontSize: "0.6875rem",
								color: "var(--text-tertiary)",
							}}
						>
							<span
								style={{
									maxWidth: "200px",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{rendererUrl}
							</span>
							<button
								type="button"
								onClick={copyRendererUrl}
								style={{
									background: "none",
									border: "none",
									padding: "0.25rem",
									cursor: "pointer",
									color: copied
										? "var(--accent-success)"
										: "var(--text-tertiary)",
								}}
								title="URL 복사"
							>
								<Copy size={12} />
							</button>
							<a
								href={rendererUrl}
								target="_blank"
								rel="noopener noreferrer"
								style={{
									color: "var(--text-tertiary)",
									padding: "0.25rem",
								}}
								title="새 창에서 열기"
							>
								<ExternalLink size={12} />
							</a>
						</div>

						{isRehearsing && (
							<span
								style={{
									padding: "0.35rem 0.6rem",
									borderRadius: "999px",
									background: "var(--accent-subtle-bg)",
									border: "1px solid var(--accent-subtle-border)",
									color: "var(--accent-primary)",
									fontSize: "0.75rem",
									fontWeight: 700,
								}}
							>
								리허설
							</span>
						)}

						{/* 실제 송출 / 리허설 버튼 */}
						{canControlController ? (
							<>
								{!isRehearsing && (
									<BroadcastButton
										sessionId={sessionId}
										isBroadcasting={isLiveBroadcasting}
										onStart={handleBroadcastStart}
										onStop={handleBroadcastStop}
									/>
								)}
								{!isLiveBroadcasting && (
									<Button
										variant="outline"
										onClick={
											isRehearsing ? handleRehearsalStop : handleRehearsalStart
										}
										style={{
											padding: "0.5rem 0.75rem",
											fontSize: "0.8rem",
											display: "flex",
											alignItems: "center",
											gap: "0.35rem",
											background: isRehearsing
												? "var(--accent-subtle-bg)"
												: "transparent",
											borderColor: isRehearsing
												? "var(--accent-subtle-border)"
												: "var(--border-default)",
											color: isRehearsing
												? "var(--accent-primary)"
												: "var(--text-secondary)",
										}}
										title={
											isRehearsing
												? "리허설을 종료하고 재생 기록을 초기화합니다"
												: "리허설 모드를 시작합니다"
										}
									>
										<Radio size={14} />
										{isRehearsing ? "리허설 종료" : "리허설 시작"}
									</Button>
								)}
							</>
						) : (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.5rem",
									padding: "0.5rem 0.75rem",
									borderRadius: "8px",
									border: "1px solid var(--border-default)",
									background: "var(--app-bg-muted)",
									color: isRehearsing
										? "var(--accent-primary)"
										: isLiveBroadcasting
											? "var(--accent-warning)"
											: "var(--text-secondary)",
									fontSize: "0.8rem",
									fontWeight: 600,
								}}
								title="송출 오퍼레이터만 제어할 수 있습니다"
							>
								<Radio className="w-4 h-4" />
								{isRehearsing
									? "리허설중"
									: isLiveBroadcasting
										? "송출중"
										: "송출 대기"}
							</div>
						)}

						{canBroadcast && (
							<Button
								variant={isMainOperator ? "default" : "outline"}
								onClick={handleClaimMainOperator}
								disabled={isWritingLease || isMainOperator}
								style={{
									padding: "0.45rem 0.7rem",
									fontSize: "0.75rem",
									fontWeight: 800,
									borderRadius: "999px",
									background: isMainOperator
										? "var(--accent-primary)"
										: "var(--app-bg-muted)",
									borderColor: isStandbyOperator
										? "rgba(234, 179, 8, 0.45)"
										: "var(--border-default)",
									color: isMainOperator
										? "#fff"
										: isStandbyOperator
											? "#eab308"
											: "var(--text-secondary)",
									cursor: isMainOperator ? "default" : "pointer",
									opacity: isWritingLease ? 0.65 : 1,
								}}
								title={
									isMainOperator
										? "이 브라우저가 메인 오퍼레이터입니다"
										: "운영권을 이 브라우저로 가져옵니다"
								}
							>
								{isMainOperator
									? "메인 OP"
									: mainOperatorLease
										? "OP 가져오기"
										: "OP 선택"}
							</Button>
						)}

						{/* 송출 진행 기록 초기화 — 리허설 종료는 자동 초기화하므로 별도 표시하지 않음 */}
						{canControlController && !isRehearsing && (
							<Button
								variant="secondary"
								onClick={handlePlayoutProgressReset}
								disabled={
									playoutProgressCount === 0 && session.status !== "ended"
								}
								style={{
									padding: "0.375rem 0.75rem",
									fontSize: "0.75rem",
									display: "flex",
									alignItems: "center",
									gap: "0.25rem",
									cursor:
										playoutProgressCount > 0 || session.status === "ended"
											? "pointer"
											: "default",
									opacity:
										playoutProgressCount > 0 || session.status === "ended"
											? 1
											: 0.6,
								}}
								title="송출/리허설 진행 기록을 초기화하고 준비 상태로 되돌립니다"
							>
								<RotateCcw size={14} />
								기록 초기화
								<span
									style={{
										background:
											playoutProgressCount > 0
												? "var(--accent-primary)"
												: "var(--app-bg-muted)",
										color:
											playoutProgressCount > 0
												? "white"
												: "var(--text-tertiary)",
										border:
											playoutProgressCount > 0
												? "none"
												: "1px solid var(--border-default)",
										borderRadius: "999px",
										padding: "0 6px",
										fontSize: "0.625rem",
										fontWeight: 700,
										marginLeft: "2px",
									}}
								>
									{playoutProgressCount}
								</span>
							</Button>
						)}

						{/* 접속자 표시 */}
						<UserAvatars
							users={
								connectedUsers.length > 0
									? connectedUsers
									: [
											{
												id: user.id,
												email: user.email || "",
												displayName: user.email?.split("@")[0] || "User",
												color: myColor,
												playheadPosition: 0,
												canBroadcast: canBroadcastPresence,
												isCurrentUser: true,
												isScrubbing: false,
												lastBroadcastAt: null,
											},
										]
							}
						/>

						{canControlController && <SettingsPanel />}

						<ControllerActivityPanel
							canApplyNrcs={canControlController}
							onApplyNrcsChange={() => broadcastToRenderer()}
						/>
					</div>
				</header>

				{/* 단축키 도움말 모달 */}
				{showShortcutHelp && (
					<KeyboardShortcutModal onClose={() => setShowShortcutHelp(false)} />
				)}

				{needsOperatorSelection && (
					<div
						style={{
							position: "fixed",
							inset: 0,
							zIndex: 10000,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "rgba(0, 0, 0, 0.62)",
							backdropFilter: "blur(6px)",
						}}
					>
						<div
							style={{
								width: "min(440px, calc(100vw - 2rem))",
								borderRadius: "16px",
								border: "1px solid rgba(234, 179, 8, 0.35)",
								background: "var(--app-bg-alt)",
								boxShadow: "0 24px 80px rgba(0, 0, 0, 0.48)",
								padding: "1.25rem",
							}}
						>
							<div
								style={{
									fontSize: "0.75rem",
									fontWeight: 800,
									color: "#eab308",
									marginBottom: "0.5rem",
								}}
							>
								MAIN OPERATOR REQUIRED
							</div>
							<h2
								style={{
									margin: 0,
									fontSize: "1.1rem",
									fontWeight: 800,
									color: "var(--text-primary)",
								}}
							>
								메인 오퍼레이터를 선택하세요
							</h2>
							<p
								style={{
									margin: "0.75rem 0 1rem",
									fontSize: "0.85rem",
									lineHeight: 1.55,
									color: "var(--text-secondary)",
								}}
							>
								현재 세션에 오퍼레이터가 2명 이상입니다. 한 명만 타임라인, Take,
								오버레이, 판서 송출 상태를 쓸 수 있어야 PVW/PGM 기준이 흔들리지
								않습니다.
							</p>
							<Button
								onClick={handleClaimMainOperator}
								disabled={isWritingLease}
								style={{
									width: "100%",
									justifyContent: "center",
									background: "var(--accent-primary)",
									color: "#fff",
									fontWeight: 800,
								}}
							>
								{isWritingLease ? "운영권 설정 중..." : "내가 메인 오퍼레이터"}
							</Button>
						</div>
					</div>
				)}

				{/* 메인 콘텐츠 (모니터 + 탭 바 + 탭 콘텐츠) — 1fr 영역 */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
						minHeight: 0,
					}}
				>
					{/* PVW / PGM 모니터 — 항상 표시, 고정 크기 */}
					<div
						className={`monitors-container${isReadOnlyParticipant ? " monitors-container-readonly" : ""}`}
					>
						<PreviewMonitor
							sessionId={sessionId}
							videoRef={previewVideoRef}
							previewOverlays={filteredPreviewOverlays}
							skipExitOverlayIds={filteredProgramOverlayIds}
							onPluginAction={
								canControlController
									? overlayStore.handlePluginAction
									: undefined
							}
							previewPosition={readOnlyPreviewPosition}
							isScrubbing={previewMonitorIsScrubbing}
						/>
						{canControlController && (
							<MonitorActionBar
								previewVideoRef={previewVideoRef}
								videoInputMode={videoInputMode}
							/>
						)}
						<PGMMonitor
							sessionId={sessionId}
							isBroadcasting={isBroadcasting}
							notBroadcastingWarning={notBroadcastingWarning}
							scrubWarning={scrubSpaceWarning}
							programOverlays={filteredProgramOverlays}
							skipExitOverlayIds={filteredPreviewOverlayIds}
							onPluginAction={
								canControlController
									? overlayStore.handlePluginAction
									: undefined
							}
						/>
					</div>

					{/* 탭 바 — 모니터 바로 아래 */}
					<div className="controller-tab-bar">
						<div style={{ display: "flex", gap: "2px" }}>
							<button
								type="button"
								onClick={() => setActiveTab("timeline")}
								className={`controller-tab ${activeTab === "timeline" ? "active" : ""}`}
							>
								타임라인
							</button>
							{canControlController && (
								<>
									<button
										type="button"
										onClick={() => setActiveTab("overlay")}
										className={`controller-tab ${activeTab === "overlay" ? "active" : ""}`}
									>
										<Layers size={12} />
										오버레이
									</button>
									<button
										type="button"
										onClick={() => setActiveTab("character")}
										className={`controller-tab ${activeTab === "character" ? "active" : ""}`}
									>
										<Bot size={12} />
										AI 캐릭터
									</button>
									<button
										type="button"
										onClick={() => setActiveTab("whiteboard")}
										className={`controller-tab ${activeTab === "whiteboard" ? "active" : ""}`}
									>
										<PenTool size={12} />
										판서
									</button>
								</>
							)}
						</div>
					</div>

					{/* 탭 콘텐츠 */}
					<div className="controller-tab-content">
						{activeTab === "timeline" && (
							<ErrorBoundary componentName="타임라인">
								<div className="controller-playout-workspace">
									<div className="controller-playout-deck">
										<Timeline
											remotePlayheads={remotePlayheads}
											myColor={myColor}
											readOnly={isReadOnlyParticipant}
											undoAvailable={undoAvailable}
											redoAvailable={redoAvailable}
											onUndo={handleUndo}
											onRedo={handleRedo}
											onOpenShortcutHelp={() => setShowShortcutHelp(true)}
											onBlockDoubleClick={
												canControlController
													? (block) => setEditingBlock(block)
													: undefined
											}
										/>
									</div>
									{canControlController && (
										<GraphicDetailControl
											block={selectedDetailBlock}
											disabled={!canControlController}
											isProgram={selectedDetailBlockIsProgram}
											isPlayoutActive={isPlayoutActive}
											runtimeCommandState={selectedDetailRuntimeCommandState}
											onApplyData={handleGraphicDetailDataApply}
											onRunCustomAction={handleGraphicCustomAction}
											onRunStep={handleGraphicStep}
										/>
									)}
								</div>
							</ErrorBoundary>
						)}
						{canControlController && activeTab === "overlay" && (
							<ErrorBoundary componentName="오버레이 패널">
								<OverlayPanel
									sessionId={sessionId}
									currentPgmBlock={
										currentPgmBlock
											? {
													id: currentPgmBlock.id,
													name: currentPgmBlock.name,
													trackId: currentPgmBlock.trackId,
												}
											: null
									}
									overlayStore={overlayStore}
								/>
							</ErrorBoundary>
						)}
						{canControlController && activeTab === "character" && (
							<ErrorBoundary componentName="AI 캐릭터">
								<AiCharacterPanel
									sessionId={sessionId}
									isActiveTab={activeTab === "character"}
								/>
							</ErrorBoundary>
						)}
						{canControlController && activeTab === "whiteboard" && (
							<ErrorBoundary componentName="판서 레이어">
								<WhiteboardPanel
									sessionId={sessionId}
									isPlayoutActive={isPlayoutActive}
									onPlayoutStateChange={handleWhiteboardPlayoutStateChange}
								/>
							</ErrorBoundary>
						)}
					</div>
				</div>
				{/* 텍스트 핫 수정 드로어 (타임라인 블록 더블클릭 시) */}
				{canControlController && (
					<BlockEditDrawer
						block={editingBlock}
						onClose={() => setEditingBlock(null)}
						onApply={(blockId) => {
							// sourceData 변경 후 렌더러 재발행
							broadcastToRenderer();
							const userName = user?.email?.split("@")[0] || "User";
							const userId = user?.id || "unknown";
							const editedBlock = blocks.find((b) => b.id === blockId);
							if (editedBlock) {
								addActionLog(
									"text_edit",
									userId,
									userName,
									editedBlock.name,
									"텍스트 핫 수정",
									sessionId,
								);
							}
						}}
					/>
				)}
			</div>
		</RoleGuard>
	);
}

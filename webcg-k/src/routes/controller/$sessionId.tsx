/**
 * Session-based Controller Page
 * 프로젝트(세션) 기반 타임라인 송출 컨트롤러
 */

import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, Bot, Copy, ExternalLink, HelpCircle, Layers, Radio, RotateCcw, PenTool } from "lucide-react";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useStore } from "@tanstack/react-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { ActionLogPanel } from "../../components/Controller/ActionLogPanel";
import { BroadcastButton } from "../../components/Controller/BroadcastButton";
import { PGMMonitor } from "../../components/Controller/PGMMonitor";
import { PreviewMonitor } from "../../components/Controller/PreviewMonitor";
import { SettingsPanel } from "../../components/Controller/SettingsPanel";
import { Timeline, type RemotePlayheadData } from "../../components/Controller/Timeline";
import { UserAvatars } from "../../components/Controller/UserAvatars";
import { OverlayPanel } from "../../components/Controller/OverlayPanel";
import { AiCharacterPanel } from "../../components/Controller/AiCharacterPanel";
import { WhiteboardPanel } from "../../components/Controller/WhiteboardPanel";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { parsePlayheadState } from "../../lib/schemas";
import { NrcsChangeAlert } from "../../components/Controller/NrcsChangeAlert";
import { BlockEditDrawer } from "../../components/Controller/BlockEditDrawer";
import { KeyboardShortcutModal } from "../../components/Controller/KeyboardShortcutModal";
import { MonitorActionBar } from "../../components/Controller/MonitorActionBar";
import { RoleGuard, useCanPerform } from "../../components/RoleGuard";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import { useSessionPresence } from "../../hooks/useSessionPresence";
import { useClipboard } from "../../hooks/useClipboard";
import { useOverlayStore } from "../../hooks/useOverlayStore";
import { computeRemaining, isTimerReplicant } from "../../lib/timerUtils";
import { useAuth } from "../../lib/auth";
import { addActionLog } from "../../stores/actionLogStore";
import { timelineStore, type GraphicBlock, type TransitionType, resetCompletedBlocks, setPlayheadPosition } from "../../stores/timelineStore";
import type { PlayheadState, SavedLogoBlock, TimelineBlockData } from "../../lib/types/broadcast";
import {
  useSessionController,
  type PlayoutPayload,
} from "../../hooks/useSessionController";
import { useCuesheetSync } from "../../hooks/useCuesheetSync";
import { calibrateClockOffset, getClockOffset } from "../../lib/clockSync";

export const Route = createFileRoute("/controller/$sessionId")({
    // ■ output 쿼리 파라미터: 모니터에 표시할 오버레이 태그 필터
    // 예: /controller/xxx?output=viewer → PVW/PGM에 "viewer" 태그 오버레이만 표시
    // 태그 없으면 기존 동작(모든 오버레이 표시)
    validateSearch: (search: Record<string, unknown>) => ({
        output: (search.output as string) || null,
    }),
    component: SessionControllerPage,
});

// 타입은 lib/types/broadcast.ts에서 import

function SessionControllerPage() {
    const { sessionId } = Route.useParams();
    const { output: outputTag } = Route.useSearch();
    const { user, loading: authLoading } = useAuth();

    // ─── 세션 + 채널 hook ────────────────────────────────────────────
    const {
        session,
        segments: sessionSegments,
        loading: sessionLoading,
        error: sessionError,
        isChannelReady,
        broadcast,
        savePlayheadState: savePlayheadStateToDb,
        updateStatus,
    } = useSessionController(sessionId);
    const { copied, copyToClipboard } = useClipboard();

    // ■ 오버레이 단일 진실점 — useOverlayStore
    // Realtime 1개만 구독, 모든 모니터/패널이 같은 데이터 참조
    const overlayStore = useOverlayStore(sessionId);

    // ■ 모니터 출력 필터: output 쿼리 파라미터로 특정 태그만 PVW/PGM에 표시
    // Why? /controller/xxx?output=viewer 로 접속하면 시청자용 출력만 확인.
    //       태그 없으면 기존 동작(모든 오버레이 표시)
    const filteredPreviewOverlays = useMemo(() => {
        if (!outputTag) return overlayStore.previewOverlays;
        return overlayStore.previewOverlays.filter((o) =>
            (o as any).tags?.includes(outputTag) || (o as any).group_tag === outputTag
        );
    }, [overlayStore.previewOverlays, outputTag]);

    const filteredProgramOverlays = useMemo(() => {
        if (!outputTag) return overlayStore.programOverlays;
        return overlayStore.programOverlays.filter((o) =>
            (o as any).tags?.includes(outputTag) || (o as any).group_tag === outputTag
        );
    }, [overlayStore.programOverlays, outputTag]);

    // ■ Clock Offset 캘리브레이션 — 초기 로드 시 1회
    useEffect(() => {
        calibrateClockOffset().then((offset) => {
            console.log("[Controller] Clock offset calibrated:", offset, "ms");
        });
    }, []);

    // ■ 타이머 틱 루프 — 1초 주기로 remaining 갱신하여 모든 View에 전파
    useEffect(() => {
        if (!sessionId) return;

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
    }, [sessionId, overlayStore.overlays, overlayStore.updateReplicantData]);

    // 탭 상태 (타임라인/오버레이/AI 캐릭터/판서 레이어)
    const [activeTab, setActiveTab] = useState<"timeline" | "overlay" | "character" | "whiteboard">("timeline");
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
    const scrubWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 텍스트 핫 수정 드로어 상태
    const [editingBlock, setEditingBlock] = useState<GraphicBlock | null>(null);

    // Supabase Presence로 접속자 관리
    const {
        connectedUsers,
        myColor,
        updatePlayheadPosition,
        setIsScrubbing,
        updateLastBroadcastAt,
    } = useSessionPresence(sessionId);

    // ─── 영상 캡쳐용 video ref (PVW 모니터의 클린 영상) ───
    const previewVideoRef = useRef<HTMLVideoElement | null>(null);

    // ─── 영상 입력 설정 (MonitorActionBar에서 모드 체크용) ───
    const [videoInputMode, setVideoInputMode] = useState<"off" | "ndi" | "uvc">("off");
    useEffect(() => {
        // SettingsPanel이 localStorage에 저장한 설정 읽기
        try {
            const saved = localStorage.getItem("webcg-k-video-input-config");
            if (saved) setVideoInputMode(JSON.parse(saved).mode || "off");
        } catch { /* 무시 */ }
        const handleChange = () => {
            try {
                const saved = localStorage.getItem("webcg-k-video-input-config");
                if (saved) setVideoInputMode(JSON.parse(saved).mode || "off");
            } catch { /* 무시 */ }
        };
        window.addEventListener("videoInputConfigChanged", handleChange);
        return () => window.removeEventListener("videoInputConfigChanged", handleChange);
    }, []);
    // 원격 플레이헤드 데이터 (내 정보 제외)
    const remotePlayheads: RemotePlayheadData[] = connectedUsers
        .filter(u => !u.isCurrentUser)
        .map(u => ({
            userId: u.id,
            displayName: u.displayName,
            color: u.color,
            position: u.playheadPosition,
            isScrubbing: u.isScrubbing,
        }));

    // ─── 멀티유저 스크러빙 ───
    const isScrubbing = useStore(timelineStore, (state) => state.isScrubbing);

    // 키보드 내비게이션 활성화 (AI 캐릭터 탭에서는 비활성화)
    useKeyboardNavigation(activeTab !== "character", isBroadcasting, () => {
        // ■ 송출 중이 아닌데 Space를 눌렀을 때 경고 표시
        setNotBroadcastingWarning(true);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => setNotBroadcastingWarning(false), 2500);
    }, isScrubbing, () => {
        // 스크러빙 모드에서 Space 차단 경고
        setScrubSpaceWarning(true);
        if (scrubWarningTimerRef.current) clearTimeout(scrubWarningTimerRef.current);
        scrubWarningTimerRef.current = setTimeout(() => setScrubSpaceWarning(false), 2500);
    });

    // ─── 주 오퍼레이터 결정 ───
    // lastBroadcastAt이 가장 최신인 사용자 = 주 오퍼레이터
    const primaryOperator = useMemo(() => {
        const broadcasters = connectedUsers.filter(u => u.lastBroadcastAt);
        if (broadcasters.length === 0) return null;
        return broadcasters.sort(
            (a, b) => new Date(b.lastBroadcastAt!).getTime() - new Date(a.lastBroadcastAt!).getTime()
        )[0];
    }, [connectedUsers]);


    // ─── 플레이헤드 팔로잉 ───
    // 스크러빙 OFF + 주 오퍼레이터 아닐 때 → 주 오퍼레이터 playhead 자동 추적
    useEffect(() => {
        if (!isScrubbing && primaryOperator && !primaryOperator.isCurrentUser) {
            setPlayheadPosition(primaryOperator.playheadPosition);
        }
    }, [primaryOperator?.id, primaryOperator?.playheadPosition, isScrubbing]);

    // ─── 스크러빙 상태 Presence 동기화 ───
    const prevScrubbingRef = useRef<boolean>(false);
    useEffect(() => {
        if (prevScrubbingRef.current !== isScrubbing) {
            prevScrubbingRef.current = isScrubbing;
            setIsScrubbing(isScrubbing);
            updatePlayheadPosition(timelineStore.state.playheadPosition);
        }
    }, [isScrubbing, setIsScrubbing, updatePlayheadPosition]);

    // PGM 블록 상태 구독 (Realtime 발행용) — 멀티트랙
    const pgmBlockIds = useStore(timelineStore, (state) => state.pgmBlockIds);
    const blocks = useStore(timelineStore, (state) => state.blocks);
    const completedBlockIds = useStore(timelineStore, (state) => state.completedBlockIds);

    // ─── PGM 변경 시 lastBroadcastAt 갱신 (주 오퍼레이터 추적용) ───
    const pgmKeyRef = useRef<string>("");
    useEffect(() => {
        const pgmKey = [...pgmBlockIds.entries()]
            .map(([t, b]) => `${t}:${b}`)
            .sort()
            .join("|");
        if (pgmKeyRef.current && pgmKeyRef.current !== pgmKey) {
            updateLastBroadcastAt();
        }
        pgmKeyRef.current = pgmKey;
    }, [pgmBlockIds, updateLastBroadcastAt]);

    // 초기화 버튼 카운트: 완료된 블록 수
    const completedCount = completedBlockIds.size;

    // ─── RBAC: 송출 권한 가드 ───
    // ■ Why 컴포넌트 내부에서도 체크?
    //   RoleGuard가 라우트 레벨에서 차단하지만,
    //   broadcastToRenderer()는 키보드 단축키(Space)에서도 호출되므로
    //   함수 레벨에서도 이중 방어한다.
    const canBroadcast = useCanPerform(["playout_operator", "system_admin"]);

    // ─── 송출: payload 빌드 + hook의 broadcast() 호출 ──────────────────

    const buildPlayoutPayload = useCallback((): PlayoutPayload => {
        const seqNum = Date.now();
        const currentFadeDuration = timelineStore.state.fadeDuration;

        const activeItems = [...pgmBlockIds.entries()]
            .map(([, blockId]) => blocks.find((b) => b.id === blockId))
            .filter(Boolean)
            .map((b) => ({
                id: b!.id,
                name: b!.name,
                trackId: b!.trackId,
                color: b!.color || "",
                transitionIn: b!.transitionIn,
                sourceType: (b as any)?.sourceType,
                sourceData: (b as any)?.sourceData,
            }));

        return activeItems.length > 0
            ? { action: "PLAY_MULTI" as const, items: activeItems, fadeDuration: currentFadeDuration, seqNum }
            : { action: "CLEAR" as const, fadeDuration: currentFadeDuration, seqNum };
    }, [pgmBlockIds, blocks]);

    const broadcastToRenderer = useCallback(async () => {
        if (!canBroadcast) {
            console.warn("[RBAC] 송출 권한 없음 — broadcastToRenderer 차단");
            return;
        }
        const payload = buildPlayoutPayload();
        console.log("[Controller] Broadcasting to renderer:", payload);
        await broadcast(payload);
    }, [canBroadcast, buildPlayoutPayload, broadcast]);

    // pgmBlockIds 변경 시 자동 발행
    useEffect(() => {
        if (!sessionId || !isChannelReady) return;
        broadcastToRenderer();
    }, [pgmBlockIds, sessionId, isChannelReady, broadcastToRenderer]);


    // PGM 변경 시 액션 로그 기록
    const prevPgmRef = useRef<string | null>(null);
    useEffect(() => {
        // 이전 값과 동일하면 무시 (초기 로드 등)
        // 멀티트랙: pgmBlockIds의 모든 값을 직렬화하여 변경 감지
        const pgmIdsKey = [...pgmBlockIds.entries()].map(([t, b]) => `${t}:${b}`).sort().join("|");
        if (prevPgmRef.current === pgmIdsKey) return;
        prevPgmRef.current = pgmIdsKey;

        const userName = user?.email?.split("@")[0] || "User";
        const userId = user?.id || "unknown";

        // 새 PGM 블록 ON 기록 (모든 활성 트랙)
        for (const [, blockId] of pgmBlockIds) {
            const newBlock = blocks.find((b) => b.id === blockId);
            if (newBlock) {
                addActionLog("pgm_on", userId, userName, newBlock.name, undefined, sessionId);
            }
        }
    }, [pgmBlockIds, blocks, user]);

    // ─── 세션 데이터 → timelineStore 초기화 ──────────────────────────
    // Hook이 session + segments 로딩을 담당. Route는 timelineStore 초기화만.
    const loadedSessionRef = useRef<string | null>(null);
    const timelineInitRef = useRef(false);

    useEffect(() => {
        if (sessionLoading || sessionError || !session) {
            return;
        }
        // 이미 이 세션으로 초기화했으면 건너뜀
        if (timelineInitRef.current === true && loadedSessionRef.current === sessionId) return;
        timelineInitRef.current = true;
        loadedSessionRef.current = sessionId;

        const blocks: GraphicBlock[] = ((session.timeline_data || []) as any[]).map((item: TimelineBlockData) => ({
            id: item.id,
            name: item.name,
            trackId: item.trackId || 1,
            startPosition: item.startPosition,
            width: item.width || 100,
            color: getColorByType(item.source_type),
            transitionIn: "fade" as TransitionType,
            transitionOut: "fade" as TransitionType,
            sourceType: item.source_type,
            sourceId: item.source_id,
            sourceData: item.data,
            cuesheetItemId: item.cuesheet_item_id,
            bundleSlotId: item.bundle_slot_id,
            segmentId: item.segment_id,
        }));

        const ps = parsePlayheadState(session.playhead_state);
        const restoredPlayhead = (ps.playheadPosition ?? 0) as number;
        const restoredPgmIds: Record<string, string> = ps.pgmBlockIds ?? {};
        const restoredLastPos = ((ps as any).lastBroadcastPosition ?? 0) as number;
        const restoredCompleted = new Set<string>((ps as any).completedBlockIds ?? []);
        const restoredAired = new Set<string>((ps as any).airedBlockIds ?? []);
        const restoredSkipped = new Set<string>((ps as any).skippedBlockIds ?? []);

        const isSessionLive = session.status === "live";
        const finalPgmIds = new Map<number, string>();
        if (isSessionLive) {
            for (const [trackIdStr, blockId] of Object.entries(restoredPgmIds)) {
                if (blocks.some(b => b.id === blockId)) {
                    finalPgmIds.set(Number(trackIdStr), blockId);
                }
            }
        }
        const finalLastPos = isSessionLive ? restoredLastPos : 0;

        const firstPgmId = finalPgmIds.size > 0 ? [...finalPgmIds.values()][0] : null;
        const previewId = firstPgmId
            ? blocks.find(b => b.startPosition > restoredPlayhead)?.id ?? null
            : (blocks.length > 0 ? blocks[0].id : null);

        const savedLogoBlocks: GraphicBlock[] = ((ps as any)?.logoBlocks ?? []).map((lb: SavedLogoBlock) => ({
            id: lb.id, name: lb.name, trackId: 0,
            startPosition: lb.startPosition, width: lb.width, color: lb.color,
            transitionIn: "cut" as TransitionType, transitionOut: "cut" as TransitionType,
            sourceType: "image" as const, sourceId: lb.sourceId,
        }));

        timelineStore.setState((state) => ({
            ...state,
            blocks: [...blocks, ...savedLogoBlocks],
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
                segments: sessionSegments.map(s => ({
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

        console.log("[Session] Timeline initialized:", { blocksCount: blocks.length, segmentsCount: sessionSegments.length });
    }, [session, sessionSegments, sessionLoading, sessionError, sessionId]);

    // === Playhead 상태 DB 영속화 (hook의 savePlayheadStateToDb 사용) ===

    const buildPlayheadState = useCallback((): PlayheadState => {
        const state = timelineStore.state;
        const logoTrack = state.tracks.find(t => t.isLogoTrack);
        const logoBlocks: SavedLogoBlock[] = logoTrack
            ? state.blocks
                .filter(b => b.trackId === logoTrack.id)
                .map(b => ({ id: b.id, name: b.name, startPosition: b.startPosition, width: b.width, color: b.color, sourceId: b.sourceId }))
            : [];
        return {
            playheadPosition: state.playheadPosition,
            pgmBlockIds: Object.fromEntries(state.pgmBlockIds),
            lastBroadcastPosition: state.lastBroadcastPosition,
            completedBlockIds: Array.from(state.completedBlockIds),
            airedBlockIds: Array.from(state.airedBlockIds),
            skippedBlockIds: Array.from(state.skippedBlockIds),
            logoBlocks,
        };
    }, []);

    const savePlayheadState = useCallback(async () => {
        await savePlayheadStateToDb(buildPlayheadState());
    }, [savePlayheadStateToDb, buildPlayheadState]);

    // PGM 블록 변경 시 자동 저장
    useEffect(() => {
        if (!isChannelReady) return;
        savePlayheadState();
    }, [pgmBlockIds, isChannelReady, savePlayheadState]);

    // 로고 블록 변경 시 자동 저장
    const logoBlockKey = useMemo(() => {
        const logoTrack = timelineStore.state.tracks.find(t => t.isLogoTrack);
        if (!logoTrack) return "";
        return blocks
            .filter(b => b.trackId === logoTrack.id)
            .map(b => `${b.id}:${b.startPosition}:${b.width}`)
            .join("|");
    }, [blocks]);

    useEffect(() => {
        if (!isChannelReady || !logoBlockKey) return;
        savePlayheadState();
    }, [logoBlockKey, isChannelReady, savePlayheadState]);

    // 페이지 이탈 시 playhead 상태 저장 (sendBeacon)
    useEffect(() => {
        if (!sessionId) return;

        const handleBeforeUnload = () => {
            const state = buildPlayheadState();
            const payload = JSON.stringify({ playhead_state: state });
            const url = `${import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321"}/rest/v1/broadcast_sessions?id=eq.${sessionId}`;
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon(url + `&apikey=${anonKey}`, blob);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            savePlayheadState();
        };
    }, [sessionId, savePlayheadState, buildPlayheadState]);

    // ─── 큐시트 런다운 텍스트 변경 실시간 감지 ──────────────────────
    useCuesheetSync(session?.rundown_id, () => timelineStore.state.blocks);

    // 소스 타입에 따른 색상
    const getColorByType = (type: string): string => {
        switch (type) {
            case "image":
                return "rgba(59, 130, 246, 0.7)"; // 파랑
            case "graphic":
                return "rgba(16, 185, 129, 0.7)"; // 초록
            case "template":
                return "rgba(139, 92, 246, 0.7)"; // 보라
            case "overlay":
                return "rgba(236, 72, 153, 0.7)"; // 핑크 (AI 생성)
            default:
                return "rgba(100, 100, 100, 0.7)";
        }
    };

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
                    <Link to="/dashboard/broadcast" className={buttonVariants({ variant: "default" })}>
                        송출 목록으로 돌아가기
                    </Link>
                </div>
            </div>
        );
    }

    // 현재 PGM 블록 정보 (가장 위 트랙 우선)
    const currentPgmBlock = pgmBlockIds.size > 0
        ? (() => {
            const topEntry = [...pgmBlockIds.entries()].sort(([a], [b]) => b - a)[0];
            return topEntry ? blocks.find(b => b.id === topEntry[1]) || null : null;
        })()
        : null;

    return (
        <RoleGuard requiredRoles={["playout_operator", "cg_designer", "system_admin"]}>
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
                        <div className="flex items-center gap-2" style={{ fontSize: "0.75rem" }}>
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
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">

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
                        <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                                color: copied ? "var(--accent-success)" : "var(--text-tertiary)",
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

                    {/* 송출 버튼 */}
                    <BroadcastButton
                        sessionId={sessionId}
                        isBroadcasting={isBroadcasting}
                        onBroadcastChange={setIsBroadcasting}
                        onStop={async () => {
                            // 1. STOP 명령 발행
                            await broadcast({ action: "STOP" as const, seqNum: Date.now() });
                            console.log("[Controller] STOP sent via persistent channel");

                            // 2. ■ PGM 상태 즉시 소거 — "유령 그래픽" 방지
                            // Why? STOP만 보내면 렌더러는 지워지지만,
                            //   컨트롤러 PGM 모니터는 timelineStore의 pgmBlockId/
                            //   lastBroadcastPosition에 의존하므로 이것도 초기화해야
                            //   "송출 중이 아닌데 PGM에 그래픽이 보이는" 유령 상태를 방지.
                            timelineStore.setState((state) => ({
                                ...state,
                                pgmBlockIds: new Map<number, string>(),
                                lastBroadcastPosition: 0,
                            }));
                        }}
                    />

                    {/* ■ 송출완료 → 준비됨 되돌리기. OBS URL은 그대로 유지하며 리허설 가능 */}
                    {session.status === "ended" && (
                        <button
                            type="button"
                            onClick={async () => {
                                await updateStatus("ready");
                            }}
                            className={buttonVariants({ variant: "secondary" })}
                            style={{
                                fontSize: "0.75rem",
                                padding: "0.25rem 0.625rem",
                                gap: "4px",
                            }}
                            title="송출완료 상태를 준비됨으로 되돌립니다"
                        >
                            <RotateCcw size={14} />
                            되돌리기
                        </button>
                    )}


                    {/* 초기화 버튼 — 항상 표시, 0일 때 비활성 */}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            if (completedCount > 0) {
                                resetCompletedBlocks();
                                updateStatus("ready");
                                savePlayheadStateToDb({
                                    playheadPosition: 0,
                                    pgmBlockIds: {},
                                    lastBroadcastPosition: 0,
                                    completedBlockIds: [],
                                    airedBlockIds: [],
                                    skippedBlockIds: [],
                                    logoBlocks: [],
                                });
                            }
                        }}
                        style={{
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.75rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            cursor: completedCount > 0 ? "pointer" : "default",
                            opacity: completedCount > 0 ? 1 : 0.6,
                        }}
                        title="송출 완료 상태 초기화"
                    >
                        <RotateCcw size={14} />
                        초기화
                        <span style={{
                            background: completedCount > 0 ? "var(--accent-primary)" : "var(--app-bg-muted)",
                            color: completedCount > 0 ? "white" : "var(--text-tertiary)",
                            border: completedCount > 0 ? "none" : "1px solid var(--border-default)",
                            borderRadius: "999px",
                            padding: "0 6px",
                            fontSize: "0.625rem",
                            fontWeight: 700,
                            marginLeft: "2px",
                        }}>
                            {completedCount}
                        </span>
                    </Button>


                    {/* 접속자 표시 */}
                    <UserAvatars
                        users={connectedUsers.length > 0 ? connectedUsers : [
                            {
                                id: user.id,
                                email: user.email || "",
                                displayName: user.email?.split("@")[0] || "User",
                                color: myColor,
                                playheadPosition: 0,
                                canBroadcast: true,
                                isCurrentUser: true,
                                isScrubbing: false,
                                lastBroadcastAt: null,
                            }
                        ]}
                    />

                    <SettingsPanel />

                    {/* NRCS 변경 알림 배지 + Diff 드로어 */}
                    <NrcsChangeAlert onApplyChange={() => broadcastToRenderer()} />

                    {/* 액션 로그 */}
                    <ActionLogPanel />

                    {/* 도움말 버튼 */}
                    <Button
                        variant="secondary"
                        onClick={() => setShowShortcutHelp(true)}
                        style={{ padding: "0.375rem" }}
                        title="단축키 도움말"
                    >
                        <HelpCircle className="w-4 h-4" />
                    </Button>
                </div>
            </header>

            {/* 단축키 도움말 모달 */}
            {showShortcutHelp && (
                <KeyboardShortcutModal onClose={() => setShowShortcutHelp(false)} />
            )}

            {/* 메인 콘텐츠 (모니터 + 탭 바 + 탭 콘텐츠) — 1fr 영역 */}
            <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
                {/* PVW / PGM 모니터 — 항상 표시, 고정 크기 */}
                <div className="monitors-container">
                    <PreviewMonitor sessionId={sessionId} videoRef={previewVideoRef} previewOverlays={filteredPreviewOverlays} onPluginAction={overlayStore.handlePluginAction} isScrubbing={isScrubbing} />
                    <MonitorActionBar
                        previewVideoRef={previewVideoRef}
                        videoInputMode={videoInputMode}
                    />
                    <PGMMonitor
                        sessionId={sessionId}
                        isBroadcasting={isBroadcasting}
                        notBroadcastingWarning={notBroadcastingWarning}
                        scrubWarning={scrubSpaceWarning}
                        programOverlays={filteredProgramOverlays}
                        onPluginAction={overlayStore.handlePluginAction}
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
                    </div>
                </div>

                {/* 탭 콘텐츠 */}
                <div className="controller-tab-content">
                    {activeTab === "timeline" && (
                        <ErrorBoundary componentName="타임라인">
                            <Timeline
                                remotePlayheads={remotePlayheads}
                                myColor={myColor}
                                onBlockDoubleClick={(block) => setEditingBlock(block)}
                            />
                        </ErrorBoundary>
                    )}
                    {activeTab === "overlay" && (
                        <ErrorBoundary componentName="오버레이 패널">
                            <OverlayPanel
                                sessionId={sessionId}
                                currentPgmBlock={currentPgmBlock ? {
                                    id: currentPgmBlock.id,
                                    name: currentPgmBlock.name,
                                    trackId: currentPgmBlock.trackId,
                                } : null}
                                overlayStore={overlayStore}
                            />
                        </ErrorBoundary>
                    )}
                    {activeTab === "character" && (
                        <ErrorBoundary componentName="AI 캐릭터">
                            <AiCharacterPanel
                                sessionId={sessionId}
                                isActiveTab={activeTab === "character"}
                            />
                        </ErrorBoundary>
                    )}
                    {activeTab === "whiteboard" && (
                        <ErrorBoundary componentName="판서 레이어">
                            <WhiteboardPanel sessionId={sessionId} />
                        </ErrorBoundary>
                    )}
                </div>
            </div>
            {/* 텍스트 핫 수정 드로어 (타임라인 블록 더블클릭 시) */}
            <BlockEditDrawer
                block={editingBlock}
                onClose={() => setEditingBlock(null)}
                onApply={(blockId) => {
                    // sourceData 변경 후 렌더러 재발행
                    broadcastToRenderer();
                    const userName = user?.email?.split("@")[0] || "User";
                    const userId = user?.id || "unknown";
                    const editedBlock = blocks.find(b => b.id === blockId);
                    if (editedBlock) {
                        addActionLog("text_edit", userId, userName, editedBlock.name, "텍스트 핫 수정", sessionId);
                    }
                }}
            />
        </div>
        </RoleGuard>
    );
}

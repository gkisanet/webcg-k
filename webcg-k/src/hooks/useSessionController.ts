/**
 * useSessionController — 세션 데이터 로딩 + realtime 채널 관리 hook.
 *
 * Route는 raw 데이터만 받고, timelineStore 초기화는 직접 담당한다.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { sendRealtimeBroadcast } from "../lib/realtimeBroadcast";
import type { BroadcastSession, PlayheadState, SessionStatus } from "../lib/types/broadcast";
import {
  createHeartbeatMonitor,
  type RendererState,
  type HeartbeatPayload,
  type AckPayload,
} from "../lib/ackProtocol";

export interface PlayoutPayload {
  action: "PLAY_MULTI" | "CLEAR" | "STOP";
  items?: {
    id: string;
    name: string;
    trackId: number;
    color: string;
    transitionIn: string;
    sourceType?: string;
    sourceData?: any;
  }[];
  fadeDuration?: number;
  seqNum: number;
}

interface SegmentRow {
  id: string;
  session_id: string;
  label: string;
  segment_order: number;
  color: string;
  slug: string;
  reporter?: string;
  cuesheet_item_id?: string;
}

export interface SessionSegment {
  id: string;
  cuesheetItemId?: string;
  label: string;
  reporter?: string;
  order: number;
  color: string;
  slug: string;
}

export function useSessionController(sessionId: string) {

  const [session, setSession] = useState<BroadcastSession | null>(null);
  const [segments, setSegments] = useState<SessionSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [rendererStatus, setRendererStatus] = useState<RendererState>({
    rendererId: "",
    status: "disconnected",
    lastHeartbeat: 0,
    currentItemId: null,
    memoryUsedMB: null,
    memoryLimitMB: null,
    memoryPercent: null,
  });

  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const acknowledgedSeqNumsRef = useRef<Set<number>>(new Set());
  const pendingAcksRef = useRef<Map<number, {
    payload: PlayoutPayload;
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>>(new Map());
  const heartbeatMonitorRef = useRef<ReturnType<typeof createHeartbeatMonitor> | null>(null);
  const loadedSessionRef = useRef<string | null>(null);

  const sendPlayoutPayload = useCallback(async (payload: PlayoutPayload) => {
    const channel = broadcastChannelRef.current;
    if (!channel) return false;

    try {
      const result = await sendRealtimeBroadcast(channel, "playout", payload as unknown as Record<string, unknown>, {
        restFallback: true,
      });
      return result === "ok";
    } catch (err) {
      console.error("[SessionController] Broadcast error:", err);
      return false;
    }
  }, []);

  const clearPendingAck = useCallback((seqNum: number) => {
    const pending = pendingAcksRef.current.get(seqNum);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingAcksRef.current.delete(seqNum);
  }, []);

  const scheduleAckRetry = useCallback((payload: PlayoutPayload, attempts = 0) => {
    const seqNum = payload.seqNum;
    if (!seqNum) return;

    const existing = pendingAcksRef.current.get(seqNum);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(async () => {
      if (acknowledgedSeqNumsRef.current.has(seqNum)) {
        clearPendingAck(seqNum);
        return;
      }

      if (attempts >= 2) {
        console.warn(`[SessionController] ACK timeout seq=${seqNum} — retry exhausted`);
        clearPendingAck(seqNum);
        return;
      }

      console.warn(`[SessionController] ACK timeout seq=${seqNum} — retry ${attempts + 1}/2`);
      const sent = await sendPlayoutPayload(payload);
      if (sent) {
        scheduleAckRetry(payload, attempts + 1);
      }
    }, 900);

    pendingAcksRef.current.set(seqNum, { payload, attempts, timer });
  }, [clearPendingAck, sendPlayoutPayload]);

  // ─── 1. 세션 + 세그먼트 데이터 로딩 ────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    loadedSessionRef.current = null;
    setSession(null);
    setSegments([]);
    setLoading(true);
    setError(null);

    let cancelled = false;

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("broadcast_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (cancelled) return;

        if (fetchError || !data) {
          setError("세션을 찾을 수 없습니다.");
          setLoading(false);
          return;
        }

        setSession(data as unknown as BroadcastSession);
        loadedSessionRef.current = sessionId;

        // 세그먼트 로딩
        const { data: segmentRows } = await (supabase as any)
          .from("broadcast_segments")
          .select("*")
          .eq("session_id", sessionId)
          .order("segment_order", { ascending: true });

        if (!cancelled && segmentRows?.length > 0) {
          setSegments(
            segmentRows.map((row: SegmentRow) => ({
              id: row.id,
              cuesheetItemId: row.cuesheet_item_id,
              label: row.label,
              reporter: row.reporter,
              order: row.segment_order,
              color: row.color,
              slug: row.slug,
            })),
          );
        }

        // draft → ready 자동 전환
        if (data.status === "draft") {
          await supabase
            .from("broadcast_sessions")
            .update({ status: "ready" })
            .eq("id", sessionId);
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading session:", err);
          setError("세션 로드 중 오류가 발생했습니다.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ─── 2.1 세션 DB 변경 실시간 구독 (postgres_changes) ─────────────────
  useEffect(() => {
    if (!sessionId) return;

    const dbChannel = supabase.channel(`db-session:${sessionId}`);
    dbChannel
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcast_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as BroadcastSession;
          if (updated) {
            console.log("[SessionController] Session DB updated in realtime:", updated);
            setSession(updated);
          }
        }
      )
      .subscribe();

    return () => {
      dbChannel.unsubscribe();
    };
  }, [sessionId]);

  // ─── 2. Broadcast 채널 ────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase.channel(`broadcast:${sessionId}`);
    ch
      .on("broadcast", { event: "ack" }, (payload) => {
        const ack = payload.payload as AckPayload;
        if (ack.seqNum) {
          acknowledgedSeqNumsRef.current.add(ack.seqNum);
          clearPendingAck(ack.seqNum);
        }
      })
      .on("broadcast", { event: "heartbeat" }, (payload) => {
        const hb = payload.payload as HeartbeatPayload;
        heartbeatMonitorRef.current?.handleHeartbeat(hb);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsChannelReady(true);
        }
      });
    broadcastChannelRef.current = ch;

    return () => {
      ch.unsubscribe();
      broadcastChannelRef.current = null;
      setIsChannelReady(false);
      acknowledgedSeqNumsRef.current.clear();
      for (const pending of pendingAcksRef.current.values()) {
        if (pending.timer) clearTimeout(pending.timer);
      }
      pendingAcksRef.current.clear();
    };
  }, [clearPendingAck, sessionId]);

  // ─── 3. Heartbeat 채널 ────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const monitor = createHeartbeatMonitor({
      disconnectThresholdMs: 3000,
      delayThresholdMs: 1500,
      onStatusChange: (state) => {
        setRendererStatus(state);
      },
    });
    heartbeatMonitorRef.current = monitor;

    return () => {
      monitor.stop();
      heartbeatMonitorRef.current = null;
    };
  }, [sessionId]);

  // ─── 4. 사용자 API ─────────────────────────────────────────────────

  const broadcast = useCallback(
    async (payload: PlayoutPayload) => {
      const channel = broadcastChannelRef.current;
      if (!channel) return;

      const sent = await sendPlayoutPayload(payload);
      if (sent) {
        scheduleAckRetry(payload);
      }
    },
    [scheduleAckRetry, sendPlayoutPayload],
  );

  const savePlayheadState = useCallback(
    async (playheadState: PlayheadState) => {
      if (!sessionId) return;
      const { data } = await supabase
        .from("broadcast_sessions")
        .update({ playhead_state: playheadState as any })
        .eq("id", sessionId)
        .select("*")
        .single();
      if (data) setSession(data as unknown as BroadcastSession);
    },
    [sessionId],
  );

  const saveSessionPlayoutState = useCallback(
    async (playheadState: PlayheadState, status?: SessionStatus) => {
      if (!sessionId) return null;
      const patch: { playhead_state: any; status?: SessionStatus } = {
        playhead_state: playheadState as any,
      };
      if (status) patch.status = status;

      const { data, error } = await supabase
        .from("broadcast_sessions")
        .update(patch as any)
        .eq("id", sessionId)
        .select("*")
        .single();

      if (error) throw error;
      if (data) {
        const updated = data as unknown as BroadcastSession;
        setSession(updated);
        return updated;
      }
      return null;
    },
    [sessionId],
  );

  const updateStatus = useCallback(
    async (status: SessionStatus) => {
      if (!sessionId) return;
      const { data } = await supabase
        .from("broadcast_sessions")
        .update({ status } as any)
        .eq("id", sessionId)
        .select("*")
        .single();
      if (data) setSession(data as unknown as BroadcastSession);
    },
    [sessionId],
  );

  return {
    session,
    setSession, // 🆕 로컬 상태 강제 갱신용 세터 노출
    segments,
    loading,
    error,
    isChannelReady,
    rendererStatus,
    broadcast,
    savePlayheadState,
    saveSessionPlayoutState,
    updateStatus,
  };
}

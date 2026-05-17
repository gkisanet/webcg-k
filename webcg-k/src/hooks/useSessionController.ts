/**
 * useSessionController — 세션 데이터 로딩 + realtime 채널 관리 hook.
 *
 * Route는 raw 데이터만 받고, timelineStore 초기화는 직접 담당한다.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { BroadcastSession, PlayheadState } from "../lib/types/broadcast";
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
  const heartbeatMonitorRef = useRef<ReturnType<typeof createHeartbeatMonitor> | null>(null);
  const loadedSessionRef = useRef<string | null>(null);

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

  // ─── 2. Broadcast 채널 ────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase.channel(`broadcast:${sessionId}`);
    ch
      .on("broadcast", { event: "ack" }, (payload) => {
        const ack = payload.payload as AckPayload;
        if (ack.seqNum) {
          acknowledgedSeqNumsRef.current.add(ack.seqNum);
        }
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
    };
  }, [sessionId]);

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

    const hbChannel = supabase.channel(`heartbeat:${sessionId}`);
    hbChannel
      .on("broadcast", { event: "heartbeat" }, (payload) => {
        const hb = payload.payload as HeartbeatPayload;
        monitor.handleHeartbeat(hb);
      })
      .subscribe();

    return () => {
      monitor.stop();
      hbChannel.unsubscribe();
    };
  }, [sessionId]);

  // ─── 4. 사용자 API ─────────────────────────────────────────────────

  const broadcast = useCallback(
    async (payload: PlayoutPayload) => {
      const channel = broadcastChannelRef.current;
      if (!channel) return;

      try {
        await channel.send({
          type: "broadcast",
          event: "playout",
          payload,
        });
      } catch (err) {
        console.error("[SessionController] Broadcast error:", err);
      }
    },
    [],
  );

  const savePlayheadState = useCallback(
    async (playheadState: PlayheadState) => {
      if (!sessionId) return;
      await supabase
        .from("broadcast_sessions")
        .update({ playhead_state: playheadState as any })
        .eq("id", sessionId);
    },
    [sessionId],
  );

  const updateStatus = useCallback(
    async (status: string) => {
      if (!sessionId) return;
      await supabase
        .from("broadcast_sessions")
        .update({ status } as any)
        .eq("id", sessionId);
      setSession((prev) => (prev ? { ...prev, status } as BroadcastSession : prev));
    },
    [sessionId],
  );

  return {
    session,
    segments,
    loading,
    error,
    isChannelReady,
    rendererStatus,
    broadcast,
    savePlayheadState,
    updateStatus,
  };
}

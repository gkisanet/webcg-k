import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

const log = createLogger("[Realtime]");

/**
 * 📡 Supabase Realtime 채널 구독 생명주기 관리 훅
 *
 * Why: supabase.channel() → .on() → .subscribe() → unsubscribe() 패턴이
 *      render.tsx, BroadcastButton, AiCharacterPanel, $sessionId.tsx 등 5곳에서 반복.
 *      채널 생성+구독+정리를 한 곳에서 관리하여 메모리 누수 방지.
 *
 * 🎓 비유: 라디오 주파수를 맞추고(subscribe), 방송을 듣다가(on),
 *          라디오를 끄면(cleanup) 자동으로 주파수를 해제하는 것.
 *          각 컴포넌트가 직접 라디오를 관리하는 대신
 *          "라디오 매니저"가 일괄 관리.
 *
 * @param channelName 채널 이름 (예: `broadcast:${sessionId}`)
 * @param handlers 이벤트 핸들러 배열
 * @param enabled 구독 활성화 여부 (기본 true)
 *
 * @example
 * useRealtimeChannel(
 *   `broadcast:${sessionId}`,
 *   [
 *     { event: 'playout', type: 'broadcast', handler: (payload) => { ... } },
 *   ],
 *   !!sessionId, // sessionId가 있을 때만 구독
 * );
 */

interface RealtimeHandler {
	/** 이벤트 이름 */
	event: string;
	/** 채널 타입: 'broadcast' (P2P) 또는 'postgres_changes' (DB 변경) */
	type: "broadcast" | "postgres_changes";
	/** postgres_changes용 필터 (table, filter 등) */
	filter?: {
		event?: string;
		schema?: string;
		table?: string;
		filter?: string;
	};
	/** 이벤트 수신 시 호출되는 핸들러 */
	handler: (payload: any) => void;
}

export function useRealtimeChannel(
	channelName: string,
	handlers: RealtimeHandler[],
	enabled = true,
) {
	const channelRef = useRef<RealtimeChannel | null>(null);

	// 채널에 메시지를 보내는 유틸리티
	const send = useCallback(
		async (event: string, payload: Record<string, unknown>) => {
			if (!channelRef.current) {
				log.warn("채널이 아직 준비되지 않았습니다:", channelName);
				return;
			}
			await channelRef.current.send({
				type: "broadcast",
				event,
				payload,
			});
		},
		[channelName],
	);

	useEffect(() => {
		if (!enabled || !channelName) return;

		log.debug("채널 구독 시작:", channelName);

		const channel = supabase.channel(channelName);

		// 핸들러 등록
		for (const h of handlers) {
			if (h.type === "broadcast") {
				channel.on("broadcast", { event: h.event }, h.handler);
			} else if (h.type === "postgres_changes") {
				channel.on(
					"postgres_changes" as any,
					{
						event: h.filter?.event || "UPDATE",
						schema: h.filter?.schema || "public",
						table: h.filter?.table || "",
						filter: h.filter?.filter || "",
					},
					h.handler,
				);
			}
		}

		channel.subscribe((status) => {
			log.debug("채널 상태:", channelName, status);
		});

		channelRef.current = channel;

		return () => {
			log.debug("채널 구독 해제:", channelName);
			channel.unsubscribe();
			channelRef.current = null;
		};
		// handlers는 매 렌더마다 새 배열이므로 JSON 직렬화로 비교
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelName, enabled]);

	return { send, channel: channelRef };
}

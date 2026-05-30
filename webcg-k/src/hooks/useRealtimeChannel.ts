import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { createLogger } from "../lib/logger";
import { sendRealtimeBroadcast } from "../lib/realtimeBroadcast";
import type { RealtimeChannel } from "@supabase/supabase-js";

const log = createLogger("[Realtime]");

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

/**
 * 📡 방송 그래픽(Broadcast Graphics) Supabase Realtime 채널 구독 생명주기 관리 훅
 * 
 * ⚡ [성능 최적화 스펙]
 * 1. Handlers Ref Guard: 매 렌더마다 변경되는 익명 콜백 함수 참조를 useRef로 감싸 보존하여 Stale Closure를 원천 가드합니다.
 * 2. Static Specifications Serialization: 핸들러의 '정적 수신 규격(type, event, filter)' 정보만 직렬화(staticHandlersKey)하여 의존성에 배정함으로써, 불필요한 WebSocket 재연결(Resubscription Storm) 오버헤드를 100% 진압합니다.
 * 3. Stable Proxy Callback: 소켓 이벤트 수신 시, 당시 등록된 proxy가 latest handlersRef.current에서 매칭 핸들러를 0ms 즉각 동적 룩업하여 완충 실행합니다.
 */
export function useRealtimeChannel(
	channelName: string,
	handlers: RealtimeHandler[],
	enabled = true,
) {
	const channelRef = useRef<RealtimeChannel | null>(null);
	const handlersRef = useRef<RealtimeHandler[]>(handlers);

	// ⚡ 매 렌더링 시 최신 handlers 배열 참조를 ref에 최우선 동기화 (Render-phase synchronization)
	handlersRef.current = handlers;

	// ⚡ 핸들러의 정적 이벤트 수신 규격(type, event, filter) 정보만 직렬화하여 stable key 획득
	const staticHandlersKey = JSON.stringify(
		handlers.map((h) => ({
			type: h.type,
			event: h.event,
			filter: h.filter,
		}))
	);

	// 채널에 메시지를 보내는 P2P 유틸리티
	const send = useCallback(
		async (event: string, payload: Record<string, unknown>) => {
			if (!channelRef.current) {
				log.warn("채널이 아직 준비되지 않았습니다:", channelName);
				return;
			}
			await sendRealtimeBroadcast(channelRef.current, event, payload, {
				restFallback: true,
			});
		},
		[channelName],
	);

	useEffect(() => {
		if (!enabled || !channelName) return;

		log.debug("채널 구독 시작 (Ref Guarded):", channelName);

		const channel = supabase.channel(channelName);

		// ⚡ 프록시/위임 콜백을 통한 Supabase 채널 이벤트 등록
		for (const h of handlers) {
			if (h.type === "broadcast") {
				// Broadcast P2P 채널 프록시 등록
				channel.on("broadcast", { event: h.event }, (payload) => {
					// ⚡ 실시간 이벤트 도래 시, 항상 최신 handlersRef.current에서 신선한 콜백 룩업 후 실행
					const currentHandler = handlersRef.current.find(
						(curr) => curr.type === "broadcast" && curr.event === h.event
					);
					if (currentHandler) {
						currentHandler.handler(payload);
					}
				});
			} else if (h.type === "postgres_changes") {
				// PostgreSQL CDC 채널 프록시 등록
				const filterConfig = {
					event: h.filter?.event || "UPDATE",
					schema: h.filter?.schema || "public",
					table: h.filter?.table || "",
					filter: h.filter?.filter || "",
				};

				channel.on(
					"postgres_changes" as any,
					filterConfig,
					(payload) => {
						// ⚡ 실시간 DB 변경 도래 시, 항상 최신 handlersRef.current에서 동일 필터의 신선한 콜백 룩업 후 실행
						const currentHandler = handlersRef.current.find(
							(curr) =>
								curr.type === "postgres_changes" &&
								(curr.filter?.event || "UPDATE") === filterConfig.event &&
								(curr.filter?.schema || "public") === filterConfig.schema &&
								(curr.filter?.table || "") === filterConfig.table &&
								(curr.filter?.filter || "") === filterConfig.filter
						);
						if (currentHandler) {
							currentHandler.handler(payload);
						}
					}
				);
			}
		}

		channel.subscribe((status) => {
			log.debug("채널 상태:", channelName, status);
		});

		channelRef.current = channel;

		return () => {
			log.debug("채널 구독 해제 (Cleanup):", channelName);
			channel.unsubscribe();
			channelRef.current = null;
		};
		// handlers 함수 참조가 변하더라도 staticHandlersKey(이벤트 규격 명세)가 같으면 
		// 소켓 커넥션을 절대 해제/재연결하지 않고 영속적으로 보존합니다.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelName, enabled, staticHandlersKey]);

	return { send, channel: channelRef };
}

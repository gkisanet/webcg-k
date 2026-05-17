/**
 * NRCS Realtime Service — 실시간 동기화
 * Supabase Realtime을 사용하여 큐시트/아이템 변경사항을 자동 감지
 *
 * 동기화 체인:
 * NRCS 데이터 변경 → nrcs_cuesheet_items 갱신 → Realtime 이벤트 →
 * 컨트롤러 타임라인 자동 업데이트
 */

import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── 이벤트 타입 ──────────────────────────────────────────────

export type NrcsEventType = "INSERT" | "UPDATE" | "DELETE";

export interface NrcsRealtimeEvent {
	type: NrcsEventType;
	table: "nrcs_cuesheets" | "nrcs_cuesheet_items";
	record: any;
	old_record?: any;
}

export type NrcsRealtimeCallback = (event: NrcsRealtimeEvent) => void;

// ─── 큐시트 구독 ──────────────────────────────────────────────

/** 특정 큐시트의 아이템 변경 구독 */
export function subscribeToCuesheetItems(
	cuesheetId: string,
	onEvent: NrcsRealtimeCallback,
): RealtimeChannel {
	const channel = supabase
		.channel(`nrcs_items_${cuesheetId}`)
		.on(
			"postgres_changes" as any,
			{
				event: "*",
				schema: "public",
				table: "nrcs_cuesheet_items",
				filter: `cuesheet_id=eq.${cuesheetId}`,
			},
			(payload: any) => {
				onEvent({
					type: payload.eventType as NrcsEventType,
					table: "nrcs_cuesheet_items",
					record: payload.new,
					old_record: payload.old,
				});
			},
		)
		.subscribe();

	return channel;
}

/** 전체 큐시트 목록 변경 구독 */
export function subscribeToCuesheets(
	onEvent: NrcsRealtimeCallback,
): RealtimeChannel {
	const channel = supabase
		.channel("nrcs_cuesheets_all")
		.on(
			"postgres_changes" as any,
			{
				event: "*",
				schema: "public",
				table: "nrcs_cuesheets",
			},
			(payload: any) => {
				onEvent({
					type: payload.eventType as NrcsEventType,
					table: "nrcs_cuesheets",
					record: payload.new,
					old_record: payload.old,
				});
			},
		)
		.subscribe();

	return channel;
}

/** 채널 구독 해제 */
export function unsubscribeChannel(channel: RealtimeChannel): void {
	supabase.removeChannel(channel);
}

// ─── 커스텀 훅: useCuesheetRealtime ────────────────────────────

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * 큐시트 실시간 동기화 훅
 * 큐시트 아이템 변경 시 자동으로 React Query 캐시를 invalidate
 */
export function useCuesheetRealtime(cuesheetId: string | null) {
	const queryClient = useQueryClient();
	const channelRef = useRef<RealtimeChannel | null>(null);

	const handleEvent = useCallback(
		(event: NrcsRealtimeEvent) => {
			console.log("[NRCS Realtime]", event.type, event.table, event.record?.id);

			// 큐시트 아이템 변경 → 큐시트 상세 쿼리 invalidate
			if (event.table === "nrcs_cuesheet_items") {
				queryClient.invalidateQueries({
					queryKey: ["cuesheet", cuesheetId],
				});
			}

			// 큐시트 자체 변경 → 목록 쿼리도 invalidate
			if (event.table === "nrcs_cuesheets") {
				queryClient.invalidateQueries({
					queryKey: ["cuesheets"],
				});
			}
		},
		[cuesheetId, queryClient],
	);

	useEffect(() => {
		if (!cuesheetId) return;

		// 구독 시작
		channelRef.current = subscribeToCuesheetItems(cuesheetId, handleEvent);

		return () => {
			// 구독 해제
			if (channelRef.current) {
				unsubscribeChannel(channelRef.current);
				channelRef.current = null;
			}
		};
	}, [cuesheetId, handleEvent]);
}

/**
 * 전체 큐시트 실시간 동기화 훅
 */
export function useCuesheetsRealtime() {
	const queryClient = useQueryClient();
	const channelRef = useRef<RealtimeChannel | null>(null);

	useEffect(() => {
		channelRef.current = subscribeToCuesheets((event) => {
			console.log("[NRCS Realtime] 큐시트 변경:", event.type);
			queryClient.invalidateQueries({ queryKey: ["cuesheets"] });
		});

		return () => {
			if (channelRef.current) {
				unsubscribeChannel(channelRef.current);
				channelRef.current = null;
			}
		};
	}, [queryClient]);
}

// ─── 데이터 소스 변경 감지 훅 ──────────────────────────────────

/**
 * 데이터 소스(cuesheet_data_sources) 변경 시 자동 감지
 *
 * ■ Why 별도 훅?
 *   NRCS/CSV 데이터가 외부에서 갱신되면(예: API 폴링/수동 동기화),
 *   cuesheet_data_sources.raw_data가 UPDATE됨.
 *   이 변경을 실시간으로 감지하여 큐시트 아이템과 런다운에 전파.
 *
 * ■ 안전: onair 상태면 전파하지 않고 "변경 대기" 상태만 표시
 *
 * @param sourceId - 감시할 데이터 소스 ID
 * @param cuesheetId - 연결된 큐시트 ID (동기화 대상)
 * @param onPendingChange - onair 상태에서 변경 감지 시 콜백
 */
export function useDataSourceRealtime(
	sourceId: string | null,
	cuesheetId: string | null,
	onPendingChange?: () => void,
) {
	const queryClient = useQueryClient();
	const channelRef = useRef<RealtimeChannel | null>(null);

	useEffect(() => {
		if (!sourceId) return;

		const channel = supabase
			.channel(`ds_${sourceId}`)
			.on(
				"postgres_changes" as any,
				{
					event: "UPDATE",
					schema: "public",
					table: "cuesheet_data_sources",
					filter: `id=eq.${sourceId}`,
				},
				(_payload: any) => {
					console.log("[DataSource Realtime] 데이터 소스 변경 감지:", sourceId);

					// 데이터 소스 캐시 갱신
					queryClient.invalidateQueries({
						queryKey: ["dataSource", sourceId],
					});

					// 큐시트 아이템 캐시도 갱신
					if (cuesheetId) {
						queryClient.invalidateQueries({
							queryKey: ["cuesheet", cuesheetId],
						});
					}

					// onair 상태에서의 변경 → 콜백으로 알림
					if (onPendingChange) {
						onPendingChange();
					}
				},
			)
			.subscribe();

		channelRef.current = channel;

		return () => {
			if (channelRef.current) {
				unsubscribeChannel(channelRef.current);
				channelRef.current = null;
			}
		};
	}, [sourceId, cuesheetId, queryClient, onPendingChange]);
}

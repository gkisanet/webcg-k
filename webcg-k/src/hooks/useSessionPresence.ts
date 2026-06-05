/**
 * useSessionPresence Hook
 * Supabase Presence를 활용한 세션 접속자 관리
 *
 * ■ 멀티유저 스크러빙 확장 및 안정성 개선 (2026-05-24)
 *   1. Reconnect 시 랜덤 컬러 변경 차단을 위해 로컬 스토리지에 세션별 사용자 색상 고유 영속화
 *   2. playheadPosition, isScrubbing, lastBroadcastAt 등 상태 변경 시 디바운스/스로틀(100ms) 처리된
 *      단일 Presence track useEffect 루프를 구현하여 Supabase Rate limit 및 연결 차단 원천 방지
 *   3. joinedAt 타임스탬프를 PresenceState에 추가하여 초기 주 오퍼레이터 선정 로직 제공
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth, useHasAnyRole } from "../lib/auth";
import { getUserColor, type ConnectedUser } from "../components/Controller/UserAvatars";

interface PresenceState {
	id: string;
	email: string;
	displayName: string;
	color: string;
	playheadPosition: number;
	canBroadcast: boolean;
	isScrubbing: boolean;
	lastBroadcastAt: string | null;
	joinedAt: string;
}

export function useSessionPresence(sessionId: string) {
	const { user } = useAuth();
	const canBroadcast = useHasAnyRole(["playout_operator", "system_admin"]);
	const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);

	// ─── 1. 세션별 사용자 고유 색상 영속화 ───
	const [myColor, setMyColor] = useState<string>(() => {
		if (typeof window !== "undefined") {
			const localColorKey = `webcg-k:session:${sessionId}:color`;
			const cached = localStorage.getItem(localColorKey);
			if (cached) return cached;
			const colorIndex = Math.floor(Math.random() * 8);
			const color = getUserColor(colorIndex);
			localStorage.setItem(localColorKey, color);
			return color;
		}
		return "#3b82f6";
	});

	// ─── 2. 로컬 Presence State 관리 ───
	const [playheadPosition, setPlayheadPosition] = useState<number>(0);
	const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
	const [lastBroadcastAt, setLastBroadcastAt] = useState<string | null>(null);

	// 최초 세션 진입(joinedAt) 타임스탬프 고정
	const joinedAtRef = useRef<string>(new Date().toISOString());

	// Presence 채널 참조
	const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

	// 최신 상태 값을 참조하기 위한 Ref
	const stateRef = useRef({
		playheadPosition,
		isScrubbing,
		lastBroadcastAt,
		myColor,
		canBroadcast,
	});

	// 매 렌더링 시 ref 갱신
	useEffect(() => {
		stateRef.current = {
			playheadPosition,
			isScrubbing,
			lastBroadcastAt,
			myColor,
			canBroadcast,
		};
	}, [playheadPosition, isScrubbing, lastBroadcastAt, myColor, canBroadcast]);

	// 스로틀 타이머 및 최신 트래킹 시간 관리
	const lastTrackTimeRef = useRef<number>(0);
	const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ─── 3. 100ms 스로틀 처리된 channel.track 함수 ───
	const triggerTrack = useCallback(async () => {
		if (!channel || !user) return;

		// 기존 대기 중인 타이머 해제
		if (throttleTimeoutRef.current) {
			clearTimeout(throttleTimeoutRef.current);
			throttleTimeoutRef.current = null;
		}

		const now = Date.now();
		const THROTTLE_LIMIT = 100; // 100ms 스로틀링
		const elapsed = now - lastTrackTimeRef.current;

		const performTrack = async () => {
			if (!channel || !user) return;
			try {
				await channel.track({
					id: user.id,
					email: user.email,
					displayName: user.email?.split("@")[0] || "User",
					color: stateRef.current.myColor,
					playheadPosition: stateRef.current.playheadPosition,
					canBroadcast: stateRef.current.canBroadcast,
					isScrubbing: stateRef.current.isScrubbing,
					lastBroadcastAt: stateRef.current.lastBroadcastAt,
					joinedAt: joinedAtRef.current,
				} as PresenceState);
				lastTrackTimeRef.current = Date.now();
			} catch (err) {
				console.error("[Presence] Track error:", err);
			}
		};

		if (elapsed >= THROTTLE_LIMIT) {
			await performTrack();
		} else {
			// 남은 시간 만큼 대기한 뒤 최종 상태를 전송 (디바운스 조합 스로틀)
			throttleTimeoutRef.current = setTimeout(async () => {
				await performTrack();
			}, THROTTLE_LIMIT - elapsed);
		}
	}, [channel, user]);

	// 입장 및 Presence 채널 라이프사이클 관리
	useEffect(() => {
		if (!user || !sessionId) return;

		const presenceChannel = supabase.channel(`session:${sessionId}:presence`, {
			config: {
				presence: {
					key: user.id,
				},
			},
		});

		// Presence 동기화 이벤트
		presenceChannel
			.on("presence", { event: "sync" }, () => {
				const state = presenceChannel.presenceState<PresenceState>();
				const users: ConnectedUser[] = [];

				for (const presences of Object.values(state)) {
					const presence = presences[0] as unknown as PresenceState;
					if (presence) {
						users.push({
							id: presence.id,
							email: presence.email,
							displayName: presence.displayName,
							color: presence.color,
							playheadPosition: presence.playheadPosition,
							canBroadcast: presence.canBroadcast,
							isCurrentUser: presence.id === user.id,
							isScrubbing: presence.isScrubbing ?? false,
							lastBroadcastAt: presence.lastBroadcastAt ?? null,
							// joinedAt은 훅 내부 sorting을 위해 전달하진 않고 presenceState 내에 보존
						} as any); // Type cast if necessary for additional properties
					}
				}

				// joinedAt 오름차순(가장 먼저 들어온 사용자 순)으로 추가 정렬하거나 connectedUsers에 반영 가능
				// 멘토 팁: 유저 목록 렌더링 시 접속 순서를 유지
				setConnectedUsers(users);
			})
			.on("presence", { event: "join" }, ({ newPresences }) => {
				console.log("[Presence] User joined:", newPresences);
			})
			.on("presence", { event: "leave" }, ({ leftPresences }) => {
				console.log("[Presence] User left:", leftPresences);
			});

		// 채널 구독 시작
		presenceChannel.subscribe(async (status) => {
			if (status === "SUBSCRIBED") {
				// 최초 구독 성공 시 즉시 track 실행
				await presenceChannel.track({
					id: user.id,
					email: user.email,
					displayName: user.email?.split("@")[0] || "User",
					color: myColor,
					playheadPosition: 0,
					canBroadcast,
					isScrubbing: false,
					lastBroadcastAt: null,
					joinedAt: joinedAtRef.current,
				} as PresenceState);
				console.log("[Presence] Initial tracking completed for session:", sessionId);
			}
		});

		setChannel(presenceChannel);

		// 클린업: 채널 구독 해제 및 스로틀 타이머 해제
		return () => {
			presenceChannel.unsubscribe();
			if (throttleTimeoutRef.current) {
				clearTimeout(throttleTimeoutRef.current);
			}
		};
	}, [user, sessionId, myColor, canBroadcast]);

	// ─── 4. 상태 변화 감지하여 자동으로 스로틀 트랙 호출 ───
	useEffect(() => {
		if (channel) {
			triggerTrack();
		}
	}, [playheadPosition, isScrubbing, lastBroadcastAt, channel, triggerTrack]);

	// Playhead 위치 업데이트 함수
	const updatePlayheadPosition = useCallback(
		async (position: number) => {
			setPlayheadPosition(position);
		},
		[]
	);

	// 스크러빙 모드 상태 업데이트 함수
	const updateScrubbing = useCallback(
		async (scrubbing: boolean) => {
			setIsScrubbing(scrubbing);
		},
		[]
	);

	// 마지막 송출 시각 업데이트 함수 (broadcastToPGM 호출 시)
	const updateLastBroadcastAt = useCallback(
		async () => {
			const now = new Date().toISOString();
			setLastBroadcastAt(now);
		},
		[]
	);

	return {
		connectedUsers,
		myColor,
		canBroadcast,
		updatePlayheadPosition,
		isScrubbing,
		setIsScrubbing: updateScrubbing,
		updateLastBroadcastAt,
	};
}

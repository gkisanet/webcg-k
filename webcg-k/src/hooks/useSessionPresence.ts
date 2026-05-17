/**
 * useSessionPresence Hook
 * Supabase Presence를 활용한 세션 접속자 관리
 *
 * ■ 멀티유저 스크러빙 확장 (2026-05-12)
 *   PresenceState에 isScrubbing, lastBroadcastAt 필드 추가.
 *   주 오퍼레이터 결정을 위해 마지막 송출 시각을 추적.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
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
	const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
	const [myColor, setMyColor] = useState<string>("#3b82f6");
	const [canBroadcast, setCanBroadcast] = useState<boolean>(true);
	const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
	const [lastBroadcastAt, setLastBroadcastAt] = useState<string | null>(null);

	// Presence 채널 참조
	const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

	// 입장 시 Presence 트랙
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
						});
					}
				}

				setConnectedUsers(users);
			})
			.on("presence", { event: "join" }, ({ newPresences }) => {
				console.log("User joined:", newPresences);
			})
			.on("presence", { event: "leave" }, ({ leftPresences }) => {
				console.log("User left:", leftPresences);
			});

		// 채널 구독 시작
		presenceChannel.subscribe(async (status) => {
			if (status === "SUBSCRIBED") {
				// 내 Presence 트랙
				const colorIndex = Math.floor(Math.random() * 8);
				const color = getUserColor(colorIndex);
				setMyColor(color);

				await presenceChannel.track({
					id: user.id,
					email: user.email,
					displayName: user.email?.split("@")[0] || "User",
					color,
					playheadPosition: 0,
					canBroadcast: true,
					isScrubbing: false,
					lastBroadcastAt: null,
					joinedAt: new Date().toISOString(),
				} as PresenceState);

				console.log("Presence tracked for session:", sessionId);
			}
		});

		setChannel(presenceChannel);

		// 클린업: 채널 구독 해제
		return () => {
			presenceChannel.unsubscribe();
		};
	}, [user, sessionId]);

	// Playhead 위치 업데이트
	const updatePlayheadPosition = useCallback(
		async (position: number) => {
			if (!channel || !user) return;

			await channel.track({
				id: user.id,
				email: user.email,
				displayName: user.email?.split("@")[0] || "User",
				color: myColor,
				playheadPosition: position,
				canBroadcast,
				isScrubbing,
				lastBroadcastAt,
				joinedAt: new Date().toISOString(),
			} as PresenceState);
		},
		[channel, user, myColor, canBroadcast, isScrubbing, lastBroadcastAt]
	);

	// 스크러빙 모드 상태 업데이트
	const updateScrubbing = useCallback(
		async (scrubbing: boolean) => {
			setIsScrubbing(scrubbing);
		},
		[]
	);

	// 마지막 송출 시각 업데이트 (broadcastToPGM 호출 시)
	const updateLastBroadcastAt = useCallback(
		async () => {
			if (!channel || !user) return;
			const now = new Date().toISOString();
			setLastBroadcastAt(now);
		},
		[channel, user]
	);

	return {
		connectedUsers,
		myColor,
		canBroadcast,
		setCanBroadcast,
		updatePlayheadPosition,
		isScrubbing,
		setIsScrubbing: updateScrubbing,
		updateLastBroadcastAt,
	};
}

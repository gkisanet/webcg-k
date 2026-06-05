import { useCallback, useEffect, useMemo, useState } from "react";
import {
	createMainOperatorLease,
	getActiveMainOperatorLease,
	isMainOperatorLeaseExpired,
	MAIN_OPERATOR_HEARTBEAT_MS,
	withMainOperatorLease,
} from "../lib/operatorLease";
import { supabase } from "../lib/supabase";
import type { MainOperatorLease } from "../lib/types/broadcast";

interface MainOperatorUser {
	id: string;
	email?: string | null;
}

interface UseMainOperatorLeaseOptions {
	sessionId: string;
	playheadState: unknown;
	canBroadcast: boolean;
	user: MainOperatorUser | null | undefined;
	clientId: string;
	operatorCount: number;
	setSession?: (session: any) => void; // 🆕 로컬 세션 즉시 갱신 콜백 주입
}

export function useMainOperatorLease({
	sessionId,
	playheadState,
	canBroadcast,
	user,
	clientId,
	operatorCount,
	setSession, // 🆕 구조 분해 할당
}: UseMainOperatorLeaseOptions) {
	const [isWritingLease, setIsWritingLease] = useState(false);

	const activeLease = useMemo(
		() => getActiveMainOperatorLease(playheadState),
		[playheadState],
	);

	const isMainOperator = Boolean(
		canBroadcast &&
			user?.id &&
			activeLease?.userId === user.id &&
			activeLease.clientId === clientId,
	);
	const hasMainOperator = Boolean(activeLease);
	const needsOperatorSelection =
		canBroadcast && operatorCount > 1 && !activeLease;

	const writeLease = useCallback(
		async (nextLease: MainOperatorLease | null) => {
			if (!sessionId) return null;
			setIsWritingLease(true);
			try {
				const { data: current, error: loadError } = await supabase
					.from("broadcast_sessions")
					.select("playhead_state")
					.eq("id", sessionId)
					.single();

				if (loadError) throw loadError;

				const nextPlayheadState = withMainOperatorLease(
					(current as { playhead_state?: unknown } | null)?.playhead_state,
					nextLease,
				);

				const { data, error } = await supabase
					.from("broadcast_sessions")
					.update({ playhead_state: nextPlayheadState as any } as any)
					.eq("id", sessionId)
					.select("*")
					.single();

				if (error) throw error;
				return data;
			} finally {
				setIsWritingLease(false);
			}
		},
		[sessionId],
	);

	const claimMainOperator = useCallback(
		async (options: { force?: boolean } = {}) => {
			if (!canBroadcast || !user?.id || !clientId) return null;
			if (
				activeLease &&
				!isMainOperatorLeaseExpired(activeLease) &&
				activeLease.userId !== user.id &&
				!options.force
			) {
				return null;
			}

			const displayName = user.email?.split("@")[0] ?? "Operator";
			const nextLease = createMainOperatorLease({
				userId: user.id,
				clientId,
				email: user.email ?? null,
				displayName,
			});
			const updated = await writeLease(nextLease);
			if (updated && setSession) {
				setSession(updated); // 🆕 로컬 세션 즉시 갱신 (실시간 지연 우회)
			}
			return updated;
		},
		[activeLease, canBroadcast, clientId, user, writeLease, setSession],
	);

	const releaseMainOperator = useCallback(async () => {
		if (!isMainOperator) return null;
		const updated = await writeLease(null);
		if (updated && setSession) {
			setSession(updated); // 🆕 로컬 세션 즉시 갱신 (실시간 지연 우회)
		}
		return updated;
	}, [isMainOperator, writeLease, setSession]);

	useEffect(() => {
		// ■ Why 무조건 자동 선점인가?
		//   기존의 operatorCount === 1 제약은 여러 명이 접속했을 때 오퍼레이터가 공석이어도
		//   자동으로 오퍼레이터를 가져가지 못해 빈 화면이 유지되는 치명적인 불편을 자아냈습니다.
		//   따라서 오퍼레이터가 지정되지 않았거나 만료된 상태라면, 접속자 수와 관계없이
		//   최초 진입한 오퍼레이터가 즉각 자동으로 지위를 선점하게 보완합니다.
		if (!canBroadcast || !user?.id || (activeLease && !isMainOperatorLeaseExpired(activeLease)))
			return;
		void claimMainOperator();
	}, [activeLease, canBroadcast, claimMainOperator, user?.id]);

	useEffect(() => {
		if (!isMainOperator) return;
		const heartbeat = window.setInterval(() => {
			void claimMainOperator({ force: true });
		}, MAIN_OPERATOR_HEARTBEAT_MS);

		return () => window.clearInterval(heartbeat);
	}, [claimMainOperator, isMainOperator]);

	return {
		activeLease,
		hasMainOperator,
		isMainOperator,
		isWritingLease,
		needsOperatorSelection,
		claimMainOperator,
		releaseMainOperator,
	};
}

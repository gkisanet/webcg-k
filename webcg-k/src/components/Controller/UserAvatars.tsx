/**
 * UserAvatars Component
 * 현재 세션에 접속 중인 사용자 목록을 아바타로 표시
 *
 * ■ 멀티유저 스크러빙 확장 (2026-05-12)
 *   스크러빙 중인 사용자: 주황 테두리 + "SCRUB" 뱃지
 *   주 오퍼레이터(lastBroadcastAt 최신): 노란 별(★) 아이콘
 */

import { useMemo } from "react";
import { Users } from "lucide-react";

// 접속자 정보 타입
export interface ConnectedUser {
	id: string;
	email: string;
	displayName: string;
	color: string;
	playheadPosition: number;
	canBroadcast: boolean;
	isCurrentUser: boolean;
	isScrubbing: boolean;
	lastBroadcastAt: string | null;
}

// 더미 색상 배열 (실제로는 순서대로 할당)
const USER_COLORS = [
	"#3b82f6", // 파랑
	"#10b981", // 초록
	"#f59e0b", // 주황
	"#ef4444", // 빨강
	"#8b5cf6", // 보라
	"#ec4899", // 핑크
	"#06b6d4", // 청록
	"#84cc16", // 라임
];

// 이름 첫 글자 추출 (이메일에서)
function getInitials(email: string): string {
	const name = email.split("@")[0];
	if (name.length <= 2) return name.toUpperCase();
	return name.slice(0, 2).toUpperCase();
}

interface UserAvatarsProps {
	users: ConnectedUser[];
}

export function UserAvatars({ users }: UserAvatarsProps) {
	// Primary operator = lastBroadcastAt이 가장 최신인 사용자
	const primaryOperator = useMemo(() => {
		const broadcasters = users.filter(u => u.lastBroadcastAt);
		if (broadcasters.length === 0) return null;
		return broadcasters.sort(
			(a, b) => new Date(b.lastBroadcastAt!).getTime() - new Date(a.lastBroadcastAt!).getTime()
		)[0];
	}, [users]);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "0.5rem",
			}}
		>
			{/* 접속자 수 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.25rem",
					padding: "0.25rem 0.5rem",
					background: "var(--app-bg-muted)",
					borderRadius: "4px",
					fontSize: "0.75rem",
					color: "var(--text-secondary)",
				}}
			>
				<Users size={14} />
				<span>{users.length}</span>
			</div>

			{/* 아바타 스택 */}
			<div
				style={{
					display: "flex",
					marginLeft: "-4px",
				}}
			>
				{users.slice(0, 5).map((user, index) => {
					const isPrimary = primaryOperator?.id === user.id;
					let borderColor = "var(--app-bg-alt)";
					if (user.isScrubbing) {
						borderColor = "#f59e0b";     // 주황: 스크러빙 모드
					} else if (user.isCurrentUser) {
						borderColor = "var(--accent-primary)";
					} else if (isPrimary) {
						borderColor = "#eab308";     // 노랑: 주 오퍼레이터
					}
					return (
						<div
							key={user.id}
							style={{
								position: "relative",
								width: "28px",
								height: "28px",
								borderRadius: "50%",
								backgroundColor: user.color,
								border: `2px solid ${borderColor}`,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "10px",
								fontWeight: "600",
								color: "#fff",
								marginLeft: index > 0 ? "-8px" : 0,
								zIndex: users.length - index,
								cursor: "default",
								boxShadow: user.isCurrentUser
									? "0 0 0 2px var(--app-bg-alt)"
									: "none",
							}}
							title={`${user.displayName}${user.isCurrentUser ? " (나)" : ""}${isPrimary ? " ★ 운영자" : ""}${user.isScrubbing ? " [SCRUB]" : ""}${user.canBroadcast ? "" : " (읽기 전용)"}`}
						>
							{getInitials(user.email)}
							{/* 주 오퍼레이터 별 */}
							{isPrimary && (
								<span style={{
									position: "absolute",
									top: "-4px",
									right: "-4px",
									fontSize: "11px",
									color: "#eab308",
									textShadow: "0 0 3px rgba(0,0,0,0.9)",
									lineHeight: 1,
									pointerEvents: "none",
								}}>
									★
								</span>
							)}
							{/* 스크러빙 뱃지 */}
							{user.isScrubbing && (
								<span style={{
									position: "absolute",
									bottom: "-7px",
									left: "50%",
									transform: "translateX(-50%)",
									fontSize: "6px",
									padding: "0 3px",
									background: "#f59e0b",
									color: "#000",
									borderRadius: "2px",
									fontWeight: 700,
									lineHeight: "11px",
									whiteSpace: "nowrap",
									pointerEvents: "none",
								}}>
									SCRUB
								</span>
							)}
						</div>
					);
				})}

				{/* 더 많은 사용자 표시 */}
				{users.length > 5 && (
					<div
						style={{
							width: "28px",
							height: "28px",
							borderRadius: "50%",
							backgroundColor: "var(--app-bg-muted)",
							border: "2px solid var(--app-bg-alt)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "10px",
							fontWeight: "600",
							color: "var(--text-secondary)",
							marginLeft: "-8px",
							zIndex: 0,
						}}
					>
						+{users.length - 5}
					</div>
				)}
			</div>
		</div>
	);
}

// 색상 할당 유틸
export function getUserColor(index: number): string {
	return USER_COLORS[index % USER_COLORS.length];
}

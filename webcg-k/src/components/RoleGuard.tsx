/**
 * RoleGuard — 역할 기반 접근 제어 컴포넌트
 *
 * ■ Why RoleGuard?
 *   auth.tsx에 useRole/useHasRole 훅은 있지만,
 *   실제 라우트와 기능에 enforcement(강제)하는 코드가 없었다.
 *   호텔 출입카드 시스템(훅)은 설치되어 있지만 문(Guard)이 열려 있는 상태.
 *   RoleGuard는 그 "문"을 닫는 컴포넌트다.
 *
 * ■ 사용법
 *   <RoleGuard requiredRoles={["playout_operator", "system_admin"]}>
 *     <Timeline />
 *   </RoleGuard>
 *
 * ■ Why 컴포넌트 방식? (미들웨어 방식 대신)
 *   - TanStack Router는 서버사이드 미들웨어 없이 클라이언트 SPA 라우팅이므로
 *     컴포넌트 레벨에서 가드하는 것이 자연스럽다.
 *   - 라우트 전체를 감싸거나, 개별 버튼/기능만 감쌀 수 있어 유연하다.
 */

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, ArrowLeft } from "lucide-react";
import { type UserRole, useHasAnyRole, useRole } from "../lib/auth";
import { buttonVariants } from "./ui/button";

/** 역할별 한글 라벨 매핑 */
const ROLE_LABELS: Record<UserRole, string> = {
	system_admin: "시스템 관리자",
	cg_designer: "CG 디자이너",
	cuesheet_editor: "큐시트 편집자",
	playout_operator: "송출 오퍼레이터",
	viewer: "뷰어",
};

interface RoleGuardProps {
	/** 접근 허용 역할 목록 (system_admin은 항상 포함) */
	requiredRoles: UserRole[];
	/** 권한 충족 시 렌더링할 자식 */
	children: ReactNode;
	/** 권한 부족 시 표시할 커스텀 UI (없으면 기본 403 페이지) */
	fallback?: ReactNode;
	/** true이면 권한 부족 시 아무것도 렌더링하지 않음 (버튼 숨기기 등) */
	silent?: boolean;
}

export function RoleGuard({ requiredRoles, children, fallback, silent }: RoleGuardProps) {
	const hasAccess = useHasAnyRole(requiredRoles);

	if (hasAccess) {
		return <>{children}</>;
	}

	// ■ silent 모드: 권한 없으면 렌더링 자체를 안 함 (버튼 숨기기)
	if (silent) return null;

	// ■ 커스텀 fallback 제공 시 사용
	if (fallback) return <>{fallback}</>;

	// ■ 기본 403 (접근 거부) UI
	return <AccessDeniedView requiredRoles={requiredRoles} />;
}

/**
 * 기능 레벨 가드 훅 — 버튼/단축키 등에서 사용
 *
 * @example
 * const canBroadcast = useCanPerform(["playout_operator"]);
 * if (canBroadcast) broadcastToPGM();
 */
export function useCanPerform(requiredRoles: UserRole[]): boolean {
	return useHasAnyRole(requiredRoles);
}

// ─── 접근 거부 화면 ────────────────────────────────────────

function AccessDeniedView({ requiredRoles }: { requiredRoles: UserRole[] }) {
	const currentRole = useRole();

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
				flexDirection: "column",
				gap: "1.5rem",
				background: "var(--app-bg, #0a0a0f)",
				color: "var(--text-secondary)",
			}}
		>
			{/* 아이콘 */}
			<div
				style={{
					width: "64px",
					height: "64px",
					borderRadius: "50%",
					background: "rgba(239, 68, 68, 0.1)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Shield size={28} style={{ color: "#ef4444" }} />
			</div>

			{/* 메시지 */}
			<div style={{ textAlign: "center" }}>
				<h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
					접근 권한이 없습니다
				</h2>
				<p style={{ fontSize: "0.875rem", color: "var(--text-tertiary)", maxWidth: "400px", lineHeight: 1.6 }}>
					이 페이지에 접근하려면{" "}
					<strong style={{ color: "var(--text-secondary)" }}>
						{requiredRoles.map(r => ROLE_LABELS[r]).join(" 또는 ")}
					</strong>{" "}
					역할이 필요합니다.
				</p>
			</div>

			{/* 현재 역할 표시 */}
			<div
				style={{
					padding: "0.5rem 1rem",
					background: "var(--app-bg-muted)",
					borderRadius: "6px",
					fontSize: "0.75rem",
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
				}}
			>
				<span style={{ color: "var(--text-tertiary)" }}>현재 역할:</span>
				<span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
					{ROLE_LABELS[currentRole]}
				</span>
			</div>

			{/* 돌아가기 */}
			<Link
				to="/dashboard"
				className={buttonVariants({ variant: "secondary" })}
				style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
			>
				<ArrowLeft size={14} />
				대시보드로 돌아가기
			</Link>
		</div>
	);
}

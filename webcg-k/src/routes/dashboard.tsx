/**
 * Dashboard Layout Route
 * 대시보드 레이아웃 - 사이드바 + 콘텐츠 영역
 */

import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/Dashboard/Sidebar";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const { user, loading } = useAuth();

	// 로딩 중
	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<div
						className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4"
						style={{
							borderColor: "var(--border-default)",
							borderTopColor: "var(--accent-primary)",
						}}
					/>
					<p style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
				</div>
			</div>
		);
	}

	// 미인증 → 로그인 페이지로 리다이렉트
	if (!user) {
		return <Navigate to="/login" />;
	}

	return (
		<div className="dashboard-layout">
			<Sidebar />
			<div className="dashboard-content">
				<main className="dashboard-main">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

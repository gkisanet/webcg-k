/**
 * Index Page
 * 로그인 시 대시보드로 리다이렉트
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2, LogIn, MonitorPlay } from "lucide-react";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const { user, loading } = useAuth();

	// 로딩 중
	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<div className="text-center">
					{/* Logo */}
					<div
						className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
						style={{
							background:
								"linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
						}}
					>
						<MonitorPlay className="w-10 h-10 text-white" />
					</div>

					<div
						className="inline-flex items-center gap-2 px-6 py-3 rounded-lg"
						style={{ backgroundColor: "var(--app-bg-alt)" }}
					>
						<Loader2
							className="w-5 h-5 animate-spin"
							style={{ color: "var(--accent-primary)" }}
						/>
						<span style={{ color: "var(--text-secondary)" }}>로딩 중...</span>
					</div>
				</div>
			</div>
		);
	}

	// 로그인 된 경우 대시보드로 리다이렉트
	if (user) {
		return <Navigate to="/dashboard" />;
	}

	// 비로그인 시 로그인 페이지로 안내
	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<div className="text-center">
				{/* Logo */}
				<div
					className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
					style={{
						background:
							"linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
					}}
				>
					<MonitorPlay className="w-10 h-10 text-white" />
				</div>

				{/* Title */}
				<h1 className="text-4xl font-bold text-white mb-2">WebCG-K</h1>
				<p className="text-lg mb-8" style={{ color: "var(--text-secondary)" }}>
					차세대 웹 방송 그래픽 시스템
				</p>

				{/* Description */}
				<p
					className="max-w-md mx-auto mb-8 text-sm leading-relaxed"
					style={{ color: "var(--text-tertiary)" }}
				>
					프리미어 프로처럼 편집하고, 파워포인트처럼 넘기는
					<br />
					실시간 방송 그래픽 송출 시스템
				</p>

				{/* Login Button */}
				<a
					href="/login"
					className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:opacity-90"
					style={{
						backgroundColor: "var(--accent-primary)",
						color: "var(--app-bg)",
					}}
				>
					<LogIn className="w-5 h-5" />
					로그인
				</a>

				{/* Footer */}
				<p className="mt-12 text-xs" style={{ color: "var(--text-muted)" }}>
					TanStack Start + Supabase로 구축
				</p>
			</div>
		</div>
	);
}

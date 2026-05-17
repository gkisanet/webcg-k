/**
 * Dashboard Home Page
 * 대시보드 홈 - 최근 프로젝트 및 송출중 프로젝트 표시
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Clock,
	ExternalLink,
	FolderOpen,
	Image,
	LayoutTemplate,
	Loader2,
	MonitorPlay,
	Palette,
	Play,
	Radio,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../lib/auth";
import { fetchMyProjects, fetchLiveProjects } from "../../services/dashboardService";
import { formatDay, formatTime } from "../../lib/utils/dateFormat";
import { useTranslation } from "react-i18next";

export const Route = createLazyFileRoute("/dashboard/")(	{
	component: DashboardHome,
});

function DashboardHome() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const { t } = useTranslation(["dashboard", "common"]);

	// 내 프로젝트 (최신 6개)
	const { data: myProjects = [], isLoading: myLoading } = useQuery({
		queryKey: ["broadcast_sessions", "my", user?.id],
		queryFn: () => fetchMyProjects(user!.id),
		enabled: !!user,
	});

	// 송출중 프로젝트 (모든 live 상태)
	const { data: liveProjects = [], isLoading: liveLoading } = useQuery({
		queryKey: ["broadcast_sessions", "live"],
		queryFn: fetchLiveProjects,
		enabled: !!user,
	});

	const loading = myLoading || liveLoading;

	// 컨트롤러로 이동
	const handleGoToController = (sessionId: string) => {
		navigate({ to: "/controller/$sessionId", params: { sessionId }, search: { output: null } });
	};

	// 렌더러 URL 열기
	const openRenderer = (sessionId: string, resolution: string) => {
		const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
		window.open(`${baseUrl}/render?sessionId=${sessionId}&resolution=${resolution}`, "_blank");
	};

	return (
		<>
			{/* 페이지 헤더 */}
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">{t("dashboard:pageTitle")}</h1>
					<p className="page-description">
						{t("dashboard:pageDescription")}
					</p>
				</div>
				<div className="page-header-actions">
					<Button asChild>
						<Link to="/dashboard/broadcast">
							<MonitorPlay size={18} />
							{t("dashboard:projectBroadcast")}
						</Link>
					</Button>
				</div>
			</div>

			{/* 빠른 시작 */}
			<div className="cards-grid" style={{ marginBottom: "2rem" }}>
				<QuickStartCard
					to="/dashboard/images"
					icon={<Image size={24} />}
					title={t("dashboard:quickStart.uploadImages")}
					description={t("dashboard:quickStart.uploadImagesDesc")}
				/>
				<QuickStartCard
					to="/dashboard/studio/graphics"
					icon={<Palette size={24} />}
					title={t("dashboard:quickStart.createGraphics")}
					description={t("dashboard:quickStart.createGraphicsDesc")}
				/>
				<QuickStartCard
					to="/dashboard/rundowns"
					icon={<LayoutTemplate size={24} />}
					title={t("dashboard:quickStart.editCuesheets")}
					description={t("dashboard:quickStart.editCuesheetsDesc")}
				/>
			</div>

			{/* 송출중인 프로젝트 */}
			<h2
				style={{
					fontSize: "1.125rem",
					fontWeight: 600,
					marginBottom: "1rem",
					color: "var(--text-primary)",
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
				}}
			>
				<Radio size={18} style={{ color: liveProjects.length > 0 ? "var(--accent-success)" : "var(--text-tertiary)" }} />
				{t("dashboard:liveProjects")}
			</h2>
			{liveProjects.length === 0 ? (
				<div
					style={{
						padding: "1.5rem",
						marginBottom: "2rem",
						background: "var(--app-bg-muted)",
						borderRadius: "8px",
						textAlign: "center",
						color: "var(--text-tertiary)",
						fontSize: "0.875rem",
					}}
				>
					{t("dashboard:noLiveProjects")}
				</div>
			) : (
				<div className="cards-grid" style={{ marginBottom: "2rem" }}>
					{liveProjects.map((project) => (
						<div
							key={project.id}
							className="card"
							style={{
								border: "1px solid var(--accent-success)",
								background: "linear-gradient(135deg, rgba(16, 185, 129, 0.05), transparent)",
							}}
						>
							<div className="card-body">
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
									<div>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "0.25rem",
												padding: "0.125rem 0.5rem",
												fontSize: "0.6875rem",
												fontWeight: 500,
												color: "var(--accent-success)",
												background: "rgba(16, 185, 129, 0.15)",
												borderRadius: "4px",
												marginBottom: "0.5rem",
											}}
										>
											<Radio size={10} />
											LIVE
										</span>
										<h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
											{project.title}
										</h3>
									</div>
								</div>
								<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
									{t("common:itemsCount", { count: project.timeline_data?.length || 0 })}
								</div>
								{/* 렌더러 링크 버튼 */}
								<div style={{ display: "flex", gap: "0.5rem" }}>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => openRenderer(project.id, "1080p")}
										style={{ flex: 1 }}
									>
										<ExternalLink size={12} />
										1080p
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => openRenderer(project.id, "4k")}
										style={{ flex: 1 }}
									>
										<ExternalLink size={12} />
										4K
									</Button>
									<Button
										size="sm"
										onClick={() => handleGoToController(project.id)}
										style={{ flex: 1 }}
									>
										<Play size={12} />
										{t("common:actions.controller")}
									</Button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* 최근 프로젝트 */}
			<h2
				style={{
					fontSize: "1.125rem",
					fontWeight: 600,
					marginBottom: "1rem",
					color: "var(--text-primary)",
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
				}}
			>
				<Clock size={18} style={{ color: "var(--text-secondary)" }} />
				{t("dashboard:recentProjects")}
			</h2>

			{loading ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "3rem",
					}}
				>
					<Loader2 className="animate-spin" size={24} />
				</div>
			) : myProjects.length === 0 ? (
				<div className="card">
					<div
						style={{
							textAlign: "center",
							padding: "3rem",
							color: "var(--text-tertiary)",
						}}
					>
						<FolderOpen size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
						<p style={{ marginBottom: "0.5rem" }}>{t("dashboard:noProjects")}</p>
						<p style={{ fontSize: "0.875rem" }}>
							<Link to="/dashboard/rundowns" style={{ color: "var(--accent-primary)" }}>
								{t("dashboard:createFromCuesheet")}
							</Link>
							{t("dashboard:createProjectHint")}
						</p>
					</div>
				</div>
			) : (
				<div className="cards-grid">
					{myProjects.map((project) => (
						<div
							key={project.id}
							className="card"
							style={{ cursor: "pointer" }}
							onClick={() => handleGoToController(project.id)}
						>
							<div className="card-body">
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
									<h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
										{project.title}
									</h3>
									{project.status === "live" && (
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "0.25rem",
												padding: "0.125rem 0.375rem",
												fontSize: "0.625rem",
												fontWeight: 500,
												color: "var(--accent-success)",
												background: "rgba(16, 185, 129, 0.15)",
												borderRadius: "4px",
											}}
										>
											<Radio size={8} />
											LIVE
										</span>
									)}
								</div>
								<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "flex", gap: "0.75rem" }}>
									<span>{formatDay(project.created_at)}</span>
									<span>{formatTime(project.updated_at)}</span>
									<span>{t("common:items", { count: project.timeline_data?.length || 0 })}</span>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</>
	);
}

// 빠른 시작 카드 컴포넌트
interface QuickStartCardProps {
	to: string;
	icon: React.ReactNode;
	title: string;
	description: string;
}

function QuickStartCard({ to, icon, title, description }: QuickStartCardProps) {
	return (
		<Link to={to} style={{ textDecoration: "none" }}>
			<div className="card" style={{ cursor: "pointer" }}>
				<div
					className="card-body"
					style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}
				>
					<div
						style={{
							width: 48,
							height: 48,
							borderRadius: 10,
							background:
								"linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1))",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--accent-primary)",
							flexShrink: 0,
						}}
					>
						{icon}
					</div>
					<div>
						<h3
							style={{
								fontSize: "0.9375rem",
								fontWeight: 600,
								color: "var(--text-primary)",
								margin: "0 0 0.25rem",
							}}
						>
							{title}
						</h3>
						<p
							style={{
								fontSize: "0.8125rem",
								color: "var(--text-secondary)",
								margin: 0,
							}}
						>
							{description}
						</p>
					</div>
				</div>
			</div>
		</Link>
	);
}

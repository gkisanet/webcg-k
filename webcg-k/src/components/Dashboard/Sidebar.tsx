import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
	Bot,
	Building2,
	ChevronDown,
	Database,
	Globe,
	Image,
	Layers,
	List,
	LogOut,
	MonitorPlay,
	Newspaper,
	Palette,
	RotateCcw,
	Shield,
	Sparkles,
	Tag,
	Type,
	Grid3x3,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useTranslation } from "react-i18next";
import { useProMode } from "../../lib/hooks/useProMode";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaces } from "../../services/workspaceService";
import { cn } from "@/lib/utils";

interface NavItem {
	to: string;
	icon: React.ReactNode;
	labelKey?: string; // i18n 키 (common.nav.*)
	labelFallback?: string; // i18n 없는 경우 대비 하드코딩 라벨
	adminOnly?: boolean;
	divider?: boolean; // 이 항목 앞에 구분선 표시
}

// 그룹 1: 최상단 진입점
const topNavItems: NavItem[] = [
	{ to: "/dashboard/ai-cuesheet", icon: <Sparkles size={20} />, labelKey: "nav.aiCuesheet" },
	{ to: "/dashboard/graphic-tagging", icon: <Tag size={20} />, labelKey: "nav.graphicTagging" },
];

// 그룹 2: 제작 (Creation)
const creationNavItems: NavItem[] = [
	{ to: "/dashboard/studio/graphics", icon: <Palette size={20} />, labelKey: "nav.graphicsSvg" },
	{ to: "/dashboard/studio/overlays", icon: <Layers size={20} />, labelKey: "nav.overlaysHtml" },
	{ to: "/dashboard/studio/grid-templates", icon: <Grid3x3 size={20} />, labelKey: "nav.gridTemplates" },
	{ to: "/dashboard/rundowns", icon: <List size={20} />, labelKey: "nav.cuesheets", divider: true },
	{ to: "/dashboard/broadcast", icon: <MonitorPlay size={20} />, labelKey: "nav.projectBroadcast" },
];

// 그룹 3: 라이브러리 (Library)
const libraryNavItems: NavItem[] = [
	{ to: "/dashboard/assets/images", icon: <Image size={20} />, labelKey: "nav.imageManage" },
	{ to: "/dashboard/assets/fonts", icon: <Type size={20} />, labelKey: "nav.fontManage" },
	{ to: "/dashboard/characters", icon: <Bot size={20} />, labelKey: "nav.aiCharacters" },
];

// 그룹 4: 프로 (Advanced/Pro) - Pro Mode ON일 때만 표시
const proNavItems: NavItem[] = [
	{ to: "/dashboard/datasources", icon: <Database size={20} />, labelKey: "nav.dataSources" },
	{ to: "/dashboard/cuesheets", icon: <Newspaper size={20} />, labelKey: "nav.nrcs" },
];

const adminNavItems: NavItem[] = [
	{
		to: "/dashboard/admin",
		icon: <Shield size={20} />,
		labelKey: "nav.administrator",
		adminOnly: true,
	},
];

export function Sidebar() {
	const { user, profile, signOut, activeWorkspaceId, setActiveWorkspace } = useAuth();
	const location = useLocation();
	const { t, i18n } = useTranslation("common");
	const { isProMode, toggleProMode } = useProMode();
	const [wsDropdownOpen, setWsDropdownOpen] = useState(false);

	const { data: workspaces = [] } = useQuery({
		queryKey: ["workspaces"],
		queryFn: fetchWorkspaces,
	});

	const activeWorkspace = workspaces.find((ws: any) => ws.id === activeWorkspaceId);

	// 현재 경로와 매칭 확인
	const isActive = (path: string) => {
		const currentPath = location.pathname;

		// 대시보드 홈은 정확히 일치하는 경우만
		if (path === "/dashboard") {
			return currentPath === "/dashboard" || currentPath === "/dashboard/";
		}

		// 나머지 메뉴는 해당 경로로 시작하는 경우
		return currentPath.startsWith(path);
	};

	// 이메일에서 이니셜 추출
	const getInitials = (email: string) => {
		return email.charAt(0).toUpperCase();
	};

	// 언어 전환 핸들러
	const toggleLanguage = () => {
		const nextLang = i18n.language === "ko" ? "en" : "ko";
		i18n.changeLanguage(nextLang);
	};

	// 아이템 렌더링 헬퍼
	const renderNavItem = (item: NavItem) => (
		<Link
			key={item.to}
			to={item.to}
			className={`sidebar-nav-item ${isActive(item.to) ? "active" : ""}`}
			activeOptions={{ exact: item.to === "/dashboard" }}
			inactiveProps={{ className: "sidebar-nav-item" }}
		>
			{item.icon}
			{item.labelKey ? t(item.labelKey) : item.labelFallback}
		</Link>
	);

	return (
		<aside className="sidebar">
			{/* 헤더 - 클릭하면 대시보드로 이동 */}
			<Link to="/dashboard" className="sidebar-header">
				<div className="sidebar-logo">CG</div>
				<span className="sidebar-title">WebCG-K</span>
			</Link>

			{/* 워크스페이스 스위처 */}
			<div className="sidebar-workspace-switcher">
				<button
					type="button"
					className="sidebar-ws-button"
					onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
				>
					<Building2 size={14} />
					<span className="sidebar-ws-name">
						{activeWorkspace ? (activeWorkspace as any).name : "워크스페이스 선택"}
					</span>
					<ChevronDown size={12} style={{ marginLeft: "auto", transition: "transform 0.2s", transform: wsDropdownOpen ? "rotate(180deg)" : undefined }} />
				</button>
				{wsDropdownOpen && (
					<div className="sidebar-ws-dropdown">
						{workspaces.map((ws: any) => (
							<button
								key={ws.id}
								type="button"
								className={`sidebar-ws-item ${ws.id === activeWorkspaceId ? "active" : ""}`}
								onClick={() => {
									setActiveWorkspace(ws.id);
									setWsDropdownOpen(false);
								}}
							>
								<span>{ws.name}</span>
								{ws.id === activeWorkspaceId && (
									<span className="sidebar-ws-check">✓</span>
								)}
							</button>
						))}
						{workspaces.length === 0 && (
							<div className="sidebar-ws-empty">워크스페이스가 없습니다</div>
						)}
						{profile?.is_admin && (
							<Link
								to="/dashboard/admin"
								className="sidebar-ws-item sidebar-ws-manage"
								onClick={() => setWsDropdownOpen(false)}
							>
								<Shield size={12} />
								<span>워크스페이스 관리</span>
							</Link>
						)}
					</div>
				)}
			</div>

			{/* 메인 네비게이션 */}
			<nav className="sidebar-nav">
				{/* Top Level */}
				<div className="sidebar-nav-section" style={{ marginBottom: "1rem" }}>
					{topNavItems.map(renderNavItem)}
				</div>

				{/* Creation */}
				<div className="sidebar-nav-section">
					<div className="sidebar-nav-label">{t("nav.sections.creation")}</div>
					{creationNavItems.map(renderNavItem)}
				</div>

				{/* Library */}
				<div className="sidebar-nav-section">
					<div className="sidebar-nav-label">{t("nav.sections.library")}</div>
					{libraryNavItems.map(renderNavItem)}
				</div>

				{/* Pro Mode */}
				{isProMode && (
					<div className="sidebar-nav-section">
						<div className="sidebar-nav-label">{t("nav.sections.advanced")}</div>
						{proNavItems.map(renderNavItem)}
					</div>
				)}

				{/* 관리자 메뉴 */}
				{profile?.is_admin && (
					<div className="sidebar-nav-section">
						<div className="sidebar-nav-label">{t("nav.admin")}</div>
						{adminNavItems.map(renderNavItem)}
					</div>
				)}
			</nav>

			{/* 푸터 - 사용자 정보 & 설정 */}
			<div className="sidebar-footer">
				{/* Pro Mode 토글 */}
				<button
					type="button"
					className={cn("sidebar-pro-toggle", isProMode && "active")}
					onClick={toggleProMode}
					aria-pressed={isProMode}
				>
					<div className="sidebar-pro-toggle-label">
						<Layers size={14} />
						<span>Pro Mode</span>
					</div>
					<span className="sidebar-pro-toggle-switch" aria-hidden="true">
						<span className="sidebar-pro-toggle-thumb" />
					</span>
				</button>

				{/* 사용자 카드 */}
				<div className="sidebar-user-card">
					<div className="sidebar-user-profile">
						<div className="sidebar-avatar">
							{user ? getInitials(user.email ?? "U") : "?"}
						</div>
						<div className="sidebar-user-meta">
							<span className="sidebar-user-email">
								{user?.email ?? "Guest"}
							</span>
							<span className="sidebar-user-role">
								{profile?.is_admin ? t("auth.admin") : t("auth.user")}
							</span>
						</div>
					</div>

					<div className="sidebar-user-actions">
						<button
							type="button"
							className="sidebar-action-btn"
							onClick={toggleLanguage}
							title={i18n.language === "ko" ? "Switch to English" : "한국어로 전환"}
						>
							<Globe size={12} />
							<span>{i18n.language === "ko" ? "EN" : "KO"}</span>
						</button>
						<button
							type="button"
							className="sidebar-action-btn"
							onClick={() => window.location.reload()}
							title={t("auth.fullRefresh")}
						>
							<RotateCcw size={12} />
							<span>{t("auth.refresh")}</span>
						</button>
						<button
							type="button"
							className="sidebar-action-btn sidebar-action-btn--danger"
							onClick={signOut}
							title={t("auth.logout")}
						>
							<LogOut size={12} />
						</button>
					</div>
				</div>
			</div>
		</aside>
	);
}

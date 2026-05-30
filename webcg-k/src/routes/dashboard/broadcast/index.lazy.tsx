/**
 * Broadcast Page (프로젝트 송출)
 * 프로젝트(세션) 목록, 송출 관리, 액션 로그, 날짜/검색 필터
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Archive,
	Calendar,
	Check,
	Clock,
	Copy,
	ExternalLink,
	FolderOpen,
	HelpCircle,
	Loader2,
	MonitorPlay,
	Play,
	ScrollText,
	Search,
	ShieldAlert,
	Trash2,
	RotateCcw,
	X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { ACTION_LABELS, type ActionType } from "../../../stores/actionLogStore";
import {
	archiveSession,
	deleteSession,
	fetchAllSessions,
	restoreArchivedSession,
	type BroadcastSessionWithLogs,
} from "../../../services/dashboardService";
import type { SessionStatus, SessionLog } from "../../../lib/types/broadcast";
import { formatDateTime, formatRelativeTime, formatLogTime } from "../../../lib/utils/dateFormat";
import { useTranslation } from "react-i18next";
import { useClipboard } from "../../../hooks/useClipboard";
import { fetchCuesheets } from "../../../services/cuesheetService";
import type { NrcsCuesheet } from "../../../services/cuesheetService";

import "../dashboard-common.css";
import { BroadcastGuideModal } from "@/components/Broadcast/BroadcastGuideModal";

export const Route = createLazyFileRoute("/dashboard/broadcast/")({
	component: BroadcastPage,
});

const PROJECTS_PER_PAGE = 8;

// 타입은 lib/types/broadcast.ts에서 import
// BroadcastSessionWithLogs는 services/dashboardService에서 import

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: SessionStatus }) {
	const { t } = useTranslation("common");
	const config: Record<SessionStatus, { labelKey: string; color: string; bg: string }> = {
		draft: { labelKey: "status.draft", color: "var(--text-tertiary)", bg: "var(--app-bg-muted)" },
		ready: { labelKey: "status.ready", color: "var(--accent-primary)", bg: "rgba(59,130,246,0.15)" },
		rehearsal: { labelKey: "status.rehearsal", color: "var(--accent-primary)", bg: "var(--accent-subtle-bg)" },
		live: { labelKey: "status.live", color: "var(--accent-danger)", bg: "rgba(239, 68, 68, 0.15)" },
		ended: { labelKey: "status.ended", color: "var(--accent-warning)", bg: "rgba(245, 158, 11, 0.15)" },
		completed: { labelKey: "status.completed", color: "var(--text-secondary)", bg: "var(--app-bg-alt)" },
	}
	const c = config[status] ?? config.draft;
	return (
		<span style={{
			padding: "0.125rem 0.5rem", fontSize: "0.6875rem", fontWeight: 500,
			color: c.color, background: c.bg, borderRadius: "4px",
			display: "inline-flex", alignItems: "center", gap: "0.375rem",
		}}>
			{(status === "live" || status === "rehearsal") && (
				<span style={{
					width: "6px", height: "6px", borderRadius: "50%",
					backgroundColor: status === "live" ? "var(--accent-danger)" : "var(--accent-primary)",
					boxShadow: status === "live"
						? "0 0 6px 2px rgba(239, 68, 68, 0.6)"
						: "0 0 6px 2px rgba(96, 165, 250, 0.38)",
					animation: "livePulse 1.5s ease-in-out infinite",
					flexShrink: 0,
				}} />
			)}
			{t(c.labelKey)}
		</span>
	)
}

function canPhysicallyDeleteSession(session: BroadcastSessionWithLogs): boolean {
	return session.actionLogCount === 0 && (session.status === "draft" || session.status === "ready");
}

function canArchiveSession(session: BroadcastSessionWithLogs): boolean {
	return session.status !== "live" && session.status !== "rehearsal";
}

function BroadcastPage() {
	const { user, activeWorkspaceId } = useAuth();
	const navigate = useNavigate();
	const { t } = useTranslation(["broadcast", "common"]);
	const { copyToClipboard: clipboardCopy } = useClipboard();
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [isGuideOpen, setIsGuideOpen] = useState(false);

	// 확장된 세션 ID (렌더 URL 표시용)
	const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

	// 검색 & 필터 상태
	const [searchQuery, setSearchQuery] = useState("");
	const today = new Date();
	const twoWeeksAgo = new Date();
	twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
	const fmt = (d: Date) => d.toISOString().split("T")[0];
	const [dateFrom, setDateFrom] = useState(fmt(twoWeeksAgo));
	const [dateTo, setDateTo] = useState(fmt(today));
	const [statusFilter, setStatusFilter] = useState<SessionStatus | "all">("all");
	const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
	const [currentPage, setCurrentPage] = useState(1);

	// 로그 모달 상태
	const [logSessionId, setLogSessionId] = useState<string | null>(null);
	const [logEntries, setLogEntries] = useState<SessionLog[]>([]);
	const [logLoading, setLogLoading] = useState(false);

	// 세션 목록 로드
	const queryClient = useQueryClient();
	const { data: sessions = [], isLoading: loading } = useQuery({
		queryKey: ["broadcast_sessions", "all", user?.id, archiveFilter],
		queryFn: () => user ? fetchAllSessions(user.id, { archiveMode: archiveFilter }) : Promise.resolve([]),
		enabled: !!user,
	})

	// 큐시트 변경 대기 조회 — 데이터 연동형(nrcs/csv) 중 draft/ready 상태
	const { data: pendingCuesheets = [] } = useQuery({
		queryKey: ["cuesheets_pending", activeWorkspaceId],
		queryFn: async () => {
			if (!activeWorkspaceId) return [];
			const cuesheets = await fetchCuesheets(activeWorkspaceId);
			return cuesheets.filter((cs: NrcsCuesheet) => {
				const st = cs.source_type || "manual";
				return (st === "nrcs" || st === "csv") &&
					cs.linked_rundown_id &&
					(cs.status === "draft" || cs.status === "ready");
			})
		},
		enabled: !!activeWorkspaceId,
		refetchInterval: 30000, // 30초마다 자동 폴링
	})

	// 세션 삭제 (미사용 draft/ready만) 또는 아카이브 (운영 기록 보존)
	const deleteSessionMutation = useMutation({
		mutationFn: async (session: BroadcastSessionWithLogs) => {
			if (!canPhysicallyDeleteSession(session)) {
				throw new Error(t("common:actionLog.cannotDeleteWithLogs"));
			}
			await deleteSession(session.id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["broadcast_sessions"] });
		},
	})

	const archiveSessionMutation = useMutation({
		mutationFn: async (session: BroadcastSessionWithLogs) => {
			if (!canArchiveSession(session)) {
				throw new Error(t("common:actionLog.cannotArchiveActive"));
			}
			await archiveSession(session.id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["broadcast_sessions"] });
		},
	});

	const restoreSessionMutation = useMutation({
		mutationFn: async (session: BroadcastSessionWithLogs) => {
			await restoreArchivedSession(session.id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["broadcast_sessions"] });
		},
	});

	const handleProjectDisposition = async (session: BroadcastSessionWithLogs) => {
		if (session.archived_at) {
			if (!confirm(t("common:actionLog.confirmRestore"))) return;
			restoreSessionMutation.mutate(session);
			return;
		}
		if (canPhysicallyDeleteSession(session)) {
			if (!confirm(t("common:actionLog.confirmDelete"))) return;
			deleteSessionMutation.mutate(session);
			return;
		}
		if (!canArchiveSession(session)) {
			alert(t("common:actionLog.cannotArchiveActive"));
			return;
		}
		if (!confirm(t("common:actionLog.confirmArchive"))) return;
		archiveSessionMutation.mutate(session);
	}

	// 컨트롤러로 이동
	const handleStartBroadcast = (sessionId: string) => {
		navigate({ to: "/controller/$sessionId", params: { sessionId }, search: { output: null } });
	}

	// 렌더 URL 복사 — useClipboard 훅 활용
	const handleCopyUrl = (url: string, key: string) => {
		clipboardCopy(url);
		setCopiedKey(key);
		setTimeout(() => setCopiedKey(null), 2000);
	}

	// 세션별 렌더 URL
	const getRendererUrl = (sessionId: string, resolution: string) => {
		const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
		return `${baseUrl}/render?sessionId=${sessionId}&resolution=${resolution}`;
	}

	// 날짜 유틸은 lib/utils/dateFormat.ts에서 import

	// 로그 조회
	const openLogModal = async (sessionId: string) => {
		setLogSessionId(sessionId);
		setLogLoading(true);
		setLogEntries([]);

		const { data } = await supabase
			.from("session_action_logs")
			.select("*, profiles:user_id(display_name, email)")
			.eq("session_id", sessionId)
			.order("created_at", { ascending: false })
			.limit(100);

		setLogEntries((data || []) as SessionLog[]);
		setLogLoading(false);
	}

	// 필터링된 세션
	const filteredSessions = useMemo(() => {
		return sessions.filter((s) => {
			// 텍스트 검색
			if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
			// 상태 필터
			if (statusFilter !== "all" && s.status !== statusFilter) return false;
			// 날짜 FROM
			if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
			// 날짜 TO
			if (dateTo) {
				const to = new Date(dateTo);
				to.setDate(to.getDate() + 1); // 포함
				if (new Date(s.created_at) >= to) return false;
			}
			return true;
		})
	}, [sessions, searchQuery, statusFilter, dateFrom, dateTo]);

	const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PROJECTS_PER_PAGE));
	const paginatedSessions = useMemo(() => {
		const start = (currentPage - 1) * PROJECTS_PER_PAGE;
		return filteredSessions.slice(start, start + PROJECTS_PER_PAGE);
	}, [filteredSessions, currentPage]);
	const paginationStart = filteredSessions.length === 0 ? 0 : (currentPage - 1) * PROJECTS_PER_PAGE + 1;
	const paginationEnd = Math.min(currentPage * PROJECTS_PER_PAGE, filteredSessions.length);

	useEffect(() => {
		setCurrentPage(1);
		setExpandedSessionId(null);
	}, [searchQuery, statusFilter, archiveFilter, dateFrom, dateTo]);

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
			setExpandedSessionId(null);
		}
	}, [currentPage, totalPages]);

	const logSession = logSessionId ? sessions.find((s) => s.id === logSessionId) : null;

	return (
		<>
			{/* 큐시트 변경 대기 배너 */}
			{pendingCuesheets.length > 0 && (
				<div style={{
					padding: "10px 16px",
					marginBottom: "1rem",
					background: "rgba(245, 158, 11, 0.08)",
					border: "1px solid rgba(245, 158, 11, 0.2)",
					borderRadius: 8,
					display: "flex", alignItems: "center", gap: 10,
					fontSize: "0.8125rem",
				}}>
					<span style={{ fontSize: 18 }}>📋</span>
					<div style={{ flex: 1 }}>
						<span style={{ fontWeight: 600, color: "var(--accent-warning)" }}>
							큐시트 변경 대기 {pendingCuesheets.length}건
						</span>
						<span style={{ color: "var(--text-tertiary)", marginLeft: 8, fontSize: "0.75rem" }}>
							데이터 연동 큐시트의 변경이 런다운 전파를 대기 중입니다
						</span>
					</div>
					<Link to="/dashboard/cuesheets">
						<Button variant="secondary" size="sm" style={{ fontSize: 11, gap: 4 }}>
							큐시트 확인
						</Button>
					</Link>
				</div>
			)}

			{/* 페이지 헤더 */}
			<div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<MonitorPlay size={18} />
						</div>
						{t("broadcast:pageTitle")}
					</div>
					<div className="dash-page-subtitle">{t("broadcast:pageSubtitle")}</div>
				</div>
				<div className="dash-page-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
					<Button
						variant="outline"
						className="gap-1.5"
						onClick={() => setIsGuideOpen(true)}
						style={{ fontSize: 13, height: 36 }}
					>
						<HelpCircle size={16} /> {t("broadcast:guide.title")}
					</Button>
					<Link to="/dashboard/rundowns" className="dash-btn accent">
						<FolderOpen size={16} /> {t("broadcast:cuesheetEditor")}
					</Link>
				</div>
			</div>

			{/* 검색/필터 바 */}
			<div className="dash-filter-panel">
				{/* 텍스트 검색 */}
				<div className="dash-filter-search">
					<Search size={14} className="dash-filter-icon" />
					<input
						className="dash-filter-input"
						type="text"
						placeholder={t("broadcast:searchPlaceholder")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					{searchQuery && (
						<button type="button" className="dash-filter-clear" onClick={() => setSearchQuery("")}>
							<X size={12} />
						</button>
					)}
				</div>

				{/* 상태 필터 */}
				<select
					className="dash-filter-select"
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value as SessionStatus | "all")}
				>
					<option value="all">{t("broadcast:filter.allStatus")}</option>
					<option value="draft">{t("broadcast:filter.draft")}</option>
					<option value="ready">{t("broadcast:filter.ready")}</option>
					<option value="rehearsal">{t("broadcast:filter.rehearsal")}</option>
					<option value="live">{t("broadcast:filter.live")}</option>
					<option value="ended">{t("broadcast:filter.ended")}</option>
					<option value="completed">{t("broadcast:filter.completed")}</option>
				</select>

				{/* 보관 상태 필터 */}
				<select
					className="dash-filter-select"
					value={archiveFilter}
					onChange={(e) => setArchiveFilter(e.target.value as "active" | "archived")}
				>
					<option value="active">{t("broadcast:filter.activeProjects")}</option>
					<option value="archived">{t("broadcast:filter.archivedProjects")}</option>
				</select>

				{/* 날짜 범위 */}
				<div className="dash-filter-date-range">
					<Calendar size={14} className="dash-filter-icon" />
					<input className="dash-filter-date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
					<span className="dash-filter-separator">~</span>
					<input className="dash-filter-date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
				</div>

				{/* 결과 수 */}
				<span className="dash-filter-meta">
					{t("common:projects", { count: filteredSessions.length })}
				</span>
			</div>

			{/* 프로젝트 테이블 */}
			<div className="dash-surface">
				<div style={{ padding: 0 }}>
					{loading ? (
						<div className="dash-loading">
							<Loader2 className="animate-spin" size={24} />
						</div>
					) : filteredSessions.length === 0 ? (
						<div className="dash-empty-state">
							<div className="dash-empty-icon">
								<FolderOpen size={48} />
							</div>
							<div className="dash-empty-title">
								{sessions.length === 0 ? t("broadcast:empty.noProjects") : t("broadcast:empty.noMatch")}
							</div>
							{sessions.length === 0 && (
								<div className="dash-empty-desc">
									<Link to="/dashboard/rundowns" style={{ color: "var(--accent-primary)" }}>{t("broadcast:cuesheetEditor")}</Link>{t("broadcast:empty.createHint")}
								</div>
							)}
						</div>
					) : (
						<>
						<table style={{
							width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem",
						}}>
							<thead>
								<tr style={{
									borderBottom: "1px solid var(--border-subtle)",
									background: "var(--glass-bg-hover)",
								}}>
									<th style={{ ...thStyle, width: "40%" }}>{t("broadcast:table.projectName")}</th>
									<th style={{ ...thStyle, width: "10%" }}>{t("broadcast:table.status")}</th>
									<th style={{ ...thStyle, width: "12%" }}>{t("broadcast:table.createdAt")}</th>
									<th style={{ ...thStyle, width: "12%" }}>{t("broadcast:table.modified")}</th>
									<th style={{ ...thStyle, width: "8%" }}>{t("broadcast:table.items")}</th>
									<th style={{ ...thStyle, width: "18%" }}>{t("broadcast:table.actions")}</th>
								</tr>
							</thead>
							<tbody>
								{paginatedSessions.map((session) => (
									<Fragment key={session.id}>
										<tr
											style={{
												borderBottom: "1px solid var(--border-subtle)",
												background: expandedSessionId === session.id ? "var(--app-bg-alt)" : "transparent",
												cursor: "pointer",
												transition: "background 0.1s",
											}}
											onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
											onMouseEnter={(e) => { if (expandedSessionId !== session.id) e.currentTarget.style.background = "var(--app-bg-muted)"; }}
											onMouseLeave={(e) => { if (expandedSessionId !== session.id) e.currentTarget.style.background = "transparent"; }}
										>
											{/* 프로젝트명 */}
											<td style={tdStyle}>
												<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
													{session.status === "live" || session.status === "rehearsal" ? (
														<span style={{
															width: "10px", height: "10px", borderRadius: "50%",
															backgroundColor: session.status === "live" ? "var(--accent-danger)" : "var(--accent-primary)",
															boxShadow: session.status === "live"
																? "0 0 8px 3px rgba(239, 68, 68, 0.6)"
																: "0 0 8px 3px rgba(96, 165, 250, 0.38)",
															animation: "livePulse 1.5s ease-in-out infinite",
															flexShrink: 0,
														}} />
													) : <MonitorPlay size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
													<span style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
														{session.title}
													</span>
													{session.isShared && (
														<span style={{ padding: "0.0625rem 0.375rem", fontSize: "0.625rem", fontWeight: 500, color: "var(--accent-warning)", background: "rgba(245,158,11,0.15)", borderRadius: "0.25rem" }}>{t("common:status.shared")}</span>
													)}
													{session.archived_at && (
														<span style={{ padding: "0.0625rem 0.375rem", fontSize: "0.625rem", fontWeight: 500, color: "var(--text-tertiary)", background: "var(--app-bg-muted)", borderRadius: "0.25rem" }}>{t("common:status.archived")}</span>
													)}
												</div>
											</td>
											{/* 상태 */}
											<td style={tdStyle}><StatusBadge status={session.status} /></td>
											{/* 생성일 */}
											<td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "0.75rem" }}>{formatDateTime(session.created_at)}</td>
											{/* 수정 */}
											<td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "0.75rem" }}>{formatRelativeTime(session.updated_at)}</td>
											{/* 아이템 수 */}
											<td style={{ ...tdStyle, color: "var(--text-secondary)", textAlign: "center" }}>{session.timeline_data?.length || 0}</td>
											{/* 액션 버튼 */}
											<td style={tdStyle} onClick={(e) => e.stopPropagation()}>
												<div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
													{/* 로그 버튼 */}
													<Button
														variant="secondary"
														size="icon"
														onClick={() => session.actionLogCount > 0 ? openLogModal(session.id) : alert(t("common:actionLog.noBroadcast"))}
														style={{ position: "relative" }}
														title={session.actionLogCount > 0 ? t("common:actionLog.records", { count: session.actionLogCount }) : t("common:actionLog.noBroadcastHistory")}
													>
														<ScrollText size={14} />
														{session.actionLogCount > 0 && (
															<span style={{
																position: "absolute", top: "-3px", right: "-3px",
																width: "6px", height: "6px", borderRadius: "50%",
																background: "var(--accent-primary)",
															}} />
														)}
													</Button>

													{/* 삭제/아카이브 버튼 */}
													{!session.isShared && (
														<Button
															variant="secondary"
															size="icon"
															onClick={() => handleProjectDisposition(session)}
															style={{
																opacity: canArchiveSession(session) ? 1 : 0.4,
																cursor: canArchiveSession(session) ? "pointer" : "not-allowed",
															}}
															title={
																session.archived_at
																	? t("common:actions.restore")
																	: canPhysicallyDeleteSession(session)
																		? t("common:actions.delete")
																		: canArchiveSession(session)
																			? t("common:actions.archive")
																			: t("common:actionLog.cannotArchiveActive")
															}
														>
															{session.archived_at ? (
																<RotateCcw size={14} />
															) : canPhysicallyDeleteSession(session) ? (
																<Trash2 size={14} />
															) : canArchiveSession(session) ? (
																<Archive size={14} />
															) : (
																<ShieldAlert size={14} />
															)}
														</Button>
													)}

													{/* 송출하기 */}
													<Button
														size="sm"
														onClick={() => handleStartBroadcast(session.id)}
													>
														<Play size={14} />
														{t("common:actions.broadcast")}
													</Button>
												</div>
											</td>
										</tr>

										{/* 확장 렌더 URL 패널 */}
										{expandedSessionId === session.id && (
											<tr key={`${session.id}-expand`}>
												<td colSpan={6} style={{ padding: "0.75rem 1rem", background: "var(--app-bg-alt)", borderBottom: "1px solid var(--border-subtle)" }}>
													<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>
														{t("broadcast:renderUrl.title")}
													</div>
													<div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
														{/* 1080p */}
														<RenderUrlCard
															label="1080p (Full HD)"
															url={getRendererUrl(session.id, "1080p")}
															copyKey={`${session.id}-1080p`}
															copied={copiedKey}
															onCopy={handleCopyUrl}
														/>
														{/* 4K */}
														<RenderUrlCard
															label="4K (Ultra HD)"
															url={getRendererUrl(session.id, "4k")}
															copyKey={`${session.id}-4k`}
															copied={copiedKey}
															onCopy={handleCopyUrl}
														/>
													</div>
												</td>
											</tr>
										)}
									</Fragment>
								))}
							</tbody>
						</table>
						{filteredSessions.length > PROJECTS_PER_PAGE && (
							<div style={{
								padding: "0.875rem 1rem",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "0.75rem",
								borderTop: "1px solid var(--border-subtle)",
								color: "var(--text-tertiary)",
								fontSize: "0.75rem",
								flexWrap: "wrap",
							}}>
								<span>{t("broadcast:pagination.summary", { start: paginationStart, end: paginationEnd, total: filteredSessions.length })}</span>
								<div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
									<Button variant="secondary" size="sm" disabled={currentPage === 1} onClick={() => { setCurrentPage((page) => Math.max(1, page - 1)); setExpandedSessionId(null); }}>
										{t("broadcast:pagination.prev")}
									</Button>
									<span style={{ minWidth: "3.25rem", textAlign: "center", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{currentPage} / {totalPages}</span>
									<Button variant="secondary" size="sm" disabled={currentPage === totalPages} onClick={() => { setCurrentPage((page) => Math.min(totalPages, page + 1)); setExpandedSessionId(null); }}>
										{t("broadcast:pagination.next")}
									</Button>
								</div>
							</div>
						)}
						</>
					)}
				</div>
			</div>

			{/* 로그 모달 */}
			{logSessionId && (
				<div style={{
					position: "fixed", inset: 0, zIndex: 1000,
					display: "flex", alignItems: "center", justifyContent: "center",
					background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
				}} onClick={() => setLogSessionId(null)}>
					<div
						style={{
							width: "560px", maxHeight: "80vh",
							background: "var(--app-bg-alt)", border: "1px solid var(--border-default)",
							borderRadius: "12px", boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
							display: "flex", flexDirection: "column", overflow: "hidden",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						{/* 모달 헤더 */}
						<div style={{
							padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-subtle)",
							display: "flex", alignItems: "center", justifyContent: "space-between",
						}}>
							<div>
								<div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
									<ScrollText size={16} />
									{t("common:actionLog.title")}
								</div>
								<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
									{logSession?.title || t("broadcast:table.projectName")} · {t("common:actionLog.records", { count: logEntries.length })}
								</div>
							</div>
							<button type="button" onClick={() => setLogSessionId(null)}
								style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", color: "var(--text-tertiary)" }}>
								<X size={18} />
							</button>
						</div>

						{/* 로그 목록 */}
						<div style={{ flex: 1, overflow: "auto", padding: "0.5rem 0" }}>
							{logLoading ? (
								<div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
									<Loader2 className="animate-spin" size={20} />
								</div>
							) : logEntries.length === 0 ? (
								<div style={{ textAlign: "center", padding: "2rem", color: "var(--text-tertiary)", fontSize: "0.8125rem" }}>
									<Clock size={24} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
									<div>{t("common:actionLog.noLogs")}</div>
								</div>
							) : (
								logEntries.map((log) => {
									const actionInfo = ACTION_LABELS[log.action_type as ActionType] || { label: log.action_type, icon: "📝", color: "var(--text-secondary)" };
									// label이 i18n 키이므로 t()로 변환
									const userName = log.profiles?.display_name || log.profiles?.email?.split("@")[0] || log.user_id?.slice(0, 8) || "Unknown";
									const detail = log.action_detail || {};

									return (
										<div key={log.id} style={{
											display: "flex", alignItems: "flex-start", gap: "0.75rem",
											padding: "0.5rem 1.25rem", fontSize: "0.8125rem",
											borderBottom: "1px solid rgba(255,255,255,0.03)",
										}}>
											{/* 시간 */}
											<span style={{ color: "var(--text-tertiary)", fontFamily: "monospace", fontSize: "0.6875rem", flexShrink: 0, marginTop: "2px", whiteSpace: "nowrap" }}>
												{formatLogTime(log.created_at)}
											</span>
											{/* 아이콘 */}
											<span style={{ flexShrink: 0 }}>{actionInfo.icon}</span>
											{/* 내용 */}
											<div style={{ flex: 1 }}>
												<div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
														<span style={{ fontWeight: 600, color: actionInfo.color }}>{t(`common:${actionInfo.label}`, { defaultValue: actionInfo.label })}</span>
													{detail.targetName && <span style={{ color: "var(--text-primary)" }}>{detail.targetName}</span>}
												</div>
												<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.125rem" }}>
													by {userName}
												</div>
											</div>
										</div>
									)
								})
							)}
						</div>
					</div>
				</div>
			)}

			<LivePulseStyle />
			<BroadcastGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
		</>
	)
}

// ===== 유틸 컴포넌트 =====


/** 렌더러 URL 카드 */
function RenderUrlCard({ label, url, copyKey, copied, onCopy }: {
	label: string; url: string; copyKey: string;
	copied: string | null; onCopy: (url: string, key: string) => void;
}) {
	return (
		<div style={{
			flex: 1, minWidth: "220px", padding: "0.625rem",
			background: "var(--app-bg-muted)", borderRadius: "6px", border: "1px solid var(--border-subtle)",
		}}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.375rem" }}>
				<span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-primary)" }}>{label}</span>
				<div style={{ display: "flex", gap: "0.125rem" }}>
					<button type="button" onClick={() => onCopy(url, copyKey)}
						style={{ background: "none", border: "none", padding: "0.25rem", cursor: "pointer", color: copied === copyKey ? "var(--accent-success)" : "var(--text-tertiary)" }}>
						{copied === copyKey ? <Check size={14} /> : <Copy size={14} />}
					</button>
					<a href={url} target="_blank" rel="noopener noreferrer" style={{ padding: "0.25rem", color: "var(--text-tertiary)" }}>
						<ExternalLink size={14} />
					</a>
				</div>
			</div>
			<code style={{ display: "block", fontSize: "0.625rem", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.3 }}>
				{url}
			</code>
		</div>
	)
}

// 테이블 스타일 상수
const thStyle: React.CSSProperties = {
	padding: "0.625rem 1rem", textAlign: "left", fontWeight: 600,
	fontSize: "0.75rem", color: "var(--text-tertiary)",
};

const tdStyle: React.CSSProperties = {
	padding: "0.625rem 1rem",
};



// 글로벌 CSS: 송출 중 펄스 애니메이션
const LivePulseStyle = () => (
	<style>{`
		@keyframes livePulse {
			0%, 100% {
				transform: scale(1);
				box-shadow: 0 0 4px 1px rgba(239, 68, 68, 0.4);
			}
			50% {
				transform: scale(1.3);
				box-shadow: 0 0 12px 4px rgba(239, 68, 68, 0.8);
			}
		}
	`}</style>
);

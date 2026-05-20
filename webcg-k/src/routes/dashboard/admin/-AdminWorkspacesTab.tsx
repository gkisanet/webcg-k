import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	Building2,
	Calendar,
	Check,
	Crown,
	Loader2,
	Pencil,
	Plus,
	Search,
	Shield,
	Trash2,
	User,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
	fetchAllWorkspaces,
	createWorkspace,
	updateWorkspace,
	deleteWorkspace,
	fetchMembers,
	inviteMember,
	removeMember,
} from "../../../services/workspaceService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── 역할 배지 ────────────────────────────────────────────────────
const RoleBadge = ({ role }: { role: string }) => {
	const { t } = useTranslation("admin");
	const config: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
		owner: { label: t("wsRoles.owner", "소유자"), color: "#eab308", bg: "rgba(234, 179, 8, 0.12)", icon: <Crown size={10} /> },
		admin: { label: t("wsRoles.admin", "관리자"), color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.12)", icon: <Shield size={10} /> },
		member: { label: t("wsRoles.member", "멤버"), color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)", icon: <Users size={10} /> },
		viewer: { label: t("wsRoles.viewer", "뷰어"), color: "#6b7280", bg: "rgba(107, 114, 128, 0.12)", icon: <User size={10} /> },
	};

	const c = config[role] || config.member;

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "2px 8px",
				borderRadius: 12,
				fontSize: 11,
				fontWeight: 600,
				color: c.color,
				background: c.bg,
				border: `1px solid ${c.color}20`,
			}}
		>
			{c.icon}
			{c.label}
		</span>
	);
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────

export function AdminWorkspacesTab() {
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation("admin");

	// 생성 모달
	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");
	const [newDesc, setNewDesc] = useState("");

	// 수정 모드
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState("");
	const [editDesc, setEditDesc] = useState("");

	// 멤버 초대 모달
	const [showInviteModal, setShowInviteModal] = useState(false);
	const [inviteQuery, setInviteQuery] = useState("");
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [inviteRole, setInviteRole] = useState("member");
	const [inviteError, setInviteError] = useState<string | null>(null);

	// 데이터
	const [selectedWs, setSelectedWs] = useState<any>(null);
	const [filter, setFilter] = useState("");

	const { data: workspaces = [] } = useQuery({
		queryKey: ["admin", "workspaces"],
		queryFn: fetchAllWorkspaces,
	});

	const { data: members = [] } = useQuery({
		queryKey: ["admin", "workspaces", selectedWs?.id, "members"],
		queryFn: () => fetchMembers(selectedWs.id),
		enabled: !!selectedWs,
	});

	// 통계
	const stats = useMemo(() => {
		const total = workspaces.length;
		const totalMembers = workspaces.reduce((acc: number, ws: any) => acc + (ws.memberCount || 0), 0);
		const lastWeek = new Date();
		lastWeek.setDate(lastWeek.getDate() - 7);
		const recentWeek = workspaces.filter((ws: any) => new Date(ws.created_at) > lastWeek).length;
		const avgMembers = total > 0 ? Math.round((totalMembers / total) * 10) / 10 : 0;

		return { total, totalMembers, recentWeek, avgMembers };
	}, [workspaces]);

	const filteredWorkspaces = useMemo(() => {
		const q = filter.toLowerCase();
		return workspaces.filter(
			(ws: any) =>
				ws.name.toLowerCase().includes(q) ||
				(ws.description || "").toLowerCase().includes(q) ||
				(ws.creatorName || "").toLowerCase().includes(q)
		);
	}, [workspaces, filter]);

	// Mutations
	const createMut = useMutation({
		mutationFn: () => createWorkspace(newName, newDesc),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
			setShowCreate(false);
			setNewName("");
			setNewDesc("");
		},
	});

	const updateMut = useMutation({
		mutationFn: () => updateWorkspace(selectedWs.id, { name: editName, description: editDesc }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
			setIsEditing(false);
			setSelectedWs((prev: any) => ({ ...prev, name: editName, description: editDesc }));
		},
	});

	const deleteMut = useMutation({
		mutationFn: (id: string) => deleteWorkspace(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
			if (selectedWs?.id) setSelectedWs(null);
		},
	});

	const inviteMut = useMutation({
		mutationFn: (userId: string) => inviteMember(selectedWs.id, userId, inviteRole as any),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "workspaces", selectedWs.id, "members"] });
			setInviteError(null);
		},
		onError: (err: any) => {
			setInviteError(err.message || t("workspacesTab.inviteFail", "초대 실패"));
		},
	});

	const removeMut = useMutation({
		mutationFn: (userId: string) => removeMember(selectedWs.id, userId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "workspaces", selectedWs.id, "members"] });
		},
	});

	// 사용자 검색
	const handleSearch = async (q: string) => {
		setInviteQuery(q);
		if (q.length < 2) {
			setSearchResults([]);
			return;
		}

		setIsSearching(true);
		try {
			const { supabase } = await import("../../../lib/supabase");
			const { data } = await supabase
				.from("profiles")
				.select("id, display_name, email")
				.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
				.limit(10);
			setSearchResults(data || []);
		} catch (err) {
			console.error("Search failed:", err);
		} finally {
			setIsSearching(false);
		}
	};

	return (
		<div className="admin-tab-content">
			{/* 통계 카드 */}
			<div className="admin-stats">
				<div className="admin-stat-card">
					<div className="admin-stat-icon blue"><Building2 size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.totalWorkspaces", "전체 워크스페이스")}</div>
						<div className="admin-stat-value">{stats.total}</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon purple"><Users size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.totalMembers", "총 멤버")}</div>
						<div className="admin-stat-value">{stats.totalMembers}</div>
						<div className="admin-stat-sub">
							{t("stats.avgMembersPerWs", { count: stats.avgMembers, defaultValue: "평균 {{count}}명 / 워크스페이스" })}
						</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon green"><Calendar size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.recentWeekWs", "최근 7일 생성")}</div>
						<div className="admin-stat-value">{stats.recentWeek}</div>
					</div>
				</div>
			</div>

			{/* 메인: 50:50 분할 */}
			<div className="ws-split-container">
				{/* ─── 왼쪽: 워크스페이스 목록 ─── */}
				<div className="ws-panel">
					{/* 패널 헤더 */}
					<div className="ws-panel-header">
						<h3 className="admin-section-title" style={{ marginBottom: 0 }}>
							<Building2 size={16} /> {t("workspacesTab.title", "워크스페이스 목록")}
						</h3>
						<Button
							size="sm"
							onClick={() => setShowCreate(true)}
							className="flex items-center gap-1"
						>
							<Plus size={14} /> {t("workspacesTab.createBtn", "생성")}
						</Button>
					</div>

					{/* 검색 */}
					<div style={{ position: "relative", marginBottom: 12 }}>
						<Search
							size={14}
							style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
						/>
						<Input
							type="text"
							placeholder={t("workspacesTab.searchPlaceholder", "이름, 설명, 소유자 검색...")}
							style={{ paddingLeft: 32, fontSize: 13 }}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
					</div>

					{/* 테이블 */}
					<div className="admin-table-wrapper" style={{ flex: 1, overflow: "auto" }}>
						<table>
							<thead>
								<tr>
									<th>{t("workspacesTab.thWorkspace", "워크스페이스")}</th>
									<th style={{ width: 70 }}>{t("workspacesTab.thMembers", "멤버")}</th>
									<th style={{ width: 110 }}>{t("workspacesTab.thOwner", "소유자")}</th>
									<th style={{ width: 100 }}>{t("workspacesTab.thCreatedDate", "생성일")}</th>
									<th style={{ width: 50 }}></th>
								</tr>
							</thead>
							<tbody>
								{filteredWorkspaces.map((ws: any) => (
									<tr
										key={ws.id}
										onClick={() => { setSelectedWs(ws); setIsEditing(false); }}
										className={selectedWs?.id === ws.id ? "active-row" : ""}
										style={{ cursor: "pointer" }}
									>
										<td>
											<div style={{ fontWeight: 600, fontSize: 13 }}>{ws.name}</div>
											{ws.description && (
												<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
													{ws.description}
												</div>
											)}
										</td>
										<td>
											<span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
												<Users size={12} />
												{ws.memberCount ?? 0}
											</span>
										</td>
										<td>
											<span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
												{ws.creatorName || "—"}
											</span>
										</td>
										<td>
											<span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
												{new Date(ws.created_at).toLocaleDateString(i18n.language === "ko" ? "ko-KR" : "en-US")}
											</span>
										</td>
										<td>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													if (confirm(t("workspacesTab.deleteConfirm", { name: ws.name, defaultValue: `"${ws.name}"을(를) 삭제하시겠습니까?` }))) {
														deleteMut.mutate(ws.id);
													}
												}}
												className="ws-row-delete"
											>
												<Trash2 size={14} />
											</button>
										</td>
									</tr>
								))}
								{filteredWorkspaces.length === 0 && (
									<tr>
										<td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--text-tertiary)" }}>
											{filter ? t("workspacesTab.noSearchResults", "검색 결과가 없습니다.") : t("workspacesTab.noWorkspaces", "워크스페이스가 없습니다.")}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				{/* ─── 오른쪽: 상세 패널 ─── */}
				<div className="ws-panel">
					{selectedWs ? (
						<>
							{/* 정보 카드 */}
							<div className="ws-info-card">
								{isEditing ? (
									<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
										<Input
											type="text"
											value={editName}
											onChange={(e) => setEditName(e.target.value)}
											placeholder={t("workspacesTab.workspaceName", "워크스페이스 이름")}
											autoFocus
											style={{ fontSize: 14 }}
										/>
										<Input
											type="text"
											value={editDesc}
											onChange={(e) => setEditDesc(e.target.value)}
											placeholder={t("workspacesTab.descriptionOptional", "설명 (선택)")}
											style={{ fontSize: 13 }}
										/>
										<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
											<Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>{t("workspacesTab.cancel", "취소")}</Button>
											<Button size="sm" onClick={() => updateMut.mutate()} disabled={!editName.trim() || updateMut.isPending}>
												<Check size={14} /> {t("workspacesTab.save", "저장")}
											</Button>
										</div>
									</div>
								) : (
									<>
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
											<div style={{ minWidth: 0 }}>
												<h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
													{selectedWs.name}
												</h3>
												{selectedWs.description && (
													<p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" }}>
														{selectedWs.description}
													</p>
												)}
											</div>
											<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
												<Button
													size="icon-xs"
													variant="ghost"
													onClick={() => {
														setEditName(selectedWs.name);
														setEditDesc(selectedWs.description || "");
														setIsEditing(true);
													}}
													title={t("workspacesTab.editWorkspace", "워크스페이스 수정")}
												>
													<Pencil size={13} />
												</Button>
												<Button
													size="icon-xs"
													variant="ghost"
													onClick={() => {
														if (confirm(t("workspacesTab.deleteConfirm", { name: selectedWs.name, defaultValue: `"${selectedWs.name}"을(를) 삭제하시겠습니까?` }))) {
															deleteMut.mutate(selectedWs.id);
														}
													}}
													title={t("workspacesTab.delete", { defaultValue: "삭제" })}
													style={{ color: "#ef4444" }}
												>
													<Trash2 size={13} />
												</Button>
											</div>
										</div>
										<div className="ws-meta-row">
											<span><Users size={11} /> {t("workspacesTab.membersCount", { count: selectedWs.memberCount ?? 0, defaultValue: "멤버 ({{count}}명)" })}</span>
											<span><Calendar size={11} /> {new Date(selectedWs.created_at).toLocaleDateString(i18n.language === "ko" ? "ko-KR" : "en-US")}</span>
											<span><User size={11} /> {selectedWs.creatorName || "—"}</span>
										</div>
									</>
								)}
							</div>

							{/* 멤버 섹션 */}
							<div className="ws-member-section">
								<div className="ws-member-header">
									<h4><Users size={14} /> {t("workspacesTab.membersCount", { count: members.length, defaultValue: "멤버 ({{count}}명)" })}</h4>
									<Button size="sm" onClick={() => setShowInviteModal(true)} className="flex items-center gap-1">
										<UserPlus size={14} /> {t("workspacesTab.invite", "초대")}
									</Button>
								</div>

								<div className="admin-table-wrapper" style={{ flex: 1, overflow: "auto" }}>
									<table>
										<thead>
											<tr>
												<th>{t("usersTab.thUser", "사용자")}</th>
												<th style={{ width: 90 }}>{t("workspacesTab.thRole", "역할")}</th>
												<th style={{ width: 40 }}></th>
											</tr>
										</thead>
										<tbody>
											{members.map((m: any) => (
												<tr key={m.id}>
													<td>
														<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
															{m.profile?.display_name || m.user_id.slice(0, 8)}
														</div>
														<div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
															{m.user_id.slice(0, 12)}...
														</div>
													</td>
													<td><RoleBadge role={m.role} /></td>
													<td>
														{m.role !== "owner" && (
															<button
																type="button"
																onClick={() => removeMut.mutate(m.user_id)}
																className="ws-row-delete"
															>
																<X size={14} />
															</button>
														)}
													</td>
												</tr>
											))}
											{members.length === 0 && (
												<tr>
													<td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>
														{t("workspacesTab.noMembers", "멤버가 없습니다.")}
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</div>
						</>
					) : (
						<div className="ws-empty">
							<Building2 size={40} style={{ opacity: 0.3 }} />
							<p>{t("workspacesTab.selectWorkspaceHint", "왼쪽에서 워크스페이스를 선택하세요")}</p>
						</div>
					)}
				</div>
			</div>

			{/* 생성 모달 */}
			{showCreate && (
				<div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ width: "360px" }}>
						<h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
							<Plus size={18} /> {t("workspacesTab.createTitle", "새 워크스페이스 생성")}
						</h3>
						<div className="input-group">
							<label>{t("workspacesTab.workspaceName", "워크스페이스 이름")} *</label>
							<Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("workspacesTab.workspaceName", "워크스페이스 이름")} autoFocus />
						</div>
						<div className="input-group">
							<label>{t("workspacesTab.description", "설명")}</label>
							<Input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={t("workspacesTab.descriptionOptional", "설명 (선택)")} />
						</div>
						<div className="admin-modal-actions">
							<Button variant="secondary" onClick={() => setShowCreate(false)}>{t("workspacesTab.cancel", "취소")}</Button>
							<Button onClick={() => createMut.mutate()} disabled={!newName.trim() || createMut.isPending}>{t("workspacesTab.createBtn", "생성")}</Button>
						</div>
					</div>
				</div>
			)}

			{/* 초대 모달 */}
			{showInviteModal && selectedWs && (
				<div className="admin-modal-overlay" onClick={() => setShowInviteModal(false)}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ width: "520px", padding: 0, overflow: "hidden" }}>
						<div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--app-bg-muted)" }}>
							<div>
								<h3 style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, margin: 0, color: "var(--text-primary)" }}>
									<UserPlus size={20} style={{ color: "var(--app-primary)" }} /> {t("workspacesTab.inviteTitle", "새로운 멤버 초대")}
								</h3>
								<p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, marginBottom: 0 }}>
									{t("workspacesTab.inviteDesc", { name: selectedWs.name, defaultValue: `"${selectedWs.name}" 워크스페이스에 참여할 멤버를 검색하고 역할을 부여하세요.` })}
								</p>
							</div>
							<button type="button" onClick={() => setShowInviteModal(false)} style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 4 }}>
								<X size={20} />
							</button>
						</div>
						<div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
							<div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
								<div style={{ flex: 1, position: "relative" }}>
									<Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
									<Input type="text" value={inviteQuery} onChange={(e) => handleSearch(e.target.value)} placeholder={t("workspacesTab.searchInvitePlaceholder", "이름 또는 이메일로 검색하세요...")} autoFocus style={{ paddingLeft: 40, height: 44, fontSize: 14 }} />
								</div>
								<select
									value={inviteRole}
									onChange={(e) => setInviteRole(e.target.value)}
									style={{ height: 44, padding: "0 1rem", background: "var(--app-bg-muted)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", fontSize: 14, fontWeight: 500, minWidth: 110 }}
								>
									<option value="admin">{t("wsRoles.admin", "관리자")}</option>
									<option value="member">{t("wsRoles.member", "멤버")}</option>
									<option value="viewer">{t("wsRoles.viewer", "뷰어")}</option>
								</select>
							</div>
							<div style={{ minHeight: "220px", maxHeight: "300px", overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--app-bg)" }}>
								{isSearching ? (
									<div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
										<Loader2 size={24} className="animate-spin" />
									</div>
								) : searchResults.length > 0 ? (
									<div style={{ display: "flex", flexDirection: "column" }}>
										{searchResults.map((u) => (
											<div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", borderBottom: "1px solid var(--border-default)", transition: "background 0.2s" }} className="hover:bg-accent">
												<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
													<div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--app-primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 14 }}>
														{(u.display_name || "U")[0].toUpperCase()}
													</div>
													<div>
														<div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{u.display_name || "Unknown User"}</div>
														<div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "monospace", marginTop: 2 }}>{u.id.slice(0, 12)}...</div>
													</div>
												</div>
												<Button size="sm" variant="outline" onClick={() => inviteMut.mutate(u.id)} disabled={inviteMut.isPending} style={{ fontSize: 13, height: 32 }}>
													{t("workspacesTab.inviteBtn", "초대하기")}
												</Button>
											</div>
										))}
									</div>
								) : inviteQuery.length >= 2 ? (
									<div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-tertiary)" }}>
										<User size={40} style={{ opacity: 0.5 }} />
										<p style={{ fontSize: 14 }}>{t("workspacesTab.inviteNoResults", { query: inviteQuery, defaultValue: `"${inviteQuery}" 검색 결과가 없습니다.` })}</p>
									</div>
								) : (
									<div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-tertiary)", padding: "2rem" }}>
										<Search size={40} style={{ opacity: 0.3 }} />
										<p style={{ fontSize: 14, textAlign: "center", lineHeight: 1.6 }}>
											{t("workspacesTab.inviteSearchHint", "초대할 사용자의 이름을 검색하세요.")}<br />
											<span style={{ fontSize: 12, opacity: 0.7 }}>{t("workspacesTab.inviteSearchHintSub", "최소 2글자 이상 입력해야 합니다.")}</span>
										</p>
									</div>
								)}
							</div>
							{inviteError && (
								<div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 6, color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
									<X size={16} /> {inviteError}
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

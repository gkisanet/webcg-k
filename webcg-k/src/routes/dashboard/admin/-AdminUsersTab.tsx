/**
 * Admin 사용자 관리 탭 (통합)
 * TanStack Table 기반: 사용자 + 시스템 역할 + 소속 워크스페이스 + 가입일
 *
 * 개선사항:
 *   - 커스텀 globalFilterFn: 이름/역할/워크스페이스 모두 검색
 *   - 모든 컬럼에 sorting 적용
 *   - MembershipCell UI 간소화 (태그 중심, 추가는 한 줄 드롭다운)
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type FilterFn,
} from "@tanstack/react-table";
import {
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	Loader2,
	Search,
	Shield,
	Users,
	Zap,
	Building2,
	Plus,
	X,
	Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserRole } from "../../../lib/auth";
import {
	inviteMember,
	removeMember,
} from "../../../services/workspaceService";
import type { Workspace } from "../../../services/workspaceService";
import {
	ROLE_META,
	getAvatarGradient,
	getInitials,
	computeUserStats,
} from "./-adminTypes";
import type { ProfileWithMemberships } from "./-adminTypes";

// ─── Props ──────────────────────────────────────────────────────

interface AdminUsersTabProps {
	profiles: ProfileWithMemberships[];
	loading: boolean;
	globalFilter: string;
	setGlobalFilter: (value: string) => void;
	userId: string | undefined;
	changeRole: (userId: string, newRole: UserRole) => void;
	workspaces: Workspace[];
}

// ─── 커스텀 글로벌 필터: 이름 / 역할 / 워크스페이스 전부 검색 ───

const globalSearchFilter: FilterFn<ProfileWithMemberships> = (row, _columnId, filterValue) => {
	if (!filterValue) return true;
	const q = String(filterValue).toLowerCase();
	const p = row.original;

	const searchable = [
		p.display_name || "",
		p.role || "",
		p.memberships.map((m) => m.workspace_name).join(" "),
	].join(" ").toLowerCase();

	return searchable.includes(q);
};

// ─── 워크스페이스 태그 셀 (간소화) ──────────────────────────────

function MembershipCell({
	memberships,
	userId,
	allWorkspaces,
}: {
	memberships: ProfileWithMemberships["memberships"];
	userId: string;
	allWorkspaces: Workspace[];
}) {
	const queryClient = useQueryClient();
	const { t } = useTranslation("admin");
	const [adding, setAdding] = useState(false);
	const [selectedWs, setSelectedWs] = useState("");
	const DEFAULT_ROLE = "member";

	const available = (allWorkspaces || []).filter((ws) => !memberships.some((m) => m.workspace_id === ws.id));

	const addMut = useMutation({
		mutationFn: ({ wsId, role }: { wsId: string; role: string }) => inviteMember(wsId, userId, role as any),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_profiles"] }),
	});

	const removeMut = useMutation({
		mutationFn: (wsId: string) => removeMember(wsId, userId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_profiles"] }),
	});

	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", minWidth: 0 }}>
			{memberships.map((m) => (
				<div
					key={m.workspace_id}
					className="ws-tag"
					title={`${m.workspace_name}`}
				>
					<Building2 size={9} style={{ opacity: 0.5 }} />
					<span>{m.workspace_name}</span>
					<button
						type="button"
						className="ws-tag-remove"
						onClick={() => removeMut.mutate(m.workspace_id)}
					>
						<X size={9} />
					</button>
				</div>
			))}

			{adding ? (
				<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
					<select
						value={selectedWs}
						onChange={(e) => setSelectedWs(e.target.value)}
						className="ws-add-select"
						autoFocus
					>
						<option value="">{t("usersTab.selectWorkspace")}</option>
						{available.map((ws) => (
							<option key={ws.id} value={ws.id}>
								{ws.name}
							</option>
						))}
					</select>
					<button
						type="button"
						onClick={() => {
							if (selectedWs) addMut.mutate({ wsId: selectedWs, role: DEFAULT_ROLE });
							setAdding(false);
							setSelectedWs("");
						}}
						className="ws-add-btn confirm"
					>
						<Check size={10} />
					</button>
					<button
						type="button"
						onClick={() => {
							setAdding(false);
							setSelectedWs("");
						}}
						className="ws-add-btn cancel"
					>
						<X size={10} />
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setAdding(true)}
					className="ws-tag-add"
					title={t("usersTab.addWorkspace")}
				>
					<Plus size={10} />
				</button>
			)}
		</div>
	);
}

// ─── 컬럼 헬퍼 ──────────────────────────────────────────────────

const columnHelper = createColumnHelper<ProfileWithMemberships>();

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function AdminUsersTab({
	profiles,
	loading,
	globalFilter,
	setGlobalFilter,
	userId,
	changeRole,
	workspaces,
}: AdminUsersTabProps) {
	const { t } = useTranslation("admin");
	const userStats = useMemo(() => computeUserStats(profiles as any), [profiles]);

	const columns = useMemo(
		() => [
			columnHelper.accessor("display_name", {
				header: ({ column }) => (
					<Button
						variant="ghost"
						size="sm"
						className="flex items-center gap-1 hover:text-white"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("usersTab.thUser")}
						<ArrowUpDown size={13} className="text-secondary" />
					</Button>
				),
				cell: (info) => {
					const row = info.row.original;
					return (
						<div className="flex items-center gap-10">
							<div className={`user-avatar gradient-${getAvatarGradient(row.id)}`}>
								{getInitials(info.getValue())}
							</div>
							<div>
								<div style={{ fontWeight: 600, fontSize: 13 }}>
									{info.getValue() || t("usersTab.noName")}
								</div>
								<div
									style={{
										fontSize: 11,
										color: "var(--text-tertiary)",
										fontFamily: "monospace",
									}}
								>
									{row.id.substring(0, 8)}…
								</div>
							</div>
						</div>
					);
				},
			}),
			columnHelper.accessor("role", {
				header: ({ column }) => (
					<Button
						variant="ghost"
						size="sm"
						className="flex items-center gap-1 hover:text-white"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("usersTab.thRole")}
						<ArrowUpDown size={13} className="text-secondary" />
					</Button>
				),
				cell: (info) => {
					const row = info.row.original;
					const isSelf = row.id === userId;
					const currentRole = info.getValue() || "viewer";
					const meta = ROLE_META[currentRole as keyof typeof ROLE_META];
					return (
						<select
							value={currentRole}
							onChange={(e) => !isSelf && changeRole(row.id, e.target.value as UserRole)}
							disabled={isSelf}
							title={isSelf ? t("usersTab.cannotChangeSelfRole") : t("usersTab.clickToChangeRole")}
							style={{
								background: "var(--app-bg-muted)",
								border: `1px solid ${meta.color}40`,
								color: meta.color,
								borderRadius: 6,
								padding: "4px 8px",
								fontSize: 12,
								fontWeight: 600,
								cursor: isSelf ? "not-allowed" : "pointer",
								opacity: isSelf ? 0.5 : 1,
							}}
						>
							{Object.entries(ROLE_META).map(([key, val]) => (
								<option key={key} value={key}>
									{val.icon} {t(`roles.${key}`, val.label)}
								</option>
							))}
						</select>
					);
				},
			}),
			columnHelper.accessor("memberships", {
				id: "memberships",
				header: ({ column }) => (
					<Button
						variant="ghost"
						size="sm"
						className="flex items-center gap-1 hover:text-white"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("usersTab.thWorkspaces")}
						<ArrowUpDown size={13} className="text-secondary" />
					</Button>
				),
				sortingFn: (rowA, rowB) => {
					const a = rowA.original.memberships.length;
					const b = rowB.original.memberships.length;
					return a === b ? 0 : a > b ? 1 : -1;
				},
				cell: (info) => {
					const row = info.row.original;
					return (
						<MembershipCell
							memberships={row.memberships}
							userId={row.id}
							allWorkspaces={workspaces}
						/>
					);
				},
			}),
			columnHelper.accessor("created_at", {
				header: ({ column }) => (
					<Button
						variant="ghost"
						size="sm"
						className="flex items-center gap-1 hover:text-white"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("usersTab.thJoinedAt")}
						<ArrowUpDown size={13} className="text-secondary" />
					</Button>
				),
				cell: (info) => (
					<span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
						{new Date(info.getValue()).toLocaleDateString(t("usersTab.thJoinedAt") === "Joined Date" ? "en-US" : "ko-KR")}
					</span>
				),
			}),
			columnHelper.accessor("updated_at", {
				header: ({ column }) => (
					<Button
						variant="ghost"
						size="sm"
						className="flex items-center gap-1 hover:text-white"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("usersTab.thRecentActivity")}
						<ArrowUpDown size={13} className="text-secondary" />
					</Button>
				),
				cell: (info) => {
					const d = new Date(info.getValue());
					const diffMs = Date.now() - d.getTime();
					const diffH = Math.floor(diffMs / 3600000);
					const label =
						diffH < 1
							? t("usersTab.recentActivity.justNow")
							: diffH < 24
								? t("usersTab.recentActivity.hoursAgo", { count: diffH })
								: t("usersTab.recentActivity.daysAgo", { count: Math.floor(diffH / 24) });
					return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>;
				},
			}),
		],
		[userId, changeRole, workspaces, t],
	);

	const table = useReactTable({
		data: profiles,
		columns,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: globalSearchFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<>
			{/* 통계 카드 */}
			<div className="admin-stats">
				<div className="admin-stat-card">
					<div className="admin-stat-icon blue">
						<Users size={22} />
					</div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.totalUsers")}</div>
						<div className="admin-stat-value">{userStats.total}</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon purple">
						<Shield size={22} />
					</div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.admins")}</div>
						<div className="admin-stat-value">{userStats.admins}</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon green">
						<Zap size={22} />
					</div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.recentWeek")}</div>
						<div className="admin-stat-value">{userStats.recentWeek}</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon amber">
						<Building2 size={22} />
					</div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">{t("stats.workspaceParticipation")}</div>
						<div className="admin-stat-value">
							{profiles.reduce((sum, p) => sum + p.memberships.length, 0)}
						</div>
						<div className="admin-stat-sub">{t("stats.totalMemberships")}</div>
					</div>
				</div>
			</div>

			{/* 검색 + 테이블 */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<h3 className="admin-section-title" style={{ marginBottom: 0 }}>
					<Users size={16} /> {t("usersTab.title")}
				</h3>
				<div style={{ position: "relative", maxWidth: 320, width: "100%" }}>
					<Search
						size={15}
						style={{
							position: "absolute",
							left: 10,
							top: "50%",
							transform: "translateY(-50%)",
							color: "var(--text-secondary)",
						}}
					/>
					<Input
						type="text"
						placeholder={t("usersTab.searchPlaceholder")}
						style={{ paddingLeft: 32, width: "100%", padding: "7px 10px 7px 32px", fontSize: 13 }}
						value={globalFilter}
						onChange={(e) => setGlobalFilter(e.target.value)}
					/>
				</div>
			</div>

			<div className="admin-table-wrapper">
				<table>
					<thead>
						{table.getHeaderGroups().map((hg) => (
							<tr key={hg.id}>
								{hg.headers.map((h) => (
									<th key={h.id}>
										{h.isPlaceholder
											? null
											: flexRender(h.column.columnDef.header, h.getContext())}
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{loading ? (
							<tr>
								<td colSpan={columns.length} style={{ textAlign: "center", padding: 32 }}>
									<Loader2 size={20} className="animate-spin" style={{ margin: "0 auto" }} />
								</td>
							</tr>
						) : (
							table.getRowModel().rows.map((row) => (
								<tr key={row.id}>
									{row.getVisibleCells().map((cell) => (
										<td key={cell.id}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</td>
									))}
								</tr>
							))
						)}
					</tbody>
				</table>
				{table.getPageCount() > 1 && (
					<div className="admin-pagination">
						<span>
							{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<ChevronLeft size={15} />
						</Button>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<ChevronRight size={15} />
						</Button>
					</div>
				)}
			</div>
		</>
	);
}

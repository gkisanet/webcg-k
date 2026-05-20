/**
 * Rundown List Page
 * 큐시트 목록 조회 및 생성 (TanStack Table 적용)
 */

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowUpDown,
    Calendar,
    ChevronLeft,
    ChevronRight,
    List,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";

import "../dashboard-common.css";

export const Route = createLazyFileRoute("/dashboard/rundowns/")({
    component: RundownListPage,
});

interface Rundown {
    id: string;
    title: string;
    description: string | null;
    updated_at: string;
    created_at: string;
    project_id: string;
    is_public?: boolean;
    created_by: string | null;
}

const columnHelper = createColumnHelper<Rundown>();

function RundownListPage() {
    const { user, activeWorkspaceId } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [globalFilter, setGlobalFilter] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // 큐시트 목록 불러오기
    const { data = [], isLoading } = useQuery({
        queryKey: ["rundowns", user?.id],
        queryFn: async () => {
            const { data: rundowns, error } = await supabase
                .from("rundowns")
                .select(`
                    id, 
                    title, 
                    description, 
                    updated_at, 
                    created_at,
                    project_id,
                    is_public,
                    created_by,
                    projects!inner(owner_id)
                `)
                .order("updated_at", { ascending: false });

            if (error) throw error;
            return rundowns as unknown as Rundown[];
        },
        enabled: !!user,
        staleTime: 0,
        refetchOnMount: "always",  // 페이지 복귀 시 항상 최신 데이터 재요청
    });

    // 삭제 mutation (RLS 정책에 의해 조용히 실패 가능 → count로 확인)
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error, count } = await supabase
                .from("rundowns")
                .delete({ count: "exact" })
                .eq("id", id);
            if (error) throw error;
            if (count === 0) throw new Error("삭제 권한이 없거나 이미 삭제된 큐시트입니다.");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["rundowns"] });
        },
        onError: (error) => {
            console.error("큐시트 삭제 실패:", error);
            alert(`삭제 실패: ${error.message}`);
        },
    });

    // 새 큐시트 생성
    const handleCreateRundown = async () => {
        if (!user) return;
        if (!activeWorkspaceId) {
            alert("활성화된 워크스페이스가 없습니다. 워크스페이스를 선택하거나 생성해주세요.");
            return;
        }
        setIsCreating(true);

        try {
            // 1. 사용자의 첫 번째 프로젝트 ID 찾기
            const { data: projects } = await supabase
                .from("projects")
                .select("id")
                .eq("owner_id", user.id)
                .limit(1);

            let projectId = (projects as any)?.[0]?.id;

            // 프로젝트가 없으면 하나 생성
            if (!projectId) {
                const { data: newProject, error: projError } = (await supabase
                    .from("projects")
                    .insert({
                        name: "내 프로젝트",
                        owner_id: user.id,
                        workspace_id: activeWorkspaceId,
                        settings: {},
                    } as any)
                    .select()
                    .single()) as any;

                if (projError) throw projError;
                projectId = newProject.id;
            }

            // 2. 런다운 생성 — 이름에 날짜시간 접미사 추가
            const now = new Date();
            const timestamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const defaultTitle = `새 큐시트_${timestamp}`;

            const { data: newRundown, error: runError } = (await supabase
                .from("rundowns")
                .insert({
                    project_id: projectId,
                    title: defaultTitle,
                    description: "",
                    created_by: user.id,
                    workspace_id: activeWorkspaceId,
                    is_public: false,
                } as any)
                .select()
                .single()) as any;

            if (runError) throw runError;

            navigate({ to: `/dashboard/rundowns/${newRundown.id}` });
        } catch (error) {
            console.error("Error creating rundown:", error);
            alert("큐시트 생성 중 오류가 발생했습니다.");
        } finally {
            setIsCreating(false);
        }
    };

    // 컬럼 정의
    const columns = [
        columnHelper.accessor("title", {
            header: ({ column }) => (
                <button
                    type="button"
                    className="column-header-btn"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    제목
                    <ArrowUpDown size={14} />
                </button>
            ),
            cell: (info) => (
                <Link
                    to="/dashboard/rundowns/$rundownId"
                    params={{ rundownId: info.row.original.id }}
                    className="font-medium hover:text-accent-primary transition-colors"
                >
                    {info.getValue()}
                </Link>
            ),
        }),
        columnHelper.accessor("description", {
            header: "설명",
            cell: (info) => (
                <span className="text-secondary truncate block max-w-xs">
                    {info.getValue() || "-"}
                </span>
            ),
        }),
        columnHelper.accessor("is_public", {
            header: "공개",
            cell: (info) => (
                <span className={`badge ${info.getValue() ? "badge-success" : "badge-secondary"}`}>
                    {info.getValue() ? "🌐 공개" : "🔒 비공개"}
                </span>
            ),
        }),
        columnHelper.accessor("created_by", {
            header: "생성자",
            cell: (info) => (
                <span className="text-secondary">
                    {info.getValue() === user?.id ? "나" : info.getValue()?.slice(0, 8) || "-"}
                </span>
            ),
        }),
        columnHelper.accessor("created_at", {
            header: ({ column }) => (
                <button
                    type="button"
                    className="column-header-btn"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    생성일
                    <ArrowUpDown size={14} />
                </button>
            ),
            cell: (info) => (
                <span className="item-date">
                    {new Date(info.getValue()).toLocaleDateString("ko-KR")}
                </span>
            ),
        }),
        columnHelper.accessor("updated_at", {
            header: ({ column }) => (
                <button
                    type="button"
                    className="column-header-btn"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    수정일
                    <ArrowUpDown size={14} />
                </button>
            ),
            cell: (info) => {
                const createdAt = info.row.original.created_at;
                const updatedAt = info.getValue();
                if (updatedAt && updatedAt !== createdAt) {
                    return (
                        <span className="item-date item-date-updated">
                            {new Date(updatedAt).toLocaleDateString("ko-KR")}
                        </span>
                    );
                }
                return <span className="item-date text-muted">-</span>;
            },
        }),
        columnHelper.display({
            id: "actions",
            header: "",
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon-sm" asChild>
                        <Link
                            to="/dashboard/rundowns/$rundownId"
                            params={{ rundownId: info.row.original.id }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Pencil size={14} />
                        </Link>
                    </Button>
                    <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("이 큐시트를 삭제하시겠습니까?")) {
                                deleteMutation.mutate(info.row.original.id);
                            }
                        }}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        }),
    ];

    // 필터링된 데이터 (검색 + 공개/비공개 + 날짜)
    const filteredData = useMemo(() => {
        return data.filter((r) => {
            // 공개/비공개 필터
            if (visibilityFilter === "public" && !r.is_public) return false;
            if (visibilityFilter === "private" && r.is_public) return false;
            // 날짜 FROM
            if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
            // 날짜 TO
            if (dateTo) {
                const to = new Date(dateTo);
                to.setDate(to.getDate() + 1);
                if (new Date(r.created_at) >= to) return false;
            }
            return true;
        });
    }, [data, visibilityFilter, dateFrom, dateTo]);

    const table = useReactTable({
        data: filteredData,
        columns,
        state: {
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-accent-primary" />
            </div>
        );
    }

    return (
        <>
            <div className="dash-page-header">
                <div>
                    <div className="dash-page-title">
                        <div className="dash-page-title-icon">
                            <List size={18} />
                        </div>
                        큐시트 관리
                    </div>
                    <div className="dash-page-subtitle">
                        방송 순서(Rundown)를 생성하고 관리합니다.
                    </div>
                </div>
                <div className="dash-page-actions">
                    <button
                        className="dash-btn primary"
                        onClick={handleCreateRundown}
                        disabled={isCreating}
                    >
                        {isCreating ? (
                            <Loader2 className="animate-spin" size={16} />
                        ) : (
                            <Plus size={16} />
                        )}
                        새 큐시트
                    </button>
                </div>
            </div>

            {/* 검색/필터 바 — broadcast 페이지 통일 */}
            <div
                style={{
                    display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
                    padding: "0.875rem 1rem",
                    background: "var(--app-bg-alt)", border: "1px solid var(--border-subtle)",
                    borderRadius: "8px", marginBottom: "1rem",
                }}
            >
                {/* 텍스트 검색 */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    padding: "0.375rem 0.75rem", background: "var(--app-bg-muted)",
                    borderRadius: "6px", flex: 1, minWidth: "200px", maxWidth: "320px",
                }}>
                    <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="큐시트 제목, 설명 검색..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        style={{
                            background: "transparent", border: "none", outline: "none",
                            color: "var(--text-primary)", fontSize: "0.8125rem", width: "100%",
                        }}
                    />
                    {globalFilter && (
                        <button type="button" onClick={() => setGlobalFilter("")}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-tertiary)" }}>
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* 공개/비공개 필터 */}
                <select
                    value={visibilityFilter}
                    onChange={(e) => setVisibilityFilter(e.target.value as "all" | "public" | "private")}
                    style={{
                        padding: "0.375rem 0.75rem", fontSize: "0.8125rem",
                        background: "var(--app-bg-muted)", border: "1px solid var(--border-subtle)",
                        borderRadius: "6px", color: "var(--text-primary)", cursor: "pointer",
                    }}
                >
                    <option value="all">전체 상태</option>
                    <option value="public">🌐 공개</option>
                    <option value="private">🔒 비공개</option>
                </select>

                {/* 날짜 범위 */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <Calendar size={14} style={{ color: "var(--text-tertiary)" }} />
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        style={{
                            padding: "0.375rem 0.5rem", fontSize: "0.75rem",
                            background: "var(--app-bg-muted)", border: "1px solid var(--border-subtle)",
                            borderRadius: "6px", color: "var(--text-primary)",
                        }}
                    />
                    <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>~</span>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        style={{
                            padding: "0.375rem 0.5rem", fontSize: "0.75rem",
                            background: "var(--app-bg-muted)", border: "1px solid var(--border-subtle)",
                            borderRadius: "6px", color: "var(--text-primary)",
                        }}
                    />
                </div>

                {/* 결과 수 */}
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginLeft: "auto" }}>
                    총 {filteredData.length}개
                </span>
            </div>

            {/* TanStack Table */}
            {data.length === 0 ? (
                <div className="dash-empty-state">
                    <div className="dash-empty-icon">
                        <List size={48} />
                    </div>
                    <div className="dash-empty-title">생성된 큐시트가 없습니다</div>
                    <div className="dash-empty-desc">
                        새로운 큐시트를 생성하여 방송 순서를 구성해보세요.
                    </div>
                    <button
                        className="dash-btn primary"
                        onClick={handleCreateRundown}
                        disabled={isCreating}
                    >
                        <Plus size={16} /> 큐시트 생성하기
                    </button>
                </div>
            ) : (
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="hover:bg-white/5 transition-colors">
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* 페이지네이션 */}
                    {table.getPageCount() > 1 && (
                        <div className="table-pagination">
                            <span className="text-sm text-secondary">
                                Page {table.getState().pagination.pageIndex + 1} of{" "}
                                {table.getPageCount()}
                            </span>
                            <button
                                className="pagination-btn"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                className="pagination-btn"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/**
 * Graphics Gallery Component
 * 그래픽 갤러리 (TanStack Table)
 */


import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    ColumnDef,
} from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import {
    Palette,
    Plus,
    Search,
    Calendar,
    MoreVertical,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

// 그래픽 타입 정의
interface Graphic {
    id: string;
    name: string;
    description: string | null;
    template_data: Record<string, unknown>;
    thumbnail_path: string | null;
    created_at: string;
    updated_at: string;
    owner_id: string;
}

export function GraphicsGallery() {
    const [globalFilter, setGlobalFilter] = useState("");

    // Supabase에서 그래픽 목록 가져오기
    const { data: graphics = [], isLoading, error } = useQuery({
        queryKey: ["graphics"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("graphics")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as Graphic[];
        },
    });

    // TanStack Table 컬럼 정의
    const columns = useMemo<ColumnDef<Graphic>[]>(
        () => [
            {
                accessorKey: "name",
                header: "이름",
                cell: (info) => info.getValue(),
            },
            {
                accessorKey: "created_at",
                header: "생성일",
                cell: (info) =>
                    new Date(info.getValue() as string).toLocaleDateString("ko-KR"),
            },
        ],
        [],
    );

    // TanStack Table 초기화
    const table = useReactTable({
        data: graphics,
        columns,
        state: {
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: {
                pageSize: 12,
            },
        },
    });

    if (isLoading) {
        return (
            <div className="graphics-loading">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="graphic-card-skeleton" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-state">
                오류가 발생했습니다: {(error as Error).message}
            </div>
        );
    }

    const filteredRows = table.getRowModel().rows;
    const pageCount = table.getPageCount();
    const currentPage = table.getState().pagination.pageIndex;

    return (
        <>
            {/* 검색 바 */}
            <div className="graphics-search-bar">
                <div className="search-input-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="그래픽 검색..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                    />
                </div>
                <div className="search-meta">{filteredRows.length}개 결과</div>
            </div>

            {/* 빈 상태 */}
            {graphics.length === 0 && (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Palette size={48} />
                        </div>
                        <h3 className="empty-state-title">그래픽이 없습니다</h3>
                        <p className="empty-state-description">
                            새 그래픽을 만들어 방송에 사용하세요
                        </p>
                        <Button>
                            <Plus size={18} />처음 그래픽 만들기
                        </Button>
                    </div>
                </div>
            )}

            {/* 검색 결과 없음 */}
            {graphics.length > 0 && filteredRows.length === 0 && (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Search size={48} />
                        </div>
                        <h3 className="empty-state-title">검색 결과가 없습니다</h3>
                        <p className="empty-state-description">다른 검색어로 시도해보세요</p>
                    </div>
                </div>
            )}

            {/* 그래픽 그리드 */}
            {filteredRows.length > 0 && (
                <>
                    <div className="graphics-grid">
                        {filteredRows.map((row) => {
                            const graphic = row.original;
                            return <GraphicCard key={graphic.id} graphic={graphic} />;
                        })}
                    </div>

                    {/* 페이지네이션 */}
                    {pageCount > 1 && (
                        <div className="pagination">
                            <button
                                type="button"
                                className="pagination-btn"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                            >
                                <ChevronLeft size={18} />
                                이전
                            </button>
                            <div className="pagination-info">
                                페이지 {currentPage + 1} / {pageCount}
                            </div>
                            <button
                                type="button"
                                className="pagination-btn"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                            >
                                다음
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

// 그래픽 카드 컴포넌트
function GraphicCard({ graphic }: { graphic: Graphic }) {
    const [showMenu, setShowMenu] = useState(false);

    const handleDelete = async () => {
        if (!confirm(`"${graphic.name}" 그래픽을 삭제하시겠습니까?`)) return;

        const { error } = await supabase
            .from("graphics")
            .delete()
            .eq("id", graphic.id);

        if (error) {
            alert("삭제 중 오류가 발생했습니다");
        } else {
            window.location.reload();
        }
    };

    return (
        <div className="graphic-card">
            {/* 썸네일 */}
            <div className="graphic-thumbnail">
                {graphic.thumbnail_path ? (
                    <img
                        src={graphic.thumbnail_path}
                        alt={graphic.name}
                        className="graphic-thumbnail-img"
                    />
                ) : (
                    <div className="graphic-thumbnail-placeholder">
                        <Palette size={32} />
                    </div>
                )}
            </div>

            {/* 카드 내용 */}
            <div className="graphic-card-body">
                <div className="graphic-card-header">
                    <h3 className="graphic-card-title">{graphic.name}</h3>
                    <div className="graphic-card-menu-wrapper">
                        <button
                            type="button"
                            className="graphic-card-menu-btn"
                            onClick={() => setShowMenu(!showMenu)}
                        >
                            <MoreVertical size={16} />
                        </button>
                        {showMenu && (
                            <div className="graphic-card-menu">
                                <button type="button" className="graphic-card-menu-item">
                                    <Pencil size={14} />
                                    편집
                                </button>
                                <button
                                    type="button"
                                    className="graphic-card-menu-item danger"
                                    onClick={handleDelete}
                                >
                                    <Trash2 size={14} />
                                    삭제
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {graphic.description && (
                    <p className="graphic-card-description">{graphic.description}</p>
                )}

                <div className="graphic-card-meta">
                    <Calendar size={12} />
                    <span>{new Date(graphic.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
            </div>
        </div>
    );
}

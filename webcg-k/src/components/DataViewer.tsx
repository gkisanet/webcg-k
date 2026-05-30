/**
 * DataViewer — 엑셀 테이블 형태의 데이터 소스 뷰어
 *
 * ■ Why TanStack Table?
 *   이미 프로젝트 의존성에 존재(@tanstack/react-table ^8.21.3).
 *   번들 크기 추가 0, 정렬/필터/페이지네이션 내장.
 *   AG-Grid(~300KB)는 오버스펙.
 *
 * ■ 비유: "엑셀 시트에서 데이터를 한눈에 보되,
 *   각 행의 CG 매핑 상태까지 색상으로 표시하는 스프레드시트"
 *
 * 기능:
 *   - 정렬 가능한 컬럼 헤더
 *   - 행별 CG 매핑 상태 배지 (✅/🟡/🔴)
 *   - 셀 클릭 → 큐시트 상세 페이지의 해당 아이템으로 이동
 *   - 검색/필터 바
 *   - 반응형 (가로 스크롤)
 */

import { useState, useMemo } from "react";
import {
	useReactTable,
	getCoreRowModel,
	getSortedRowModel,
	getFilteredRowModel,
	flexRender,
	type ColumnDef,
	type SortingState,
} from "@tanstack/react-table";
import {
	ArrowUpDown,
	Search,
	Download,
	RefreshCw,
	CheckCircle2,
	AlertTriangle,
	XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
	CuesheetDataSource,
	DataSourceRow,
	ColumnSchema,
} from "@/services/cuesheetDataSourceService";

// ─── 타입 ─────────────────────────────────────────────────────

export interface DataViewerProps {
	/** 데이터 소스 객체 */
	dataSource: CuesheetDataSource;
	/** 행 클릭 시 콜백 (큐시트 아이템 이동) */
	onRowClick?: (row: DataSourceRow) => void;
	/** 동기화 버튼 클릭 */
	onSync?: () => void;
	/** 동기화 중 여부 */
	syncing?: boolean;
	/** 행별 매핑 상태 (source_row_id → status) */
	mappingStatusMap?: Map<string, "full" | "partial" | "unmapped" | "pending">;
	/** 접이식 모드 여부 */
	collapsible?: boolean;
}

// 매핑 상태별 아이콘/색상
const MAPPING_STATUS = {
	full: { icon: <CheckCircle2 size={13} />, color: "#10b981", label: "완전 매핑" },
	partial: { icon: <AlertTriangle size={13} />, color: "#f59e0b", label: "부분 매핑" },
	unmapped: { icon: <XCircle size={13} />, color: "#ef4444", label: "미매핑" },
	pending: { icon: null, color: "#6b7280", label: "대기" },
};

// ─── 컴포넌트 ─────────────────────────────────────────────────

export function DataViewer({
	dataSource,
	onRowClick,
	onSync,
	syncing = false,
	mappingStatusMap,
	collapsible = false,
}: DataViewerProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [collapsed, setCollapsed] = useState(collapsible);

	// 컬럼 정의를 데이터소스의 column_schema에서 동적 생성
	const columns = useMemo<ColumnDef<DataSourceRow>[]>(() => {
		const schema: ColumnSchema[] = dataSource.column_schema || [];

		// 1. 행 번호 + 매핑 상태 컬럼
		const statusCol: ColumnDef<DataSourceRow> = {
			id: "_status",
			header: "#",
			size: 60,
			cell: ({ row }) => {
				const rowId = String(row.original._row_id || "");
				const status = mappingStatusMap?.get(rowId) || "pending";
				const meta = MAPPING_STATUS[status];
				return (
					<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 16, textAlign: "right" }}>
							{row.index + 1}
						</span>
						{meta.icon && (
							<span style={{ color: meta.color }} title={meta.label}>
								{meta.icon}
							</span>
						)}
					</div>
				);
			},
		};

		// 2. 데이터 컬럼 (column_schema 기반)
		const dataCols: ColumnDef<DataSourceRow>[] = schema.map((col) => ({
			id: col.key,
			accessorFn: (row: DataSourceRow) => row[col.key],
			header: ({ column }) => (
				<button
					type="button"
					onClick={() => column.toggleSorting()}
					style={{
						display: "flex", alignItems: "center", gap: 4,
						background: "transparent", border: "none", cursor: "pointer",
						color: "inherit", fontWeight: 700, fontSize: 11,
						padding: 0,
					}}
				>
					{col.label}
					<ArrowUpDown size={10} style={{ opacity: 0.4 }} />
				</button>
			),
			cell: ({ getValue }) => {
				const val = getValue();
				if (val === null || val === undefined) return <span style={{ color: "var(--text-tertiary)" }}>-</span>;
				if (typeof val === "object") return <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>{JSON.stringify(val).substring(0, 60)}...</span>;
				return <span style={{ fontSize: 12 }}>{String(val)}</span>;
			},
		}));

		return [statusCol, ...dataCols];
	}, [dataSource.column_schema, mappingStatusMap]);

	// TanStack Table 인스턴스
	const table = useReactTable({
		data: dataSource.raw_data || [],
		columns,
		state: { sorting, globalFilter },
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	// 마지막 동기화 시각 포맷
	const lastSynced = dataSource.last_synced_at
		? new Date(dataSource.last_synced_at).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })
		: "없음";

	// CSV 내보내기
	const handleExport = () => {
		const schema: ColumnSchema[] = dataSource.column_schema || [];
		const headers = schema.map((c) => c.label).join(",");
		const rows = (dataSource.raw_data || []).map((row) =>
			schema.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
		);
		const csv = [headers, ...rows].join("\n");
		const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${dataSource.name}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="dataviewer-container" style={{
			border: "1px solid var(--border-default)",
			borderRadius: 10,
			background: "var(--app-bg-secondary)",
			overflow: "hidden",
			display: "flex",
			flexDirection: "column",
		}}>
			{/* ─── 헤더 바 ─── */}
			<div style={{
				padding: "10px 14px",
				borderBottom: "1px solid var(--border-default)",
				display: "flex", alignItems: "center", gap: 8,
				flexShrink: 0,
			}}>
				{/* 접기/펴기 토글 */}
				{collapsible && (
					<button
						type="button"
						onClick={() => setCollapsed(!collapsed)}
						style={{
							background: "transparent", border: "none", cursor: "pointer",
							color: "var(--text-secondary)", fontSize: 12, padding: 0,
						}}
					>
						{collapsed ? "▶" : "▼"}
					</button>
				)}

				<div style={{ flex: 1 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<span style={{ fontWeight: 700, fontSize: 13 }}>
							📊 {dataSource.name}
						</span>
						<span style={{
							fontSize: 9, padding: "1px 6px", borderRadius: 4,
							fontWeight: 600,
							background: dataSource.source_type === "nrcs"
								? "rgba(59, 130, 246, 0.15)"
								: "rgba(16, 185, 129, 0.15)",
							color: dataSource.source_type === "nrcs" ? "#60a5fa" : "#34d399",
						}}>
							{dataSource.source_type === "nrcs" ? "📡 NRCS" : "📄 CSV"}
						</span>
						<span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
							{dataSource.row_count}행
						</span>
					</div>
					<div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
						마지막 동기화: {lastSynced}
					</div>
				</div>

				{/* 액션 버튼들 */}
				<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
					{onSync && (
						<Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}
							style={{ fontSize: 10, gap: 4, padding: "4px 8px", height: "auto" }}
						>
							<RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
							{syncing ? "동기화 중..." : "동기화"}
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={handleExport}
						style={{ fontSize: 10, gap: 4, padding: "4px 8px", height: "auto" }}
					>
						<Download size={11} /> 내보내기
					</Button>
				</div>
			</div>

			{/* ─── 검색 바 ─── */}
			{!collapsed && (
				<div style={{
					padding: "8px 14px",
					borderBottom: "1px solid var(--border-default)",
					flexShrink: 0,
				}}>
					<div style={{ position: "relative" }}>
						<Search size={13} style={{
							position: "absolute", left: 8, top: "50%",
							transform: "translateY(-50%)", color: "var(--text-tertiary)",
						}} />
						<Input
							placeholder="검색..."
							value={globalFilter}
							onChange={(e) => setGlobalFilter(e.target.value)}
							style={{ paddingLeft: 28, fontSize: 12, height: 30 }}
						/>
					</div>
				</div>
			)}

			{/* ─── 테이블 본체 ─── */}
			{!collapsed && (
				<div style={{ flex: 1, overflow: "auto" }}>
					<table style={{
						width: "100%",
						borderCollapse: "collapse",
						fontSize: 12,
					}}>
						<thead>
							{table.getHeaderGroups().map((headerGroup) => (
								<tr key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											style={{
												padding: "8px 10px",
												textAlign: "left",
												borderBottom: "2px solid var(--border-default)",
												background: "var(--app-bg-muted)",
												position: "sticky",
												top: 0,
												zIndex: 1,
												fontSize: 11,
												fontWeight: 700,
												color: "var(--text-secondary)",
												whiteSpace: "nowrap",
												width: header.getSize(),
											}}
										>
											{header.isPlaceholder
												? null
												: flexRender(header.column.columnDef.header, header.getContext())}
										</th>
									))}
								</tr>
							))}
						</thead>
						<tbody>
							{table.getRowModel().rows.length === 0 ? (
								<tr>
									<td
										colSpan={columns.length}
										style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}
									>
										{globalFilter ? "검색 결과가 없습니다" : "데이터가 없습니다"}
									</td>
								</tr>
							) : (
								table.getRowModel().rows.map((row) => (
									<tr
										key={row.id}
										onClick={() => onRowClick?.(row.original)}
										style={{
											cursor: onRowClick ? "pointer" : "default",
											transition: "background 0.1s ease",
										}}
										onMouseEnter={(e) => {
											(e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
										}}
										onMouseLeave={(e) => {
											(e.currentTarget as HTMLElement).style.background = "transparent";
										}}
									>
										{row.getVisibleCells().map((cell) => (
											<td
												key={cell.id}
												style={{
													padding: "6px 10px",
													borderBottom: "1px solid var(--border-default)",
													maxWidth: 250,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
											>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</td>
										))}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}

			{/* ─── 하단 상태 바 ─── */}
			{!collapsed && (
				<div style={{
					padding: "6px 14px",
					borderTop: "1px solid var(--border-default)",
					display: "flex", justifyContent: "space-between",
					fontSize: 10, color: "var(--text-tertiary)",
					flexShrink: 0,
				}}>
					<span>
						{table.getFilteredRowModel().rows.length}
						{globalFilter ? ` / ${dataSource.row_count}` : ""} 행
					</span>
					{mappingStatusMap && (
						<div style={{ display: "flex", gap: 8 }}>
							<span style={{ color: "#10b981" }}>
								✅ {[...mappingStatusMap.values()].filter(v => v === "full").length}
							</span>
							<span style={{ color: "#f59e0b" }}>
								🟡 {[...mappingStatusMap.values()].filter(v => v === "partial").length}
							</span>
							<span style={{ color: "#ef4444" }}>
								🔴 {[...mappingStatusMap.values()].filter(v => v === "unmapped").length}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

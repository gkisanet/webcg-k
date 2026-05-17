import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../../lib/supabase";
import { GridTemplateRow } from "../../../../lib/gridTypes";
import {
	Plus,
	Grid3x3,
	Search,
	Calendar,
	ArrowUpDown,
	Pencil,
	GitFork,
	X,
	Trash2,
} from "lucide-react";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../../../lib/auth";
import "../../dashboard-common.css";

export const Route = createLazyFileRoute("/dashboard/studio/grid-templates/")({
	component: GridTemplatesPage,
});

const columnHelper = createColumnHelper<GridTemplateRow>();

function GridTemplatesPage() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [globalFilter, setGlobalFilter] = useState("");
	const [forking, setForking] = useState(false);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [selectedItem, setSelectedItem] = useState<GridTemplateRow | null>(null);
	const queryClient = useQueryClient();

    const updateTemplateMutation = useMutation({
		mutationFn: async (vars: { id: string; description?: string; is_public?: boolean }) => {
			const { error } = await supabase.from("grid_templates").update(vars).eq("id", vars.id);
			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["gridTemplates"] });
		},
	});

	// Fork 핸들러
	const handleFork = async (item: GridTemplateRow) => {
		if (!user) {
			alert("로그인이 필요합니다");
			return;
		}
		setForking(true);
		try {
			const { data, error } = await supabase
				.from("grid_templates")
				.insert({
					name: `${item.name} (복제)`,
					description: item.description,
					owner_id: user.id,
					template_data: item.template_data,
					forked_from: item.id,
				} as any)
				.select()
				.single();

			if (error) throw error;
			navigate({
				to: "/dashboard/studio/graphics/grid-templates/$templateId",
				params: { templateId: (data as any).id },
			});
		} catch (error) {
			console.error("Fork 실패:", error);
			alert("Fork에 실패했습니다");
			setForking(false);
		}
	};

	// 그리드 템플릿 목록 가져오기
	const { data: templates = [], isLoading } = useQuery({
		queryKey: ["gridTemplates"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("grid_templates")
				.select("*")
				.order("created_at", { ascending: false });
			if (error) throw error;
			return data as unknown as GridTemplateRow[];
		},
	});

	// 삭제 핸들러
	const handleDelete = async (item: GridTemplateRow) => {
		if (!confirm(`"${item.name}"을(를) 삭제하시겠습니까?`)) return;
		const { error } = await supabase.from("grid_templates").delete().eq("id", item.id);
		if (error) {
			alert("삭제 중 오류가 발생했습니다.");
		} else {
			queryClient.invalidateQueries({ queryKey: ["gridTemplates"] });
		}
	};

	const columns = useMemo(
		() => [
			columnHelper.accessor("name", {
				header: ({ column }) => (
					<button
						type="button"
						className="column-header-btn"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						이름
						<ArrowUpDown size={14} />
					</button>
				),
				cell: (info) => (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Grid3x3 size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
						<span className="item-name">{info.getValue()}</span>
					</div>
				),
			}),
			columnHelper.accessor("description", {
				header: "설명",
				cell: (info) => (
					<span className="item-description">
						{info.getValue() || "-"}
					</span>
				),
			}),
			columnHelper.display({
				id: "owner",
				header: "소유자",
				cell: ({ row }) => {
					const isOwner = row.original.owner_id === user?.id;
					return (
						<span className={`owner-badge ${isOwner ? "mine" : "other"}`}>
							{isOwner ? "나" : "공개"}
						</span>
					);
				},
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
			columnHelper.display({
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const item = row.original;
					const isOwner = item.owner_id === user?.id;
					return isOwner ? (
						<Button variant="ghost" size="sm" asChild>
							<Link
								to="/dashboard/studio/graphics/grid-templates/$templateId"
								params={{ templateId: item.id }}
								onClick={(e) => e.stopPropagation()}
							>
								<Pencil size={14} />
							</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							onClick={(e) => {
								e.stopPropagation();
								handleFork(item);
							}}
							disabled={forking}
						>
							<GitFork size={14} />
						</Button>
					);
				},
			}),
		],
		[user?.id, forking],
	);

	const table = useReactTable({
		data: templates,
		columns,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: 15 },
		},
	});

	return (
		<>
            {/* 페이지 헤더 */}
            <div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<Grid3x3 size={18} />
						</div>
						그리드 템플릿
					</div>
					<div className="dash-page-subtitle">
						그래픽 요소가 배치될 기준이 되는 그리드 템플릿을 생성하고 관리합니다.
					</div>
				</div>
				<div className="dash-page-actions">
					<Link to="/dashboard/studio/graphics/grid-templates/new">
						<button className="dash-btn primary">
							<Plus size={16} /> 새 템플릿
						</button>
					</Link>
				</div>
			</div>

			{/* 필터 바 */}
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
						placeholder="템플릿 검색..."
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

				{/* Action button moved to header */}
			</div>

			{/* 메인 콘텐츠: 테이블 + 미리보기 스플릿 뷰 */}
			<div className="graphics-split-view">
			{/* 테이블 렌더링 */}
			<div className="graphics-table-panel" style={{ minHeight: "60vh" }}>
				{isLoading && (
					<div className="graphics-loading-state">
						<div className="loading-spinner" />
						<span>로딩 중...</span>
					</div>
				)}

				{!isLoading && templates.length === 0 && (
					<div className="graphics-empty-state">
						<div className="empty-icon">
							<Grid3x3 size={48} />
						</div>
						<h3>템플릿이 없습니다</h3>
						<p>새로운 레이아웃 템플릿을 생성해보세요.</p>
					</div>
				)}

				{!isLoading && templates.length > 0 && (
					<div className="graphics-table-container">
						<table className="graphics-table">
							<thead>
								{table.getHeaderGroups().map((headerGroup) => (
									<tr key={headerGroup.id}>
										{headerGroup.headers.map((header) => (
											<th key={header.id}>
												{flexRender(header.column.columnDef.header, header.getContext())}
											</th>
										))}
									</tr>
								))}
							</thead>
							<tbody>
								{table.getRowModel().rows.map((row) => (
									<tr key={row.id} onClick={() => setSelectedItem(row.original)} className={selectedItem?.id === row.original.id ? "selected-row" : ""}>
										{row.getVisibleCells().map((cell) => (
											<td key={cell.id}>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* 오른쪽: 미리보기 패널 */}
			<div className="graphics-preview-panel">
				{selectedItem ? (
					<>
						{/* 미리보기 썸네일 */}
						<div className="preview-thumbnail">
							<div className="grid-preview-container">
								<span className="preview-label">PREVIEW</span>
								{(() => {
									const td = selectedItem.template_data as any;
									const rawZones: any[] = td?.zones || [];
									const cw = td?.canvas?.width || 1920;
									const ch = td?.canvas?.height || 1080;

									const zones = rawZones.length > 0
										? rawZones
											.filter((z: any) =>
												(z.bounds && typeof z.bounds.x === "number") ||
												(typeof z.x === "number" && typeof z.width === "number")
											)
											.map((z: any) => {
												if (z.bounds && typeof z.bounds.x === "number") {
													return {
														id: z.id,
														name: z.name || "",
														type: z.type || "",
														x: (z.bounds.x / cw) * 100,
														y: (z.bounds.y / ch) * 100,
														width: (z.bounds.width / cw) * 100,
														height: (z.bounds.height / ch) * 100,
													};
												}
												return {
													id: z.id,
													name: z.name || "",
													type: z.type || "",
													x: z.x,
													y: z.y,
													width: z.width,
													height: z.height,
												};
											})
										: [];

									if (zones.length > 0) {
										return (
											<div className="grid-preview-canvas">
												{zones.map((z: any, idx: number) => (
													<div
														key={z.id || idx}
														className="grid-preview-zone"
														style={{
															left: `${z.x}%`,
															top: `${z.y}%`,
															width: `${z.width}%`,
															height: `${z.height}%`,
														}}
													>
														{z.name || idx + 1}
													</div>
												))}
											</div>
										);
									}
									return (
										<div className="preview-empty-zones">
											<Grid3x3 size={48} />
											<span>영역 없음</span>
										</div>
									);
								})()}
							</div>
						</div>

						{/* 상세 정보 */}
						<div className="preview-details">
							<h2 className="preview-title">{selectedItem.name}</h2>
							{selectedItem.owner_id === user?.id ? (
								<div className="template-settings">
									<div className="setting-group">
										<label htmlFor="template-description">설명</label>
										<textarea
											id="template-description"
											className="input-field"
											value={selectedItem.description || ""}
											onChange={(e) => {
												const newDesc = e.target.value;
												setSelectedItem({ ...selectedItem, description: newDesc });
											}}
											onBlur={(e) => {
												updateTemplateMutation.mutate({ id: selectedItem.id, description: e.target.value });
											}}
											placeholder="템플릿 설명을 입력하세요..."
											rows={3}
										/>
									</div>
									<div className="setting-group toggle-group">
										<label htmlFor="template-public">공개 여부</label>
										<button
											id="template-public"
											type="button"
											className={`toggle-btn ${selectedItem.is_public ? "active" : ""}`}
											onClick={() => {
												const newValue = !selectedItem.is_public;
												setSelectedItem({ ...selectedItem, is_public: newValue });
												updateTemplateMutation.mutate({ id: selectedItem.id, is_public: newValue });
											}}
										>
											{selectedItem.is_public ? "🌐 공개" : "🔒 비공개"}
										</button>
									</div>
								</div>
							) : (
								<>
									{selectedItem.description && (
										<p className="preview-description">
											{selectedItem.description}
										</p>
									)}
									<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
										<span>소유자: {selectedItem.owner_id}</span>
									</div>
								</>
							)}
							<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8, display: "flex", gap: 12 }}>
								<span>🗓 {new Date(selectedItem.created_at).toLocaleDateString("ko-KR")}</span>
							</div>

							{/* 액션 버튼 */}
							<div className="preview-actions">
								{selectedItem.owner_id === user?.id ? (
									<>
										<Button asChild>
											<Link
												to="/dashboard/studio/graphics/grid-templates/$templateId"
												params={{ templateId: selectedItem.id }}
											>
												<Pencil size={16} />
												편집
											</Link>
										</Button>
										<Button
											variant="destructive"
											onClick={() => handleDelete(selectedItem)}
										>
											<Trash2 size={16} />
											삭제
										</Button>
									</>
								) : (
									<Button
										variant="outline"
										onClick={() => handleFork(selectedItem)}
										disabled={forking}
									>
										<GitFork size={16} />
										복제하여 사용하기
									</Button>
								)}
							</div>
						</div>
					</>
				) : (
					<div className="preview-placeholder">
						<Grid3x3 size={64} />
						<p>항목을 선택하면 미리보기가 표시됩니다.</p>
					</div>
				)}
			</div>
			</div>
		</>
	);
}

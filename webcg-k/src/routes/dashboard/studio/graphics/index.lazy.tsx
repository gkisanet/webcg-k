/**
 * Graphics Page
 * 그래픽 갤러리 + 그래픽 번들 + 그리드 템플릿 통합 페이지
 * 왼쪽: TanStack Table, 오른쪽: 미리보기 패널
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
	ArrowUpDown,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Eye,
	GitFork,
	Grid3x3,
	Layers,
	Package,
	Palette,
	Pencil,
	Plus,
	Settings2,
	Sparkles,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { NamingSearchBox } from "@/components/NamingSearchBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	assetMatchesNamingQuery,
	type NamingAssetKind,
} from "@/lib/naming/namingSuggestion";
import { VisibilityToggle } from "../../../../components/Common/VisibilityToggle";
import { OverlayCreationWizard } from "../../../../components/Overlay/OverlayCreationWizard";
import { useAuth } from "../../../../lib/auth";
import type { GridTemplateRow } from "../../../../lib/gridTypes";
import type { CgVariation, ZoneBounds } from "../../../../lib/overlayTypes";
import { supabase } from "../../../../lib/supabase";
import {
	createBundle,
	deleteBundle,
	fetchBundles,
} from "../../../../services/bundleService";
import {
	cloneGraphic,
	createGraphic,
	deleteGraphic,
	fetchGraphics,
	saveAiVariation,
	updateGraphic,
	updateGraphicVisibility,
} from "../../../../services/graphicService";
import {
	cloneGridTemplate,
	deleteGridTemplate,
	fetchGridTemplates,
	updateGridTemplate,
	updateGridTemplateVisibility,
} from "../../../../services/gridTemplateService";
import type {
	BundleListItem,
	Graphic,
	ListItem,
	ViewMode,
} from "./-graphicsTypes";
import { GraphicPreview } from "./-graphicsTypes";
import "../../dashboard-common.css";

export const Route = createLazyFileRoute("/dashboard/studio/graphics/")({
	component: GraphicsPage,
});

// 타입은 graphicsTypes.ts에서 import

// GraphicPreview는 graphicsTypes.ts에서 import

// 그래픽/그리드 전용 columnHelper
const columnHelper = createColumnHelper<ListItem>();
// 번들 전용 columnHelper
const bundleColumnHelper = createColumnHelper<BundleListItem>();

function formatPanelDate(value: string) {
	return new Date(value).toLocaleDateString("ko-KR");
}

function getVisibilityLabel(visibility?: "private" | "workspace" | "public") {
	if (visibility === "private") return "비공개";
	if (visibility === "public") return "전체 공개";
	return "팀 공유";
}

function GraphicsPage() {
	const navigate = useNavigate();
	const { user, activeWorkspaceId } = useAuth();
	const [viewMode] = useState<ViewMode>("gallery");
	const [globalFilter, setGlobalFilter] = useState("");
	const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
	// 번들 선택 상태 (별도 관리 — 타입이 다름)
	const [selectedBundle, setSelectedBundle] = useState<BundleListItem | null>(
		null,
	);
	const [forking, setForking] = useState(false);
	const [creating, setCreating] = useState(false);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const queryClient = useQueryClient();

	// 번들 생성 모달 상태
	const [showGraphicCreateModal, setShowGraphicCreateModal] = useState(false);
	const [graphicFormName, setGraphicFormName] = useState("");
	const [showBundleModal, setShowBundleModal] = useState(false);
	const [bundleFormName, setBundleFormName] = useState("");
	const [bundleFormDesc, setBundleFormDesc] = useState("");
	const [bundleFormProgram, setBundleFormProgram] = useState("");

	// AI 그래픽 생성 위자드 모달
	const [showAiWizard, setShowAiWizard] = useState(false);

	// 새 그래픽 생성
	const handleCreateGraphic = async () => {
		if (!user || creating || !graphicFormName.trim()) return;
		setCreating(true);

		try {
			const data = await createGraphic({
				name: graphicFormName.trim(),
				owner_id: user.id,
				template_data: { elements: [], canvas: { width: 1920, height: 1080 } },
				workspace_id: activeWorkspaceId,
			});
			queryClient.invalidateQueries({ queryKey: ["graphics"] });
			setShowGraphicCreateModal(false);
			setGraphicFormName("");
			navigate({
				to: "/dashboard/studio/graphics/$graphicId",
				params: { graphicId: data.id },
			});
		} catch (error) {
			console.error("생성 실패:", error);
			alert("그래픽 생성에 실패했습니다");
			setCreating(false);
		}
	};

	// ─── AI 생성 결과를 graphics 테이블에 저장 ────────────────
	// ■ Why graphics 테이블? AI가 생성한 GraphicElement[]를 그래픽 에디터에서
	//   재편집할 수 있도록, 오버레이(overlay_templates) 대신
	//   그래픽(graphics) 테이블에 저장하여 그래픽 에디터 워크플로우에 통합.
	const handleAiSaveVariation = async (
		variation: CgVariation,
		meta: { gridId?: string; zoneBounds?: ZoneBounds; prompt: string },
	) => {
		if (!user) throw new Error("인증 필요");

		const data = await saveAiVariation(
			variation,
			{ gridId: meta.gridId, zoneBounds: meta.zoneBounds },
			user.id,
			activeWorkspaceId,
		);

		queryClient.invalidateQueries({ queryKey: ["graphics"] });
		navigate({
			to: "/dashboard/studio/graphics/$graphicId",
			params: { graphicId: data.id },
		});
	};

	// Fork 핸들러 (그리드 템플릿)
	const handleFork = async (item: GridTemplateRow & { _type: ViewMode }) => {
		if (!user) {
			alert("로그인이 필요합니다");
			return;
		}
		setForking(true);
		try {
			const data = await cloneGridTemplate(item, user.id);
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

	// 그래픽 Fork 핸들러
	const handleForkGraphic = async (item: Graphic & { _type: ViewMode }) => {
		if (!user) {
			alert("로그인이 필요합니다");
			return;
		}
		setForking(true);
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = await cloneGraphic(
				{
					name: item.name,
					description: item.description,
					template_data: item.template_data,
				},
				user.id,
				activeWorkspaceId,
			);

			queryClient.invalidateQueries({ queryKey: ["graphics"] });
			navigate({
				to: "/dashboard/studio/graphics/$graphicId",
				params: { graphicId: data.id },
			});
		} catch (error) {
			console.error("Fork 실패:", error);
			alert("Fork에 실패했습니다");
			setForking(false);
		}
	};

	// 번들 생성 핸들러
	const handleCreateBundle = async () => {
		if (!bundleFormName.trim()) return;
		try {
			await createBundle({
				name: bundleFormName.trim(),
				description: bundleFormDesc.trim() || undefined,
				program_name: bundleFormProgram.trim() || undefined,
			});
			setShowBundleModal(false);
			setBundleFormName("");
			setBundleFormDesc("");
			setBundleFormProgram("");
			queryClient.invalidateQueries({ queryKey: ["bundles"] });
		} catch (err) {
			console.error("번들 생성 실패:", err);
			alert("번들 생성에 실패했습니다.");
		}
	};

	// 번들 삭제 핸들러
	const handleDeleteBundle = async (bundleId: string) => {
		if (!confirm("이 번들을 삭제하시겠습니까?")) return;
		try {
			await deleteBundle(bundleId);
			setSelectedBundle(null);
			queryClient.invalidateQueries({ queryKey: ["bundles"] });
		} catch (err) {
			console.error("번들 삭제 실패:", err);
			alert("번들 삭제에 실패했습니다.");
		}
	};

	// 그래픽 목록 가져오기
	// 큐시트에서 사용 중인 오버레이 ID Set (한 번에 조회)
	const { data: usedOverlayIds = [] } = useQuery({
		queryKey: ["rundownUsedOverlayIds"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("rundown_items")
				.select("source_id")
				.not("source_id", "is", null);
			if (error) throw error;
			return (data || []).map((r: any) => r.source_id as string);
		},
		staleTime: 30_000,
	});
	const usedIdSet = new Set(usedOverlayIds);

	const { data: graphics = [], isLoading: graphicsLoading } = useQuery({
		queryKey: ["graphics"],
		queryFn: async () => {
			const data = await fetchGraphics();
			return (data as Graphic[]).map((g) => ({
				...g,
				_type: "gallery" as const,
			}));
		},
	});

	// 그리드 템플릿 목록 가져오기
	const { data: templates = [], isLoading: templatesLoading } = useQuery({
		queryKey: ["gridTemplates"],
		queryFn: async () => {
			const data = await fetchGridTemplates();
			return (data as unknown as GridTemplateRow[]).map((t) => ({
				...t,
				_type: "grid-templates" as const,
			}));
		},
	});

	// 번들 목록 가져오기
	const { data: bundles = [], isLoading: bundlesLoading } = useQuery({
		queryKey: ["bundles"],
		queryFn: fetchBundles,
	});

	// 번들 데이터를 BundleListItem 배열로 변환
	const bundleListItems: BundleListItem[] = useMemo(
		() =>
			bundles.map((b) => ({
				id: b.id,
				name: b.name,
				description: b.description,
				program_name: b.program_name,
				slot_count: b.slot_count ?? 0,
				is_default: b.is_default,
				created_at: b.created_at,
				updated_at: b.updated_at,
				owner_id: b.owner_id,
				_type: "bundles" as const,
			})),
		[bundles],
	);

	// 템플릿 업데이트 mutation (이름/설명 등)
	const updateTemplateMutation = useMutation({
		mutationFn: async (updates: {
			id: string;
			description?: string;
			is_public?: boolean;
		}) => {
			await updateGridTemplate(updates.id, {
				description: updates.description,
				is_public: updates.is_public,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["gridTemplates"] });
		},
	});

	const updateTemplateVisibilityMutation = useMutation({
		mutationFn: async (args: {
			id: string;
			visibility: "private" | "workspace" | "public";
		}) => {
			await updateGridTemplateVisibility(args.id, args.visibility);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["gridTemplates"] });
		},
	});

	// 그래픽 업데이트 mutation
	const updateGraphicMutation = useMutation({
		mutationFn: async (updates: {
			id: string;
			description?: string;
			is_public?: boolean;
		}) => {
			await updateGraphic(updates.id, {
				description: updates.description,
				is_public: updates.is_public,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["graphics"] });
		},
	});

	const updateGraphicVisibilityMutation = useMutation({
		mutationFn: async (args: {
			id: string;
			visibility: "private" | "workspace" | "public";
		}) => {
			await updateGraphicVisibility(args.id, args.visibility);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["graphics"] });
		},
	});

	const handleVisibilityToggle = (item: ListItem, nextVis: string) => {
		if (item._type === "grid-templates") {
			updateTemplateVisibilityMutation.mutate({
				id: item.id,
				visibility: nextVis as any,
			});
		} else if (item._type === "gallery") {
			updateGraphicVisibilityMutation.mutate({
				id: item.id,
				visibility: nextVis as any,
			});
		}
	};

	// 현재 뷰 모드에 따른 데이터
	const currentData: ListItem[] =
		viewMode === "grid-templates" ? templates : graphics;
	const isLoading =
		viewMode === "grid-templates"
			? templatesLoading
			: viewMode === "bundles"
				? bundlesLoading
				: graphicsLoading;
	const searchAssetKind: NamingAssetKind =
		viewMode === "grid-templates"
			? "grid_template"
			: viewMode === "bundles"
				? "bundle"
				: "graphic";
	const searchSuggestionNames =
		viewMode === "bundles"
			? bundleListItems.map((item) => item.name)
			: currentData.map((item) => item.name);

	// 그래픽/그리드 컬럼 정의
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
				cell: (info) => <span className="item-name">{info.getValue()}</span>,
			}),
			columnHelper.accessor("description", {
				header: "설명",
				cell: (info) => (
					<span className="item-description">{info.getValue() || "-"}</span>
				),
			}),
			// 공유(가시성) 컬럼
			columnHelper.display({
				id: "visibility",
				header: "공유",
				cell: ({ row }) => {
					const item = row.original;
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const visibility = (item as any).visibility || "workspace";
					const isOwner = (item as any).owner_id === user?.id;

					if (isOwner) {
						return (
							<VisibilityToggle
								visibility={visibility}
								onToggle={(nextVis) => handleVisibilityToggle(item, nextVis)}
								size={16}
							/>
						);
					}

					// 소유자가 아니면 그냥 아이콘만 (클릭 불가)
					return (
						<div style={{ opacity: 0.7, pointerEvents: "none" }}>
							<VisibilityToggle
								visibility={visibility}
								onToggle={() => {}}
								size={16}
							/>
						</div>
					);
				},
			}),
			// 큐시트 사용 여부
			columnHelper.display({
				id: "cuesheet_usage",
				header: "큐시트",
				cell: ({ row }) => {
					if (usedIdSet.has(row.original.id)) {
						return (
							<span
								className="owner-badge mine"
								style={{
									background: "rgba(99,102,241,0.15)",
									color: "#a5b4fc",
								}}
							>
								사용 중
							</span>
						);
					}
					return <span className="item-date text-muted">-</span>;
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
			// 수정일
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
					// 수정된 적이 있으면 표시
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
			// 액션 컬럼 (편집/Fork)
			columnHelper.display({
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const item = row.original;
					if (item._type === "grid-templates") {
						const template = item as GridTemplateRow & { _type: ViewMode };
						const isOwner = template.owner_id === user?.id;
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
									handleFork(template);
								}}
								disabled={forking}
							>
								<GitFork size={14} />
							</Button>
						);
					}
					return null;
				},
			}),
		],
		[user?.id, forking],
	);

	// 번들 전용 컬럼 정의
	const bundleColumns = useMemo(
		() => [
			bundleColumnHelper.accessor("name", {
				header: ({ column }) => (
					<button
						type="button"
						className="column-header-btn"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						번들 이름
						<ArrowUpDown size={14} />
					</button>
				),
				cell: (info) => (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Package
							size={14}
							style={{ color: "var(--accent-primary)", flexShrink: 0 }}
						/>
						<span className="item-name">{info.getValue()}</span>
						{info.row.original.is_default && (
							<span
								style={{
									fontSize: 9,
									background: "var(--accent-primary)",
									color: "#fff",
									padding: "1px 5px",
									borderRadius: 3,
									fontWeight: 700,
								}}
							>
								기본
							</span>
						)}
					</div>
				),
			}),
			bundleColumnHelper.accessor("program_name", {
				header: "프로그램",
				cell: (info) => (
					<span className="item-description">{info.getValue() || "-"}</span>
				),
			}),
			bundleColumnHelper.accessor("slot_count", {
				header: "슬롯",
				cell: (info) => (
					<span
						style={{
							display: "flex",
							alignItems: "center",
							gap: 4,
							fontSize: 12,
						}}
					>
						<Layers size={12} />
						{info.getValue()}개
					</span>
				),
			}),
			bundleColumnHelper.accessor("updated_at", {
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
				cell: (info) => (
					<span className="item-date">
						{new Date(info.getValue()).toLocaleDateString("ko-KR")}
					</span>
				),
			}),
			bundleColumnHelper.display({
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<Button
						variant="ghost"
						size="sm"
						asChild
						onClick={(e: React.MouseEvent) => e.stopPropagation()}
					>
						<Link to={`/dashboard/bundles/${row.original.id}` as any}>
							<Settings2 size={14} />
						</Link>
					</Button>
				),
			}),
		],
		[],
	);

	// 그래픽/그리드 TanStack Table 설정
	const table = useReactTable({
		data: currentData,
		columns,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, filterValue) =>
			assetMatchesNamingQuery(row.original, String(filterValue ?? "")),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: 15 },
		},
	});

	// 번들 TanStack Table 설정
	const bundleTable = useReactTable({
		data: bundleListItems,
		columns: bundleColumns,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, filterValue) =>
			assetMatchesNamingQuery(row.original, String(filterValue ?? "")),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: 15 },
		},
	});

	// 삭제 핸들러 (그래픽/그리드)
	const handleDelete = async (item: ListItem) => {
		if (!confirm(`"${item.name}"을(를) 삭제하시겠습니까?`)) return;

		try {
			if (item._type === "gallery") {
				await deleteGraphic(item.id);
			} else {
				await deleteGridTemplate(item.id);
			}
			setSelectedItem(null);
			queryClient.invalidateQueries({
				queryKey: [item._type === "gallery" ? "graphics" : "gridTemplates"],
			});
		} catch (error) {
			alert("삭제 중 오류가 발생했습니다.");
		}
	};

	return (
		<>
			{/* 페이지 헤더 */}
			<div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<Palette size={18} />
						</div>
						그래픽 갤러리 (SVG)
					</div>
					<div className="dash-page-subtitle">
						방송에 사용될 벡터 그래픽 디자인 에셋을 관리하고 AI로 자동
						생성합니다.
					</div>
				</div>
				<div className="dash-page-actions" style={{ display: "flex", gap: 8 }}>
					<button
						className="dash-btn accent"
						onClick={() => setShowAiWizard(true)}
					>
						<Sparkles size={16} /> AI 그래픽 생성
					</button>
					<button
						className="dash-btn primary"
						onClick={() => setShowGraphicCreateModal(true)}
						disabled={creating}
					>
						<Plus size={16} /> {creating ? "생성 중..." : "새 그래픽"}
					</button>
				</div>
			</div>

			{/* 검색/필터 바 — broadcast 페이지 통일 */}
			<div className="graphics-filter-panel">
				{/* 텍스트 검색 */}
				<NamingSearchBox
					ariaLabel="그래픽 이름 검색"
					assetKind={searchAssetKind}
					existingNames={searchSuggestionNames}
					placeholder="그래픽 검색 또는 좌상단-헤드라인-두글자..."
					value={globalFilter}
					onChange={setGlobalFilter}
				/>

				{/* 날짜 범위 */}
				<div className="graphics-filter-date-range">
					<Calendar size={14} className="graphics-filter-icon" />
					<input
						className="graphics-filter-date"
						type="date"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
					<span className="graphics-filter-separator">~</span>
					<input
						className="graphics-filter-date"
						type="date"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</div>

				{/* Action buttons moved to header */}
			</div>

			{/* 메인 콘텐츠: 테이블 + 미리보기 */}
			<div className="graphics-split-view">
				{/* 왼쪽: 테이블 */}
				<div className="graphics-table-panel">
					{/* 로딩 상태 */}
					{isLoading && (
						<div className="graphics-loading-state">
							<div className="loading-spinner" />
							<span>로딩 중...</span>
						</div>
					)}

					{/* 빈 상태 */}
					{!isLoading &&
						(viewMode === "bundles"
							? bundleListItems.length === 0
							: currentData.length === 0) && (
							<div className="graphics-empty-state">
								<div className="empty-icon">
									{viewMode === "gallery" ? (
										<Palette size={48} />
									) : viewMode === "bundles" ? (
										<Package size={48} />
									) : (
										<Grid3x3 size={48} />
									)}
								</div>
								<h3>
									{viewMode === "gallery"
										? "그래픽이 없습니다"
										: viewMode === "bundles"
											? "번들이 없습니다"
											: "템플릿이 없습니다"}
								</h3>
								<p>
									{viewMode === "bundles"
										? "NRCS와 연동할 CG 세트를 만들어 보세요"
										: "새 항목을 만들어 시작하세요"}
								</p>
							</div>
						)}

					{/* 번들 테이블 */}
					{!isLoading &&
						viewMode === "bundles" &&
						bundleListItems.length > 0 && (
							<>
								<div className="graphics-table-container">
									<table className="graphics-table">
										<thead>
											{bundleTable.getHeaderGroups().map((headerGroup) => (
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
											{bundleTable.getRowModel().rows.map((row) => {
												const isSelected =
													selectedBundle?.id === row.original.id;
												return (
													<tr
														key={row.id}
														className={isSelected ? "selected" : ""}
														onClick={() => {
															setSelectedBundle(row.original);
															setSelectedItem(null);
														}}
													>
														{row.getVisibleCells().map((cell) => (
															<td key={cell.id}>
																{flexRender(
																	cell.column.columnDef.cell,
																	cell.getContext(),
																)}
															</td>
														))}
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>

								{/* 번들 페이지네이션 */}
								{bundleTable.getPageCount() > 1 && (
									<div className="graphics-pagination">
										<span className="pagination-info">
											{bundleTable.getState().pagination.pageIndex + 1} /{" "}
											{bundleTable.getPageCount()} 페이지
										</span>
										<div className="pagination-buttons">
											<button
												type="button"
												className="pagination-btn"
												onClick={() => bundleTable.previousPage()}
												disabled={!bundleTable.getCanPreviousPage()}
											>
												<ChevronLeft size={18} />
											</button>
											<button
												type="button"
												className="pagination-btn"
												onClick={() => bundleTable.nextPage()}
												disabled={!bundleTable.getCanNextPage()}
											>
												<ChevronRight size={18} />
											</button>
										</div>
									</div>
								)}
							</>
						)}

					{/* 그래픽/그리드 테이블 */}
					{!isLoading && viewMode !== "bundles" && currentData.length > 0 && (
						<>
							<div className="graphics-table-container">
								<table className="graphics-table">
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
										{table.getRowModel().rows.map((row) => {
											const isSelected = selectedItem?.id === row.original.id;
											return (
												<tr
													key={row.id}
													className={isSelected ? "selected" : ""}
													onClick={() => {
														setSelectedItem(row.original);
														setSelectedBundle(null);
													}}
												>
													{row.getVisibleCells().map((cell) => (
														<td key={cell.id}>
															{flexRender(
																cell.column.columnDef.cell,
																cell.getContext(),
															)}
														</td>
													))}
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>

							{/* 페이지네이션 */}
							{table.getPageCount() > 1 && (
								<div className="graphics-pagination">
									<span className="pagination-info">
										{table.getState().pagination.pageIndex + 1} /{" "}
										{table.getPageCount()} 페이지
									</span>
									<div className="pagination-buttons">
										<button
											type="button"
											className="pagination-btn"
											onClick={() => table.previousPage()}
											disabled={!table.getCanPreviousPage()}
										>
											<ChevronLeft size={18} />
										</button>
										<button
											type="button"
											className="pagination-btn"
											onClick={() => table.nextPage()}
											disabled={!table.getCanNextPage()}
										>
											<ChevronRight size={18} />
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</div>

				{/* 오른쪽: 미리보기 패널 */}
				<div className="graphics-preview-panel">
					{/* 번들 미리보기 */}
					{viewMode === "bundles" && selectedBundle ? (
						<>
							<div className="preview-thumbnail">
								<div className="preview-placeholder" style={{ gap: 8 }}>
									<Package size={48} style={{ opacity: 0.4 }} />
									<span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
										{selectedBundle.slot_count}개 슬롯
									</span>
								</div>
							</div>
							<div className="preview-details">
								<div className="preview-title-row">
									<h2 className="preview-title">
										<span className="preview-title-main">
											<Package size={15} />
											{selectedBundle.name}
										</span>
									</h2>
									{selectedBundle.is_default && (
										<span className="preview-badge preview-badge-accent">
											기본
										</span>
									)}
								</div>
								{selectedBundle.program_name && (
									<p className="preview-subtitle">
										{selectedBundle.program_name}
									</p>
								)}
								{selectedBundle.description && (
									<p className="preview-description">
										{selectedBundle.description}
									</p>
								)}
								<div className="preview-meta-row">
									<span className="preview-meta-chip">
										생성 {formatPanelDate(selectedBundle.created_at)}
									</span>
									<span className="preview-meta-chip">
										수정 {formatPanelDate(selectedBundle.updated_at)}
									</span>
								</div>

								{/* 액션 버튼 */}
								<div className="preview-actions">
									<Link
										to={`/dashboard/bundles/${selectedBundle.id}` as any}
										className="btn-panel-edit"
									>
										<Pencil size={14} /> 편집
									</Link>
									<button
										type="button"
										className="btn-panel-delete"
										onClick={() => handleDeleteBundle(selectedBundle.id)}
									>
										<Trash2 size={14} /> 삭제
									</button>
								</div>
							</div>
						</>
					) : viewMode !== "bundles" && selectedItem ? (
						<>
							{/* 미리보기 썸네일 */}
							<div className="preview-thumbnail">
								{selectedItem._type === "grid-templates" ? (
									// 그리드 템플릿: 레이아웃 미리보기
									<div className="grid-preview-container">
										<span className="preview-label">PREVIEW</span>
										{(() => {
											const template = selectedItem as GridTemplateRow;
											const td = template.template_data;
											const rawZones: any[] = td?.zones || [];
											const cw = td?.canvas?.width || 1920;
											const ch = td?.canvas?.height || 1080;

											// 두 가지 zone 형태를 모두 퍼센트로 정규화:
											// 1) bounds 기반 (seed 데이터): z.bounds.x 등은 픽셀 값 → 퍼센트 변환
											// 2) flat 기반 (사용자 생성, GridSplitEditor): z.x 등이 이미 0~100 퍼센트
											const zones =
												rawZones.length > 0
													? rawZones
															.filter(
																(z: any) =>
																	(z.bounds &&
																		typeof z.bounds.x === "number") ||
																	(typeof z.x === "number" &&
																		typeof z.width === "number"),
															)
															.map((z: any) => {
																if (
																	z.bounds &&
																	typeof z.bounds.x === "number"
																) {
																	// seed 데이터: 픽셀 → 퍼센트
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
																// 사용자 생성 데이터: 이미 퍼센트 (0~100)
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
								) : selectedItem._type === "gallery" ? (
									// 그래픽: SVG 요소 미리보기
									<GraphicPreview graphic={selectedItem as Graphic} />
								) : selectedItem.thumbnail_path ? (
									<img
										src={selectedItem.thumbnail_path}
										alt={selectedItem.name}
									/>
								) : (
									<div className="preview-placeholder">
										<Palette size={64} />
									</div>
								)}
							</div>

							{/* 상세 정보 */}
							<div className="preview-details">
								<h2 className="preview-title">{selectedItem.name}</h2>
								{/* 내 템플릿일 경우 설명 편집 및 공개 토글 */}
								{selectedItem._type === "grid-templates" &&
								(selectedItem as GridTemplateRow).owner_id === user?.id ? (
									<div className="template-settings">
										<div className="setting-group">
											<label htmlFor="template-description">설명</label>
											<textarea
												id="template-description"
												className="input-field"
												value={selectedItem.description || ""}
												onChange={(e) => {
													const newDesc = e.target.value;
													setSelectedItem({
														...selectedItem,
														description: newDesc,
													});
												}}
												onBlur={(e) => {
													updateTemplateMutation.mutate({
														id: selectedItem.id,
														description: e.target.value,
													});
												}}
												placeholder="템플릿 설명을 입력하세요..."
												rows={3}
											/>
										</div>
										<div className="setting-group toggle-group">
											<label htmlFor="template-public">공개 범위</label>
											<div className="preview-visibility-control">
												<VisibilityToggle
													visibility={
														(selectedItem as any).visibility || "workspace"
													}
													onToggle={(nextVis) => {
														const updatedItem = {
															...selectedItem,
															visibility: nextVis,
														} as any;
														setSelectedItem(updatedItem);
														updateTemplateVisibilityMutation.mutate({
															id: selectedItem.id,
															visibility: nextVis,
														});
													}}
													size={18}
												/>
												<span className="preview-visibility-text">
													{getVisibilityLabel(
														(selectedItem as any).visibility || "workspace",
													)}
												</span>
											</div>
										</div>
									</div>
								) : selectedItem._type === "gallery" &&
									(selectedItem as Graphic).owner_id === user?.id ? (
									<div className="template-settings">
										<div className="setting-group">
											<label htmlFor="graphic-description">설명</label>
											<textarea
												id="graphic-description"
												className="input-field"
												value={selectedItem.description || ""}
												onChange={(e) => {
													const newDesc = e.target.value;
													setSelectedItem({
														...selectedItem,
														description: newDesc,
													});
												}}
												onBlur={(e) => {
													updateGraphicMutation.mutate({
														id: selectedItem.id,
														description: e.target.value,
													});
												}}
												placeholder="그래픽 설명을 입력하세요..."
												rows={3}
											/>
										</div>
										<div className="setting-group toggle-group">
											<label htmlFor="graphic-public">공개 범위</label>
											<div className="preview-visibility-control">
												<VisibilityToggle
													visibility={
														(selectedItem as any).visibility || "workspace"
													}
													onToggle={(nextVis) => {
														const updatedItem = {
															...selectedItem,
															visibility: nextVis,
														} as any;
														setSelectedItem(updatedItem);
														updateGraphicVisibilityMutation.mutate({
															id: selectedItem.id,
															visibility: nextVis,
														});
													}}
													size={18}
												/>
												<span className="preview-visibility-text">
													{getVisibilityLabel(
														(selectedItem as any).visibility || "workspace",
													)}
												</span>
											</div>
										</div>
									</div>
								) : (
									selectedItem.description && (
										<p className="preview-description">
											{selectedItem.description}
										</p>
									)
								)}
								<div className="preview-meta-row">
									{"owner_id" in selectedItem &&
										selectedItem.owner_id !== user?.id && (
											<span className="preview-meta-chip">
												소유자 {selectedItem.owner_id}
											</span>
										)}
									<span className="preview-meta-chip">
										생성 {formatPanelDate(selectedItem.created_at)}
									</span>
									{"updated_at" in selectedItem && (
										<span className="preview-meta-chip">
											수정 {formatPanelDate(selectedItem.updated_at)}
										</span>
									)}
								</div>

								{/* 액션 버튼 */}
								<div className="preview-actions">
									{selectedItem._type === "grid-templates" ? (
										(selectedItem as GridTemplateRow).owner_id === user?.id ? (
											<Link
												className="btn-panel-edit"
												to="/dashboard/studio/graphics/grid-templates/$templateId"
												params={{ templateId: selectedItem.id }}
											>
												<Pencil size={14} /> 편집
											</Link>
										) : (
											<button
												type="button"
												className="btn-panel-fork"
												onClick={() =>
													handleFork(
														selectedItem as GridTemplateRow & {
															_type: ViewMode;
														},
													)
												}
												disabled={forking}
											>
												<GitFork size={14} />{" "}
												{forking ? "복제 중..." : "Fork 복제"}
											</button>
										)
									) : // 그래픽(gallery) 모드
									(selectedItem as Graphic).owner_id === user?.id ? (
										<Link
											className="btn-panel-edit"
											to="/dashboard/studio/graphics/$graphicId"
											params={{ graphicId: selectedItem.id }}
										>
											<Pencil size={14} /> 편집
										</Link>
									) : (
										<button
											type="button"
											className="btn-panel-fork"
											onClick={() =>
												handleForkGraphic(
													selectedItem as Graphic & { _type: ViewMode },
												)
											}
											disabled={forking}
										>
											<GitFork size={14} />{" "}
											{forking ? "복제 중..." : "Fork 복제"}
										</button>
									)}
									{((selectedItem._type === "gallery" &&
										(selectedItem as Graphic).owner_id === user?.id) ||
										(selectedItem._type === "grid-templates" &&
											(selectedItem as GridTemplateRow).owner_id ===
												user?.id)) && (
										<button
											type="button"
											className="btn-panel-delete"
											onClick={() => handleDelete(selectedItem)}
										>
											<Trash2 size={14} /> 삭제
										</button>
									)}
								</div>
							</div>
						</>
					) : (
						<div className="preview-empty">
							<Eye size={48} />
							<p>항목을 선택하면 미리보기가 표시됩니다</p>
						</div>
					)}
				</div>
			</div>

			{/* 그래픽 생성 모달 */}
			{showGraphicCreateModal && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.6)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={() => {
						if (creating) return;
						setShowGraphicCreateModal(false);
						setGraphicFormName("");
					}}
				>
					<div
						style={{
							background: "var(--app-bg-secondary)",
							borderRadius: 12,
							padding: 24,
							width: 440,
							border: "1px solid var(--border-default)",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
							새 그래픽 만들기
						</h3>
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<div>
								<label
									style={{
										fontSize: 12,
										color: "var(--text-secondary)",
										marginBottom: 4,
										display: "block",
									}}
								>
									그래픽 이름 *
								</label>
								<NamingSearchBox
									ariaLabel="새 그래픽 이름"
									assetKind="graphic"
									className="name-builder"
									existingNames={graphics.map((graphic) => graphic.name)}
									placeholder="예: 좌상단-헤드라인-두글자-빨강"
									value={graphicFormName}
									onChange={setGraphicFormName}
									clearLabel="그래픽 이름 지우기"
									showLeadingIcon={false}
									suggestionTitle="그래픽 이름 만들기"
									suggestionHint="추천 토큰을 순서대로 선택해 표준 이름을 만듭니다."
								/>
							</div>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								gap: 8,
								marginTop: 20,
							}}
						>
							<Button
								variant="ghost"
								onClick={() => {
									setShowGraphicCreateModal(false);
									setGraphicFormName("");
								}}
								disabled={creating}
							>
								취소
							</Button>
							<Button
								onClick={handleCreateGraphic}
								disabled={creating || !graphicFormName.trim()}
							>
								{creating ? "생성 중..." : "생성"}
							</Button>
						</div>
					</div>
				</div>
			)}

			{showBundleModal && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.6)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={() => setShowBundleModal(false)}
				>
					<div
						style={{
							background: "var(--app-bg-secondary)",
							borderRadius: 12,
							padding: 24,
							width: 420,
							border: "1px solid var(--border-default)",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
							📦 새 번들 만들기
						</h3>
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<div>
								<label
									style={{
										fontSize: 12,
										color: "var(--text-secondary)",
										marginBottom: 4,
										display: "block",
									}}
								>
									번들 이름 *
								</label>
								<NamingSearchBox
									ariaLabel="새 번들 이름"
									assetKind="bundle"
									className="name-builder"
									existingNames={bundleListItems.map((bundle) => bundle.name)}
									placeholder="예: 하단-뉴스패키지-재사용"
									value={bundleFormName}
									onChange={setBundleFormName}
									clearLabel="번들 이름 지우기"
									showLeadingIcon={false}
									suggestionTitle="번들 이름 만들기"
									suggestionHint="번들에도 같은 네이밍 토큰을 써서 그래픽 묶음을 찾기 쉽게 만듭니다."
								/>
							</div>
							<div>
								<label
									style={{
										fontSize: 12,
										color: "var(--text-secondary)",
										marginBottom: 4,
										display: "block",
									}}
								>
									대상 프로그램 (NRCS 매칭용)
								</label>
								<Input
									value={bundleFormProgram}
									onChange={(e) => setBundleFormProgram(e.target.value)}
									placeholder="예: KBS 뉴스 9"
								/>
							</div>
							<div>
								<label
									style={{
										fontSize: 12,
										color: "var(--text-secondary)",
										marginBottom: 4,
										display: "block",
									}}
								>
									설명 (선택)
								</label>
								<Input
									value={bundleFormDesc}
									onChange={(e) => setBundleFormDesc(e.target.value)}
									placeholder="번들에 대한 설명"
								/>
							</div>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								gap: 8,
								marginTop: 20,
							}}
						>
							<Button variant="ghost" onClick={() => setShowBundleModal(false)}>
								취소
							</Button>
							<Button
								onClick={handleCreateBundle}
								disabled={!bundleFormName.trim()}
							>
								생성
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* AI 그래픽 생성 위자드 모달 */}
			{showAiWizard && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.7)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 3000,
					}}
					onClick={(e) => {
						if (e.target === e.currentTarget) setShowAiWizard(false);
					}}
				>
					<div
						style={{
							width: "min(90vw, 960px)",
							maxHeight: "85vh",
							overflow: "auto",
							borderRadius: "16px",
							boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
						}}
					>
						<OverlayCreationWizard
							onClose={() => setShowAiWizard(false)}
							onSaveVariation={handleAiSaveVariation}
						/>
					</div>
				</div>
			)}
		</>
	);
}

/**
 * 큐시트 상세 페이지 — 아이템 목록 + 속성 패널 (RichTextEditor)
 *
 * 레이아웃: 2-Column
 * ┌────────────────────────┬──────────────────────┐
 * │  큐시트 아이템 리스트    │  속성 패널             │
 * │  (slug, title, 그래픽 태그) │  (RichTextEditor × N) │
 * │  클릭 → 선택                │  선택 아이템의 그래픽 편집 │
 * └────────────────────────┴──────────────────────┘
 *
 * 학습 목표: TipTap 리치 텍스트 에디터를 실제 NRCS 큐시트에 통합하여,
 * 방송 그래픽 텍스트의 부분 스타일링(색상, 크기) 워크플로우를 익힌다.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Database,
	FileText,
	Loader2,
	Lock,
	Newspaper,
	RefreshCw,
	Save,
	Send,
	Shield,
	XCircle,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { DataViewer } from "@/components/DataViewer";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { PreflightPanel } from "@/components/Preflight/PreflightPanel";
import type { CgTextItem } from "@/lib/nrcsTypes";
import { CG_TYPE_COLORS, CG_TYPE_LABELS } from "@/lib/nrcsTypes";
import { supabase } from "@/lib/supabase";
import {
	type CuesheetReusePolicy,
	type CuesheetValidationReportRecord,
	createCuesheetContentHash,
	fetchLatestCuesheetValidationReport,
	isValidationReportStale,
	saveCuesheetValidationReport,
} from "@/services/cuesheetCheckService";
import {
	fetchDataSource,
	syncDataSourceToCuesheet,
} from "@/services/cuesheetDataSourceService";
import type { NrcsCuesheetItem } from "@/services/cuesheetService";
import {
	fetchCuesheet,
	linkCuesheetToRundown,
	propagateToRundown,
	updateCuesheetItem,
} from "@/services/cuesheetService";
import type {
	ContentIssue,
	PreflightItemResult,
	PreflightReport,
} from "@/services/preflightService";
import {
	buildMappingStatusMap,
	runPreflight,
} from "@/services/preflightService";
import "../dashboard-common.css";
import "./cuesheet-detail.css";

export const Route = createFileRoute("/dashboard/cuesheets/$cuesheetId")({
	component: CuesheetDetailPage,
});

// 아이템 상태별 메타
const ITEM_STATUS_META: Record<string, { label: string; color: string }> = {
	pending: { label: "대기", color: "#6b7280" },
	mapped: { label: "매핑됨", color: "#3b82f6" },
	approved: { label: "승인", color: "#10b981" },
	aired: { label: "송출됨", color: "#ef4444" },
};

function CuesheetDetailPage() {
	const { cuesheetId } = Route.useParams();
	const queryClient = useQueryClient();

	const { data: cuesheet, isLoading } = useQuery({
		queryKey: ["cuesheet", cuesheetId],
		queryFn: () => fetchCuesheet(cuesheetId),
	});

	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	// 로컬 방송 그래픽 데이터 편집 상태 (선택된 아이템의 cg_data 사본)
	const [localCgData, setLocalCgData] = useState<CgTextItem[]>([]);
	const [showDataViewer, setShowDataViewer] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [propagating, setPropagating] = useState(false);
	const [approvingCheck, setApprovingCheck] = useState(false);
	const [propagateMsg, setPropagateMsg] = useState<string | null>(null);
	const [reusePolicy, setReusePolicy] =
		useState<CuesheetReusePolicy>("reusable");

	// 데이터 소스 조회 (source_id가 있을 때만)
	const { data: dataSource } = useQuery({
		queryKey: ["dataSource", cuesheet?.source_id],
		queryFn: () => {
			const sourceId = cuesheet?.source_id;
			if (!sourceId) throw new Error("source_id is required");
			return fetchDataSource(sourceId);
		},
		enabled: !!cuesheet?.source_id,
	});

	const currentContentHash = useMemo(() => {
		if (!cuesheet) return "";
		return createCuesheetContentHash({
			programDate: cuesheet.program_date,
			items: cuesheet.items || [],
		});
	}, [cuesheet]);

	const { data: latestValidation, isLoading: validationLoading } = useQuery({
		queryKey: ["cuesheetValidation", cuesheetId],
		queryFn: () => fetchLatestCuesheetValidationReport(cuesheetId),
		enabled: !!cuesheet,
	});

	const validationStale = isValidationReportStale(
		latestValidation,
		currentContentHash,
		reusePolicy,
	);

	// 🆕 프리플라이트 검증 쿼리
	const {
		data: preflightReport,
		isLoading: preflightLoading,
		refetch: refetchPreflight,
	} = useQuery({
		queryKey: ["preflight", cuesheetId, reusePolicy],
		queryFn: () => {
			const cs = cuesheet;
			if (!cs) return null;
			// programDate를 시제 검증에 활용
			return runPreflight(cs.items || [], cs.bundle_id, cs.program_date, {
				reusePolicy,
				originalAirDate: cs.program_date,
				targetAirDate: cs.program_date,
			});
		},
		enabled: !!cuesheet,
	});

	// 선택된 아이템
	const selectedItem = useMemo(() => {
		if (!cuesheet?.items || !selectedItemId) return null;
		return (
			cuesheet.items.find((i: NrcsCuesheetItem) => i.id === selectedItemId) ||
			null
		);
	}, [cuesheet?.items, selectedItemId]);

	// 아이템 선택 시 로컬 방송 그래픽 데이터 복사
	const handleSelectItem = useCallback((item: NrcsCuesheetItem) => {
		setSelectedItemId(item.id);
		// cg_data를 deep clone하여 로컬 편집용으로 사용
		setLocalCgData(JSON.parse(JSON.stringify(item.cg_data || [])));
	}, []);

	// 방송 그래픽 필드 값 변경 (RichTextEditor → HTML)
	const handleFieldChange = useCallback(
		(cgItemIndex: number, fieldKey: string, html: string) => {
			setLocalCgData((prev) => {
				const next = [...prev];
				if (next[cgItemIndex]) {
					next[cgItemIndex] = {
						...next[cgItemIndex],
						fields: { ...next[cgItemIndex].fields, [fieldKey]: html },
					};
				}
				return next;
			});
		},
		[],
	);

	// 방송 그래픽 데이터 저장
	const handleSave = useCallback(async () => {
		if (!selectedItemId) return;
		setSaving(true);
		try {
			await updateCuesheetItem(selectedItemId, { cg_data: localCgData });
			queryClient.invalidateQueries({ queryKey: ["cuesheet", cuesheetId] });
			queryClient.invalidateQueries({ queryKey: ["preflight", cuesheetId] });
			queryClient.invalidateQueries({
				queryKey: ["cuesheetValidation", cuesheetId],
			});
		} catch (err) {
			console.error("방송 그래픽 데이터 저장 실패:", err);
		}
		setSaving(false);
	}, [selectedItemId, localCgData, cuesheetId, queryClient]);

	// 로딩
	if (isLoading) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					padding: 60,
					gap: 8,
				}}
			>
				<Loader2 size={24} className="animate-spin" />
				<span style={{ color: "var(--text-secondary)" }}>
					큐시트 로딩 중...
				</span>
			</div>
		);
	}

	if (!cuesheet) {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					padding: 60,
					gap: 12,
					color: "var(--text-secondary)",
				}}
			>
				<p>큐시트를 찾을 수 없습니다.</p>
				<Link to="/dashboard/cuesheets">
					<Button variant="secondary">
						<ArrowLeft size={14} /> 큐시트 목록
					</Button>
				</Link>
			</div>
		);
	}

	const items: NrcsCuesheetItem[] = cuesheet.items || [];
	const isOnAir = cuesheet.status === "onair";
	const isLinkedSource =
		cuesheet.source_type !== "manual" && !!cuesheet.source_id;

	// 데이터 소스 동기화
	const handleSync = async () => {
		if (!cuesheet.source_id || syncing) return;
		setSyncing(true);
		try {
			const result = await syncDataSourceToCuesheet(
				cuesheet.source_id,
				cuesheetId,
			);
			if (result.skipped) {
				setPropagateMsg(result.skipReason || "동기화 차단됨");
			} else {
				setPropagateMsg(
					`✅ 동기화 완료: +${result.inserted} / ✏️${result.updated} / 🗑️${result.deleted}`,
				);
				queryClient.invalidateQueries({ queryKey: ["cuesheet", cuesheetId] });
				queryClient.invalidateQueries({ queryKey: ["preflight", cuesheetId] });
				queryClient.invalidateQueries({
					queryKey: ["cuesheetValidation", cuesheetId],
				});
			}
		} catch (err) {
			console.error("동기화 실패:", err);
		}
		setSyncing(false);
		setTimeout(() => setPropagateMsg(null), 5000);
	};

	// 런다운 변경 전파
	const handlePropagate = async () => {
		setPropagating(true);
		try {
			const validationSnapshot =
				latestValidation && !validationStale
					? {
							reportId: latestValidation.id,
							contentHash: latestValidation.contentHash,
							status: latestValidation.status,
							checkedAt: latestValidation.checkedAt,
						}
					: undefined;
			const result = await propagateToRundown(cuesheetId, validationSnapshot);
			if (result.blocked) {
				setPropagateMsg(result.blockReason || "전파 차단됨");
			} else {
				setPropagateMsg(`✅ 런다운에 ${result.propagated}건 전파 완료`);
			}
		} catch (err) {
			console.error("전파 실패:", err);
		}
		setPropagating(false);
		setTimeout(() => setPropagateMsg(null), 5000);
	};

	const handleApproveCheck = async () => {
		if (!preflightReport || preflightReport.validationStatus === "blocked")
			return;
		setApprovingCheck(true);
		try {
			await saveCuesheetValidationReport({
				cuesheetId,
				status: preflightReport.validationStatus,
				contentHash: preflightReport.contentHash,
				context: {
					...preflightReport.checkContext,
					checkedAt: new Date().toISOString(),
				},
				report: preflightReport,
			});
			queryClient.invalidateQueries({
				queryKey: ["cuesheetValidation", cuesheetId],
			});
			setPropagateMsg(
				preflightReport.validationStatus === "passed"
					? "✅ 큐시트 체크 승인 완료"
					: "✅ 경고 포함 큐시트 체크 승인 완료",
			);
		} catch (err) {
			console.error("큐시트 체크 승인 실패:", err);
			setPropagateMsg("⚠️ 큐시트 체크 승인 실패");
		}
		setApprovingCheck(false);
		setTimeout(() => setPropagateMsg(null), 5000);
	};

	return (
		<div
			className="page-content"
			style={{ display: "flex", flexDirection: "column", height: "100%" }}
		>
			{/* ─── 송출 중 잠금 배너 ─── */}
			{isOnAir && (
				<div
					style={{
						padding: "8px 16px",
						background: "rgba(239, 68, 68, 0.1)",
						border: "1px solid rgba(239, 68, 68, 0.3)",
						borderRadius: 8,
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: 12,
						color: "#ef4444",
						fontWeight: 600,
						marginBottom: 8,
						flexShrink: 0,
					}}
				>
					<Lock size={14} />🔒 송출 중(ONAIR) — 편집은 가능하지만, 변경사항은
					방송 종료 후 적용됩니다
					{cuesheet.linked_rundown_id && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handlePropagate}
							disabled={isOnAir || propagating}
							style={{ fontSize: 10, marginLeft: "auto" }}
						>
							<RefreshCw size={10} /> 수동 동기화
						</Button>
					)}
				</div>
			)}

			{/* ─── 상태 메시지 토스트 ─── */}
			{propagateMsg && (
				<div
					style={{
						padding: "6px 14px",
						background: propagateMsg.startsWith("✅")
							? "rgba(16, 185, 129, 0.1)"
							: "rgba(245, 158, 11, 0.1)",
						borderRadius: 6,
						fontSize: 11,
						marginBottom: 8,
						flexShrink: 0,
						color: propagateMsg.startsWith("✅") ? "#10b981" : "#f59e0b",
					}}
				>
					{propagateMsg}
				</div>
			)}

			{/* ─── 헤더 ─── */}
			<div className="page-header" style={{ flexShrink: 0 }}>
				<div
					className="page-header-left"
					style={{ display: "flex", alignItems: "center", gap: 8 }}
				>
					<Link to="/dashboard/cuesheets">
						<Button variant="ghost" size="sm">
							<ArrowLeft size={16} />
						</Button>
					</Link>
					<div>
						<h1
							className="page-title"
							style={{ display: "flex", alignItems: "center", gap: 8 }}
						>
							<Newspaper size={20} style={{ color: "#60a5fa" }} />
							{cuesheet.program_name}
						</h1>
						<p className="page-description">
							📅 {new Date(cuesheet.program_date).toLocaleDateString("ko-KR")}
							{" · "}
							{items.length}건의 아이템
						</p>
					</div>
				</div>
				{/* 데이터 소스 연동 정보 바 */}
				{isLinkedSource && (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span
							style={{
								fontSize: 10,
								padding: "2px 8px",
								borderRadius: 4,
								fontWeight: 600,
								background:
									cuesheet.source_type === "nrcs"
										? "rgba(59, 130, 246, 0.15)"
										: "rgba(16, 185, 129, 0.15)",
								color: cuesheet.source_type === "nrcs" ? "#60a5fa" : "#34d399",
							}}
						>
							{cuesheet.source_type === "nrcs" ? "📡 NRCS" : "📄 CSV"} 연동
						</span>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleSync}
							disabled={syncing}
							style={{
								fontSize: 10,
								gap: 4,
								padding: "4px 8px",
								height: "auto",
							}}
						>
							<RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
							{syncing ? "동기화 중..." : "데이터 동기화"}
						</Button>
						{cuesheet.linked_rundown_id && !isOnAir && (
							<Button
								variant="secondary"
								size="sm"
								onClick={handlePropagate}
								disabled={propagating}
								style={{
									fontSize: 10,
									gap: 4,
									padding: "4px 8px",
									height: "auto",
								}}
							>
								<Send size={10} />
								{propagating ? "전파 중..." : "런다운 전파"}
							</Button>
						)}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowDataViewer(!showDataViewer)}
							style={{
								fontSize: 10,
								gap: 4,
								padding: "4px 8px",
								height: "auto",
							}}
						>
							<Database size={10} />
							{showDataViewer ? "테이블 닫기" : "데이터 테이블"}
						</Button>
					</div>
				)}
			</div>

			{/* ─── 메인: 아이템 리스트 + 속성 패널 + 큐시트 체크 ─── */}
			<div
				className="cuesheet-detail-layout"
				style={{
					flex: 1,
					marginTop: 16,
				}}
			>
				{/* 좌측: 아이템 리스트 */}
				<div className="dash-surface cuesheet-detail-surface">
					<div className="dash-surface-header">
						<div className="dash-surface-header-title">
							<FileText size={13} /> 아이템 목록
						</div>
					</div>
					<div className="dash-surface-scroll">
						{items.length === 0 ? (
							<div
								className="dash-surface-empty"
								style={{ padding: 40, fontSize: 13 }}
							>
								아이템이 없습니다
							</div>
						) : (
							items.map((item: NrcsCuesheetItem) => {
								const isSelected = item.id === selectedItemId;
								const statusMeta =
									ITEM_STATUS_META[item.status] || ITEM_STATUS_META.pending;
								const cgTypes = ((item.cg_data as CgTextItem[]) || []).map(
									(c: CgTextItem) => c.type,
								);
								const uniqueTypes = [...new Set(cgTypes)];

								return (
									<button
										type="button"
										key={item.id}
										onClick={() => handleSelectItem(item)}
										style={{
											width: "100%",
											display: "block",
											textAlign: "left",
											padding: "10px 14px",
											borderTop: 0,
											borderRight: 0,
											borderBottom: "1px solid var(--border-default)",
											color: "inherit",
											font: "inherit",
											cursor: "pointer",
											background: isSelected
												? "rgba(59, 130, 246, 0.1)"
												: "transparent",
											borderLeft: isSelected
												? "3px solid var(--accent-primary)"
												: "3px solid transparent",
											transition: "all 0.1s ease",
										}}
									>
										<div
											style={{
												display: "flex",
												justifyContent: "space-between",
												alignItems: "flex-start",
											}}
										>
											<div>
												<div
													style={{
														fontWeight: 600,
														fontSize: 13,
														marginBottom: 2,
													}}
												>
													{item.title || item.slug}
												</div>
												<div
													style={{
														fontSize: 11,
														color: "var(--text-tertiary)",
													}}
												>
													{item.slug}
													{item.reporter && ` · ${item.reporter}`}
												</div>
											</div>
											<span
												style={{
													fontSize: 9,
													fontWeight: 700,
													padding: "2px 6px",
													borderRadius: 4,
													background: `${statusMeta.color}15`,
													color: statusMeta.color,
												}}
											>
												{statusMeta.label}
											</span>
										</div>
										{/* 방송 그래픽 타입 태그 */}
										{uniqueTypes.length > 0 && (
											<div
												style={{
													display: "flex",
													gap: 4,
													marginTop: 6,
													flexWrap: "wrap",
												}}
											>
												{uniqueTypes.map((t: string) => (
													<span
														key={t}
														style={{
															fontSize: 9,
															padding: "1px 5px",
															borderRadius: 3,
															background: `${CG_TYPE_COLORS[t as keyof typeof CG_TYPE_COLORS] || "#888"}15`,
															color:
																CG_TYPE_COLORS[
																	t as keyof typeof CG_TYPE_COLORS
																] || "#888",
															fontWeight: 600,
														}}
													>
														{CG_TYPE_LABELS[t as keyof typeof CG_TYPE_LABELS] ||
															t}
													</span>
												))}
											</div>
										)}
									</button>
								);
							})
						)}
					</div>
				</div>

				{/* 우측: 속성 패널 */}
				<div className="dash-surface cuesheet-detail-surface">
					{selectedItem ? (
						<>
							{/* 패널 헤더 */}
							<div className="dash-surface-header">
								<div>
									<span style={{ fontWeight: 700, fontSize: 13 }}>
										✏️ {selectedItem.title || selectedItem.slug}
									</span>
									<span
										style={{
											fontSize: 11,
											color: "var(--text-tertiary)",
											marginLeft: 8,
										}}
									>
										방송 그래픽 텍스트 편집
									</span>
								</div>
								<Button size="sm" onClick={handleSave} disabled={saving}>
									<Save size={12} /> {saving ? "저장 중..." : "저장"}
								</Button>
							</div>

							{/* 방송 그래픽 텍스트 편집 영역 */}
							<div
								className="dash-surface-scroll"
								style={{
									padding: 14,
									display: "flex",
									flexDirection: "column",
									gap: 16,
								}}
							>
								{localCgData.length === 0 ? (
									<div
										className="dash-surface-empty"
										style={{ padding: 40, fontSize: 13 }}
									>
										방송 그래픽 텍스트가 없습니다
									</div>
								) : (
									localCgData.map((cgItem: CgTextItem, cgIndex: number) => (
										<CgItemEditor
											key={cgItem.id}
											cgItem={cgItem}
											cgIndex={cgIndex}
											onFieldChange={handleFieldChange}
										/>
									))
								)}
							</div>
						</>
					) : (
						<div className="dash-surface-empty" style={{ flex: 1 }}>
							<FileText size={40} style={{ opacity: 0.2 }} />
							<span style={{ fontSize: 13 }}>
								아이템을 선택하면 방송 그래픽 텍스트를 편집할 수 있습니다
							</span>
						</div>
					)}
				</div>

				{/* 우측: 큐시트 체크 패널 */}
				<PreflightPanel
					report={preflightReport ?? null}
					loading={preflightLoading}
					onRefresh={() => refetchPreflight()}
					cuesheetId={cuesheetId}
					linkedRundownId={cuesheet.linked_rundown_id}
					reusePolicy={reusePolicy}
					onReusePolicyChange={setReusePolicy}
					latestValidation={latestValidation ?? null}
					validationStale={validationStale}
					validationLoading={validationLoading}
					approvingCheck={approvingCheck}
					onApproveCheck={handleApproveCheck}
				/>
			</div>

			{/* ─── 하단: DataViewer (접이식) ─── */}
			{showDataViewer && dataSource && (
				<div
					style={{
						flexShrink: 0,
						marginTop: 16,
						maxHeight: 300,
						overflow: "auto",
					}}
				>
					<DataViewer
						dataSource={dataSource}
						onSync={handleSync}
						syncing={syncing}
						mappingStatusMap={buildMappingStatusMap(
							preflightReport ?? null,
							items,
						)}
						onRowClick={(row) => {
							// 행 클릭 → 해당 source_row_id의 큐시트 아이템 선택
							const item = items.find((i) => i.source_row_id === row._row_id);
							if (item) handleSelectItem(item);
						}}
					/>
				</div>
			)}
		</div>
	);
}

// ─── 방송 그래픽 아이템 에디터 ────────────────────────────────────────

function CgItemEditor({
	cgItem,
	cgIndex,
	onFieldChange,
}: {
	cgItem: CgTextItem;
	cgIndex: number;
	onFieldChange: (cgIndex: number, fieldKey: string, html: string) => void;
}) {
	const color = CG_TYPE_COLORS[cgItem.type] || "#888";
	const label = CG_TYPE_LABELS[cgItem.type] || cgItem.type;

	return (
		<div
			style={{
				border: `1px solid ${color}30`,
				borderRadius: 8,
				overflow: "hidden",
			}}
		>
			{/* 방송 그래픽 타입 헤더 */}
			<div
				style={{
					padding: "6px 12px",
					background: `${color}10`,
					borderBottom: `1px solid ${color}20`,
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 700,
						color,
						padding: "1px 6px",
						borderRadius: 3,
						background: `${color}20`,
					}}
				>
					{label}
				</span>
				<span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
					#{cgItem.order + 1}
				</span>
			</div>

			{/* 필드별 RichTextEditor */}
			<div
				style={{
					padding: 10,
					display: "flex",
					flexDirection: "column",
					gap: 8,
				}}
			>
				{Object.entries(cgItem.fields).map(([key, value]: [string, string]) => (
					<RichTextEditor
						key={`${cgItem.id}-${key}`}
						label={key}
						content={value}
						onChange={(html: string) => onFieldChange(cgIndex, key, html)}
						placeholder={`${label} — ${key}`}
					/>
				))}
			</div>
		</div>
	);
}

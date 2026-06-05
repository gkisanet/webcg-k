/**
 * 큐시트 대시보드 페이지 — 2-탭 구조 (독립형 / 데이터 연동형)
 *
 * ■ Why 2-탭?
 *   사용자 요구: 외부 데이터 소스와 연동되지 않는 큐시트(수동)와
 *   NRCS/CSV로 자동 생성된 큐시트를 명확히 구분.
 *   각 탭의 카드 UI도 소스 유형에 맞게 차별화.
 *
 * ■ 생성 모달 3-Step:
 *   Step 1: 유형 선택 (독립형 / NRCS / CSV)
 *   Step 2: 소스 설정 (NRCS: 프로그램 선택 / CSV: 파일 업로드)
 *   Step 3: 번들 매핑 + 생성
 */

import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	FileText,
	Loader2,
	Newspaper,
	Plus,
	Radio,
	Trash2,
	Upload,
	Database,
	PenLine,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "../../../lib/auth";
import {
	fetchCuesheets,
	createCuesheet,
	deleteCuesheet,
} from "../../../services/cuesheetService";
import type { NrcsCuesheet } from "../../../services/cuesheetService";
import { useCuesheetsRealtime } from "../../../services/nrcsRealtimeService";
import { fetchBundles } from "../../../services/bundleService";
import type { TemplateBundle } from "../../../services/bundleService";
import { fetchWorkspaces } from "../../../services/workspaceService";
import { CsvImportWizard } from "../../../components/CsvImportWizard";

export const Route = createLazyFileRoute("/dashboard/cuesheets/")({
	component: CuesheetsPage,
});

// 상태별 색상/라벨
const STATUS_META: Record<string, { label: string; color: string }> = {
	draft: { label: "초안", color: "#6b7280" },
	ready: { label: "준비", color: "#3b82f6" },
	onair: { label: "온에어", color: "#ef4444" },
	done: { label: "완료", color: "#10b981" },
};

// 소스 유형별 메타
const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
	manual: { label: "수동 입력", icon: "📝", color: "#6b7280" },
	nrcs: { label: "NRCS 연동", icon: "📡", color: "#3b82f6" },
	csv: { label: "CSV 임포트", icon: "📄", color: "#10b981" },
};

type TabType = "standalone" | "data-linked";

function CuesheetsPage() {
	const queryClient = useQueryClient();
	const { user, activeWorkspaceId } = useAuth();

	const { data: cuesheets = [], isLoading } = useQuery({
		queryKey: ["cuesheets", "all"],
		queryFn: () => fetchCuesheets(activeWorkspaceId, true),
		enabled: !!user,
	});

	const { data: bundles = [] } = useQuery({
		queryKey: ["bundles"],
		queryFn: fetchBundles,
	});

	const { data: workspaces = [] } = useQuery({
		queryKey: ["workspaces"],
		queryFn: fetchWorkspaces,
		enabled: !!user,
	});

	// 실시간 동기화
	useCuesheetsRealtime();

	const [activeTab, setActiveTab] = useState<TabType>("standalone");
	const [showCreate, setShowCreate] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [showCsvImport, setShowCsvImport] = useState(false);
	const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
	const [didApplyDefaultWorkspaceFilter, setDidApplyDefaultWorkspaceFilter] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// 생성 모달 상태
	const [createStep, setCreateStep] = useState(1);
	const [createType, setCreateType] = useState<"manual" | "nrcs" | "csv">("manual");
	const [formProgram, setFormProgram] = useState("");
	const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
	const [formBundleId, setFormBundleId] = useState("");

	useEffect(() => {
		if (activeWorkspaceId && !didApplyDefaultWorkspaceFilter) {
			setWorkspaceFilter(activeWorkspaceId);
			setDidApplyDefaultWorkspaceFilter(true);
		}
	}, [activeWorkspaceId, didApplyDefaultWorkspaceFilter]);

	// 탭별 큐시트 필터링
	const filteredCuesheets = useMemo(() => {
		return cuesheets.filter((cs: NrcsCuesheet) => {
			if (workspaceFilter !== "all" && cs.workspace_id !== workspaceFilter) return false;
			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				const haystack = [
					cs.program_name,
					cs.program_date,
					cs.status,
					cs.source_type,
				].join(" ").toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			const sourceType = cs.source_type || "manual";
			if (activeTab === "standalone") return sourceType === "manual";
			return sourceType === "nrcs" || sourceType === "csv";
		});
	}, [cuesheets, activeTab, workspaceFilter, searchQuery]);

	const workspaceFilteredCuesheets = useMemo(() => {
		return cuesheets.filter((cs: NrcsCuesheet) => {
			if (workspaceFilter !== "all" && cs.workspace_id !== workspaceFilter) return false;
			if (!searchQuery) return true;
			const q = searchQuery.toLowerCase();
			return [
				cs.program_name,
				cs.program_date,
				cs.status,
				cs.source_type,
			].join(" ").toLowerCase().includes(q);
		});
	}, [cuesheets, workspaceFilter, searchQuery]);

	// 탭별 카운트
	const standaloneCuesheetCount = useMemo(
		() => workspaceFilteredCuesheets.filter((cs: NrcsCuesheet) => (cs.source_type || "manual") === "manual").length,
		[workspaceFilteredCuesheets],
	);
	const linkedCuesheetCount = useMemo(
		() => workspaceFilteredCuesheets.filter((cs: NrcsCuesheet) => (cs.source_type || "manual") !== "manual").length,
		[workspaceFilteredCuesheets],
	);

	// 큐시트 생성
	const handleCreate = async () => {
		if (!formProgram.trim()) {
			alert("프로그램명을 입력해주세요.");
			return;
		}
		if (!activeWorkspaceId) {
			alert("활성화된 워크스페이스가 없습니다. 워크스페이스를 선택하거나 생성해주세요.");
			return;
		}
		try {
			await createCuesheet({
				program_name: formProgram.trim(),
				program_date: formDate,
				bundle_id: formBundleId || undefined,
				source_type: createType,
				workspace_id: activeWorkspaceId,
			});
			resetCreateModal();
			queryClient.invalidateQueries({ queryKey: ["cuesheets"] });
		} catch (err) {
			console.error("큐시트 생성 실패:", err);
			alert("큐시트 생성 중 오류가 발생했습니다.");
		}
	};

	// 생성 모달 초기화
	const resetCreateModal = () => {
		setShowCreate(false);
		setCreateStep(1);
		setCreateType("manual");
		setFormProgram("");
		setFormBundleId("");
	};

	// 큐시트 삭제
	const handleDelete = async (id: string) => {
		try {
			await deleteCuesheet(id);
			setDeleteConfirmId(null);
			queryClient.invalidateQueries({ queryKey: ["cuesheets"] });
		} catch (err) {
			console.error("큐시트 삭제 실패:", err);
		}
	};

	return (
		<div className="page-content">
			{/* ─── 헤더 ─── */}
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">📋 큐시트</h1>
					<p className="page-description">뉴스 프로그램별 방송 그래픽 큐시트를 관리합니다</p>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<Button variant="secondary" onClick={() => setShowCsvImport(true)}>
						<Upload size={14} /> CSV 임포트
					</Button>
					<Button onClick={() => setShowCreate(true)}>
						<Plus size={16} /> 새 큐시트
					</Button>
				</div>
			</div>

			<div style={{
				display: "flex",
				gap: 8,
				alignItems: "center",
				marginTop: 16,
				flexWrap: "wrap",
			}}>
				<div style={{ position: "relative", minWidth: 240, flex: "1 1 260px" }}>
					<Search
						size={14}
						style={{
							position: "absolute",
							left: 10,
							top: "50%",
							transform: "translateY(-50%)",
							color: "var(--text-secondary)",
						}}
					/>
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="큐시트 검색"
						style={{ paddingLeft: 32, fontSize: 13 }}
					/>
				</div>
				<select
					value={workspaceFilter}
					onChange={(e) => setWorkspaceFilter(e.target.value)}
					style={{
						height: 36,
						minWidth: 220,
						background: "var(--app-bg-muted)",
						border: "1px solid var(--border-default)",
						borderRadius: 6,
						color: "var(--text-primary)",
						padding: "0 10px",
						fontSize: 13,
					}}
				>
					<option value="all">전체 워크스페이스</option>
					{workspaces.map((ws: any) => (
						<option key={ws.id} value={ws.id}>
							{ws.name}{ws.id === activeWorkspaceId ? " (현재)" : ""}
						</option>
					))}
				</select>
			</div>

			{/* ─── 2-탭 네비게이션 ─── */}
			<div style={{
				display: "flex", gap: 2, marginTop: 16,
				borderBottom: "1px solid var(--border-default)",
				paddingBottom: 0,
			}}>
				<TabButton
					active={activeTab === "standalone"}
					onClick={() => setActiveTab("standalone")}
					icon={<PenLine size={13} />}
					label="독립형"
					count={standaloneCuesheetCount}
				/>
				<TabButton
					active={activeTab === "data-linked"}
					onClick={() => setActiveTab("data-linked")}
					icon={<Database size={13} />}
					label="데이터 연동형"
					count={linkedCuesheetCount}
				/>
			</div>

			{/* ─── 큐시트 카드 그리드 ─── */}
			{isLoading ? (
				<div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
					<Loader2 size={24} className="animate-spin" />
				</div>
			) : filteredCuesheets.length === 0 ? (
				<div style={{
					display: "flex", flexDirection: "column", alignItems: "center",
					padding: 60, color: "var(--text-secondary)",
				}}>
					<Newspaper size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
					<p>
						{activeTab === "standalone"
							? "독립형 큐시트가 없습니다."
							: "데이터 연동형 큐시트가 없습니다."}
					</p>
					<Button variant="secondary" style={{ marginTop: 12 }} onClick={() => {
						if (activeTab === "data-linked") {
							setCreateType("nrcs");
							setCreateStep(1);
						}
						setShowCreate(true);
					}}>
						<Plus size={14} />
						{activeTab === "standalone" ? "수동 큐시트 만들기" : "데이터 연동 큐시트 만들기"}
					</Button>
				</div>
			) : (
				<div style={{
					display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
					gap: 16, marginTop: 16,
				}}>
					{filteredCuesheets.map((cs: NrcsCuesheet) => (
						<CuesheetCard
							key={cs.id}
							cuesheet={cs}
							deleteConfirmId={deleteConfirmId}
							setDeleteConfirmId={setDeleteConfirmId}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}

			{/* ─── 생성 모달 (3-Step) ─── */}
			{showCreate && (
				<CreateCuesheetModal
					step={createStep}
					setStep={setCreateStep}
					createType={createType}
					setCreateType={setCreateType}
					formProgram={formProgram}
					setFormProgram={setFormProgram}
					formDate={formDate}
					setFormDate={setFormDate}
					formBundleId={formBundleId}
					setFormBundleId={setFormBundleId}
					bundles={bundles}
					onClose={resetCreateModal}
					onCreate={handleCreate}
				/>
			)}

			{/* CSV 임포트 위자드 */}
			{showCsvImport && (
				<CsvImportWizard
					bundles={bundles}
					onComplete={() => {
						setShowCsvImport(false);
						queryClient.invalidateQueries({ queryKey: ["cuesheets"] });
					}}
					onCancel={() => setShowCsvImport(false)}
				/>
			)}
		</div>
	);
}

// ─── 탭 버튼 ──────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label, count }: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	count: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: "flex", alignItems: "center", gap: 6,
				padding: "8px 16px",
				background: "transparent",
				border: "none",
				borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
				color: active ? "var(--text-primary)" : "var(--text-tertiary)",
				fontWeight: active ? 700 : 500,
				fontSize: 13,
				cursor: "pointer",
				transition: "all 0.15s ease",
			}}
		>
			{icon}
			{label}
			<span style={{
				fontSize: 10, fontWeight: 700,
				padding: "1px 6px", borderRadius: 8,
				background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
				color: active ? "#000" : "var(--text-tertiary)",
			}}>
				{count}
			</span>
		</button>
	);
}

// ─── 큐시트 카드 ──────────────────────────────────────────────

function CuesheetCard({
	cuesheet, deleteConfirmId, setDeleteConfirmId, onDelete,
}: {
	cuesheet: NrcsCuesheet;
	deleteConfirmId: string | null;
	setDeleteConfirmId: (id: string | null) => void;
	onDelete: (id: string) => void;
}) {
	const meta = STATUS_META[cuesheet.status] || STATUS_META.draft;
	const sourceMeta = SOURCE_META[cuesheet.source_type || "manual"] || SOURCE_META.manual;
	const date = new Date(cuesheet.program_date).toLocaleDateString("ko-KR");

	return (
		<div style={{
			background: "var(--app-bg-alt)", border: "1px solid rgba(255,255,255,0.08)",
			borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10,
			borderLeft: cuesheet.status === "onair" ? "3px solid #ef4444" : undefined,
			transition: "border-color 0.15s ease, box-shadow 0.15s ease",
		}}>
			{/* 상단: 제목 + LIVE 뱃지 */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
				<div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Newspaper size={16} style={{ color: "#60a5fa" }} />
						<span style={{ fontWeight: 700, fontSize: 14 }}>{cuesheet.program_name}</span>
						{cuesheet.status === "onair" && (
							<span style={{
								display: "flex", alignItems: "center", gap: 3,
								fontSize: 9, color: "#ef4444", fontWeight: 700,
							}}>
								<Radio size={9} className="animate-pulse" /> LIVE
							</span>
						)}
					</div>
					<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
						📅 {date}
					</div>
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					{deleteConfirmId === cuesheet.id ? (
						<>
							<Button variant="destructive" size="sm" onClick={() => onDelete(cuesheet.id)}>확인</Button>
							<Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>취소</Button>
						</>
					) : (
						<Button variant="ghost" size="icon-xs" onClick={() => setDeleteConfirmId(cuesheet.id)}>
							<Trash2 size={13} />
						</Button>
					)}
				</div>
			</div>

			{/* 중간: 소스 유형 배지 */}
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<span style={{
					fontSize: 10, padding: "2px 8px", borderRadius: 4,
					fontWeight: 600,
					background: `${sourceMeta.color}15`,
					color: sourceMeta.color,
				}}>
					{sourceMeta.icon} {sourceMeta.label}
				</span>
				{(cuesheet.source_type === "nrcs" || cuesheet.source_type === "csv") && cuesheet.source_id && (
					<span style={{
						fontSize: 9, color: "var(--text-tertiary)",
						display: "flex", alignItems: "center", gap: 3,
					}}>
						<RefreshCw size={9} /> 데이터 연동
					</span>
				)}
			</div>

			{/* 하단: 건수 + 상태 + 상세 버튼 */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
				<div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
					<span><FileText size={11} /> {cuesheet.total_items || 0}건</span>
					<span style={{
						padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
						background: `${meta.color}20`, color: meta.color,
					}}>
						{meta.label}
					</span>
				</div>
				<Link to={`/dashboard/cuesheets/${cuesheet.id}` as any}>
					<Button variant="secondary" size="sm">
						<FileText size={12} /> 상세
					</Button>
				</Link>
			</div>
		</div>
	);
}

// ─── 생성 모달 (3-Step) ───────────────────────────────────────

function CreateCuesheetModal({
	step, setStep, createType, setCreateType,
	formProgram, setFormProgram, formDate, setFormDate,
	formBundleId, setFormBundleId, bundles,
	onClose, onCreate,
}: {
	step: number;
	setStep: (s: number) => void;
	createType: "manual" | "nrcs" | "csv";
	setCreateType: (t: "manual" | "nrcs" | "csv") => void;
	formProgram: string;
	setFormProgram: (v: string) => void;
	formDate: string;
	setFormDate: (v: string) => void;
	formBundleId: string;
	setFormBundleId: (v: string) => void;
	bundles: TemplateBundle[];
	onClose: () => void;
	onCreate: () => void;
}) {
	const typeOptions = [
		{
			value: "manual" as const,
			icon: "📝", label: "독립형 큐시트",
			desc: "수동으로 방송 그래픽 텍스트를 입력합니다",
		},
		{
			value: "nrcs" as const,
			icon: "📡", label: "NRCS 연동",
			desc: "뉴스룸 시스템에서 기사를 가져옵니다",
		},
		{
			value: "csv" as const,
			icon: "📄", label: "CSV 임포트",
			desc: "CSV 파일에서 데이터를 불러옵니다",
		},
	];

	return (
		<div
			style={{
				position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
				display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
			}}
			onClick={onClose}
		>
			<div
				style={{
					background: "var(--app-bg-alt)", borderRadius: 12, padding: 24,
					width: 480, border: "1px solid rgba(255,255,255,0.1)",
					boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* 모달 헤더 */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
					<h3 style={{ fontSize: 16, fontWeight: 700 }}>📋 새 큐시트</h3>
					<div style={{ display: "flex", gap: 4 }}>
						{[1, 2, 3].map((s) => (
							<div
								key={s}
								style={{
									width: 24, height: 4, borderRadius: 2,
									background: s <= step ? "var(--accent-primary)" : "rgba(255,255,255,0.1)",
									transition: "background 0.2s ease",
								}}
							/>
						))}
					</div>
				</div>

				{/* Step 1: 유형 선택 */}
				{step === 1 && (
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						<label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
							큐시트 유형을 선택하세요
						</label>
						{typeOptions.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => {
									setCreateType(opt.value);
									setStep(2);
								}}
								style={{
									display: "flex", alignItems: "center", gap: 12,
									padding: "12px 16px", borderRadius: 8,
									border: createType === opt.value
										? "1px solid var(--accent-primary)"
										: "1px solid rgba(255,255,255,0.08)",
									background: createType === opt.value
										? "rgba(0, 210, 255, 0.05)"
										: "var(--app-bg-muted)",
									cursor: "pointer",
									textAlign: "left",
									transition: "all 0.15s ease",
								}}
							>
								<span style={{ fontSize: 24 }}>{opt.icon}</span>
								<div>
									<div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{opt.label}</div>
									<div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{opt.desc}</div>
								</div>
							</button>
						))}
					</div>
				)}

				{/* Step 2: 소스 설정 */}
				{step === 2 && (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						<div style={{
							fontSize: 11, color: SOURCE_META[createType].color,
							padding: "4px 8px", borderRadius: 4,
							background: `${SOURCE_META[createType].color}10`,
							display: "inline-flex", alignItems: "center", gap: 4,
							alignSelf: "flex-start",
						}}>
							{SOURCE_META[createType].icon} {SOURCE_META[createType].label}
						</div>

						<div>
							<label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
								프로그램명 *
							</label>
							<Input value={formProgram} onChange={(e) => setFormProgram(e.target.value)} placeholder="예: KBS 뉴스 9" />
						</div>
						<div>
							<label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
								방송일
							</label>
							<Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
						</div>

						{createType === "nrcs" && (
							<div style={{
								padding: 12, borderRadius: 8,
								background: "rgba(59, 130, 246, 0.05)",
								border: "1px solid rgba(59, 130, 246, 0.15)",
								fontSize: 11, color: "var(--text-secondary)",
							}}>
								💡 NRCS 연동은 큐시트 생성 후 상세 페이지에서 프로그램을 선택하여 데이터를 불러올 수 있습니다.
							</div>
						)}

						{createType === "csv" && (
							<div style={{
								padding: 12, borderRadius: 8,
								background: "rgba(16, 185, 129, 0.05)",
								border: "1px solid rgba(16, 185, 129, 0.15)",
								fontSize: 11, color: "var(--text-secondary)",
							}}>
								💡 CSV 파일은 큐시트 생성 후 상세 페이지에서 업로드할 수 있습니다.
								또는 상단의 "CSV 임포트" 버튼을 사용하세요.
							</div>
						)}
					</div>
				)}

				{/* Step 3: 번들 매핑 + 생성 */}
				{step === 3 && (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						<div style={{
							padding: 10, borderRadius: 8,
							background: "var(--app-bg-muted)",
							border: "1px solid var(--border-default)",
							fontSize: 12,
						}}>
							<div style={{ fontWeight: 600 }}>{formProgram}</div>
							<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
								📅 {formDate} · {SOURCE_META[createType].icon} {SOURCE_META[createType].label}
							</div>
						</div>
						<div>
							<label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
								방송 그래픽 매핑 번들 (선택)
							</label>
							<select
								value={formBundleId}
								onChange={(e) => setFormBundleId(e.target.value)}
								style={{
									width: "100%", background: "var(--app-bg-muted)",
									border: "1px solid var(--border-default)", borderRadius: 6,
									padding: "6px 8px", fontSize: 13, color: "var(--text-primary)",
								}}
							>
								<option value="">번들 없이 생성</option>
								{bundles.map((b: TemplateBundle) => (
									<option key={b.id} value={b.id}>
										{b.name}{b.program_name ? ` (${b.program_name})` : ""}
									</option>
								))}
							</select>
						</div>
					</div>
				)}

				{/* 하단 버튼 */}
				<div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
					<div>
						{step > 1 && (
							<Button variant="ghost" onClick={() => setStep(step - 1)}>← 이전</Button>
						)}
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<Button variant="ghost" onClick={onClose}>취소</Button>
						{step === 2 && (
							<Button onClick={() => setStep(3)} disabled={!formProgram.trim()}>
								다음 →
							</Button>
						)}
						{step === 3 && (
							<Button onClick={onCreate} disabled={!formProgram.trim()}>
								생성
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

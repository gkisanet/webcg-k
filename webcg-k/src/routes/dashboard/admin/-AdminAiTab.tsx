/**
 * Admin AI 관리 탭 — v2 (TanStack Table + 설정 모달)
 *
 * 변경 이유 (Why):
 *   카드 UI는 활성 모델 확장 시 다른 카드 레이아웃을 밀어내는 문제가 있었고,
 *   모델 간 스펙 비교가 어려웠다. TanStack Table로 전환하면:
 *   1) 모든 모델을 한 줄씩 나열하여 RPM/RPD/사용량 즉시 비교 가능
 *   2) 설정 편집은 모달로 분리하여 레이아웃 영향 zero
 *   3) 모델별 토큰 사용량을 테이블 컬럼으로 직접 표시
 */

import { useState, useMemo, useEffect } from "react";
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
	type SortingState,
} from "@tanstack/react-table";
import {
	Bot,
	Edit3,
	Key,
	Loader2,
	Plus,
	RotateCcw,
	Save,
	Settings2,
	Sliders,
	Sparkles,
	Trash2,
	Zap,
	X,
	ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { ModelConfig, ApiKey } from "./-adminTypes";
import { PROVIDERS } from "./-adminTypes";
import type { AiTestResult } from "../../../services/aiCgService";
import { parseGenerationConfig } from "../../../lib/schemas";
import type { ModelUsage } from "../../../services/adminService";

// ─── Props (간소화) ─────────────────────────────────────────────

interface AdminAiTabProps {
	models: ModelConfig[];
	modelsLoading: boolean;
	usageSummary: { totalRequests: number; totalTokens: number; todayRequests: number; todayTokens: number };
	/** 모델별 사용량 맵 (model_id → ModelUsage) */
	usageByModel: Record<string, ModelUsage>;
	apiKeys: ApiKey[];
	activeModel: ModelConfig | undefined;
	setShowModelModal: (v: boolean) => void;
	// 콜백
	switchModel: (modelId: string) => void;
	deleteModel: (modelId: string) => void;
	saveSystemPrompt: (modelId: string, prompt: string) => void;
	saveGenerationConfig: (modelId: string, config: Record<string, unknown>) => void;
	linkApiKey: (modelId: string, apiKeyId: string | null) => void;
	testApiConnection: () => Promise<AiTestResult>;
}

// ─── 테이블 행 데이터 ───────────────────────────────────────────

interface ModelRow extends ModelConfig {
	todayRequests: number;
	todayTokens: number;
	totalRequests: number;
	totalTokens: number;
}

const columnHelper = createColumnHelper<ModelRow>();

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function AdminAiTab({
	models,
	modelsLoading,
	usageSummary,
	usageByModel,
	apiKeys,
	activeModel,
	setShowModelModal,
	switchModel,
	deleteModel,
	saveSystemPrompt,
	saveGenerationConfig,
	linkApiKey,
	testApiConnection,
}: AdminAiTabProps) {
	// ─── 내부 상태 (설정 모달) ───────────────────────────────────
	const [settingsModel, setSettingsModel] = useState<ModelConfig | null>(null);
	const [promptDraft, setPromptDraft] = useState("");
	const [configDraft, setConfigDraft] = useState({ temperature: 0.9, maxOutputTokens: 8192, topP: 0.95, topK: 40, deepseekThinking: false, deepseekReasoningEffort: "high" as "high" | "max", thinkingEnabled: false, thinkingEffort: "high" as "low" | "medium" | "high", includeThoughts: false, serviceTier: "" as "" | "flex" | "priority" });
	const [testResult, setTestResult] = useState<AiTestResult | null>(null);
	const [isTesting, setIsTesting] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
	const [sorting, setSorting] = useState<SortingState>([]);

	// ─── 상태 동기화 ───────────────────────────────────────────────
	// 부모의 models 프롭이 비동기적으로 갱신될 때, 현재 열려 있는 설정 모달의 모델 데이터를 최신 데이터와 동기화 (Single Source of Truth 보장)
	useEffect(() => {
		if (settingsModel) {
			const latest = models.find((m) => m.model_id === settingsModel.model_id);
			if (latest) {
				// [1차 방어선 - 이중 동기화 아키텍처]
				// 부모 프롭(models)이 비동기적으로 갱신될 때 최신 데이터를 반영하되,
				// 사용자가 모달 내에서 직접 즉각 변경한 api_key_id가 구식 프롭 데이터에 의해 롤백(null 등으로 회귀)되는 것을 방어한다.
				setSettingsModel((prev) => {
					if (!prev) return latest;
					const isApiKeyDirty = prev.api_key_id !== latest.api_key_id;
					return {
						...latest,
						// 사용자가 변경한 최신 로컬 상태가 존재하고 최신 프롭이 아직 구식 상태를 유지하고 있다면,
						// 로컬 상태를 우선적으로 유지하여 UI 깜빡임 및 오프싱크 현상을 차단한다.
						api_key_id: isApiKeyDirty && prev.api_key_id !== undefined ? prev.api_key_id : latest.api_key_id,
					};
				});
			}
		}
	}, [models, settingsModel?.model_id]);

	// ─── 테이블 데이터: 모델 + 사용량 조인 ───────────────────────
	const tableData: ModelRow[] = useMemo(() =>
		models.map((m) => {
			const u = usageByModel[m.model_id];
			return {
				...m,
				todayRequests: u?.todayRequests ?? 0,
				todayTokens: u?.todayTokens ?? 0,
				totalRequests: u?.totalRequests ?? 0,
				totalTokens: u?.totalTokens ?? 0,
			};
		}),
		[models, usageByModel],
	);

	// ─── 설정 모달 열기 ─────────────────────────────────────────
	const openSettings = (m: ModelConfig) => {
		setSettingsModel(m);
		setPromptDraft(m.system_prompt || "");
		const gc = parseGenerationConfig(m.generation_config);
		const g = gc as any;
			setConfigDraft({
				temperature: gc.temperature, maxOutputTokens: gc.maxOutputTokens, topP: gc.topP, topK: gc.topK,
				deepseekThinking: gc.deepseekThinking ?? false,
				deepseekReasoningEffort: g.deepseekReasoningEffort || "high",
				thinkingEnabled: g.thinkingEnabled ?? g.thinking?.enabled ?? false,
				thinkingEffort: g.thinkingEffort ?? g.thinking?.effort ?? "high",
				includeThoughts: g.includeThoughts ?? false,
				serviceTier: g.serviceTier ?? "",
			});
		setTestResult(null);
	};

	// ─── TanStack Table 컬럼 정의 ───────────────────────────────
	const columns = useMemo(() => [
		// 상태 (활성/비활성)
		columnHelper.accessor("is_active", {
			header: "상태",
			size: 80,
			cell: (info) => info.getValue()
				? <span className="model-status-badge active">✦ 활성</span>
				: <span className="model-status-badge">비활성</span>,
		}),
		// 모델명 + 프로바이더
		columnHelper.accessor("display_name", {
			header: ({ column }) => (
				<button className="th-sort-btn" onClick={() => column.toggleSorting()}>
					모델명 <ArrowUpDown size={12} />
				</button>
			),
			size: 200,
			cell: (info) => {
				const m = info.row.original;
				return (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span style={{ fontWeight: 600 }}>{info.getValue()}</span>
						<span className="provider-badge" style={{
							borderColor: PROVIDERS[m.provider]?.color || "#888",
							color: PROVIDERS[m.provider]?.color || "#888",
						}}>
							{PROVIDERS[m.provider]?.label || m.provider}
						</span>
					</div>
				);
			},
		}),
		// 티어
		columnHelper.accessor("tier", {
			header: "티어",
			size: 70,
			cell: (info) => <span className={`model-card-tier ${info.getValue()}`}>{info.getValue().toUpperCase()}</span>,
		}),
		// RPM
		columnHelper.accessor("rpm_limit", {
			header: () => <span title="Requests Per Minute — 분당 최대 요청 수">RPM</span>,
			size: 70,
			cell: (info) => <span style={{ fontWeight: 600 }}>{info.getValue()}</span>,
		}),
		// RPD
		columnHelper.accessor("rpd_limit", {
			header: () => <span title="Requests Per Day — 일당 최대 요청 수">RPD</span>,
			size: 90,
			cell: (info) => <span style={{ fontWeight: 600 }}>{info.getValue().toLocaleString()}</span>,
		}),
		// 오늘 사용량
		columnHelper.accessor("todayRequests", {
			header: "오늘 요청",
			size: 100,
			cell: (info) => {
				const m = info.row.original;
				const pct = m.rpd_limit > 0 ? (info.getValue() / m.rpd_limit) * 100 : 0;
				return (
					<div className="table-usage-cell">
						<span>{info.getValue()}</span>
						<div className="table-usage-bar">
							<div
								className={`table-usage-fill ${pct > 80 ? "danger" : pct > 50 ? "warning" : ""}`}
								style={{ width: `${Math.min(100, pct)}%` }}
							/>
						</div>
					</div>
				);
			},
		}),
		// 오늘 토큰
		columnHelper.accessor("todayTokens", {
			header: "오늘 토큰",
			size: 100,
			cell: (info) => <span>{info.getValue().toLocaleString()}</span>,
		}),
		// 총 토큰
		columnHelper.accessor("totalTokens", {
			header: "총 토큰",
			size: 100,
			cell: (info) => <span style={{ color: "var(--text-tertiary)" }}>{info.getValue().toLocaleString()}</span>,
		}),
		// 액션
		columnHelper.display({
			id: "actions",
			header: "",
			size: 140,
			cell: (info) => {
				const m = info.row.original;
				return (
					<div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
						{!m.is_active && (
							<Button variant="secondary" size="sm" onClick={() => switchModel(m.model_id)} style={{ fontSize: 11 }}>
								활성화
							</Button>
						)}
						<Button variant="ghost" size="sm" onClick={() => openSettings(m)} style={{ fontSize: 11 }}>
							<Settings2 size={12} /> 설정
						</Button>
						{!m.is_active && (
							deleteConfirm === m.model_id ? (
								<>
									<Button variant="destructive" size="sm" onClick={() => { deleteModel(m.model_id); setDeleteConfirm(null); }} style={{ fontSize: 11 }}>확인</Button>
									<Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)} style={{ fontSize: 11 }}>취소</Button>
								</>
							) : (
								<Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(m.model_id)} style={{ fontSize: 11, color: "var(--accent-danger, #ef4444)" }}>
									<Trash2 size={12} />
								</Button>
							)
						)}
					</div>
				);
			},
		}),
	], [deleteConfirm, switchModel, deleteModel]);

	const table = useReactTable({
		data: tableData,
		columns,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	return (
		<>
			{/* 사용량 요약 카드 */}
			<div className="admin-stats">
				<div className="admin-stat-card">
					<div className="admin-stat-icon purple"><Bot size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">현재 모델</div>
						<div className="admin-stat-value" style={{ fontSize: 18 }}>{activeModel?.display_name || "미설정"}</div>
						<div className="admin-stat-sub">
							{activeModel ? `${PROVIDERS[activeModel.provider]?.label || activeModel.provider} • ${activeModel.tier} • ${activeModel.rpm_limit} RPM` : ""}
						</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon blue"><Zap size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">오늘 요청 수</div>
						<div className="admin-stat-value">{usageSummary.todayRequests}</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon green"><Sparkles size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">오늘 토큰</div>
						<div className="admin-stat-value">{usageSummary.todayTokens.toLocaleString()}</div>
						<div className="admin-stat-sub">누적: {usageSummary.totalTokens.toLocaleString()} tokens</div>
					</div>
				</div>
				<div className="admin-stat-card">
					<div className="admin-stat-icon amber"><Bot size={22} /></div>
					<div className="admin-stat-content">
						<div className="admin-stat-label">등록 모델</div>
						<div className="admin-stat-value">{models.length}</div>
						<div className="admin-stat-sub">전체 요청: {usageSummary.totalRequests}</div>
					</div>
				</div>
			</div>

			{/* 헤더 */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
				<h3 className="admin-section-title" style={{ marginBottom: 0 }}>
					<Bot size={16} /> 모델 설정
				</h3>
				<Button className="model-add-btn" onClick={() => setShowModelModal(true)}>
					<Plus size={14} /> 모델 추가
				</Button>
			</div>

			{/* 모델 테이블 */}
			{modelsLoading ? (
				<div className="admin-empty-state">
					<Loader2 size={24} className="animate-spin" />
					<p>모델 목록을 불러오는 중...</p>
				</div>
			) : (
				<div className="admin-table-wrapper">
					<table>
						<thead>
							{table.getHeaderGroups().map((hg) => (
								<tr key={hg.id}>
									{hg.headers.map((h) => (
										<th key={h.id} style={{ width: h.getSize() }}>
											{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
										</th>
									))}
								</tr>
							))}
						</thead>
						<tbody>
							{table.getRowModel().rows.map((row) => (
								<tr key={row.id} className={row.original.is_active ? "active-row" : ""}>
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

			{/* ─── 설정 모달 ─── */}
			{settingsModel && (
				<div className="admin-modal-overlay" onClick={() => setSettingsModel(null)}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
							<h3 style={{ margin: 0 }}>
								<Settings2 size={18} />
								{settingsModel.display_name} 설정
								<span className="provider-badge" style={{
									borderColor: PROVIDERS[settingsModel.provider]?.color || "#888",
									color: PROVIDERS[settingsModel.provider]?.color || "#888",
									marginLeft: 8,
								}}>
									{PROVIDERS[settingsModel.provider]?.label || settingsModel.provider}
								</span>
							</h3>
							<button onClick={() => setSettingsModel(null)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>
								<X size={20} />
							</button>
						</div>

						{/* 시스템 프롬프트 */}
						<div className="prompt-editor" style={{ marginTop: 20 }}>
							<div className="prompt-editor-header">
								<h4><Edit3 size={13} /> 시스템 프롬프트</h4>
								{settingsModel.system_prompt && (
									<Button variant="ghost" size="sm" onClick={() => setPromptDraft("")}><RotateCcw size={12} /> 초기화</Button>
								)}
							</div>
							<textarea
								className="prompt-textarea"
								value={promptDraft}
								onChange={(e) => setPromptDraft(e.target.value)}
								placeholder="시스템 프롬프트를 입력하세요... (비워두면 기본값 사용)"
								rows={5}
							/>
						</div>

						{/* 파라미터 트윅 */}
						<div className="tweak-panel" style={{ marginTop: 12 }}>
							<h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
								<Sliders size={13} /> 파라미터 트윅
							</h4>
							<div className="tweak-grid">
								<div className="tweak-item">
									<label>Temperature</label>
									<Slider min={0} max={2} step={0.05} value={[configDraft.temperature]}
										onValueChange={(v) => setConfigDraft(d => ({ ...d, temperature: v[0] }))} />
									<span>{configDraft.temperature.toFixed(2)}</span>
								</div>
								<div className="tweak-item">
									<label>Max Tokens</label>
									<Input type="number" min={256} max={32768} step={256} value={configDraft.maxOutputTokens}
										onChange={(e) => setConfigDraft(d => ({ ...d, maxOutputTokens: parseInt(e.target.value) || 8192 }))} />
								</div>
								<div className="tweak-item">
									<label>Top P</label>
									<Slider min={0} max={1} step={0.01} value={[configDraft.topP]}
										onValueChange={(v) => setConfigDraft(d => ({ ...d, topP: v[0] }))} />
									<span>{configDraft.topP.toFixed(2)}</span>
								</div>
								<div className="tweak-item">
									<label>Top K</label>
									<Input type="number" min={0} max={100} value={configDraft.topK}
										onChange={(e) => setConfigDraft(d => ({ ...d, topK: parseInt(e.target.value) || 40 }))} />
								</div>
								{settingsModel.provider === "deepseek" && (
									<>
										<div className="tweak-item" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
											<label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0, fontWeight: 600 }}>
												<input type="checkbox" checked={configDraft.deepseekThinking} onChange={(e) => setConfigDraft(d => ({ ...d, deepseekThinking: e.target.checked }))} />
												Thinking Mode (추론 모델) 활성화
											</label>
											<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>DeepSeek V4 Pro 추론 기능. 활성화 시 temperature/top_p는 무시됩니다.</span>
										</div>
										{configDraft.deepseekThinking && (
											<div className="tweak-item" style={{ gridColumn: "1 / -1" }}>
												<label>Reasoning Effort</label>
												<select
													value={configDraft.deepseekReasoningEffort}
													onChange={(e) => setConfigDraft(d => ({ ...d, deepseekReasoningEffort: e.target.value as "high" | "max" }))}
													style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13 }}
												>
													<option value="high">high — 빠른 응답, 일반 추론</option>
													<option value="max">max — 깊은 추론, 복잡한 작업</option>
												</select>
											</div>
										)}
									</>
								)}
							{/* ── Gemini 전용 설정 ── */}
							{settingsModel.provider === "gemini" && (
								<>
									<div className="tweak-item" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border-color)" }}>
										<label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0, fontWeight: 600 }}>
											<input type="checkbox" checked={configDraft.thinkingEnabled} onChange={(e) => setConfigDraft(d => ({ ...d, thinkingEnabled: e.target.checked }))} />
											🧠 Thinking Mode (추론) 활성화
										</label>
										<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Gemini 3 Flash 사고 모드. 문제 해결 품질이 향상됩니다.</span>
									</div>
									{configDraft.thinkingEnabled && (
										<>
											<div className="tweak-item">
												<label>Reasoning Effort</label>
												<select
													value={configDraft.thinkingEffort}
													onChange={(e) => setConfigDraft(d => ({ ...d, thinkingEffort: e.target.value as "low" | "medium" | "high" }))}
													style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13 }}
												>
													<option value="low">low — 최소 추론, 빠른 응답</option>
													<option value="medium">medium — 균형 (기본값)</option>
													<option value="high">high — 깊은 추론, 복잡한 작업</option>
												</select>
											</div>
											<div className="tweak-item" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
												<label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0 }}>
													<input type="checkbox" checked={configDraft.includeThoughts} onChange={(e) => setConfigDraft(d => ({ ...d, includeThoughts: e.target.checked }))} />
													사고 요약 포함 (include_thoughts)
												</label>
												<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>모델의 추론 과정 요약을 응답에 포함합니다.</span>
											</div>
										</>
									)}
									<div className="tweak-item">
										<label>Service Tier</label>
										<select
											value={configDraft.serviceTier}
											onChange={(e) => setConfigDraft(d => ({ ...d, serviceTier: e.target.value as "" | "flex" | "priority" }))}
											style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13 }}
										>
											<option value="">default — 기본</option>
											<option value="flex">flex — 저비용 (비용 절감)</option>
											<option value="priority">priority — 고속 (레이턴시 최소화)</option>
										</select>
									</div>
								</>
							)}
							</div>
						</div>

						{/* API 키 연결 */}
						<div className="model-card-apikey" style={{ marginTop: 12 }}>
							<label><Key size={11} /> API 키:</label>
							<select
								value={settingsModel.api_key_id || ""}
								onChange={(e) => {
									const val = e.target.value || null;
									linkApiKey(settingsModel.model_id, val);
									setSettingsModel((prev) => (prev ? { ...prev, api_key_id: val } : null));
								}}
							>
								<option value="">환경변수 사용</option>
								{apiKeys.filter((k) => k.service === settingsModel.provider || k.service === "custom").map((k) => (
									<option key={k.id} value={k.id}>{k.name}</option>
								))}
							</select>
						</div>

						{/* Fallback 정보 */}
						{settingsModel.fallback_model_id && (
							<div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
								⚡ Fallback: {settingsModel.fallback_model_id} ({settingsModel.threshold_percent}% 초과 시)
							</div>
						)}

						{/* API 연결 테스트 */}
						<div className="test-connection-panel" style={{ marginTop: 12 }}>
							<div className="test-connection-header">
								<h4><Zap size={13} /> API 연결 테스트</h4>
								<Button
									className={`test-btn ${isTesting ? "testing" : ""}`}
									disabled={isTesting || !settingsModel.is_active}
									size="sm"
									onClick={async () => {
										setIsTesting(true);
										setTestResult(null);
										const result = await testApiConnection();
										setTestResult(result);
										setIsTesting(false);
									}}
								>
									{isTesting ? (
										<><Loader2 size={12} className="animate-spin" /> 테스트 중...</>
									) : (
										<><Zap size={12} /> 테스트 실행</>
									)}
								</Button>
							</div>
							{!settingsModel.is_active && (
								<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
									※ 활성 모델만 테스트할 수 있습니다
								</div>
							)}
							{testResult && (
								<div className={`test-result ${testResult.success ? "success" : "error"}`}>
									<div className="test-result-header">
										<span className="test-result-status">{testResult.success ? "✅" : "❌"}</span>
										<strong>{testResult.modelId}</strong>
										<span className="test-result-provider">{testResult.provider}</span>
										<span className="test-result-time">{testResult.responseTimeMs}ms</span>
									</div>
									<div className="test-result-message">{testResult.message}</div>
									{testResult.responseSnippet && (
										<div className="test-result-snippet">
											<code>{testResult.responseSnippet}</code>
										</div>
									)}
								</div>
							)}
						</div>

						{/* 저장/취소 */}
						<div className="admin-modal-actions">
							<Button variant="secondary" onClick={() => setSettingsModel(null)}>취소</Button>
							<Button onClick={() => {
								saveSystemPrompt(settingsModel.model_id, promptDraft);
								saveGenerationConfig(settingsModel.model_id, configDraft);
								setSettingsModel(null);
							}}>
								<Save size={14} /> 저장
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

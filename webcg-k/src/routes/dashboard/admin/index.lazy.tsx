/**
 * Admin Page — 관리자 페이지 (오케스트레이터)
 * 3-탭 구조: 사용자 관리 / AI 관리 / API 키 관리
 *
 * 서브 컴포넌트: AdminUsersTab, AdminAiTab, AdminApiKeysTab
 * 타입/상수: adminTypes.ts
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import {
	Bot,
	Key,
	Shield,
	Sparkles,
	Users,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import type { UserRole } from "../../../lib/auth";
import {
	fetchProfilesWithMemberships,
	changeRole as changeRoleService,
	fetchModels,
	fetchUsageSummary,
	fetchUsageByModel,
	switchModel as switchModelService,
	addModel as addModelService,
	deleteModel as deleteModelService,
	saveSystemPrompt as saveSystemPromptService,
	saveGenerationConfig as saveGenerationConfigService,
	linkApiKey as linkApiKeyService,
	fetchApiKeys,
	saveApiKey as saveApiKeyService,
	deleteApiKey as deleteApiKeyService,
} from "../../../services/adminService";

import { invalidateModelCache, testApiConnection } from "../../../services/aiCgService";
import { fetchAllWorkspaces } from "../../../services/workspaceService";
import type { AdminTab, ModelConfig, ApiKey } from "./-adminTypes";
import { PROVIDERS } from "./-adminTypes";
import { AdminUsersTab } from "./-AdminUsersTab";
import { AdminAiTab } from "./-AdminAiTab";
import { AdminApiKeysTab } from "./-AdminApiKeysTab";
import { AdminWorkspacesTab } from "./-AdminWorkspacesTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./index.css";

export const Route = createLazyFileRoute("/dashboard/admin/")({
	component: AdminPage,
});

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

function AdminPage() {
	const { profile, user } = useAuth();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<AdminTab>("users");

	// ─── 사용자 관리 상태 (워크스페이스 멤버십 포함) ────────────────
	const { data: profiles = [], isLoading: loading } = useQuery({
		queryKey: ["admin_profiles"],
		queryFn: fetchProfilesWithMemberships,
	})
	const [globalFilter, setGlobalFilter] = useState("");

	// ─── AI 관리 상태 ───────────────────────────────────────────
	const { data: models = [], isLoading: modelsLoading } = useQuery({
		queryKey: ["admin_ai_models"],
		queryFn: () => fetchModels<ModelConfig>(),
	})
	const { data: usageSummary = { totalRequests: 0, totalTokens: 0, todayRequests: 0, todayTokens: 0 } } = useQuery({
		queryKey: ["admin_ai_usage"],
		queryFn: fetchUsageSummary,
	})
	const { data: usageByModel = {} } = useQuery({
		queryKey: ["admin_ai_usage_by_model"],
		queryFn: fetchUsageByModel,
	})
	const [showModelModal, setShowModelModal] = useState(false);
	const [modelForm, setModelForm] = useState({ model_id: "", display_name: "", provider: "gemini", base_url: "", tier: "free", rpm_limit: 30, rpd_limit: 1500, description: "" });

	// ─── API 키 상태 ────────────────────────────────────────────
	const { data: apiKeys = [] } = useQuery({
		queryKey: ["admin_api_keys"],
		queryFn: () => fetchApiKeys<ApiKey>(),
		enabled: !!user,
	})

	// ─── 워크스페이스 관리 ────────────────────────────────────────
	const { data: workspaces = [] } = useQuery({
		queryKey: ["admin", "workspaces"],
		queryFn: fetchAllWorkspaces,
		enabled: !!user,
	})
	const [showApiKeyModal, setShowApiKeyModal] = useState(false);
	const [apiKeyForm, setApiKeyForm] = useState({ name: "", service: "gemini", key: "" });
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	// ─── 사용자 CRUD ────────────────────────────────────────────

	const changeRole = useCallback(
		async (userId: string, newRole: UserRole) => {
			if (userId === user?.id) return;
			try {
				await changeRoleService(userId, newRole);
				queryClient.invalidateQueries({ queryKey: ["admin_profiles"] });
			} catch (err) {
				console.error("Error changing role:", err);
			}
		},
		[user, queryClient],
	)

	// ─── AI 모델 관리 ──────────────────────────────────────

	const switchModel = useCallback(
		async (modelId: string) => {
			try {
				await switchModelService(modelId);
				invalidateModelCache();
				queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
			} catch (err) {
				console.error("[Admin] 모델 전환 실패:", err);
			}
		},
		[queryClient],
	)



	const addModel = useCallback(async () => {
		if (!modelForm.model_id || !modelForm.display_name) return;
		try {
			const defaultUrl: Record<string, string> = {
				gemini: "https://generativelanguage.googleapis.com/v1beta/models",
				deepseek: "https://api.deepseek.com",
				groq: "https://api.groq.com/openai/v1",
				github: "https://models.inference.ai.azure.com",
				openrouter: "https://openrouter.ai/api/v1",
			}
			await addModelService({
				model_id: modelForm.model_id,
				display_name: modelForm.display_name,
				provider: modelForm.provider,
				base_url: modelForm.base_url || defaultUrl[modelForm.provider] || "",
				tier: modelForm.tier,
				rpm_limit: modelForm.rpm_limit,
				rpd_limit: modelForm.rpd_limit,
				description: modelForm.description || null,
				is_active: false,
			})
			setShowModelModal(false);
			setModelForm({ model_id: "", display_name: "", provider: "gemini", base_url: "", tier: "free", rpm_limit: 30, rpd_limit: 1500, description: "" });
			queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
		} catch (err) {
			console.error("[Admin] 모델 추가 실패:", err);
			alert("모델 추가 실패");
		}
	}, [modelForm, queryClient]);

	const deleteModel = useCallback(async (modelId: string) => {
		try {
			await deleteModelService(modelId);
			queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
		} catch (err) {
			console.error("[Admin] 모델 삭제 실패:", err);
		}
	}, [queryClient]);

	const saveSystemPrompt = useCallback(async (modelId: string, prompt: string) => {
		try {
			await saveSystemPromptService(modelId, prompt);
			invalidateModelCache();
			queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
		} catch (err) {
			console.error("[Admin] 프롬프트 저장 실패:", err);
		}
	}, [queryClient]);

	const saveGenerationConfig = useCallback(async (modelId: string, config: Record<string, unknown>) => {
		try {
			await saveGenerationConfigService(modelId, config);
			invalidateModelCache();
			queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
		} catch (err) {
			console.error("[Admin] 설정 저장 실패:", err);
		}
	}, [queryClient]);

	const linkApiKey = useCallback(async (modelId: string, apiKeyId: string | null) => {
		try {
			await linkApiKeyService(modelId, apiKeyId);
			invalidateModelCache();
			queryClient.invalidateQueries({ queryKey: ["admin_ai_models"] });
		} catch (err) {
			console.error("[Admin] API 키 연결 실패:", err);
		}
	}, [queryClient]);

	// ─── API 키 CRUD ────────────────────────────────────────────

	const saveApiKey = useCallback(async () => {
		if (!user || !apiKeyForm.name || !apiKeyForm.key) return;
		try {
			await saveApiKeyService({
				owner_id: user.id,
				name: apiKeyForm.name,
				service: apiKeyForm.service || "custom",
				encrypted_key: apiKeyForm.key,
			})
			setShowApiKeyModal(false);
			setApiKeyForm({ name: "", service: "", key: "" });
			queryClient.invalidateQueries({ queryKey: ["admin_api_keys"] });
		} catch (err) {
			console.error("[Admin] API 키 저장 실패:", err);
			alert("API 키 저장 실패");
		}
	}, [user, apiKeyForm, queryClient]);

	const deleteApiKey = useCallback(
		async (id: string) => {
			try {
				await deleteApiKeyService(id);
				setDeleteConfirm(null);
				queryClient.invalidateQueries({ queryKey: ["admin_api_keys"] });
			} catch (err) {
				console.error("[Admin] API 키 삭제 실패:", err);
			}
		},
		[queryClient],
	)

	// ─── 파생 값 ────────────────────────────────────────────────

	const activeModel = useMemo(() => models.find((m) => m.is_active), [models]);
	const userStats = useMemo(() => {
		const total = profiles.length;
		const admins = profiles.filter((p) => p.role === "system_admin").length;
		return { total, admins };
	}, [profiles]);

	// ─── 권한 체크 ──────────────────────────────────────────────

	if (!profile?.is_admin && profile?.role !== "system_admin") {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 80 }}>
				<Shield size={56} className="text-accent-destructive" style={{ marginBottom: 16, opacity: 0.5 }} />
				<h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>접근 권한이 없습니다</h2>
				<p style={{ color: "var(--text-secondary)" }}>시스템 관리자만 접근할 수 있는 페이지입니다.</p>
			</div>
		)
	}

	// ─── 렌더링 ─────────────────────────────────────────────────

	return (
		<div className="page-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			{/* 헤더 */}
			<div className="page-header">
				<div className="page-header-left">
					<h1 className="page-title">관리자</h1>
					<p className="page-description">시스템 사용자, AI 모델, API 키를 관리합니다</p>
				</div>
			</div>

			{/* 탭 바 */}
			<div className="admin-tabs">
				<button
					className={`admin-tab ${activeTab === "users" ? "active" : ""}`}
					onClick={() => setActiveTab("users")}
				>
					<Users size={15} />
					사용자 관리
					<span className="tab-badge">{userStats.total}</span>
				</button>
				<button
					className={`admin-tab ${activeTab === "ai" ? "active" : ""}`}
					onClick={() => setActiveTab("ai")}
				>
					<Sparkles size={15} />
					AI 관리
				</button>
			<button
				className={`admin-tab ${activeTab === "workspaces" ? "active" : ""}`}
				onClick={() => setActiveTab("workspaces")}
			>
				<Shield size={15} />
				워크스페이스
				<span className="tab-badge">{workspaces.length}</span>
			</button>
				<button
					className={`admin-tab ${activeTab === "api-keys" ? "active" : ""}`}
					onClick={() => setActiveTab("api-keys")}
				>
					<Key size={15} />
					API 키
					<span className="tab-badge">{apiKeys.length}</span>
				</button>
			</div>

			{/* ─── 사용자 관리 탭 ── */}
			{activeTab === "users" && (
				<AdminUsersTab
					profiles={profiles}
					loading={loading}
					globalFilter={globalFilter}
					setGlobalFilter={setGlobalFilter}
					userId={user?.id}
					changeRole={changeRole}
                        workspaces={workspaces}
				/>
			)}

			{/* ─── AI 관리 탭 ── */}
			{activeTab === "ai" && (
				<AdminAiTab
					models={models}
					modelsLoading={modelsLoading}
					usageSummary={usageSummary}
					usageByModel={usageByModel}
					apiKeys={apiKeys}
					activeModel={activeModel}
					setShowModelModal={setShowModelModal}
					switchModel={switchModel}
					deleteModel={deleteModel}
					saveSystemPrompt={saveSystemPrompt}
					saveGenerationConfig={saveGenerationConfig}
					linkApiKey={linkApiKey}
					testApiConnection={testApiConnection}
				/>
			)}

			{/* ─── API 키 탭 ── */}

			{/* ─── 워크스페이스 탭 ── */}
			{activeTab === "workspaces" && (
				<AdminWorkspacesTab />
			)}

			{activeTab === "api-keys" && (
				<AdminApiKeysTab
					apiKeys={apiKeys}
					deleteConfirm={deleteConfirm}
					setDeleteConfirm={setDeleteConfirm}
					deleteApiKey={deleteApiKey}
					showApiKeyModal={showApiKeyModal}
					setShowApiKeyModal={setShowApiKeyModal}
					apiKeyForm={apiKeyForm}
					setApiKeyForm={setApiKeyForm}
					saveApiKey={saveApiKey}
				/>
			)}

			{/* ─── 모델 추가 모달 ── */}
			{showModelModal && (
				<div className="admin-modal-overlay" onClick={() => setShowModelModal(false)}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
						<h3><Bot size={18} /> 모델 추가</h3>
						<div className="input-group">
							<label>프로바이더 *</label>
							<select value={modelForm.provider}
								onChange={(e) => setModelForm((f) => ({ ...f, provider: e.target.value }))}>
								{Object.entries(PROVIDERS).map(([key, meta]) => (
									<option key={key} value={key}>{meta.label}</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label>모델 ID *</label>
							<Input type="text" placeholder="예: gpt-4o-mini" value={modelForm.model_id}
								onChange={(e) => setModelForm((f) => ({ ...f, model_id: e.target.value }))} />
						</div>
						<div className="input-group">
							<label>표시 이름 *</label>
							<Input type="text" placeholder="예: GPT-4o Mini" value={modelForm.display_name}
								onChange={(e) => setModelForm((f) => ({ ...f, display_name: e.target.value }))} />
						</div>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
							<div className="input-group">
								<label>티어</label>
								<select value={modelForm.tier}
									onChange={(e) => setModelForm((f) => ({ ...f, tier: e.target.value }))}>
									<option value="free">Free</option>
									<option value="paid">Paid</option>
								</select>
							</div>
							<div className="input-group">
								<label>RPM 한도</label>
								<Input type="number" value={modelForm.rpm_limit}
									onChange={(e) => setModelForm((f) => ({ ...f, rpm_limit: parseInt(e.target.value) || 30 }))} />
							</div>
							<div className="input-group">
								<label>RPD 한도</label>
								<Input type="number" value={modelForm.rpd_limit}
									onChange={(e) => setModelForm((f) => ({ ...f, rpd_limit: parseInt(e.target.value) || 1500 }))} />
							</div>
						</div>
						<div className="input-group">
							<label>설명</label>
							<Input type="text" placeholder="모델 설명 (선택)" value={modelForm.description}
								onChange={(e) => setModelForm((f) => ({ ...f, description: e.target.value }))} />
						</div>
						<div className="admin-modal-actions">
							<Button variant="secondary" onClick={() => setShowModelModal(false)}>취소</Button>
							<Button onClick={addModel}
								disabled={!modelForm.model_id || !modelForm.display_name}>추가</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

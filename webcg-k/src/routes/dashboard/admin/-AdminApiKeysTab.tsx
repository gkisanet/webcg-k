/**
 * Admin API 키 관리 탭
 * admin.tsx에서 분리 — API 키 카드 + 추가/삭제
 */

import { Key, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiKey } from "./-adminTypes";
import { PROVIDERS, SERVICE_OPTIONS, maskKey } from "./-adminTypes";

// ─── Props ──────────────────────────────────────────────────────

interface AdminApiKeysTabProps {
	apiKeys: ApiKey[];
	deleteConfirm: string | null;
	setDeleteConfirm: (id: string | null) => void;
	deleteApiKey: (id: string) => void;
	// 모달
	showApiKeyModal: boolean;
	setShowApiKeyModal: (v: boolean) => void;
	apiKeyForm: { name: string; service: string; key: string };
	setApiKeyForm: React.Dispatch<React.SetStateAction<{ name: string; service: string; key: string }>>;
	saveApiKey: () => void;
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function AdminApiKeysTab({
	apiKeys,
	deleteConfirm,
	setDeleteConfirm,
	deleteApiKey,
	showApiKeyModal,
	setShowApiKeyModal,
	apiKeyForm,
	setApiKeyForm,
	saveApiKey,
}: AdminApiKeysTabProps) {
	const { t, i18n } = useTranslation("admin");

	return (
		<>
			<h3 className="admin-section-title" style={{ marginBottom: 16 }}>
				<Key size={16} /> {t("apiKeysTab.title")}
			</h3>

			<div className="api-key-cards">
				{apiKeys.map((k) => (
					<div key={k.id} className="api-key-card">
						<div className="api-key-card-header">
							<div className="api-key-card-name">
								<Key size={14} />
								{k.name}
							</div>
							{k.service && (
								<span className="api-key-card-service">{k.service}</span>
							)}
						</div>
						<div className="api-key-card-key">{maskKey(k.encrypted_key)}</div>
						<div className="api-key-card-date">
							{t("apiKeysTab.registered")} {new Date(k.created_at).toLocaleDateString(i18n.language === "ko" ? "ko-KR" : "en-US")}
						</div>
						<div className="api-key-card-actions">
							{deleteConfirm === k.id ? (
								<>
									<Button variant="destructive" size="sm" onClick={() => deleteApiKey(k.id)}>
										{t("apiKeysTab.deleteConfirm")}
									</Button>
									<Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
										{t("apiKeysTab.cancel")}
									</Button>
								</>
							) : (
								<Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(k.id)}>
									<Trash2 size={12} /> {t("apiKeysTab.delete")}
								</Button>
							)}
						</div>
					</div>
				))}

				{/* 추가 카드 */}
				<button className="api-key-add-card" onClick={() => setShowApiKeyModal(true)}>
					<Plus size={24} />
					{t("apiKeysTab.addKeyCard")}
				</button>
			</div>

			{apiKeys.length === 0 && (
				<div className="admin-empty-state" style={{ marginTop: 20 }}>
					<Key size={32} />
					<p>{t("apiKeysTab.noKeys")}</p>
				</div>
			)}

			{/* API 키 추가 모달 */}
			{showApiKeyModal && (
				<div className="admin-modal-overlay" onClick={() => setShowApiKeyModal(false)}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()}>
						<h3><Key size={18} /> {t("apiKeysTab.addKey")}</h3>
						<div className="input-group">
							<label>{t("apiKeysTab.name")}</label>
							<Input type="text" placeholder={t("apiKeysTab.namePlaceholder")} value={apiKeyForm.name}
								onChange={(e) => setApiKeyForm((f) => ({ ...f, name: e.target.value }))} />
						</div>
						<div className="input-group">
							<label>{t("apiKeysTab.service")}</label>
							<select value={apiKeyForm.service}
								onChange={(e) => setApiKeyForm((f) => ({ ...f, service: e.target.value }))}>
								{SERVICE_OPTIONS.map((s) => (
									<option key={s} value={s}>{PROVIDERS[s]?.label || s}</option>
								))}
							</select>
						</div>
						<div className="input-group">
							<label>{t("apiKeysTab.key")}</label>
							<Input type="password" placeholder={t("apiKeysTab.keyPlaceholder")} value={apiKeyForm.key}
								onChange={(e) => setApiKeyForm((f) => ({ ...f, key: e.target.value }))} />
						</div>
						<div className="admin-modal-actions">
							<Button variant="secondary" onClick={() => setShowApiKeyModal(false)}>
								{t("apiKeysTab.cancel")}
							</Button>
							<Button onClick={saveApiKey} disabled={!apiKeyForm.name || !apiKeyForm.key}>
								{t("apiKeysTab.save")}
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}


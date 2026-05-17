/**
 * Admin 페이지 — 타입/상수/헬퍼
 * admin.tsx, AdminUsersTab, AdminAiTab, AdminApiKeysTab에서 공유
 */

import type { UserRole } from "../../../lib/auth";

// ─── 타입 정의 ────────────────────────────────────────────────────

export interface Profile {
	id: string;
	display_name: string | null;
	is_admin: boolean;
	role: UserRole;
	updated_at: string;
	created_at: string;
}

export interface ModelConfig {
	id: string;
	model_id: string;
	display_name: string;
	tier: string;
	rpm_limit: number;
	rpd_limit: number;
	tpm_limit: number;
	tpd_limit: number;
	is_active: boolean;
	fallback_model_id: string | null;
	threshold_percent: number;
	updated_at: string;
	// 다중 프로바이더 확장 필드
	provider: string;
	base_url: string | null;
	api_key_id: string | null;
	system_prompt: string | null;
	generation_config: Record<string, unknown> | null;
	description: string | null;
}

export interface ApiKey {
	id: string;
	name: string;
	service: string;
	encrypted_key: string;
	created_at: string;
}

export type AdminTab = "users" | "workspaces" | "ai" | "api-keys";

// ─── 워크스페이스 타입 ──────────────────────────────────────────

export interface Workspace {
	id: string;
	name: string;
	slug: string | null;
	description: string | null;
	created_by: string;
	created_at: string;
	memberCount?: number;
}

export interface WorkspaceMember {
	id: string;
	workspace_id: string;
	user_id: string;
	role: "owner" | "admin" | "member" | "viewer";
	joined_at: string;
	profile?: Profile;
}

export interface MembershipInfo {
	workspace_id: string;
	workspace_name: string;
	role: "owner" | "admin" | "member" | "viewer";
}

export type ProfileWithMemberships = Profile & { memberships: MembershipInfo[] };

// ─── 상수 ─────────────────────────────────────────────────────────

export const AVATAR_GRADIENT_COUNT = 8;

/** 역할 라벨/색상 매핑 */
export const ROLE_META: Record<UserRole, { label: string; color: string; icon: string }> = {
	system_admin: { label: "시스템 관리자", color: "#ef4444", icon: "🛡️" },
	cg_designer: { label: "CG 디자이너", color: "#8b5cf6", icon: "🎨" },
	cuesheet_editor: { label: "큐시트 편집자", color: "#3b82f6", icon: "📝" },
	playout_operator: { label: "송출 오퍼레이터", color: "#10b981", icon: "🎬" },
	viewer: { label: "뷰어", color: "#6b7280", icon: "👁" },
};

/** 프로바이더 메타 정보 */
export const PROVIDERS: Record<string, { label: string; color: string }> = {
	gemini: { label: "Google Gemini", color: "#4285f4" },
	"gemini-svg": { label: "Gemini SVG (3.1 Pro)", color: "#34a853" },
	deepseek: { label: "DeepSeek", color: "#00d4aa" },
	groq: { label: "Groq", color: "#f55036" },
	github: { label: "GitHub Models", color: "#8b5cf6" },
	openrouter: { label: "OpenRouter", color: "#f59e0b" },
	cerebras: { label: "Cerebras", color: "#00bcd4" },
};

export const SERVICE_OPTIONS = ["gemini", "gemini-svg", "deepseek", "groq", "github", "openrouter", "cerebras", "custom"];

// ─── 헬퍼 ─────────────────────────────────────────────────────────

/** 사용자 ID 기반 그라데이션 인덱스 */
export function getAvatarGradient(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	}
	return Math.abs(hash) % AVATAR_GRADIENT_COUNT;
}

/** 이니셜 추출 */
export function getInitials(name: string | null): string {
	if (!name) return "?";
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

/** API 키 마스킹 */
export function maskKey(key: string): string {
	if (key.length <= 8) return "••••••••";
	return key.slice(0, 4) + "••••" + key.slice(-4);
}

/** 사용자 통계 계산 */
export function computeUserStats(profiles: Profile[]) {
	const total = profiles.length;
	const admins = profiles.filter((p) => p.role === "system_admin").length;
	const designers = profiles.filter((p) => p.role === "cg_designer").length;
	const editors = profiles.filter((p) => p.role === "cuesheet_editor").length;
	const operators = profiles.filter((p) => p.role === "playout_operator").length;
	const recentWeek = profiles.filter(
		(p) => new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
	).length;
	return { total, admins, designers, editors, operators, recentWeek };
}

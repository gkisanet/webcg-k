/**
 * Auth Context
 * Supabase 인증 상태 관리
 */

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

// 사용자 역할 타입 정의 (5종)
export type UserRole = "system_admin" | "cg_designer" | "cuesheet_editor" | "playout_operator" | "viewer";

// 사용자 프로필 타입 정의
export interface UserProfile {
	id: string;
	display_name: string | null;
	is_admin: boolean;
	role: UserRole;
	avatar_url?: string | null;
	last_login_at?: string | null;
	active_workspace_id: string | null;
}

interface AuthContextType {
	user: User | null;
	profile: UserProfile | null;
	session: Session | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
	signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
	signOut: () => Promise<void>;
	activeWorkspaceId: string | null;
	setActiveWorkspace: (workspaceId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

	// 프로필 가져오기 (없으면 생성, 둘 다 실패하면 stale 세션으로 간주하여 자동 로그아웃)
	const fetchProfile = async (userObj: User) => {
		console.log("[Auth] Fetching profile for user:", userObj.id);
		try {
			const { data, error } = await supabase
				.from("profiles")
				.select("*")
				.eq("id", userObj.id)
				.single();

			console.log("[Auth] Profile query result:", { data, error });

			if (error) {
				if (error.code === "PGRST116") {
					console.warn("[Auth] Profile not found, attempting to create...");

					const { data: newProfile, error: createError } = (await supabase
						.from("profiles")
						.insert({
							id: userObj.id,
							display_name: userObj.email?.split("@")[0] || "User",
							is_admin: false,
						} as any)
						.select()
						.single()) as any;

					console.log("[Auth] Profile creation result:", { newProfile, createError });

					if (newProfile && !createError) {
						console.log("[Auth] ✅ New profile created successfully");
						setProfile(newProfile as unknown as UserProfile);
						return;
					}

					// 프로필 생성도 실패 → DB reset 후 stale 세션으로 간주
					console.error("[Auth] ❌ Profile creation failed — stale session detected, signing out...");
					await forceSignOut();
					return;
				}

				// RLS, 네트워크 에러 등 → stale 세션 가능성
				console.error("[Auth] ❌ Unexpected error fetching profile:", error);
				await forceSignOut();
				return;
			}

			if (data) {
				console.log("[Auth] ✅ Profile loaded successfully:", data);
				const p = data as unknown as UserProfile;
				const resolvedWorkspaceId = await resolveActiveWorkspaceForSingleMembership(
					userObj.id,
					p.active_workspace_id,
				);
				const nextProfile = resolvedWorkspaceId !== p.active_workspace_id
					? { ...p, active_workspace_id: resolvedWorkspaceId }
					: p;
				setProfile(nextProfile);
				setActiveWorkspaceId(resolvedWorkspaceId);
			} else {
				console.warn("[Auth] ⚠️ No data and no error — signing out");
				await forceSignOut();
			}
		} catch (error) {
			console.error("[Auth] ❌ Exception in fetchProfile:", error);
			await forceSignOut();
		}
	};

	const resolveActiveWorkspaceForSingleMembership = async (
		userId: string,
		currentWorkspaceId: string | null,
	): Promise<string | null> => {
		const { data: memberships, error } = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", userId);

		if (error) {
			console.error("[Auth] Failed to resolve workspace membership:", error);
			return currentWorkspaceId;
		}

		if ((memberships?.length ?? 0) !== 1) {
			return currentWorkspaceId;
		}

		const onlyWorkspaceId = (memberships?.[0] as { workspace_id: string }).workspace_id;
		if (currentWorkspaceId === onlyWorkspaceId) {
			return currentWorkspaceId;
		}

		const { error: updateError } = await supabase
			.from("profiles")
			.update({ active_workspace_id: onlyWorkspaceId } as any)
			.eq("id", userId);

		if (updateError) {
			console.error("[Auth] Failed to auto-select single workspace:", updateError);
			return currentWorkspaceId;
		}

		return onlyWorkspaceId;
	};

	useEffect(() => {
		// ─── URL ?reset 파라미터: 강제 세션 초기화 ───────────
		const params = new URLSearchParams(window.location.search);
		if (params.has("reset")) {
			console.log("[Auth] 🔄 Force reset requested via URL param");
			forceSignOut();
			return;
		}

		// ─── Ctrl+Shift+K: 개발용 강제 초기화 단축키 ─────────
		const handleDevReset = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && e.key === "K") {
				e.preventDefault();
				console.log("[Auth] 🔄 Force reset via Ctrl+Shift+K");
				forceSignOut();
			}
		};
		window.addEventListener("keydown", handleDevReset);

		// 초기 세션 확인
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			setUser(session?.user ?? null);
			if (session?.user) {
				fetchProfile(session.user);
			}
			setLoading(false);
		});

		// 인증 상태 변화 구독
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			setSession(session);
			setUser(session?.user ?? null);
			// SIGNED_IN/SIGNED_OUT 시에만 프로필 로드
			// TOKEN_REFRESHED 이벤트는 토큰만 갱신되므로 불필요한 DB 쿼리 + 리렌더 방지
			if (event === "SIGNED_IN" && session?.user) {
				fetchProfile(session.user);
			} else if (event === "SIGNED_OUT") {
				setProfile(null);
				setActiveWorkspaceId(null);
			}
			setLoading(false);
		});

		return () => {
			subscription.unsubscribe();
			window.removeEventListener("keydown", handleDevReset);
		};
	}, []);

	const setActiveWorkspace = useCallback(async (workspaceId: string) => {
		if (!user?.id) return;
		const { error } = await supabase
			.from("profiles")
			.update({ active_workspace_id: workspaceId } as any)
			.eq("id", user.id);
		if (!error) {
			setActiveWorkspaceId(workspaceId);
			setProfile((prev) => prev ? { ...prev, active_workspace_id: workspaceId } : prev);
		}
	}, [user?.id]);

	const signIn = async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		return { error: error as Error | null };
	};

	const signUp = async (email: string, password: string) => {
		const { error } = await supabase.auth.signUp({
			email,
			password,
		});
		return { error: error as Error | null };
	};

	// 강제 세션 초기화 (localStorage 포함 완전 클리어)
	const forceSignOut = async () => {
		console.log("[Auth] 🔄 Force sign out — clearing all auth state");
		try {
			await supabase.auth.signOut();
		} catch {
			// signOut 실패해도 localStorage는 강제 클리어
		}
		// Supabase localStorage 키 강제 삭제 (signOut 실패 대비)
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith("sb-")) {
				localStorage.removeItem(key);
			}
		}
		setUser(null);
		setProfile(null);
		setSession(null);
		setActiveWorkspaceId(null);
		setLoading(false);
		// URL 파라미터 정리 후 로그인 페이지로 이동
		window.location.href = "/login";
	};

	const signOut = async () => {
		await forceSignOut();
	};

	return (
		<AuthContext.Provider
			value={{ user, profile, session, loading, signIn, signUp, signOut, activeWorkspaceId, setActiveWorkspace }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

/** 현재 사용자의 역할 반환 */
export function useRole(): UserRole {
	const { profile } = useAuth();
	return profile?.role ?? "viewer";
}

/** 특정 역할 보유 여부 확인 (system_admin은 모든 역할 포함) */
export function useHasRole(requiredRole: UserRole): boolean {
	const role = useRole();
	if (role === "system_admin") return true;
	return role === requiredRole;
}

/** 여러 역할 중 하나라도 보유하는지 확인 */
export function useHasAnyRole(roles: UserRole[]): boolean {
	const role = useRole();
	if (role === "system_admin") return true;
	return roles.includes(role);
}

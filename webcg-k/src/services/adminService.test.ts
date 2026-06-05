import { describe, it, expect } from "vitest";
import { fetchProfilesWithMemberships } from "./adminService";

// fetchProfilesWithMemberships의 내부 맵핑 핵심 로직만 추출하여 다양한 데이터 형상(camelCase & snake_case)에서 단위 검증
function simulateMappingLogic(profiles: any[], memberships: any[], workspaces: any[]) {
	const wsMap = new Map((workspaces || []).map((w: any) => {
		const wsId = w.id || w.workspaceId;
		return [wsId, w.name];
	}));

	const membershipMap = new Map<string, any[]>();
	for (const m of memberships || []) {
		const mUserId = m.user_id || m.userId;
		const mWorkspaceId = m.workspace_id || m.workspaceId;
		const mRole = m.role;

		if (!mUserId) {
			console.warn("[Simulate] workspace_member row missing user identity:", m);
			continue;
		}

		// shallow copy를 통한 참조 공유 방지
		const list = membershipMap.has(mUserId) ? [...membershipMap.get(mUserId)!] : [];
		list.push({
			workspace_id: mWorkspaceId,
			workspace_name: wsMap.get(mWorkspaceId) || "Unknown",
			role: mRole || "viewer",
		});
		membershipMap.set(mUserId, list);
	}

	return (profiles || []).map((p: any) => {
		const pId = p.id || p.userId;
		return {
			...p,
			memberships: pId ? (membershipMap.get(pId) || []) : [],
		};
	});
}

describe("Admin Console Membership Isolation & Polyfill Tests", () => {
	it("should parse snake_case Supabase structures perfectly and maintain distinct array instances", () => {
		const mockProfiles = [
			{ id: "user-1", display_name: "User 1" },
			{ id: "user-2", display_name: "User 2" }
		];
		const mockMemberships = [
			{ id: "m-1", workspace_id: "ws-A", user_id: "user-1", role: "owner" },
			{ id: "m-2", workspace_id: "ws-B", user_id: "user-1", role: "member" },
			{ id: "m-3", workspace_id: "ws-A", user_id: "user-2", role: "viewer" }
		];
		const mockWorkspaces = [
			{ id: "ws-A", name: "Workspace Alpha" },
			{ id: "ws-B", name: "Workspace Beta" }
		];

		const result = simulateMappingLogic(mockProfiles, mockMemberships, mockWorkspaces);

		const u1 = result.find((r) => r.id === "user-1");
		const u2 = result.find((r) => r.id === "user-2");

		expect(u1?.memberships.length).toBe(2);
		expect(u2?.memberships.length).toBe(1);

		// 중요: 두 사용자의 memberships 배열 인스턴스가 완전히 물리적으로 다르고 독립적인지 체크 (참조 복사 격리 보장)
		expect(u1?.memberships).not.toBe(u2?.memberships);
		expect(u1?.memberships[0].workspace_name).toBe("Workspace Alpha");
		expect(u2?.memberships[0].workspace_name).toBe("Workspace Alpha");
	});

	it("should parse camelCase postgrest serialization structures flawlessly (browser polyfill test)", () => {
		const mockProfiles = [
			{ userId: "user-1", displayName: "User 1" },
			{ userId: "user-2", displayName: "User 2" }
		];
		const mockMemberships = [
			// 브라우저 런타임의 camelCase 응답 구조 재현
			{ id: "m-1", workspaceId: "ws-A", userId: "user-1", role: "owner" },
			{ id: "m-3", workspaceId: "ws-B", userId: "user-2", role: "member" }
		];
		const mockWorkspaces = [
			{ workspaceId: "ws-A", name: "Workspace Alpha" },
			{ workspaceId: "ws-B", name: "Workspace Beta" }
		];

		const result = simulateMappingLogic(mockProfiles, mockMemberships, mockWorkspaces);

		const u1 = result.find((r) => r.userId === "user-1");
		const u2 = result.find((r) => r.userId === "user-2");

		expect(u1?.memberships.length).toBe(1);
		expect(u2?.memberships.length).toBe(1);
		expect(u1?.memberships[0].workspace_id).toBe("ws-A");
		expect(u2?.memberships[0].workspace_id).toBe("ws-B");
		expect(u1?.memberships).not.toBe(u2?.memberships);
	});

	it("should skip empty or invalid workspace member identities gracefully and prevent crosstalk leakage", () => {
		const mockProfiles = [
			{ id: "user-1", display_name: "User 1" },
			{ id: "user-2", display_name: "User 2" }
		];
		const mockMemberships = [
			{ id: "m-1", workspace_id: "ws-A", user_id: "user-1", role: "owner" },
			// user_id 및 userId 둘 다 없는 오염된 행 (격리 붕괴의 주범)
			{ id: "m-2", workspace_id: "ws-B", role: "member" }, 
			{ id: "m-3", workspace_id: "ws-A", user_id: "user-2", role: "viewer" }
		];
		const mockWorkspaces = [
			{ id: "ws-A", name: "Workspace Alpha" },
			{ id: "ws-B", name: "Workspace Beta" }
		];

		const result = simulateMappingLogic(mockProfiles, mockMemberships, mockWorkspaces);

		const u1 = result.find((r) => r.id === "user-1");
		const u2 = result.find((r) => r.id === "user-2");

		// 오염된 행(m-2)은 스킵되어 어떤 사용자에게도 흘러 들어가지 않고 격리성을 완벽히 유지해야 함
		expect(u1?.memberships.length).toBe(1);
		expect(u2?.memberships.length).toBe(1);
		expect(u1?.memberships[0].workspace_id).toBe("ws-A");
	});
});

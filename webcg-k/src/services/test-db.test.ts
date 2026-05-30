import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const serviceRoleKey = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseUrl = "http://127.0.0.1:54321";
const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

// adminService.ts의 fetchProfilesWithMemberships 로직을 그대로 가져와서 service_role 클라이언트로 테스트 실행
async function testFetchProfilesWithMemberships() {
	const [{ data: profiles }, { data: memberships }, { data: workspaces }] = await Promise.all([
		adminSupabase.from("profiles").select("*").order("created_at", { ascending: false }),
		adminSupabase.from("workspace_members").select("*"),
		adminSupabase.from("workspaces").select("id, name"),
	]);

	console.log("=== DEBUG: workspaces raw ===");
	console.log(workspaces);

	console.log("=== DEBUG: memberships raw ===");
	console.log(memberships);

	console.log("=== DEBUG: profiles raw ===");
	console.log(profiles);

	const wsMap = new Map((workspaces || []).map((w: any) => [w.id, w.name]));

	const membershipMap = new Map<string, any[]>();
	for (const m of memberships || []) {
		const list = membershipMap.get(m.user_id) || [];
		list.push({
			workspace_id: m.workspace_id,
			workspace_name: wsMap.get(m.workspace_id) || "Unknown",
			role: m.role || "viewer",
		});
		membershipMap.set(m.user_id, list);
	}

	console.log("=== DEBUG: membershipMap contents ===");
	for (const [key, val] of membershipMap.entries()) {
		console.log(`Key: ${key} (${typeof key}) =>`, JSON.stringify(val));
	}

	const result = (profiles || []).map((p: any) => ({
		...p,
		memberships: membershipMap.get(p.id) || [],
	}));

	return result;
}

describe("Admin Service fetchProfilesWithMemberships Logic Test", () => {
	it("should map memberships accurately without crosstalk", async () => {
		const mappedProfiles = await testFetchProfilesWithMemberships();

		console.log("=== MAPPED PROFILES WITH MEMBERSHIPS ===");
		console.log(JSON.stringify(mappedProfiles, null, 2));

		// Check if test user memberships are strictly distinct
		const testUser = mappedProfiles.find((p) => p.display_name === "test");
		const test2User = mappedProfiles.find((p) => p.display_name === "test2");

		console.log("test user memberships:", testUser?.memberships);
		console.log("test2 user memberships:", test2User?.memberships);

		// test2User should only have 1 membership, testUser should have 2 memberships
		if (testUser && test2User) {
			expect(testUser.memberships.length).toBe(2);
			expect(test2User.memberships.length).toBe(1);
		}
	});
});

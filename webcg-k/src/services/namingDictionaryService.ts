import {
	NAMING_TOKEN_GROUPS,
	type NamingTokenGroup,
} from "@/lib/naming/namingSuggestion";
import { supabase } from "@/lib/supabase";

export interface NamingDictionaryRecord {
	id: string;
	workspace_id: string;
	token_groups: NamingTokenGroup[];
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface SaveNamingDictionaryInput {
	workspaceId: string;
	tokenGroups: NamingTokenGroup[];
	userId: string | null;
}

// Dynamic category authorization mode active

export async function fetchNamingDictionary(
	workspaceId: string | null,
): Promise<NamingDictionaryRecord | null> {
	if (!workspaceId) return null;

	const { data, error } = await supabase
		.from("naming_dictionaries")
		.select("*")
		.eq("workspace_id", workspaceId)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;

	return {
		...(data as Omit<NamingDictionaryRecord, "token_groups">),
		token_groups: normalizeNamingTokenGroups(
			(data as { token_groups?: unknown }).token_groups,
		),
	};
}

export async function fetchEffectiveNamingTokenGroups(
	workspaceId: string | null,
): Promise<NamingTokenGroup[]> {
	const dictionary = await fetchNamingDictionary(workspaceId);
	return dictionary?.token_groups ?? NAMING_TOKEN_GROUPS;
}

export async function saveNamingDictionary({
	workspaceId,
	tokenGroups,
	userId,
}: SaveNamingDictionaryInput): Promise<void> {
	const normalizedGroups = normalizeNamingTokenGroups(tokenGroups);
	const record: Record<string, unknown> = {
		workspace_id: workspaceId,
		token_groups: normalizedGroups,
		created_by: userId,
		updated_by: userId,
		updated_at: new Date().toISOString(),
	};
	const { error } = await supabase
		.from("naming_dictionaries")
		.upsert(record, { onConflict: "workspace_id" });

	if (error) throw error;
}

export function normalizeNamingTokenGroups(value: unknown): NamingTokenGroup[] {
	const rawGroups = Array.isArray(value) ? value : [];
	const normalized: NamingTokenGroup[] = [];

	for (const group of rawGroups) {
		if (isRecord(group) && typeof group.id === "string" && group.id.trim()) {
			const id = group.id.trim();
			const label =
				typeof group.label === "string" && group.label.trim()
					? group.label.trim()
					: id;
			const description =
				typeof group.description === "string" ? group.description.trim() : "";
			const tokens = normalizeTokenList(group.tokens, []);

			normalized.push({
				id,
				label,
				description,
				tokens,
			});
		}
	}

	if (normalized.length > 0) {
		return normalized;
	}

	return NAMING_TOKEN_GROUPS;
}

export function normalizeTokenList(
	value: unknown,
	fallback: string[] = [],
): string[] {
	const source = Array.isArray(value) ? value : fallback;
	const seen = new Set<string>();
	const tokens: string[] = [];

	for (const item of source) {
		const token = String(item ?? "").trim();
		const key = token.toLocaleLowerCase("ko-KR");
		if (!token || seen.has(key)) continue;
		seen.add(key);
		tokens.push(token);
	}

	return tokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

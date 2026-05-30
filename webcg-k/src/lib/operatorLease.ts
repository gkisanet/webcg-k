import type { MainOperatorLease } from "./types/broadcast";

export const MAIN_OPERATOR_LEASE_MS = 30_000;
export const MAIN_OPERATOR_HEARTBEAT_MS = 10_000;

export function createMainOperatorLease(input: {
	userId: string;
	clientId: string;
	email?: string | null;
	displayName?: string | null;
	now?: Date;
}): MainOperatorLease {
	const now = input.now ?? new Date();
	return {
		userId: input.userId,
		clientId: input.clientId,
		email: input.email ?? null,
		displayName: input.displayName ?? input.email?.split("@")[0] ?? "Operator",
		claimedAt: now.toISOString(),
		expiresAt: new Date(now.getTime() + MAIN_OPERATOR_LEASE_MS).toISOString(),
	};
}

export function parseMainOperatorLease(raw: unknown): MainOperatorLease | null {
	if (!raw || typeof raw !== "object") return null;
	const lease = (raw as { mainOperatorLease?: unknown }).mainOperatorLease;
	if (!lease || typeof lease !== "object") return null;

	const candidate = lease as Partial<MainOperatorLease>;
	if (
		typeof candidate.userId !== "string" ||
		typeof candidate.clientId !== "string" ||
		typeof candidate.claimedAt !== "string" ||
		typeof candidate.expiresAt !== "string"
	) {
		return null;
	}

	return {
		userId: candidate.userId,
		clientId: candidate.clientId,
		email: typeof candidate.email === "string" ? candidate.email : null,
		displayName:
			typeof candidate.displayName === "string" ? candidate.displayName : null,
		claimedAt: candidate.claimedAt,
		expiresAt: candidate.expiresAt,
	};
}

export function isMainOperatorLeaseExpired(
	lease: MainOperatorLease | null,
	nowMs = Date.now(),
): boolean {
	if (!lease) return true;
	const expiresAt = Date.parse(lease.expiresAt);
	return !Number.isFinite(expiresAt) || expiresAt <= nowMs;
}

export function getActiveMainOperatorLease(
	raw: unknown,
	nowMs = Date.now(),
): MainOperatorLease | null {
	const lease = parseMainOperatorLease(raw);
	return isMainOperatorLeaseExpired(lease, nowMs) ? null : lease;
}

export function withMainOperatorLease(
	raw: unknown,
	lease: MainOperatorLease | null,
): Record<string, unknown> {
	const base =
		raw && typeof raw === "object"
			? { ...(raw as Record<string, unknown>) }
			: {};
	return {
		...base,
		mainOperatorLease: lease,
	};
}

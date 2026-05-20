import type { CuesheetWizardState } from "@/lib/aiCuesheetTypes";

export const AI_CUESHEET_LOCAL_SNAPSHOT_KEY =
	"webcgk:ai-cuesheet:wizard-snapshot:v1";
export const AI_CUESHEET_LOCAL_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalWizardSnapshot {
	updatedAt: number;
	state: CuesheetWizardState;
}

export function writeLocalWizardSnapshot(state: CuesheetWizardState) {
	if (typeof window === "undefined") return;
	try {
		const snapshot: LocalWizardSnapshot = { updatedAt: Date.now(), state };
		window.localStorage.setItem(
			AI_CUESHEET_LOCAL_SNAPSHOT_KEY,
			JSON.stringify(snapshot),
		);
	} catch {
		/* best-effort browser crash/reload safety */
	}
}

export function readLocalWizardSnapshot(): CuesheetWizardState | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(AI_CUESHEET_LOCAL_SNAPSHOT_KEY);
		if (!raw) return null;
		const snapshot = JSON.parse(raw) as LocalWizardSnapshot;
		if (
			!snapshot?.state ||
			Date.now() - snapshot.updatedAt > AI_CUESHEET_LOCAL_SNAPSHOT_TTL_MS
		) {
			return null;
		}
		return snapshot.state;
	} catch {
		return null;
	}
}

export function clearLocalWizardSnapshot() {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(AI_CUESHEET_LOCAL_SNAPSHOT_KEY);
	} catch {
		/* noop */
	}
}

export function getRestorableNewSessionSnapshot(
	snapshot: CuesheetWizardState | null,
): CuesheetWizardState | null {
	if (!snapshot) return null;
	if (snapshot.sessionId) return null;
	if (!snapshot.sourceMaterial.trim() && !snapshot.parseResult?.cuesheet)
		return null;
	return { ...snapshot, sessionId: null };
}

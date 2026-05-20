import { describe, expect, it } from "vitest";
import { createInitialState } from "@/components/ai-cuesheet/wizardReducer";
import { getRestorableNewSessionSnapshot } from "../aiCuesheetLocalSnapshot";

describe("AI cuesheet local snapshot restore", () => {
	it("does not restore a DB-backed in-progress session when starting a new session", () => {
		const existingSessionSnapshot = {
			...createInitialState("api", "system prompt"),
			sessionId: "existing-session-id",
			sourceMaterial: "기존 작업 자료",
		};

		expect(getRestorableNewSessionSnapshot(existingSessionSnapshot)).toBeNull();
	});

	it("restores only unsaved browser work for a new session and strips any session identity", () => {
		const unsavedSnapshot = {
			...createInitialState("api", "system prompt"),
			sessionId: null,
			sourceMaterial: "아직 DB 저장 전 자료",
		};

		expect(getRestorableNewSessionSnapshot(unsavedSnapshot)).toMatchObject({
			sessionId: null,
			sourceMaterial: "아직 DB 저장 전 자료",
		});
	});
});

import { describe, expect, it } from "vitest";
import { createInitialState, wizardReducer } from "../wizardReducer";

describe("wizardReducer 5-step workflow", () => {
	it("supports rundown edit and render verification as real wizard steps", () => {
		const initial = createInitialState("api", "system prompt");
		const rundown = wizardReducer(initial, { type: "SET_STEP", step: "rundown-edit" });
		const verified = wizardReducer(rundown, { type: "SET_STEP", step: "render-verify" });

		expect(rundown.step).toBe("rundown-edit");
		expect(verified.step).toBe("render-verify");
	});
});

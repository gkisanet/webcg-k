import { describe, expect, it } from "vitest";
import { createInitialState, wizardReducer } from "../wizardReducer";
import { DEFAULT_AI_CUESHEET_ZONE_PROFILE } from "@/lib/aiCuesheetZoneProfile";

describe("wizardReducer 5-step workflow", () => {
	it("supports rundown edit and render verification as real wizard steps", () => {
		const initial = createInitialState("api", "system prompt");
		const rundown = wizardReducer(initial, { type: "SET_STEP", step: "rundown-edit" });
		const verified = wizardReducer(rundown, { type: "SET_STEP", step: "render-verify" });

		expect(rundown.step).toBe("rundown-edit");
		expect(verified.step).toBe("render-verify");
	});
});

	describe("graphic state restoration", () => {
		it("preserves restored generated graphics when entering Step 3 again", () => {
			const initial = createInitialState("api", "system prompt");
			const restored = {
				...initial,
				graphicStates: [
					{ sceneIndex: 0, status: "done" as const, generatedHtml: "<div>saved</div>", generatedCss: ".saved{}", overlayTemplateId: "overlay-1" },
				],
			};

			const next = wizardReducer(restored, { type: "INIT_GRAPHIC_STATES", sceneCount: 2 });

			expect(next.graphicStates[0]).toMatchObject({
				status: "done",
				generatedHtml: "<div>saved</div>",
				overlayTemplateId: "overlay-1",
			});
			expect(next.graphicStates[1]).toEqual({ sceneIndex: 1, status: "idle" });
		});
	});

	describe("zone profile", () => {
		it("stores the selected session zone profile", () => {
			const initial = createInitialState("api", "system prompt");
			const profile = {
				...DEFAULT_AI_CUESHEET_ZONE_PROFILE,
				name: "Session Custom Zones",
			};

			const next = wizardReducer(initial, { type: "UPDATE_ZONE_PROFILE", profile });

			expect(next.zoneProfile.name).toBe("Session Custom Zones");
		});
	});

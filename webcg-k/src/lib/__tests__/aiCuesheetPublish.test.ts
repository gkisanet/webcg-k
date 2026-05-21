import { describe, expect, it } from "vitest";
import {
	analyzeAiCuesheetPublishReadiness,
	buildRundownOverlayInserts,
} from "../aiCuesheetPublish";
import type { SceneContent } from "@/lib/aiCuesheetTypes";

function makeScenes(): SceneContent[] {
	return [
		{
			order: 1,
			trigger: "첫 장면",
			graphic_intent: "첫 장면 그래픽",
			duration: 7,
			text_slots: [],
		},
		{
			order: 2,
			trigger: "둘째 장면",
			graphic_intent: "둘째 장면 그래픽",
			duration: 9,
			text_slots: [],
		},
	];
}

describe("analyzeAiCuesheetPublishReadiness", () => {
	it("requires explicit partial confirmation when any scene is missing generated HTML", () => {
		const readiness = analyzeAiCuesheetPublishReadiness(makeScenes(), [
			{ sceneIndex: 0, status: "done", generatedHtml: "<div>first</div>", generatedCss: ".first{}" },
			{ sceneIndex: 1, status: "idle" },
		]);

		expect(readiness).toMatchObject({
			totalScenes: 2,
			readyScenes: 1,
			canPublishAll: false,
			requiresPartialConfirmation: true,
		});
		expect(readiness.missingScenes.map((s) => s.order)).toEqual([2]);
	});

	it("allows normal publish when every scene has a saved overlay", () => {
		const readiness = analyzeAiCuesheetPublishReadiness(makeScenes(), [
			{ sceneIndex: 0, status: "done", generatedHtml: "<div>first</div>" },
			{ sceneIndex: 1, status: "done", generatedHtml: "<div>second</div>" },
		]);

		expect(readiness).toMatchObject({
			totalScenes: 2,
			readyScenes: 2,
			canPublishAll: true,
			requiresPartialConfirmation: false,
			missingScenes: [],
		});
	});
});

describe("buildRundownOverlayInserts", () => {
	it("builds rundown rows only for ready scenes and keeps their source scene order", () => {
		const rows = buildRundownOverlayInserts({
			scenes: makeScenes(),
			graphicStates: [
				{ sceneIndex: 0, status: "done", overlayTemplateId: "overlay-1" },
				{ sceneIndex: 1, status: "idle" },
			],
			rundownId: "rundown-1",
			programTitle: "테스트 프로그램",
		});

		expect(rows).toEqual([
			{
				rundown_id: "rundown-1",
				source_type: "overlay",
				source_id: "overlay-1",
				source_name: "첫 장면",
				data: {
					scene_data: makeScenes()[0],
					program_title: "테스트 프로그램",
				},
				item_order: 1,
				duration: 7,
			},
		]);
	});
});

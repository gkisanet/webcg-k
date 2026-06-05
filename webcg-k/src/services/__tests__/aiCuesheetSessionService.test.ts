import { describe, expect, it } from "vitest";
import { buildGeneratedSceneAssetMaps } from "../aiCuesheetSessionService";
import type { SceneContent, SceneGraphicState } from "@/lib/aiCuesheetTypes";

const scenes: SceneContent[] = [
	{
		order: 10,
		trigger: "첫 번째",
		graphic_intent: "첫 번째 그래픽",
		duration: 8,
		text_slots: [],
	},
	{
		order: 20,
		trigger: "두 번째",
		graphic_intent: "두 번째 그래픽",
		duration: 8,
		text_slots: [],
	},
];

describe("buildGeneratedSceneAssetMaps", () => {
	it("keys generated html and css by scene.order, not zero-based sceneIndex", () => {
		const graphicStates: SceneGraphicState[] = [
			{
				sceneIndex: 0,
				status: "done",
				generatedHtml: "<div>first</div>",
				generatedCss: ".first{}",
			},
			{
				sceneIndex: 1,
				status: "done",
				generatedHtml: "<div>second</div>",
				generatedCss: ".second{}",
				overlayTemplateId: "overlay-second",
			},
		];

		expect(buildGeneratedSceneAssetMaps(scenes, graphicStates)).toEqual({
			htmlMap: {
				10: "<div>first</div>",
				20: "<div>second</div>",
			},
			cssMap: {
				10: ".first{}",
				20: ".second{}",
			},
			overlayTemplateIdMap: {
				20: "overlay-second",
			},
		});
	});
});

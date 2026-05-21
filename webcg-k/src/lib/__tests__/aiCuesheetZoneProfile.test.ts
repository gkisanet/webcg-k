import { describe, expect, it } from "vitest";
import {
	DEFAULT_AI_CUESHEET_ZONE_PROFILE,
	applyGridTemplateToZoneProfile,
	formatZoneDefinitionForPrompt,
	getZoneDefinition,
} from "../aiCuesheetZoneProfile";

describe("AI cuesheet zone profile", () => {
	it("provides concrete default bounds for every semantic zone", () => {
		expect(Object.keys(DEFAULT_AI_CUESHEET_ZONE_PROFILE.zones)).toEqual([
			"bottom_bar",
			"top_bar",
			"center",
			"left_third",
			"fullscreen",
		]);

		expect(getZoneDefinition(DEFAULT_AI_CUESHEET_ZONE_PROFILE, "bottom_bar")).toMatchObject({
			id: "bottom_bar",
			bounds: { x: 0, y: 800, width: 1920, height: 230 },
		});

		expect(formatZoneDefinitionForPrompt(getZoneDefinition(DEFAULT_AI_CUESHEET_ZONE_PROFILE, "center"))).toContain(
			"center: x=360px, y=220px, width=1200px, height=640px",
		);
	});

	it("maps reusable grid template zones into the five session zones by geometry", () => {
		const profile = applyGridTemplateToZoneProfile(
			{
				id: "grid-1",
				name: "뉴스 레이아웃",
				template_data: {
					canvas: { width: 1920, height: 1080 },
					zones: [
						{ id: "headline", name: "Headline Top", x: 0, y: 0, width: 100, height: 18 },
						{ id: "lower", name: "Lower Third", x: 0, y: 76, width: 100, height: 20 },
						{ id: "side", name: "Left Panel", x: 0, y: 20, width: 32, height: 58 },
						{ id: "main", name: "Main Center", x: 34, y: 22, width: 63, height: 52 },
					],
				},
			},
			DEFAULT_AI_CUESHEET_ZONE_PROFILE,
		);

		expect(profile.name).toBe("뉴스 레이아웃 기반 세션 Zone");
		expect(profile.gridTemplateId).toBe("grid-1");
		expect(profile.zones.top_bar.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 194 });
		expect(profile.zones.bottom_bar.bounds).toEqual({ x: 0, y: 821, width: 1920, height: 216 });
		expect(profile.zones.left_third.bounds).toEqual({ x: 0, y: 216, width: 614, height: 626 });
		expect(profile.zones.center.bounds).toEqual({ x: 653, y: 238, width: 1210, height: 562 });
		expect(profile.zones.fullscreen.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
	});
});

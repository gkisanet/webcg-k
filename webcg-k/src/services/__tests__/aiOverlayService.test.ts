import { describe, expect, it } from "vitest";
import {
	OVERLAY_SYSTEM_PROMPT,
	validateOverlayBindings,
	type OverlayCodeResult,
} from "../aiOverlayService";

function makeResult(overrides: Partial<OverlayCodeResult> = {}): OverlayCodeResult {
	return {
		html: '<div id="overlay"><span data-cg-bind="homeName">HOME</span><div data-cg-class="danger:isDanger"></div><div data-cg-if="isLive"></div></div>',
		css: "",
		js: "",
		dashboard_schema: {
			properties: {
				homeName: { type: "string", title: "홈팀" },
				isDanger: { type: "boolean", title: "위험" },
				isLive: { type: "boolean", title: "라이브" },
			},
		},
		replicant_defaults: {
			homeName: "HOME",
			isDanger: false,
			isLive: true,
		},
		...overrides,
	};
}

describe("AI overlay declarative binding contract", () => {
	it("documents data-cg binding as the default data path while keeping optional JS", () => {
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-bind");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-class");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-if");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("JS가 필요한 경우");
	});

	it("validates matching schema keys, HTML bindings, JS data usage, and defaults", () => {
		const validation = validateOverlayBindings(makeResult());

		expect(validation.ok).toBe(true);
		expect(validation.warnings).toEqual([]);
	});

	it("reports missing, orphan, and default-less binding fields", () => {
		const validation = validateOverlayBindings(makeResult({
			html: '<span data-cg-bind="player_name"></span>',
			dashboard_schema: {
				properties: {
					playerName: { type: "string", title: "선수" },
				},
			},
			replicant_defaults: {},
		}));

		expect(validation.ok).toBe(false);
		expect(validation.missingBindings).toEqual(["playerName"]);
		expect(validation.orphanBindings).toEqual(["player_name"]);
		expect(validation.missingDefaults).toEqual(["playerName"]);
	});

	it("accepts single quoted data-cg attributes and imperative JS data reads for advanced logic", () => {
		const validation = validateOverlayBindings(makeResult({
			html: "<span data-cg-bind='src:logoUrl'></span>",
			js: "webcgk.onData(function(data) { renderTimer(data.remainingSeconds); });",
			dashboard_schema: {
				properties: {
					logoUrl: { type: "string", title: "로고" },
					remainingSeconds: { type: "number", title: "남은 시간" },
				},
			},
			replicant_defaults: {
				logoUrl: "/logo.png",
				remainingSeconds: 60,
			},
		}));

		expect(validation.ok).toBe(true);
		expect(validation.warnings).toEqual([]);
	});
});

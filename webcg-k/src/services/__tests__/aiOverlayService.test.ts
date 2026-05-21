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
		expect(OVERLAY_SYSTEM_PROMPT).toContain("JS 비즈니스 로직");
	});

	it("validates matching schema keys, HTML bindings, JS data usage, and defaults", () => {
		const validation = validateOverlayBindings(makeResult());

		expect(validation.ok).toBe(true);
		expect(validation.warnings).toEqual([]);
	});

	it("reports missing, orphan, and default-less binding fields but remains ok if only missingBindings occur", () => {
		// 1. orphanBindings와 missingBindings가 동시에 발생하는 경우 (orphanBindings 때문에 ok: false)
		const validationWithOrphan = validateOverlayBindings(makeResult({
			html: '<span data-cg-bind="player_name"></span>',
			dashboard_schema: {
				properties: {
					playerName: { type: "string", title: "선수" },
				},
			},
			replicant_defaults: {},
		}));

		expect(validationWithOrphan.ok).toBe(false);
		expect(validationWithOrphan.missingBindings).toEqual(["playerName"]);
		expect(validationWithOrphan.orphanBindings).toEqual(["player_name"]);
		expect(validationWithOrphan.missingDefaults).toEqual(["playerName"]);

		// 2. 오직 missingBindings만 있는 경우 (ok: true 유지로 완화)
		const validationOnlyMissing = validateOverlayBindings(makeResult({
			html: '<div id="overlay"></div>',
			dashboard_schema: {
				properties: {
					homeName: { type: "string", title: "홈팀" },
				},
			},
			replicant_defaults: {
				homeName: "HOME",
			},
		}));

		expect(validationOnlyMissing.ok).toBe(true);
		expect(validationOnlyMissing.missingBindings).toEqual(["homeName"]);
		expect(validationOnlyMissing.orphanBindings).toEqual([]);
	});

	it("accepts single quoted data-cg attributes, imperative JS data reads, and JS destructuring", () => {
		// 1. 일반적인 JS data.xxx 참조
		const validationClassic = validateOverlayBindings(makeResult({
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

		expect(validationClassic.ok).toBe(true);
		expect(validationClassic.warnings).toEqual([]);

		// 2. 구조 분해 할당 (JS Destructuring) 및 별칭(alias) 매치 테스트
		const validationDestructure = validateOverlayBindings(makeResult({
			html: "<div id='overlay'></div>",
			js: "webcgk.onData(function(data) { const { timerDuration: duration, primaryColor } = data; start(duration, primaryColor); });",
			dashboard_schema: {
				properties: {
					timerDuration: { type: "number", title: "타이머 지속시간" },
					primaryColor: { type: "color", title: "주조색" },
				},
			},
			replicant_defaults: {
				timerDuration: 120,
				primaryColor: "#ff0000",
			},
		}));

		expect(validationDestructure.ok).toBe(true);
		expect(validationDestructure.missingBindings).toEqual([]);
		expect(validationDestructure.warnings).toEqual([]);
	});

	it("resolves CSS variables theme bindings to bypass missingBindings validation warnings", () => {
		const validationCss = validateOverlayBindings(makeResult({
			html: "<div id='overlay'></div>",
			css: ":root { --primary-color: var(--primaryColor); --accent: var(--accentColor); }",
			dashboard_schema: {
				properties: {
					primaryColor: { type: "color", title: "주조색" },
					accentColor: { type: "color", title: "강조색" },
				},
			},
			replicant_defaults: {
				primaryColor: "#00ff00",
				accentColor: "#0000ff",
			},
		}));

		expect(validationCss.ok).toBe(true);
		expect(validationCss.missingBindings).toEqual([]);
		expect(validationCss.warnings).toEqual([]);
	});
});

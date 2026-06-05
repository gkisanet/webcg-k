import { describe, expect, it } from "vitest";
import {
	buildMotionManifestFromLegacyAnimationConfig,
	graphicMotionManifestToRuntimeTimeline,
	normalizeGraphicMotionManifest,
} from "../graphicMotionManifest";

describe("graphicMotionManifest", () => {
	it("normalizes a WebCG-K motion manifest into a runtime timeline", () => {
		const manifest = normalizeGraphicMotionManifest({
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{
					target: ".headline",
					in: "slide-up",
					out: "fade",
					at: 120,
					duration: 420,
					driver: "gsap",
				},
			],
		});

		expect(manifest?.timeline).toHaveLength(1);
		expect(graphicMotionManifestToRuntimeTimeline(manifest)).toEqual([
			expect.objectContaining({
				target: ".headline",
				in: "slide-up",
				out: "fade",
				at: 120,
				duration: 420,
				driver: "gsap",
			}),
		]);
	});

	it("rejects unknown presets and strips non-animated items", () => {
		const invalid = normalizeGraphicMotionManifest({
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{ target: ".ok", in: "fade" },
				{ target: ".noop" },
				{ target: ".bad", in: "teleport" },
			],
		});

		expect(invalid).toBeNull();
	});

	it("bridges legacy animation_config into the package motion contract", () => {
		const manifest = buildMotionManifestFromLegacyAnimationConfig({
			in: { type: "slide", duration: 300 },
			out: { type: "fade", duration: 240 },
		});

		expect(manifest).toEqual({
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{
					target: "#overlay",
					in: "slide-up",
					out: "fade",
					duration: 300,
				},
			],
		});
	});
});

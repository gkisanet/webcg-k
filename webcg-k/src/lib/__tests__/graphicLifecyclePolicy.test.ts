import { describe, expect, it } from "vitest";
import type { NormalizedBroadcastSourceData } from "../broadcastSourceData";
import {
	getGraphicMotionTimelineEnterHoldMs,
	getGraphicMotionTimelineHoldMs,
	resolveBroadcastLifecyclePolicy,
	resolveBroadcastSourceLifecyclePolicy,
	usesBroadcastPackageMotion,
	usesBroadcastPackagePhaseMotion,
} from "../graphicLifecyclePolicy";

describe("graphicLifecyclePolicy", () => {
	it("keeps legacy container fade when a source has no package motion", () => {
		const source: NormalizedBroadcastSourceData = {
			kind: "overlay",
			overlay: { html: "<div></div>", css: "", js: "" },
			raw: {},
		};

		expect(resolveBroadcastLifecyclePolicy(source, 800)).toEqual({
			useContainerAnimation: true,
			usesPackageMotion: false,
			usesPackageEnterMotion: false,
			usesPackageExitMotion: false,
			enterHoldMs: 800,
			exitHoldMs: 800,
		});
	});

	it("disables outer lifecycle fade when overlay package motion exists", () => {
		const source: NormalizedBroadcastSourceData = {
			kind: "overlay",
			overlay: {
				html: "<div></div>",
				css: "",
				js: "",
				motion: {
					schemaVersion: "webcgk.motion.v2",
					timeline: [
						{ target: "#overlay", in: "slide-up", out: "fade", duration: 700 },
					],
				},
			},
			raw: {},
		};

		expect(resolveBroadcastLifecyclePolicy(source, 800)).toEqual({
			useContainerAnimation: false,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: true,
			enterHoldMs: 820,
			exitHoldMs: 820,
		});
	});

	it("uses absolute timeline time to hold exit cleanup long enough", () => {
		expect(
			getGraphicMotionTimelineHoldMs({
				schemaVersion: "webcgk.motion.v2",
				timeline: [
					{ target: ".a", in: "fade", out: "fade", at: 120, duration: 300 },
					{
						target: ".b",
						in: "pop",
						out: "slide-left",
						delay: 80,
						duration: 600,
						stagger: 90,
					},
				],
			}),
		).toBe(890);
	});

	it("uses absolute timeline time to hold enter stable transition long enough", () => {
		expect(
			getGraphicMotionTimelineEnterHoldMs({
				schemaVersion: "webcgk.motion.v2",
				timeline: [
					{ target: ".a", in: "fade", out: "none", at: 120, duration: 300 },
					{
						target: ".b",
						in: "slide-left",
						out: "none",
						delay: 80,
						duration: 600,
						stagger: 90,
					},
				],
			}),
		).toBe(890);
	});

	it("does not treat an in-only motion timeline item as package exit motion", () => {
		expect(
			getGraphicMotionTimelineHoldMs({
				schemaVersion: "webcgk.motion.v2",
				timeline: [{ target: ".headline", in: "fade", at: 120, duration: 300 }],
			}),
		).toBe(0);
	});

	it("resolves package motion directly from timeline block source data", () => {
		const sourceData = {
			source_code: {
				html: '<div id="lower"></div>',
				css: "",
				js: "",
				motion: {
					schemaVersion: "webcgk.motion.v2",
					timeline: [{ target: "#lower", in: "fade", out: "fade" }],
				},
			},
		};

		expect(
			resolveBroadcastSourceLifecyclePolicy("overlay", sourceData, 500),
		).toMatchObject({
			useContainerAnimation: false,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: true,
		});
		expect(usesBroadcastPackageMotion("overlay", sourceData)).toBe(true);
	});

	it("keeps exit fallback fade available when a graphic only has enter package motion", () => {
		const sourceData = {
			elements: [
				{
					id: "headline",
					animation: {
						enter: { type: "slideUp", duration: 600, delay: 40 },
					},
				},
			],
		};

		expect(
			resolveBroadcastSourceLifecyclePolicy("graphic", sourceData, 500),
		).toMatchObject({
			useContainerAnimation: true,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: false,
			enterHoldMs: 760,
			exitHoldMs: 0,
		});
		expect(
			usesBroadcastPackagePhaseMotion("graphic", sourceData, "enter"),
		).toBe(true);
		expect(usesBroadcastPackagePhaseMotion("graphic", sourceData, "exit")).toBe(
			false,
		);
	});

	it("treats vector element lifecycle animation as package motion", () => {
		const sourceData = {
			elements: [
				{
					id: "headline",
					animation: {
						enter: { type: "slideUp", duration: 600, delay: 40 },
						exit: { type: "slideDown", duration: 500, delay: 80 },
					},
				},
			],
		};

		expect(
			resolveBroadcastSourceLifecyclePolicy("graphic", sourceData, 500),
		).toMatchObject({
			useContainerAnimation: false,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: true,
			enterHoldMs: 760,
			exitHoldMs: 700,
		});
		expect(usesBroadcastPackageMotion("graphic", sourceData)).toBe(true);
	});
});

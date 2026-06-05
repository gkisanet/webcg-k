import { describe, expect, it } from "vitest";
import {
	getGraphicMotionCapabilityIssues,
	getGraphicMotionCapabilityWarning,
} from "../graphicMotionCapability";

describe("graphicMotionCapability", () => {
	const gsapMotion = {
		schemaVersion: "webcgk.motion.v2" as const,
		timeline: [
			{ target: "#overlay", in: "pop" as const, driver: "gsap" as const },
		],
	};

	it("warns when GSAP is requested but unavailable", () => {
		expect(getGraphicMotionCapabilityIssues(gsapMotion)).toEqual([
			expect.objectContaining({
				driver: "gsap",
				severity: "warning",
			}),
		]);
		expect(getGraphicMotionCapabilityWarning(gsapMotion)).toContain("GSAP");
	});

	it("passes when requested motion drivers are available", () => {
		expect(
			getGraphicMotionCapabilityIssues(gsapMotion, {
				motionDrivers: { gsap: true },
			}),
		).toEqual([]);
	});

	it("does not warn for default WAAPI motion", () => {
		expect(
			getGraphicMotionCapabilityIssues({
				schemaVersion: "webcgk.motion.v2",
				timeline: [{ target: ".title", in: "slide-up" }],
			}),
		).toEqual([]);
	});
});

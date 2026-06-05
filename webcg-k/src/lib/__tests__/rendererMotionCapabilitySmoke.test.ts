import { describe, expect, it } from "vitest";
import { buildGraphicPackageUiSummary } from "../graphicPackageUi";
import {
	buildRundownQualitySummary,
	buildRundownRendererCapabilityFromEnv,
} from "../rundownQualityGate";

const gsapMotionData = {
	source_code: {
		motion: {
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{
					target: "#overlay",
					in: "pop",
					out: "fade",
					driver: "gsap",
				},
			],
		},
	},
};

describe("renderer motion capability smoke", () => {
	it("keeps Package Card and Quality Gate GSAP warnings in sync", () => {
		const unavailableCapability = buildRundownRendererCapabilityFromEnv({
			VITE_WEBCGK_MOTION_GSAP_ENABLED: "false",
		});
		const availableCapability = buildRundownRendererCapabilityFromEnv({
			VITE_WEBCGK_MOTION_GSAP_ENABLED: "true",
		});

		const unavailablePackageSummary = buildGraphicPackageUiSummary(
			{
				id: "gsap-smoke",
				name: "GSAP Smoke",
				source_type: "overlay",
				data: gsapMotionData,
			},
			unavailableCapability,
		);
		const unavailableQualitySummary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-gsap-smoke",
					source_type: "overlay",
					source_name: "GSAP Smoke",
					data: gsapMotionData,
				},
			],
			report: null,
			rendererCapability: unavailableCapability,
		});

		expect(unavailablePackageSummary.motionWarning).toContain("GSAP");
		expect(unavailableQualitySummary.runtimeIssueCount).toBe(1);

		const availablePackageSummary = buildGraphicPackageUiSummary(
			{
				id: "gsap-smoke",
				name: "GSAP Smoke",
				source_type: "overlay",
				data: gsapMotionData,
			},
			availableCapability,
		);
		const availableQualitySummary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-gsap-smoke",
					source_type: "overlay",
					source_name: "GSAP Smoke",
					data: gsapMotionData,
				},
			],
			report: null,
			rendererCapability: availableCapability,
		});

		expect(availablePackageSummary.motionWarning).toBeNull();
		expect(availableQualitySummary.runtimeIssueCount).toBe(0);
	});
});

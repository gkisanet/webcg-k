import { describe, expect, it } from "vitest";
import {
	addMotionTimelineItem,
	createDefaultMotionManifest,
	getMotionAuthoringSummary,
	removeMotionTimelineItem,
	updateMotionTimelineItem,
} from "../graphicMotionAuthoring";

describe("graphicMotionAuthoring", () => {
	it("creates a safe default package motion manifest", () => {
		expect(createDefaultMotionManifest()).toEqual({
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{
					target: "#overlay",
					in: "lower-third",
					out: "fade",
					duration: 520,
					driver: "waapi",
				},
			],
		});
	});

	it("adds, updates, clamps, and removes timeline items", () => {
		const withTwoItems = addMotionTimelineItem(createDefaultMotionManifest(), {
			target: ".name",
			in: "slide-up",
			out: "fade",
			duration: 900,
		});

		expect(withTwoItems.timeline).toHaveLength(2);

		const updated = updateMotionTimelineItem(withTwoItems, 1, {
			target: "   ",
			duration: 99999,
			at: -20,
			driver: "gsap",
		});

		expect(updated.timeline[1]).toMatchObject({
			target: "#overlay",
			duration: 3000,
			at: 0,
			driver: "gsap",
		});

		expect(removeMotionTimelineItem(updated, 1)?.timeline).toHaveLength(1);
		expect(
			removeMotionTimelineItem(createDefaultMotionManifest(), 0),
		).toBeNull();
	});

	it("summarizes motion authoring state", () => {
		expect(getMotionAuthoringSummary(null)).toEqual({
			enabled: false,
			itemCount: 0,
			usesGsap: false,
			targets: [],
		});

		expect(
			getMotionAuthoringSummary({
				schemaVersion: "webcgk.motion.v2",
				timeline: [
					{ target: "#overlay", in: "fade", out: "fade" },
					{ target: ".score", in: "pop", out: "fade", driver: "gsap" },
				],
			}),
		).toEqual({
			enabled: true,
			itemCount: 2,
			usesGsap: true,
			targets: ["#overlay", ".score"],
		});
	});
});

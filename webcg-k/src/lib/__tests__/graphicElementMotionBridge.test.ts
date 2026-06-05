import { describe, expect, it } from "vitest";
import {
	buildMotionManifestFromGraphicElements,
	getGraphicElementMotionItemCount,
	graphicElementMotionTarget,
} from "../graphicElementMotionBridge";

describe("graphicElementMotionBridge", () => {
	it("maps vector element enter and exit animation into package motion items", () => {
		const manifest = buildMotionManifestFromGraphicElements([
			{
				id: "title",
				name: "Headline",
				animation: {
					enter: {
						type: "slideUp",
						duration: 520,
						delay: 80,
						easing: "ease-out",
					},
					exit: {
						type: "fadeOut",
						duration: 360,
						delay: 20,
						easing: "ease-in",
					},
				},
			},
		]);

		expect(manifest).toEqual({
			schemaVersion: "webcgk.motion.v2",
			timeline: [
				{
					target: '[data-element-id="title"]',
					in: "slide-up",
					out: "none",
					at: 80,
					duration: 520,
					easing: "ease-out",
					driver: "waapi",
					group: "Headline",
				},
				{
					target: '[data-element-id="title"]',
					in: "none",
					out: "fade",
					at: 20,
					duration: 360,
					easing: "ease-in",
					driver: "waapi",
					group: "Headline",
				},
			],
		});
	});

	it("ignores loop-only animation for lifecycle ownership", () => {
		expect(
			buildMotionManifestFromGraphicElements([
				{
					id: "bug",
					animation: {
						loop: { type: "pulse", duration: 1000, iterationCount: "infinite" },
					},
				},
			]),
		).toBeNull();
	});

	it("escapes element ids for data-element-id selectors", () => {
		expect(graphicElementMotionTarget('a"b\\c')).toBe(
			'[data-element-id="a\\"b\\\\c"]',
		);
	});

	it("counts generated lifecycle motion items", () => {
		expect(
			getGraphicElementMotionItemCount([
				{ id: "a", animation: { enter: { type: "fadeIn" } } },
				{ id: "b", animation: { exit: { type: "slideLeft" } } },
				{ id: "c", animation: { loop: { type: "pulse" } } },
			]),
		).toBe(2);
	});
});

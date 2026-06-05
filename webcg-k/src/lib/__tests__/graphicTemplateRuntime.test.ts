import { describe, expect, it } from "vitest";
import { needsAnimatedGraphicRenderer } from "../graphicTemplateRuntime";

describe("graphicTemplateRuntime", () => {
	it("uses the DOM renderer for animated vector elements and embedded html plugins", () => {
		expect(
			needsAnimatedGraphicRenderer([{ id: "title", animation: { enter: {} } }]),
		).toBe(true);
		expect(
			needsAnimatedGraphicRenderer([{ id: "plugin", type: "html_plugin" }]),
		).toBe(true);
		expect(needsAnimatedGraphicRenderer([{ id: "static", type: "text" }])).toBe(
			false,
		);
	});
});

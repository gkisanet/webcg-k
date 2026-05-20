import { describe, expect, it } from "vitest";
import { normalizeBroadcastSourceData } from "../broadcastSourceData";

describe("normalizeBroadcastSourceData", () => {
	it("accepts overlay html/css at the top level", () => {
		const normalized = normalizeBroadcastSourceData("overlay", {
			html: "<div>Top</div>",
			css: ".top{}",
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay).toEqual({
				html: "<div>Top</div>",
				css: ".top{}",
				js: "",
			});
		}
	});

	it("accepts overlay html/css under payload", () => {
		const normalized = normalizeBroadcastSourceData("overlay", {
			replicant_data: { headline: "News" },
			payload: {
				html: "<div>Nested</div>",
				css: ".nested{}",
				js: "window.__ok = true",
			},
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay.html).toBe("<div>Nested</div>");
			expect(normalized.overlay.css).toBe(".nested{}");
			expect(normalized.overlay.js).toBe("window.__ok = true");
		}
	});

	it("accepts overlay html/css under source_code", () => {
		const normalized = normalizeBroadcastSourceData("overlay", {
			source_code: {
				html: "<div>Source Code</div>",
				css: ".source{}",
			},
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay.html).toBe("<div>Source Code</div>");
			expect(normalized.overlay.css).toBe(".source{}");
		}
	});

	it("merges overlay replicant defaults with rundown item overrides", () => {
		const normalized = normalizeBroadcastSourceData("overlay", {
			source_code: {
				html: '<span data-slot-id="headline"></span>',
				css: ".headline{}",
				js: "webcgk.onData(function() {})",
			},
			replicant_defaults: {
				headline: "기본 제목",
				subtitle: "기본 부제",
			},
			replicant_data: {
				headline: "런다운 수정 제목",
			},
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay.data).toEqual({
				headline: "런다운 수정 제목",
				subtitle: "기본 부제",
			});
		}
	});

	it("detects element based templates", () => {
		const normalized = normalizeBroadcastSourceData("graphic", {
			elements: [{ id: "title" }],
			canvasWidth: 1280,
			canvasHeight: 720,
		});

		expect(normalized).toMatchObject({
			kind: "template",
			canvasWidth: 1280,
			canvasHeight: 720,
		});
	});

	it("detects whiteboard source data", () => {
		const normalized = normalizeBroadcastSourceData("whiteboard", {
			whiteboardId: "board-1",
		});

		expect(normalized).toMatchObject({
			kind: "whiteboard",
			whiteboardId: "board-1",
		});
	});
});

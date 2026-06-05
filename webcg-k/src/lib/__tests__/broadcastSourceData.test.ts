import { describe, expect, it } from "vitest";
import { normalizeBroadcastSourceData } from "../broadcastSourceData";
import { createOgrafLowerThirdSourceData } from "../ografSamples";

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
				motion: {
					schemaVersion: "webcgk.motion.v2",
					timeline: [{ target: "#overlay", in: "fade" }],
				},
			},
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay.html).toBe("<div>Source Code</div>");
			expect(normalized.overlay.css).toBe(".source{}");
			expect(normalized.overlay.motion?.timeline).toHaveLength(1);
		}
	});

	it("routes html based template source data through the overlay runtime", () => {
		const normalized = normalizeBroadcastSourceData("template", {
			source_code: {
				html: "<div>Template HTML</div>",
				css: ".template{}",
				js: "",
			},
		});

		expect(normalized.kind).toBe("overlay");
		if (normalized.kind === "overlay") {
			expect(normalized.overlay.html).toBe("<div>Template HTML</div>");
			expect(normalized.overlay.css).toBe(".template{}");
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

	it("bridges vector element animation into template package motion", () => {
		const normalized = normalizeBroadcastSourceData("graphic", {
			elements: [
				{
					id: "title",
					animation: {
						enter: { type: "slideLeft", duration: 420, delay: 30 },
						exit: { type: "fadeOut", duration: 240 },
					},
				},
			],
			canvas_size: { width: 3840, height: 2160 },
		});

		expect(normalized).toMatchObject({
			kind: "template",
			canvasWidth: 3840,
			canvasHeight: 2160,
		});
		if (normalized.kind === "template") {
			expect(normalized.motion?.timeline).toEqual([
				expect.objectContaining({
					target: '[data-element-id="title"]',
					in: "slide-left",
					out: "none",
					duration: 420,
					at: 30,
				}),
				expect.objectContaining({
					target: '[data-element-id="title"]',
					in: "none",
					out: "fade",
					duration: 240,
				}),
			]);
		}
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

	it("detects OGraf Web Component packages", () => {
		const normalized = normalizeBroadcastSourceData("ograf", {
			manifest: {
				id: "l3rd-name",
				name: "Lower Third - Name",
				main: "lower-third.mjs",
				schema: {
					type: "object",
					required: ["name"],
					properties: {
						name: { type: "string", title: "Name" },
					},
				},
				v_webcgk_motion: {
					schemaVersion: "webcgk.motion.v2",
					timeline: [{ target: ".name", in: "slide-left" }],
				},
			},
			data: {
				name: "Kim Minji",
				title: "Reporter",
			},
			moduleCode: "export default class Graphic extends HTMLElement {}",
			importSource: "webcgk.ograf.inline-module.v1",
		});

		expect(normalized.kind).toBe("ograf");
		if (normalized.kind === "ograf") {
			expect(normalized.ograf.manifest.runtimeKind).toBe("ograf-web-component");
			expect(normalized.ograf.entrypoint).toBe("lower-third.mjs");
			expect(normalized.ograf.motion?.timeline).toHaveLength(1);
			expect(normalized.ograf.data).toEqual({
				name: "Kim Minji",
				title: "Reporter",
			});
			expect(normalized.ograf.moduleCode).toContain("export default class");
			expect(normalized.ograf.importSource).toBe(
				"webcgk.ograf.inline-module.v1",
			);
		}
	});

	it("detects the built-in OGraf lower-third sample", () => {
		const normalized = normalizeBroadcastSourceData(
			"ograf",
			createOgrafLowerThirdSourceData(),
		);

		expect(normalized.kind).toBe("ograf");
		if (normalized.kind === "ograf") {
			expect(normalized.ograf.manifest.id).toBe("webcgk.samples.lower-third");
			expect(normalized.ograf.entrypoint).toBe("webcgk:ograf/lower-third");
			expect(normalized.ograf.data.name).toBe("Kim Minji");
			expect(normalized.ograf.motion?.timeline[0]).toMatchObject({
				target: ".wrap",
				in: "slide-left",
			});
		}
	});
});

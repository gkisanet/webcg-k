import { describe, expect, it } from "vitest";
import {
	buildManifestFromOverlayTemplate,
	findMissingManifestDataFields,
	parseGraphicPackageManifest,
	parseOgrafManifest,
} from "../graphicManifest";

describe("graphicManifest", () => {
	it("normalizes an OGraf v1 manifest into WebCG-K package metadata", () => {
		const result = parseOgrafManifest({
			id: "l3rd-name",
			name: "Lower Third Name",
			main: "graphic.mjs",
			schema: {
				type: "object",
				required: ["name"],
				properties: {
					name: { type: "string", title: "Name" },
				},
			},
			stepCount: 2,
			customActions: [{ name: "highlight", label: "Highlight" }],
			renderRequirements: [
				{
					resolution: { min: { width: 1920, height: 1080 } },
					engine: [{ name: "chromium", minVersion: "110" }],
				},
			],
			thumbnails: [{ src: "thumb.png", label: "Default" }],
			v_webcgk_motion: {
				schemaVersion: "webcgk.motion.v2",
				timeline: [{ target: ".name", in: "slide-left", out: "fade" }],
			},
			v_webcgk_layerPriority: 10,
		});

		expect(result.ok).toBe(true);
		expect(result.manifest).toMatchObject({
			sourceSpec: "ograf-v1",
			runtimeKind: "ograf-web-component",
			id: "l3rd-name",
			entrypoint: "graphic.mjs",
			stepCount: 2,
			customActions: [{ id: "highlight", label: "Highlight" }],
			motion: {
				schemaVersion: "webcgk.motion.v2",
				timeline: [{ target: ".name", in: "slide-left", out: "fade" }],
			},
			vendorExtensions: { v_webcgk_layerPriority: 10 },
		});
	});

	it("reports required OGraf fields", () => {
		const result = parseOgrafManifest({
			id: "broken",
			name: "Broken",
		});

		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.path === "main")).toBe(true);
	});

	it("accepts OGraf custom actions with a null schema", () => {
		const result = parseOgrafManifest({
			id: "renderer-test",
			name: "Renderer Test Graphic",
			main: "graphic.mjs",
			customActions: [{ id: "highlight", name: "Highlight", schema: null }],
		});

		expect(result.ok).toBe(true);
		expect(result.manifest?.customActions).toEqual([
			{ id: "highlight", label: "Highlight", schema: null },
		]);
	});

	it("parses WebCG-K manifests before OGraf manifests", () => {
		const result = parseGraphicPackageManifest({
			specVersion: "webcgk.manifest.v1",
			sourceSpec: "webcgk-manifest-v1",
			id: "native-title",
			name: "Native Title",
			runtimeKind: "webcgk-vector",
			motion: {
				schemaVersion: "webcgk.motion.v2",
				timeline: [{ target: "#overlay", in: "fade" }],
			},
			customActions: [],
		});

		expect(result.ok).toBe(true);
		expect(result.manifest?.sourceSpec).toBe("webcgk-manifest-v1");
		expect(result.manifest?.motion?.timeline).toHaveLength(1);
	});

	it("wraps legacy HTML overlay templates as manifest packages", () => {
		const manifest = buildManifestFromOverlayTemplate({
			id: "overlay-1",
			name: "Score Bug",
			description: null,
			plugin_type: "html",
			source_code: { html: "<div></div>", css: "", js: "" },
			dashboard_schema: {
				properties: {
					home: { type: "string", title: "Home" },
				},
			},
			animation_config: {
				in: { type: "fade", duration: 300 },
				out: { type: "fade", duration: 300 },
				actions: [
					{
						id: "swap",
						label: "Swap Teams",
						type: "trigger",
						config: { targetField: "home" },
					},
				],
			},
			graphic_data: [],
			thumbnail: "data:image/png;base64,abc",
			tags: ["sports"],
		});

		expect(manifest).toMatchObject({
			sourceSpec: "legacy-overlay-template",
			runtimeKind: "html-iframe",
			stepCount: -1,
			customActions: [{ id: "swap", label: "Swap Teams" }],
			thumbnails: [{ src: "data:image/png;base64,abc", label: "Score Bug" }],
			motion: {
				schemaVersion: "webcgk.motion.v2",
				timeline: [
					{
						target: "#overlay",
						in: "fade",
						out: "fade",
						duration: 300,
					},
				],
			},
			vendorExtensions: {
				v_webcgk_tags: ["sports"],
				v_webcgk_pluginType: "html",
			},
		});
	});

	it("finds missing required data fields from manifest schema", () => {
		const missing = findMissingManifestDataFields(
			{
				dataSchema: {
					type: "object",
					required: ["headline", "subtitle"],
					properties: {},
				},
			},
			{ headline: "Breaking" },
		);

		expect(missing).toEqual(["subtitle"]);
	});
});

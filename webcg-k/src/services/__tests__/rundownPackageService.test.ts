import { describe, expect, it } from "vitest";
import {
	buildImportedRundownItemDrafts,
	buildRundownPackageFilename,
	parseRundownPackage,
	RUNDOWN_PACKAGE_SCHEMA_VERSION,
	RUNDOWN_PACKAGE_TYPE,
	type RundownPackage,
	serializeRundownPackage,
} from "../rundownPackageService";

function makePackage(): RundownPackage {
	return {
		manifest: {
			packageType: RUNDOWN_PACKAGE_TYPE,
			schemaVersion: RUNDOWN_PACKAGE_SCHEMA_VERSION,
			exportedAt: "2026-05-26T00:00:00.000Z",
			exportedBy: "WebCG-K",
			format: {
				kind: "webcgk-rundown-json",
				isOgrafPackageExport: false,
				includesOgrafSourceData: false,
			},
			notes: [],
			counts: {
				items: 2,
				sections: 1,
				htmlOverlays: 1,
				graphics: 1,
				ografItems: 0,
			},
		},
		rundown: {
			title: "뉴스 큐시트",
			description: "테스트",
			is_public: false,
			sections_data: [
				{
					id: "sec-1",
					label: "HEADLINE",
					order: 0,
					color: "rgba(59, 130, 246, 0.12)",
				},
			],
		},
		items: [
			{
				originalId: "item-wrap",
				source_type: "overlay",
				source_id: "overlay-old",
				source_name: "하단 자막",
				data: {
					source_code: {
						html: '<div id="overlay"></div>',
						css: "#overlay{}",
						js: "webcgk.onShow(function(){})",
					},
					replicant_data: { title: "속보" },
				},
				item_order: 10,
				duration: 8,
				section_id: "sec-1",
				track_layer: "wrap",
				parent_item_id: null,
			},
			{
				originalId: "item-child",
				source_type: "graphic",
				source_id: "graphic-old",
				source_name: "배경",
				data: { elements: [] },
				item_order: 20,
				duration: 12,
				section_id: "sec-1",
				parent_item_id: "item-wrap",
			},
		],
		overlays: [
			{
				originalId: "overlay-old",
				name: "하단 자막",
				description: null,
				layer: 1,
				graphic_data: [],
				data_source: null,
				refresh_interval: null,
				animation_config: null,
				is_public: false,
				visibility: "private",
				grid_template_id: null,
				zone_ids: null,
				zone_bounds: null,
				ai_prompt: null,
				source_type: "ai_generated",
				ai_metadata: null,
				tags: null,
				plugin_type: "html",
				source_code: {
					html: '<div id="overlay"></div>',
					css: "#overlay{}",
					js: "webcgk.onShow(function(){})",
				},
				dashboard_schema: { properties: { title: { type: "string" } } },
				replicant_defaults: { title: "속보" },
				thumbnail: null,
			},
		],
		graphics: [
			{
				originalId: "graphic-old",
				name: "배경",
				description: null,
				template_data: { elements: [], canvas: { width: 1920, height: 1080 } },
				thumbnail_path: null,
			},
		],
	};
}

describe("rundown package helpers", () => {
	it("round-trips package JSON and keeps HTML overlay source code", () => {
		const serialized = serializeRundownPackage(makePackage());
		const parsed = parseRundownPackage(serialized);

		expect(parsed.manifest.packageType).toBe(RUNDOWN_PACKAGE_TYPE);
		expect(parsed.manifest.format).toMatchObject({
			kind: "webcgk-rundown-json",
			isOgrafPackageExport: false,
		});
		expect(parsed.overlays[0].source_code).toMatchObject({
			html: '<div id="overlay"></div>',
			css: "#overlay{}",
			js: "webcgk.onShow(function(){})",
		});
		expect(parsed.items[0].data).toMatchObject({
			replicant_data: { title: "속보" },
		});
	});

	it("rejects unsupported package files", () => {
		expect(() =>
			parseRundownPackage('{"manifest":{"packageType":"other"}}'),
		).toThrow("WebCG-K 큐시트 패키지가 아닙니다.");
	});

	it("builds imported item drafts with remapped source ids and delayed parent links", () => {
		const sourceIdMap = new Map([
			["overlay:overlay-old", "overlay-new"],
			["graphic:graphic-old", "graphic-new"],
		]);

		const drafts = buildImportedRundownItemDrafts({
			rundownId: "rundown-new",
			items: makePackage().items,
			sourceIdMap,
		});

		expect(drafts.map((draft) => draft.insert.source_id)).toEqual([
			"overlay-new",
			"graphic-new",
		]);
		expect(drafts[0].insert.item_order).toBe(0);
		expect(drafts[1]).toMatchObject({
			originalId: "item-child",
			parentOriginalId: "item-wrap",
			insert: {
				rundown_id: "rundown-new",
				parent_item_id: null,
				section_id: "sec-1",
			},
		});
	});

	it("creates stable download filenames", () => {
		expect(buildRundownPackageFilename("  9시 뉴스 / 큐시트  ")).toBe(
			"9시-뉴스-큐시트.webcgk-rundown.json",
		);
	});

	it("preserves the export boundary when OGraf source data is included", () => {
		const pkg = makePackage();
		pkg.manifest.format.includesOgrafSourceData = true;
		pkg.manifest.counts.ografItems = 1;
		pkg.manifest.notes.push(
			"This is a WebCG-K rundown JSON package, not an OGraf package export.",
		);
		pkg.items.push({
			originalId: "item-ograf",
			source_type: "ograf",
			source_id: "ograf-old",
			source_name: "OGraf Lower 3rd",
			data: {
				manifest: { id: "l3rd-name" },
				entrypoint: "graphic.mjs",
				moduleCode: "export default class Graphic extends HTMLElement {}",
				importSource: "webcgk.ograf.inline-module.v1",
			},
			item_order: 30,
			duration: 10,
			section_id: "sec-1",
			parent_item_id: null,
		});

		const parsed = parseRundownPackage(serializeRundownPackage(pkg));

		expect(parsed.manifest.format).toEqual({
			kind: "webcgk-rundown-json",
			isOgrafPackageExport: false,
			includesOgrafSourceData: true,
		});
		expect(parsed.manifest.counts.ografItems).toBe(1);
		expect(parsed.items.at(-1)?.source_type).toBe("ograf");
	});
});

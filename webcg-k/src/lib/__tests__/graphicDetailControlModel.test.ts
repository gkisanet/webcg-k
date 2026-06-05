import { describe, expect, it } from "vitest";
import {
	applyGraphicDetailDataField,
	buildGraphicDetailControlModel,
} from "../graphicDetailControlModel";
import { createOgrafLowerThirdSourceData } from "../ografSamples";

describe("graphicDetailControlModel", () => {
	it("builds editable fields and action affordances from an OGraf manifest", () => {
		const model = buildGraphicDetailControlModel({
			id: "block-ograf",
			name: "Lower Third",
			trackId: 2,
			startPosition: 100,
			width: 200,
			transitionIn: "cut",
			transitionOut: "cut",
			sourceType: "ograf",
			sourceId: "sample-lower-third",
			sourceData: createOgrafLowerThirdSourceData(),
		});

		expect(model.selected).toBe(true);
		expect(model.sourceType).toBe("ograf");
		expect(model.runtimeKind).toBe("OGraf Component");
		expect(model.supportsRuntimeCommands).toBe(true);
		expect(model.packageSummary?.sourceLabel).toBe("OGraf");
		expect(model.dataFields).toEqual([
			expect.objectContaining({
				key: "name",
				label: "Name",
				required: true,
				type: "string",
				value: "Kim Minji",
			}),
			expect.objectContaining({
				key: "title",
				label: "Title",
				required: true,
				type: "string",
				value: "Reporter",
			}),
		]);
		expect(model.customActions).toEqual([
			expect.objectContaining({
				id: "show",
				label: "Show",
			}),
			expect.objectContaining({
				id: "hide",
				label: "Hide",
			}),
		]);
	});

	it("updates package data while preserving manifest and entrypoint fields", () => {
		const sourceData = createOgrafLowerThirdSourceData();
		const nextSourceData = applyGraphicDetailDataField(
			sourceData,
			{ key: "title", type: "string" },
			"Anchor",
		);

		expect(nextSourceData).toMatchObject({
			manifest: sourceData.manifest,
			entrypoint: sourceData.entrypoint,
			data: {
				name: "Kim Minji",
				title: "Anchor",
			},
		});
	});

	it("coerces number and boolean data fields at the model seam", () => {
		const sourceData = {
			manifest: {
				specVersion: "webcgk.manifest.v1",
				sourceSpec: "webcgk-manifest-v1",
				id: "score-bug",
				name: "Score Bug",
				runtimeKind: "html-iframe",
				dataSchema: {
					type: "object",
					properties: {
						score: { type: "number", title: "Score" },
						live: { type: "boolean", title: "Live" },
					},
				},
			},
			data: { score: 7, live: true },
		};

		const model = buildGraphicDetailControlModel({
			id: "block-score",
			name: "Score Bug",
			trackId: 3,
			startPosition: 300,
			width: 150,
			transitionIn: "cut",
			transitionOut: "cut",
			sourceType: "overlay",
			sourceData,
		});

		expect(model.dataFields).toEqual([
			expect.objectContaining({ key: "score", type: "number", value: 7 }),
			expect.objectContaining({ key: "live", type: "boolean", value: true }),
		]);
		expect(
			applyGraphicDetailDataField(
				sourceData,
				{ key: "score", type: "number" },
				"9",
			),
		).toMatchObject({ data: { score: 9, live: true } });
		expect(
			applyGraphicDetailDataField(
				sourceData,
				{ key: "live", type: "boolean" },
				false,
			),
		).toMatchObject({ data: { score: 7, live: false } });
	});
});

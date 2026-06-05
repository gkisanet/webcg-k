import { describe, expect, it } from "vitest";
import { createOgrafLowerThirdSourceData } from "../ografSamples";
import { mapRundownItemsToCuesheetItems } from "../rundownPreflightAdapter";

describe("rundownPreflightAdapter", () => {
	it("extracts overlay dashboard data for content checks", () => {
		const [item] = mapRundownItemsToCuesheetItems([
			{
				id: "rd-1",
				rundown_id: "rundown-1",
				source_type: "overlay",
				source_name: "Lower Third",
				item_order: 0,
				data: {
					dashboard_schema: {
						properties: {
							name: { type: "string" },
							title: { type: "string" },
						},
					},
					replicant_defaults: { title: "서울시 관계자" },
					replicant_data: { name: "홍길동" },
				},
			},
		]);

		expect(item.cg_data).toHaveLength(1);
		expect(item.cg_data[0].fields).toEqual({
			name: "홍길동",
			title: "서울시 관계자",
		});
	});

	it("extracts vector text and binding slot content", () => {
		const [item] = mapRundownItemsToCuesheetItems([
			{
				id: "rd-2",
				rundown_id: "rundown-1",
				source_type: "graphic",
				source_name: "Headline",
				item_order: 1,
				data: {
					elements: [
						{ id: "headline", type: "text", content: "오늘 발표" },
						{
							id: "group",
							type: "shape",
							bindingContainer: {
								slots: [
									{
										id: "slot-1",
										bindingKey: "subtitle",
										content: "어제 회의 결과",
									},
								],
							},
						},
					],
				},
			},
		]);

		expect(item.cg_data[0].fields).toEqual({
			headline: "오늘 발표",
			subtitle: "어제 회의 결과",
		});
	});

	it("extracts OGraf package data for content checks", () => {
		const [item] = mapRundownItemsToCuesheetItems([
			{
				id: "rd-3",
				rundown_id: "rundown-1",
				source_type: "ograf",
				source_name: "OGraf Lower Third",
				item_order: 2,
				data: createOgrafLowerThirdSourceData(),
			},
		]);

		expect(item.cg_data[0].fields).toEqual({
			name: "Kim Minji",
			title: "Reporter",
		});
	});
});

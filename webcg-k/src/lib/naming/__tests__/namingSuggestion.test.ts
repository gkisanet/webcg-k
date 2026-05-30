import { describe, expect, it } from "vitest";
import {
	applyNamingSuggestion,
	assetMatchesNamingQuery,
	getNamingQualityWarnings,
	getNamingSuggestions,
	parseNamingQuery,
	scoreNamedAsset,
} from "../namingSuggestion";

describe("namingSuggestion", () => {
	it("splits Korean naming queries by common delimiters", () => {
		expect(parseNamingQuery("좌상단-두글자 빨강/겹침")).toEqual([
			{ raw: "좌상단", normalized: "좌상단" },
			{ raw: "두글자", normalized: "두글자" },
			{ raw: "빨강", normalized: "빨강" },
			{ raw: "겹침", normalized: "겹침" },
		]);
	});

	it("shows only the first naming bucket for an empty search", () => {
		const groups = getNamingSuggestions({ input: "" });

		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe("position");
		expect(
			groups[0].suggestions.map((suggestion) => suggestion.value),
		).toContain("좌상단");
		expect(
			groups[0].suggestions.map((suggestion) => suggestion.value),
		).not.toContain("헤드라인");
	});

	it("moves to the next bucket after a selected token", () => {
		const groups = getNamingSuggestions({ input: "좌상단" });

		expect(groups[0].id).toBe("role");
		expect(
			groups[0].suggestions.map((suggestion) => suggestion.value),
		).toContain("헤드라인");
	});

	it("replaces a partial trailing token when applying a matching suggestion", () => {
		const [group] = getNamingSuggestions({ input: "좌" });
		const nextValue = applyNamingSuggestion("좌", group.suggestions[0]);

		expect(nextValue).toBe("좌상단");
	});

	it("appends taxonomy suggestions with the standard delimiter", () => {
		const [group] = getNamingSuggestions({ input: "좌상단" });
		const headline = group.suggestions.find(
			(suggestion) => suggestion.value === "헤드라인",
		);

		if (!headline) throw new Error("헤드라인 제안을 찾을 수 없습니다.");
		expect(applyNamingSuggestion("좌상단", headline)).toBe("좌상단-헤드라인");
	});

	it("matches multi-word searches regardless of delimiter", () => {
		const asset = { name: "좌상단-헤드라인-두글자-빨강" };

		expect(assetMatchesNamingQuery(asset, "좌상단 빨강")).toBe(true);
		expect(assetMatchesNamingQuery(asset, "좌상단/두글자")).toBe(true);
		expect(assetMatchesNamingQuery(asset, "우상단 빨강")).toBe(false);
	});

	it("scores exact token matches higher than loose text matches", () => {
		const exact = scoreNamedAsset(
			{ name: "우상단-출처-세글자-겹침" },
			"우상단 출처",
		);
		const loose = scoreNamedAsset(
			{ description: "우상단 출처용 그래픽" },
			"우상단 출처",
		);

		expect(exact).toBeGreaterThan(loose);
	});

	it("suggests existing names that match the typed query", () => {
		const groups = getNamingSuggestions({
			input: "우상단 출처",
			existingNames: ["좌상단-헤드라인-두글자-빨강", "우상단-출처-세글자-겹침"],
		});

		const existingNameGroup = groups.find(
			(group) => group.id === "existing-names",
		);

		expect(existingNameGroup?.suggestions[0].value).toBe(
			"우상단-출처-세글자-겹침",
		);
	});

	it("uses custom workspace token groups for suggestions", () => {
		const groups = getNamingSuggestions({
			input: "",
			tokenGroups: [
				{
					id: "position",
					label: "위치",
					description: "커스텀 위치",
					tokens: ["메인월", "스튜디오좌측"],
				},
				{
					id: "role",
					label: "역할",
					description: "커스텀 역할",
					tokens: ["팩트박스"],
				},
				{
					id: "content",
					label: "콘텐츠 조건",
					description: "",
					tokens: [],
				},
				{ id: "style", label: "스타일", description: "", tokens: [] },
				{ id: "state", label: "운영 상태", description: "", tokens: [] },
			],
		});

		expect(groups[0].suggestions.map((suggestion) => suggestion.value)).toEqual(
			["메인월", "스튜디오좌측"],
		);
	});

	it("warns about temporary, duplicate, and incomplete names", () => {
		const warnings = getNamingQualityWarnings({
			input: "새 그래픽",
			existingNames: ["새 그래픽"],
		});

		expect(warnings.map((warning) => warning.code)).toEqual([
			"duplicate_name",
			"temporary_name",
			"missing_position",
			"missing_role",
		]);
	});

	it("accepts names that include required custom position and role tokens", () => {
		const warnings = getNamingQualityWarnings({
			input: "메인월-팩트박스",
			tokenGroups: [
				{
					id: "position",
					label: "위치",
					description: "커스텀 위치",
					tokens: ["메인월"],
				},
				{
					id: "role",
					label: "역할",
					description: "커스텀 역할",
					tokens: ["팩트박스"],
				},
				{
					id: "content",
					label: "콘텐츠 조건",
					description: "",
					tokens: [],
				},
				{ id: "style", label: "스타일", description: "", tokens: [] },
				{ id: "state", label: "운영 상태", description: "", tokens: [] },
			],
		});

		expect(warnings).toEqual([]);
	});
});

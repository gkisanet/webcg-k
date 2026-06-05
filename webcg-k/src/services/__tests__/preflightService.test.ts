import { describe, expect, it } from "vitest";
import { runPreflight } from "../preflightService";

describe("runPreflight", () => {
	it("runs content checks without a bundle when structural checks are optional", async () => {
		const report = await runPreflight(
			[
				{
					id: "rd-1",
					cuesheet_id: "rundown-1",
					nrcs_item_id: "rd-1",
					title: "Headline",
					slug: "Headline",
					reporter: "System",
					article_type: "graphic",
					status: "mapped",
					cg_data: [
						{
							id: "rd-1:text",
							type: "headline",
							fields: { headline: "오늘 오전 발표" },
							order: 0,
						},
					],
					mapping_result: {},
					item_order: 0,
					linked_rundown_item_id: "rd-1",
					source_row_id: null,
					created_at: "",
					updated_at: "",
				},
			],
			null,
			"2026-05-31",
			{ requireBundle: false, reusePolicy: "reusable" },
		);

		expect(report.errorCount).toBe(0);
		expect(report.warningCount).toBe(1);
		expect(report.contentIssueCount).toBeGreaterThan(0);
		expect(report.validationStatus).toBe("needs_review");
	});
});

import { describe, expect, it } from "vitest";
import {
	buildCuesheetCheckContext,
	type CuesheetValidationReportRecord,
	createCuesheetContentHash,
	getCuesheetValidationStatus,
	isValidationReportStale,
} from "../cuesheetCheckService";
import type { NrcsCuesheetItem } from "../cuesheetService";

function makeItem(overrides: Partial<NrcsCuesheetItem> = {}): NrcsCuesheetItem {
	return {
		id: "item-1",
		cuesheet_id: "cs-1",
		nrcs_item_id: "nrcs-1",
		slug: "HEAD-1",
		title: "오늘 오전 브리핑",
		reporter: "홍길동",
		article_type: "headline",
		item_order: 0,
		cg_data: [
			{
				type: "headline",
				fields: { title: "오늘 오전 브리핑" },
			},
		],
		mapping_result: {},
		status: "mapped",
		linked_rundown_item_id: null,
		source_row_id: "row-1",
		created_at: "2026-05-28T00:00:00Z",
		updated_at: "2026-05-28T00:00:00Z",
		...overrides,
	};
}

describe("cuesheetCheckService", () => {
	it("builds reusable check context by default", () => {
		const context = buildCuesheetCheckContext({
			programDate: "2026-05-28",
			checkedAt: "2026-05-28T10:00:00+09:00",
		});

		expect(context).toMatchObject({
			programDate: "2026-05-28",
			reusePolicy: "reusable",
			originalAirDate: "2026-05-28",
			targetAirDate: "2026-05-28",
			timezone: "Asia/Seoul",
		});
	});

	it("keeps content hash stable for equal content and changes on text/order edits", () => {
		const item = makeItem();
		const sameItemWithDifferentKeyOrder = makeItem({
			cg_data: [
				{
					fields: { title: "오늘 오전 브리핑" },
					type: "headline",
				},
			],
		});
		const reordered = makeItem({ item_order: 3 });
		const edited = makeItem({
			cg_data: [
				{ type: "headline", fields: { title: "5월 28일 오전 브리핑" } },
			],
		});

		const hash = createCuesheetContentHash({
			programDate: "2026-05-28",
			items: [item],
		});

		expect(hash).toBe(
			createCuesheetContentHash({
				programDate: "2026-05-28",
				items: [sameItemWithDifferentKeyOrder],
			}),
		);
		expect(hash).not.toBe(
			createCuesheetContentHash({
				programDate: "2026-05-28",
				items: [reordered],
			}),
		);
		expect(hash).not.toBe(
			createCuesheetContentHash({ programDate: "2026-05-28", items: [edited] }),
		);
	});

	it("marks latest validation stale when content hash changes", () => {
		const report: CuesheetValidationReportRecord = {
			id: "report-1",
			cuesheetId: "cs-1",
			status: "passed",
			contentHash: "fnv1a:abc:10",
			context: buildCuesheetCheckContext({ programDate: "2026-05-28" }),
			report: {},
			checkedBy: "user-1",
			checkedAt: "2026-05-28T10:00:00+09:00",
			aiModelId: null,
			createdAt: "2026-05-28T10:00:00+09:00",
		};

		expect(isValidationReportStale(report, "fnv1a:abc:10")).toBe(false);
		expect(isValidationReportStale(report, "fnv1a:abc:10", "reusable")).toBe(
			false,
		);
		expect(isValidationReportStale(report, "fnv1a:abc:10", "single_air")).toBe(
			true,
		);
		expect(isValidationReportStale(report, "fnv1a:def:10")).toBe(true);
		expect(isValidationReportStale(null, "fnv1a:def:10")).toBe(true);
	});

	it("converts issue counts to validation gate status", () => {
		expect(
			getCuesheetValidationStatus({ errorCount: 1, warningCount: 0 }),
		).toBe("blocked");
		expect(
			getCuesheetValidationStatus({ errorCount: 0, warningCount: 2 }),
		).toBe("needs_review");
		expect(
			getCuesheetValidationStatus({ errorCount: 0, warningCount: 0 }),
		).toBe("passed");
	});
});

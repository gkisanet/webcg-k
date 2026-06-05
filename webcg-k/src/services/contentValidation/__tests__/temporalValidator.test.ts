import { describe, expect, it } from "vitest";
import { buildCuesheetCheckContext } from "../../cuesheetCheckService";
import { validateTemporal } from "../temporalValidator";

describe("validateTemporal", () => {
	it("raises relative date expressions to warning for reusable rundowns", () => {
		const context = buildCuesheetCheckContext({
			programDate: "2026-05-28",
			reusePolicy: "reusable",
			checkedAt: "2026-05-28T10:00:00+09:00",
		});

		const issues = validateTemporal("오늘 오전 발표된 대책", context, "title");

		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			type: "temporal",
			severity: "warning",
			original: "오늘",
			suggestion: "5월 28일처럼 절대 날짜 병기",
		});
		expect(issues[0]?.message).toContain("재활용 런다운");
	});

	it("keeps relative date expressions informational for single-air rundowns", () => {
		const context = buildCuesheetCheckContext({
			programDate: "2026-05-28",
			reusePolicy: "single_air",
			checkedAt: "2026-05-28T10:00:00+09:00",
		});

		const issues = validateTemporal("어제 회의 결과", context, "title");

		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: "info",
			original: "어제",
			suggestion: "5월 27일처럼 절대 날짜 병기",
		});
		expect(issues[0]?.message).toContain("해석: 5월 27일");
	});

	it("detects tense mixing as warning", () => {
		const context = buildCuesheetCheckContext({
			programDate: "2026-05-28",
			reusePolicy: "reusable",
		});

		const issues = validateTemporal(
			"정부는 대책을 발표했다, 이후 추가 보완을 할 예정이라고 밝혔다",
			context,
			"body",
		);

		expect(issues.some((issue) => issue.severity === "warning")).toBe(true);
		expect(issues.some((issue) => issue.message.includes("시제 혼용"))).toBe(
			true,
		);
	});
});

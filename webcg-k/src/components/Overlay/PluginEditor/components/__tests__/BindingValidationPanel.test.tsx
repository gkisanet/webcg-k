import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OverlayBindingValidation } from "../../../../../services/aiOverlayService";
import { BindingValidationPanel } from "../BindingValidationPanel";

const baseValidation: OverlayBindingValidation = {
	ok: false,
	errors: [],
	warnings: [],
	hints: [],
	missingBindings: [],
	orphanBindings: [],
	missingDefaults: [],
	scriptTags: [],
};

describe("BindingValidationPanel", () => {
	it("renders nothing when there are no binding warnings", () => {
		const { container } = render(
			<BindingValidationPanel validation={{ ...baseValidation, ok: true }} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("summarizes binding validation with 3-tier severity (errors + warnings)", () => {
		render(
			<BindingValidationPanel
				validation={{
					...baseValidation,
					errors: [
						'HTML 바인딩 "team_name"에 대응하는 스키마 필드가 없습니다.',
					],
					warnings: [
						'대시보드 키 "teamName"에 기본값(replicant_defaults)이 없습니다.',
					],
					missingBindings: ["teamName"],
					orphanBindings: ["team_name"],
					missingDefaults: ["teamName"],
				}}
			/>,
		);

		expect(screen.getByText("바인딩 오류 1개")).toBeInTheDocument();
		expect(screen.getByText("기본값 누락 1개")).toBeInTheDocument();
		expect(screen.getByText(/teamName/)).toBeInTheDocument();
		expect(screen.getByText(/team_name/)).toBeInTheDocument();
	});
});

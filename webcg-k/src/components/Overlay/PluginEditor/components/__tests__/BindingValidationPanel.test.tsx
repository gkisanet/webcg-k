import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BindingValidationPanel } from "../BindingValidationPanel";
import type { OverlayBindingValidation } from "../../../../../services/aiOverlayService";

const baseValidation: OverlayBindingValidation = {
  ok: false,
  warnings: [],
  missingBindings: [],
  orphanBindings: [],
  missingDefaults: [],
};

describe("BindingValidationPanel", () => {
  it("renders nothing when there are no binding warnings", () => {
    const { container } = render(
      <BindingValidationPanel validation={{ ...baseValidation, ok: true }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes binding warnings for the editor UI", () => {
    render(
      <BindingValidationPanel
        validation={{
          ...baseValidation,
          warnings: [
            '스키마 키 "teamName"가 HTML(data-cg-*) 또는 JS에서 사용되지 않습니다.',
            'HTML 바인딩 "team_name"에 대응하는 스키마 필드가 없습니다.',
          ],
          missingBindings: ["teamName"],
          orphanBindings: ["team_name"],
        }}
      />,
    );

    expect(screen.getByText("바인딩 경고 2개")).toBeInTheDocument();
    expect(screen.getByText("누락 1")).toBeInTheDocument();
    expect(screen.getByText("고아 1")).toBeInTheDocument();
    expect(screen.getByText(/teamName/)).toBeInTheDocument();
    expect(screen.getByText(/team_name/)).toBeInTheDocument();
  });
});

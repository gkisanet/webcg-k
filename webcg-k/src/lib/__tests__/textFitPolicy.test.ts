import { describe, expect, it } from "vitest";
import { resolveBindingTextLayout } from "@/lib/textFitPolicy";

const BASE_SHAPE = {
	x: 100,
	width: 300,
	height: 80,
};

const BASE_SLOT = {
	frameX: 16,
	frameY: 12,
	frameWidth: 260,
	frameHeight: 40,
	fontSize: 24,
	fontFamily: "Pretendard",
	fontWeight: 700,
};

describe("resolveBindingTextLayout", () => {
	it("expands the owning Shape to the right when expandRight can fit inside safe width", () => {
		const result = resolveBindingTextLayout({
			content: "long title",
			autoFit: "expandRight",
			shape: BASE_SHAPE,
			slot: BASE_SLOT,
			constraints: { canvasWidth: 1920 },
			measuredTextWidth: 420,
		});

		expect(result.renderShapeWidth).toBe(461);
		expect(result.renderFrameWidth).toBe(421);
		expect(result.textScaleX).toBe(1);
		expect(result.severity).toBe("ok");
	});

	it("shrinks only after expandRightThenShrink reaches the safe right edge", () => {
		const result = resolveBindingTextLayout({
			content: "very long title",
			autoFit: "expandRightThenShrink",
			shape: { ...BASE_SHAPE, x: 1600 },
			slot: BASE_SLOT,
			constraints: { canvasWidth: 1920 },
			measuredTextWidth: 520,
		});

		expect(result.renderShapeWidth).toBe(320);
		expect(result.renderFrameWidth).toBe(280);
		expect(result.textScaleX).toBeCloseTo(280 / 520, 4);
		expect(result.severity).toBe("error");
	});

	it("reports overflow when no automatic fitting is selected", () => {
		const result = resolveBindingTextLayout({
			content: "too long",
			autoFit: "none",
			shape: BASE_SHAPE,
			slot: BASE_SLOT,
			measuredTextWidth: 390,
		});

		expect(result.overflow).toBe(true);
		expect(result.ratio).toBe(1.5);
		expect(result.severity).toBe("warning");
	});
});

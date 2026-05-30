import { describe, expect, it } from "vitest";
import {
	elementToPathD,
	getElementsBounds,
	isBooleanOperand,
	isMaskSource,
} from "../vectorComposition";

describe("vectorComposition", () => {
	it("rect and ellipse can be boolean operands", () => {
		expect(isBooleanOperand({ type: "rect" })).toBe(true);
		expect(isBooleanOperand({ type: "ellipse" })).toBe(true);
		expect(isBooleanOperand({ type: "text" })).toBe(true);
	});

	it("text can be a mask source and a boolean operand", () => {
		expect(isMaskSource({ type: "text" })).toBe(true);
		expect(isBooleanOperand({ type: "text" })).toBe(true);
	});

	it("creates stable SVG path data for primitive shapes", () => {
		expect(
			elementToPathD({ type: "rect", x: 10, y: 20, width: 30, height: 40 }),
		).toBe("M 10 20 H 40 V 60 H 10 Z");
		expect(
			elementToPathD({ type: "ellipse", x: 10, y: 20, width: 30, height: 40 }),
		).toBe("M 10 40 A 15 20 0 1 0 40 40 A 15 20 0 1 0 10 40 Z");
	});

	it("calculates bounds for selected elements", () => {
		expect(
			getElementsBounds([
				{ x: 10, y: 30, width: 100, height: 20 },
				{ x: 40, y: 10, width: 30, height: 90 },
			]),
		).toEqual({ x: 10, y: 10, width: 100, height: 90 });
	});
});

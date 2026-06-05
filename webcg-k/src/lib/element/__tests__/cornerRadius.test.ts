import { describe, expect, it } from "vitest";
import {
	resolveCornerRadius,
	toCssBorderRadius,
	toRoundedRectPath,
} from "../cornerRadius";

describe("resolveCornerRadius", () => {
	it("returns zero when no radius fields are set", () => {
		const r = resolveCornerRadius({});
		expect(r.hasAny).toBe(false);
		expect(r.allSame).toBe(true);
		expect(r.tl).toBe(0);
		expect(r.tr).toBe(0);
		expect(r.br).toBe(0);
		expect(r.bl).toBe(0);
		expect(r.unit).toBe("px");
	});

	it("propagates borderRadius to all 4 corners when linked (default)", () => {
		const r = resolveCornerRadius({ borderRadius: 12 });
		expect(r.tl).toBe(12);
		expect(r.tr).toBe(12);
		expect(r.br).toBe(12);
		expect(r.bl).toBe(12);
		expect(r.hasAny).toBe(true);
		expect(r.allSame).toBe(true);
	});

	it("respects per-corner values when unlinked", () => {
		const r = resolveCornerRadius({
			borderRadius: 4,
			borderRadiusLinked: false,
			borderRadiusTL: 10,
			borderRadiusTR: 20,
			borderRadiusBR: 30,
			borderRadiusBL: 40,
		});
		expect(r.tl).toBe(10);
		expect(r.tr).toBe(20);
		expect(r.br).toBe(30);
		expect(r.bl).toBe(40);
		expect(r.allSame).toBe(false);
	});

	it("falls back to base radius for missing per-corner values when unlinked", () => {
		const r = resolveCornerRadius({
			borderRadius: 5,
			borderRadiusLinked: false,
			borderRadiusTL: 15,
		});
		expect(r.tl).toBe(15);
		expect(r.tr).toBe(5);
		expect(r.br).toBe(5);
		expect(r.bl).toBe(5);
	});

	it("clamps px radius to half of the smaller side when size is given", () => {
		const r = resolveCornerRadius(
			{ borderRadius: 200 },
			{ width: 100, height: 60 },
		);
		expect(r.tl).toBe(30);
		expect(r.unit).toBe("px");
	});

	it("converts % radius to px when size is given (50% = half-pill cap)", () => {
		// 프로젝트 컨벤션: 50% 입력 시 min(W,H)/2 클램프와 동일.
		// DesignTab에서 % 단위는 max=50으로 강제됨.
		const r = resolveCornerRadius(
			{ borderRadius: 50, borderRadiusUnit: "%" },
			{ width: 100, height: 60 },
		);
		expect(r.tl).toBe(15);
		expect(r.unit).toBe("px");
	});

	it("clamps % radius >= 100 to half of smaller side (full pill)", () => {
		const r = resolveCornerRadius(
			{ borderRadius: 100, borderRadiusUnit: "%" },
			{ width: 100, height: 60 },
		);
		expect(r.tl).toBe(30);
		expect(r.unit).toBe("px");
	});

	it("keeps % unit when size is not provided", () => {
		const r = resolveCornerRadius({
			borderRadius: 50,
			borderRadiusUnit: "%",
		});
		expect(r.tl).toBe(50);
		expect(r.unit).toBe("%");
	});
});

describe("toCssBorderRadius", () => {
	it("returns undefined when no radius", () => {
		expect(toCssBorderRadius(resolveCornerRadius({}))).toBeUndefined();
	});

	it("uses shorthand when all corners are equal", () => {
		const r = resolveCornerRadius({ borderRadius: 8 });
		expect(toCssBorderRadius(r)).toBe("8px");
	});

	it("emits 4-corner shorthand when corners differ", () => {
		const r = resolveCornerRadius({
			borderRadiusLinked: false,
			borderRadiusTL: 4,
			borderRadiusTR: 8,
			borderRadiusBR: 16,
			borderRadiusBL: 24,
		});
		expect(toCssBorderRadius(r)).toBe("4px 8px 16px 24px");
	});

	it("preserves % unit when input is %", () => {
		const r = resolveCornerRadius({
			borderRadius: 25,
			borderRadiusUnit: "%",
		});
		expect(toCssBorderRadius(r)).toBe("25%");
	});
});

describe("toRoundedRectPath", () => {
	it("produces a closed path with the correct corner segments", () => {
		const r = resolveCornerRadius({
			borderRadiusLinked: false,
			borderRadiusTL: 5,
			borderRadiusTR: 10,
			borderRadiusBR: 15,
			borderRadiusBL: 20,
		});
		const d = toRoundedRectPath(0, 0, 100, 80, r);
		expect(d.startsWith("M 5 0 ")).toBe(true);
		expect(d.endsWith(" Z")).toBe(true);
		expect(d).toContain("L 90 0");
		expect(d).toContain("Q 100 0 100 10");
		expect(d).toContain("L 100 65");
		expect(d).toContain("Q 100 80 85 80");
		expect(d).toContain("L 20 80");
		expect(d).toContain("Q 0 80 0 60");
		expect(d).toContain("L 0 5");
		expect(d).toContain("Q 0 0 5 0");
	});
});

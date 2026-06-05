import { describe, expect, it } from "vitest";
import { createDefaultSlot, createDefaultTextFrame } from "@/lib/types/bindingTypes";

describe("bindingTypes", () => {
	it("creates the default Text Frame with a 15 percent inset when space allows", () => {
		expect(createDefaultTextFrame(300, 80)).toEqual({
			frameX: 45,
			frameY: 12,
			frameWidth: 210,
			frameHeight: 56,
		});
	});

	it("keeps the default Text Frame usable on small Shapes", () => {
		expect(createDefaultTextFrame(60, 24)).toEqual({
			frameX: 10,
			frameY: 2,
			frameWidth: 40,
			frameHeight: 20,
		});
	});

	it("applies the default Text Frame to new binding slots", () => {
		const slot = createDefaultSlot({ id: "slot-test" }, 300, 80);

		expect(slot.frameX).toBe(45);
		expect(slot.frameY).toBe(12);
		expect(slot.frameWidth).toBe(210);
		expect(slot.frameHeight).toBe(56);
	});
});

import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import {
	alignElements,
	deleteElements,
	releaseBooleanGroups,
	releaseCompositionMask,
	updateElement,
} from "../elementOperations";

function makeElement(
	overrides: Partial<GraphicElement> & { id: string },
): GraphicElement {
	return {
		type: "rect",
		name: "Test",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		rotation: 0,
		opacity: 1,
		visible: true,
		locked: false,
		zIndex: 0,
		parentId: null,
		...overrides,
	};
}

describe("updateElement", () => {
	it("지정 ID의 요소만 업데이트한다", () => {
		const els = [
			makeElement({ id: "a", x: 0 }),
			makeElement({ id: "b", x: 50 }),
		];
		const result = updateElement(els, "a", { x: 100 });
		expect(result[0].x).toBe(100);
		expect(result[1].x).toBe(50);
	});

	it("그룹 이동 시 자식도 함께 이동한다", () => {
		const els = [
			makeElement({ id: "g1", type: "group", x: 0, y: 0, children: ["c1"] }),
			makeElement({ id: "c1", x: 10, y: 10, parentId: "g1" }),
		];
		const result = updateElement(els, "g1", { x: 50, y: 50 });
		expect(result[0].x).toBe(50);
		expect(result[1].x).toBe(60);
		expect(result[1].y).toBe(60);
	});

	it("존재하지 않는 ID면 원본을 그대로 반환한다", () => {
		const els = [makeElement({ id: "a" })];
		const result = updateElement(els, "nonexistent", { x: 999 });
		expect(result).toBe(els);
	});
});

describe("deleteElements", () => {
	it("지정 ID의 요소를 삭제한다", () => {
		const els = [makeElement({ id: "a" }), makeElement({ id: "b" })];
		const result = deleteElements(els, ["a"]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("b");
	});

	it("그룹 삭제 시 자식의 parentId를 null로 복원한다", () => {
		const els = [
			makeElement({ id: "g1", type: "group", children: ["c1", "c2"] }),
			makeElement({ id: "c1", parentId: "g1" }),
			makeElement({ id: "c2", parentId: "g1" }),
		];
		const result = deleteElements(els, ["g1"]);
		expect(result).toHaveLength(2);
		expect(result[0].parentId).toBeNull();
		expect(result[1].parentId).toBeNull();
	});
});

describe("releaseCompositionMask", () => {
	it("마스크 그룹의 maskSourceId만 제거하고 그룹 구조는 유지한다", () => {
		const els = [
			makeElement({
				id: "g1",
				type: "group",
				children: ["target", "mask"],
				maskSourceId: "mask",
				maskMode: "alpha",
			}),
			makeElement({ id: "target", parentId: "g1" }),
			makeElement({ id: "mask", parentId: "g1" }),
		];

		const result = releaseCompositionMask(els, ["g1"]);

		expect(result[0].maskSourceId).toBeNull();
		expect(result[0].maskMode).toBeUndefined();
		expect(result[0].children).toEqual(["target", "mask"]);
		expect(result[1].parentId).toBe("g1");
		expect(result[2].parentId).toBe("g1");
	});
});

describe("releaseBooleanGroups", () => {
	it("불리언 그룹을 제거하고 자식을 루트 요소로 복원한다", () => {
		const els = [
			makeElement({
				id: "b1",
				type: "boolean_group",
				children: ["a", "b"],
				booleanOperation: "union",
			}),
			makeElement({ id: "a", parentId: "b1" }),
			makeElement({ id: "b", parentId: "b1" }),
		];

		const result = releaseBooleanGroups(els, ["b1"]);

		expect(result.elements.map((element) => element.id)).toEqual(["a", "b"]);
		expect(result.elements[0].parentId).toBeNull();
		expect(result.elements[1].parentId).toBeNull();
		expect(result.releasedChildIds).toEqual(["a", "b"]);
	});

	it("부모 그룹 안의 불리언 그룹을 해제하면 부모 children 배열에 자식을 대체 삽입한다", () => {
		const els = [
			makeElement({
				id: "parent",
				type: "group",
				children: ["before", "b1", "after"],
			}),
			makeElement({ id: "before", parentId: "parent" }),
			makeElement({
				id: "b1",
				type: "boolean_group",
				parentId: "parent",
				children: ["a", "b"],
				booleanOperation: "subtract",
			}),
			makeElement({ id: "a", parentId: "b1" }),
			makeElement({ id: "b", parentId: "b1" }),
			makeElement({ id: "after", parentId: "parent" }),
		];

		const result = releaseBooleanGroups(els, ["b1"]);
		const parent = result.elements.find((element) => element.id === "parent");
		const a = result.elements.find((element) => element.id === "a");
		const b = result.elements.find((element) => element.id === "b");

		expect(parent?.children).toEqual(["before", "a", "b", "after"]);
		expect(a?.parentId).toBe("parent");
		expect(b?.parentId).toBe("parent");
		expect(result.elements.some((element) => element.id === "b1")).toBe(false);
	});
});

describe("alignElements", () => {
	it("단일 요소를 캔버스 중앙에 정렬한다", () => {
		const els = [makeElement({ id: "a", x: 0, y: 0, width: 100, height: 100 })];
		const result = alignElements(els, ["a"], "center", 1920, 1080);
		expect(result[0].x).toBe(1920 / 2 - 100 / 2);
	});

	it("다중 요소를 좌측 정렬한다", () => {
		const els = [
			makeElement({ id: "a", x: 50, width: 100 }),
			makeElement({ id: "b", x: 200, width: 100 }),
		];
		const result = alignElements(els, ["a", "b"], "left", 1920, 1080);
		expect(result[0].x).toBe(50);
		expect(result[1].x).toBe(50);
	});
});

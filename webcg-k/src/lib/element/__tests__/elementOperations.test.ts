import {
  updateElement,
  deleteElements,
  alignElements,
} from "../elementOperations";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

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
    const els = [makeElement({ id: "a", x: 0 }), makeElement({ id: "b", x: 50 })];
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

describe("alignElements", () => {
  it("단일 요소를 캔버스 중앙에 정렬한다", () => {
    const els = [
      makeElement({ id: "a", x: 0, y: 0, width: 100, height: 100 }),
    ];
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

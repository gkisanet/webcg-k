import {
  screenToSceneCoords,
  snapBoundingBox,
  collectSnapLines,
} from "../sceneMath";

describe("sceneMath", () => {
  describe("screenToSceneCoords", () => {
    it("줌 100%(1.0)일 때 좌표를 올바르게 변환한다", () => {
      const result = screenToSceneCoords(
        { x: 300, y: 400 },
        { left: 100, top: 100 },
        1,
      );
      expect(result).toEqual({ x: 200, y: 300 });
    });

    it("줌 50%(0.5)일 때 좌표를 2배로 스케일업한다", () => {
      const result = screenToSceneCoords(
        { x: 300, y: 400 },
        { left: 100, top: 100 },
        0.5,
      );
      expect(result).toEqual({ x: 400, y: 600 });
    });
  });

  describe("snapBoundingBox", () => {
    it("임계값(8px) 내부로 왼쪽 모서리가 접근 시 스냅 X를 반환한다", () => {
      const box = { x: 95, y: 200, width: 100, height: 100 };
      const lines = { vertical: [100, 500], horizontal: [] };
      const result = snapBoundingBox(box, lines, 8);
      expect(result.snappedX).toBe(100);
      expect(result.activeVertical).toContain(100);
    });

    it("오른쪽 모서리가 임계값 내로 접근 시 스냅 X를 반환한다", () => {
      const box = { x: 0, y: 0, width: 100, height: 100 };
      const lines = { vertical: [103], horizontal: [] };
      const result = snapBoundingBox(box, lines, 8);
      expect(result.snappedX).toBe(3);
      expect(result.activeVertical).toContain(103);
    });

    it("임계값 밖이면 스냅 좌표를 반환하지 않는다", () => {
      const box = { x: 80, y: 200, width: 100, height: 100 };
      const lines = { vertical: [100], horizontal: [] };
      const result = snapBoundingBox(box, lines, 8);
      expect(result.snappedX).toBeUndefined();
      expect(result.activeVertical).toHaveLength(0);
    });

    it("수평 스냅도 정상 동작한다", () => {
      const box = { x: 0, y: 95, width: 100, height: 100 };
      const lines = { vertical: [], horizontal: [100] };
      const result = snapBoundingBox(box, lines, 8);
      expect(result.snappedY).toBe(100);
      expect(result.activeHorizontal).toContain(100);
    });
  });

  describe("collectSnapLines", () => {
    it("캔버스 중심선을 포함한다", () => {
      const result = collectSnapLines([], null, [], 1920, 1080);
      expect(result.vertical).toContain(960);
      expect(result.horizontal).toContain(540);
    });

    it("존 경계선을 포함한다", () => {
      const zones = [{ x: 25, y: 0, width: 50, height: 50 }];
      const result = collectSnapLines([], null, zones, 200, 200);
      expect(result.vertical).toContain(50);  // 25% of 200
      expect(result.vertical).toContain(150); // 75% of 200
      expect(result.horizontal).toContain(0);  // 0% of 200
      expect(result.horizontal).toContain(100); // 50% of 200
    });

    it("제외된 ID의 요소는 건너뛴다", () => {
      const elements = [
        { id: "a", x: 10, y: 10, width: 50, height: 50 },
        { id: "b", x: 100, y: 100, width: 50, height: 50 },
      ];
      const result = collectSnapLines(elements, "a", [], 200, 200);
      // "a"의 코너는 제외되고 "b"의 코너만 포함
      expect(result.vertical).not.toContain(10);
      expect(result.vertical).toContain(100);
    });
  });
});

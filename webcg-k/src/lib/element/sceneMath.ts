/**
 * Scene Math — 좌표계 변환 및 스냅 계산 (순수 함수, DOM 의존성 없음)
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapTarget {
  x: number;
  y: number;
}

export interface SnapResult {
  snappedX: number | undefined;
  snappedY: number | undefined;
  activeVertical: number[];
  activeHorizontal: number[];
}

/**
 * 스크린(화면) 좌표를 캔버스 절대 좌표로 변환
 * @param clientPoint 화면상 마우스 좌표
 * @param canvasRect SVG 캔버스의 getBoundingClientRect() 결과
 * @param zoom 현재 줌 레벨 (1 = 100%)
 */
export function screenToSceneCoords(
  clientPoint: Point,
  canvasRect: { left: number; top: number },
  zoom: number,
): Point {
  return {
    x: (clientPoint.x - canvasRect.left) / zoom,
    y: (clientPoint.y - canvasRect.top) / zoom,
  };
}

/** 임계값 내 두 값의 차이가 있을 때 스냅된 값을 반환 */
function snapValue(value: number, target: number, threshold: number): number | null {
  return Math.abs(value - target) < threshold ? target : null;
}

/**
 * 주어진 BoundingBox를 스냅 대상 라인에 맞추고, 활성 가이드라인을 반환
 *
 * @param box 현재 요소의 BoundingBox
 * @param snapLines 스냅 대상 вертикальные/горизонтальные линии
 * @param threshold 스냅 임계값 (기본 8px)
 */
export function snapBoundingBox(
  box: BoundingBox,
  snapLines: { vertical: number[]; horizontal: number[] },
  threshold = 8,
): SnapResult {
  let snappedX: number | undefined;
  let snappedY: number | undefined;
  const activeVertical: number[] = [];
  const activeHorizontal: number[] = [];

  for (const vLine of snapLines.vertical) {
    // 왼쪽 모서리 스냅
    if (snapValue(box.x, vLine, threshold) !== null) {
      snappedX = vLine;
      activeVertical.push(vLine);
    }
    // 오른쪽 모서리 스냅
    else if (snapValue(box.x + box.width, vLine, threshold) !== null) {
      snappedX = vLine - box.width;
      activeVertical.push(vLine);
    }
  }

  for (const hLine of snapLines.horizontal) {
    // 위쪽 모서리 스냅
    if (snapValue(box.y, hLine, threshold) !== null) {
      snappedY = hLine;
      activeHorizontal.push(hLine);
    }
    // 아래쪽 모서리 스냅
    else if (snapValue(box.y + box.height, hLine, threshold) !== null) {
      snappedY = hLine - box.height;
      activeHorizontal.push(hLine);
    }
  }

  return { snappedX, snappedY, activeVertical, activeHorizontal };
}

/**
 * 그리드 존, 요소 코너, 캔버스 중심에서 모든 스냅 라인 수집
 */
export function collectSnapLines(
  elements: { id: string; x: number; y: number; width: number; height: number }[],
  excludeId: string | null,
  zones: { x: number; y: number; width: number; height: number }[],
  canvasWidth: number,
  canvasHeight: number,
): { vertical: number[]; horizontal: number[] } {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  // 캔버스 중심선
  vertical.push(canvasWidth / 2);
  horizontal.push(canvasHeight / 2);

  // 존 경계
  for (const zone of zones) {
    const zx = Math.round((zone.x / 100) * canvasWidth);
    const zy = Math.round((zone.y / 100) * canvasHeight);
    const zr = Math.round(((zone.x + zone.width) / 100) * canvasWidth);
    const zb = Math.round(((zone.y + zone.height) / 100) * canvasHeight);
    vertical.push(zx, zr);
    horizontal.push(zy, zb);
  }

  // 다른 요소들의 코너
  for (const el of elements) {
    if (el.id === excludeId) continue;
    vertical.push(el.x, el.x + el.width);
    horizontal.push(el.y, el.y + el.height);
  }

  return { vertical, horizontal };
}

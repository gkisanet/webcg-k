/**
 * InteractionLayer — HTML div 기반 상호작용 UI 레이어
 *
 * Why HTML div > SVG?
 * - SVG에서 selection box, resize handle, snap guide를 다시 그릴 때
 *   전체 SVG DOM이 리페인트되는 병목을 제거
 * - HTML div는 GPU 가속 compositing으로 SVG와 독립적 렌더링
 * - pointerEvents: "none" 으로 하위 SVG 이벤트에 간섭하지 않음
 *
 * Drag Ghost (React Bypass):
 * - 드래그 중 Ghost div의 transform을 직접 DOM 조작 (ref.current.style.transform)
 * - mouseUp 시점에만 Store에 최종 좌표 커밋 → React 리렌더 1회
 * - Figma/Excalidraw의 부드러운 드래그 비결
 */

import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import type { RefObject } from "react";

const HANDLE_SIZE = 8;

// PowerPoint 스타일: 코너는 정사각형, 엣지는 얇은 직사각형
const CORNER_HANDLE = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: 2,
};

const EDGE_HANDLE = {
  width: 4,
  height: HANDLE_SIZE,
  borderRadius: 1,
};

interface HandleDef {
  handle: string;
  cursor: string;
  top: string | number;
  left: string | number;
  width: number;
  height: number;
  borderRadius: number;
}

const HANDLES: HandleDef[] = [
  // 코너 — 정사각형 핸들
  { handle: "nw-resize", cursor: "nw-resize", top: -CORNER_HANDLE.height / 2, left: -CORNER_HANDLE.width / 2, ...CORNER_HANDLE },
  { handle: "ne-resize", cursor: "ne-resize", top: -CORNER_HANDLE.height / 2, left: `calc(100% - ${CORNER_HANDLE.width / 2}px)`, ...CORNER_HANDLE },
  { handle: "se-resize", cursor: "se-resize", top: `calc(100% - ${CORNER_HANDLE.height / 2}px)`, left: `calc(100% - ${CORNER_HANDLE.width / 2}px)`, ...CORNER_HANDLE },
  { handle: "sw-resize", cursor: "sw-resize", top: `calc(100% - ${CORNER_HANDLE.height / 2}px)`, left: -CORNER_HANDLE.width / 2, ...CORNER_HANDLE },
  // 엣지 — 얇은 직사각형 핸들
  { handle: "n-resize", cursor: "n-resize", top: -EDGE_HANDLE.height / 2, left: "50%", width: 20, height: EDGE_HANDLE.height, borderRadius: EDGE_HANDLE.borderRadius },
  { handle: "s-resize", cursor: "s-resize", top: `calc(100% - ${EDGE_HANDLE.height / 2}px)`, left: "50%", width: 20, height: EDGE_HANDLE.height, borderRadius: EDGE_HANDLE.borderRadius },
  { handle: "e-resize", cursor: "e-resize", top: "50%", left: `calc(100% - ${EDGE_HANDLE.width / 2}px)`, width: EDGE_HANDLE.width, height: 20, borderRadius: EDGE_HANDLE.borderRadius },
  { handle: "w-resize", cursor: "w-resize", top: "50%", left: -EDGE_HANDLE.width / 2, width: EDGE_HANDLE.width, height: 20, borderRadius: EDGE_HANDLE.borderRadius },
];

export interface DragGhostData {
  id: string;
  x: number; y: number;
  width: number; height: number;
  rotation: number;
  fill?: string;
  borderRadius?: number;
  type: GraphicElement["type"];
}

interface InteractionLayerProps {
  elements: GraphicElement[];
  selectedIds: string[];
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  onResizeStart: (e: React.MouseEvent, id: string, handle: string) => void;
  dragGhost: DragGhostData | null;
  ghostRef: RefObject<HTMLDivElement | null>;
  snapVLinesRef: RefObject<HTMLDivElement | null>;
  snapHLinesRef: RefObject<HTMLDivElement | null>;
}

export function InteractionLayer({
  elements,
  selectedIds,
  zoom,
  canvasWidth,
  canvasHeight,
  onResizeStart,
  dragGhost,
  ghostRef,
  snapVLinesRef,
  snapHLinesRef,
}: InteractionLayerProps) {
  const selectedElems = elements.filter((el) => selectedIds.includes(el.id));

  return (
    <div
      className="interaction-layer"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth * zoom,
        height: canvasHeight * zoom,
        pointerEvents: "none",
      }}
    >
      {/* 스냅 가이드라인 — 드래그 중 React 우회: mouseMove가 직접 innerHTML 조작 */}
      <div ref={snapVLinesRef} style={{ pointerEvents: "none" }} />
      <div ref={snapHLinesRef} style={{ pointerEvents: "none" }} />

      {/* Drag Ghost — left/top=0으로 초기화, translate로만 위치 제어 (이중 계산 방지) */}
      {dragGhost && (
        <div
          ref={ghostRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: dragGhost.width * zoom,
            height: dragGhost.height * zoom,
            backgroundColor: dragGhost.fill || "rgba(59, 130, 246, 0.3)",
            border: "2px solid rgba(59, 130, 246, 0.6)",
            borderRadius: (dragGhost.borderRadius || 0) * zoom,
            transform: `translate(${dragGhost.x * zoom}px, ${dragGhost.y * zoom}px) rotate(${dragGhost.rotation}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
            zIndex: 100,
            opacity: 0.7,
            willChange: "transform",
          }}
        />
      )}

      {/* 선택된 요소: 바운딩 박스 + 리사이즈 핸들 (PowerPoint 스타일) */}
      {selectedElems.map((el) => (
        <div
          key={`bbox-${el.id}`}
          style={{
            position: "absolute",
            left: el.x * zoom,
            top: el.y * zoom,
            width: el.width * zoom,
            height: el.height * zoom,
            border: "2px solid #00d4ff",
            borderRadius: el.type === "rect" && el.borderRadius ? el.borderRadius * zoom : 0,
            transform: `rotate(${el.rotation}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          {HANDLES.map(({ handle, cursor, top, left, width, height, borderRadius }) => (
            <div
              key={handle}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResizeStart(e, el.id, handle);
              }}
              style={{
                position: "absolute",
                top,
                left,
                width,
                height,
                backgroundColor: "#fff",
                border: "1.5px solid #00d4ff",
                borderRadius,
                cursor,
                pointerEvents: "auto",
                zIndex: 20,
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

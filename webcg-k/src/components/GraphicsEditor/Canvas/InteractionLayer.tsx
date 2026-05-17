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

const HANDLE_SIZE = 10;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

type ResizeHandle =
  | "nw-resize"
  | "n-resize"
  | "ne-resize"
  | "e-resize"
  | "se-resize"
  | "s-resize"
  | "sw-resize"
  | "w-resize";

interface HandleDef {
  handle: ResizeHandle;
  cursor: string;
  top: string | number;
  left: string | number;
}

const HANDLES: HandleDef[] = [
  { handle: "nw-resize", cursor: "nw-resize", top: -HANDLE_OFFSET, left: -HANDLE_OFFSET },
  { handle: "n-resize", cursor: "n-resize", top: -HANDLE_OFFSET, left: "50%" },
  { handle: "ne-resize", cursor: "ne-resize", top: -HANDLE_OFFSET, left: `calc(100% - ${HANDLE_OFFSET}px)` },
  { handle: "e-resize", cursor: "e-resize", top: "50%", left: `calc(100% - ${HANDLE_OFFSET}px)` },
  { handle: "se-resize", cursor: "se-resize", top: `calc(100% - ${HANDLE_OFFSET}px)`, left: `calc(100% - ${HANDLE_OFFSET}px)` },
  { handle: "s-resize", cursor: "s-resize", top: `calc(100% - ${HANDLE_OFFSET}px)`, left: "50%" },
  { handle: "sw-resize", cursor: "sw-resize", top: `calc(100% - ${HANDLE_OFFSET}px)`, left: -HANDLE_OFFSET },
  { handle: "w-resize", cursor: "w-resize", top: "50%", left: -HANDLE_OFFSET },
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
  // Drag Ghost — React 우회 직접 DOM 조작용
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

      {/* Drag Ghost — React 우회: mouseMove가 직접 transform 조작 */}
      {dragGhost && (
        <div
          ref={ghostRef}
          style={{
            position: "absolute",
            left: dragGhost.x * zoom,
            top: dragGhost.y * zoom,
            width: dragGhost.width * zoom,
            height: dragGhost.height * zoom,
            backgroundColor: dragGhost.fill || "rgba(59, 130, 246, 0.3)",
            border: "2px solid rgba(59, 130, 246, 0.6)",
            borderRadius: (dragGhost.borderRadius || 0) * zoom,
            transformOrigin: "center center",
            pointerEvents: "none",
            zIndex: 100,
            opacity: 0.7,
            willChange: "transform",
          }}
        />
      )}

      {/* 선택된 요소: 바운딩 박스 + 리사이즈 핸들 */}
      {selectedElems.map((el) => (
        <div
          key={`bbox-${el.id}`}
          style={{
            position: "absolute",
            left: el.x * zoom,
            top: el.y * zoom,
            width: el.width * zoom,
            height: el.height * zoom,
            border: "2px solid #FF00FF",
            borderRadius: el.type === "rect" && el.borderRadius ? el.borderRadius * zoom : 0,
            transform: `rotate(${el.rotation}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          {HANDLES.map(({ handle, cursor, top, left }) => (
            <div
              key={handle}
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(e, el.id, handle);
              }}
              style={{
                position: "absolute",
                top,
                left,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                backgroundColor: "#fff",
                border: "2px solid #FF00FF",
                borderRadius: 2,
                cursor,
                pointerEvents: "auto",
                zIndex: 20,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

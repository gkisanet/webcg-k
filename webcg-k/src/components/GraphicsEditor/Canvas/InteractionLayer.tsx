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

const CORNER_SIZE = 14;
const EDGE_WIDTH = 12;
const EDGE_HEIGHT = 4;

interface HandleDef {
  handle: string;
  cursor: string;
  top: string | number;
  left: string | number;
  width: number;
  height: number;
  isCorner: boolean;
  borderStyle?: React.CSSProperties;
}

const HANDLES: HandleDef[] = [
  // 1. 코너 - 세련된 Figma/방송 장비용 L자형 꺾쇠(Corner Brackets) 핸들
  {
    handle: "nw-resize",
    cursor: "nw-resize",
    top: 0,
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    isCorner: true,
    borderStyle: {
      borderTop: "2.5px solid var(--accent-primary)",
      borderLeft: "2.5px solid var(--accent-primary)",
    },
  },
  {
    handle: "ne-resize",
    cursor: "ne-resize",
    top: 0,
    left: "100%",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    isCorner: true,
    borderStyle: {
      borderTop: "2.5px solid var(--accent-primary)",
      borderRight: "2.5px solid var(--accent-primary)",
    },
  },
  {
    handle: "se-resize",
    cursor: "se-resize",
    top: "100%",
    left: "100%",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    isCorner: true,
    borderStyle: {
      borderBottom: "2.5px solid var(--accent-primary)",
      borderRight: "2.5px solid var(--accent-primary)",
    },
  },
  {
    handle: "sw-resize",
    cursor: "sw-resize",
    top: "100%",
    left: 0,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    isCorner: true,
    borderStyle: {
      borderBottom: "2.5px solid var(--accent-primary)",
      borderLeft: "2.5px solid var(--accent-primary)",
    },
  },
  // 2. 엣지 - 가로/세로 방향에 맞춰 정교하게 설계된 미니 캡슐 슬릿 핸들
  { handle: "n-resize", cursor: "n-resize", top: 0, left: "50%", width: EDGE_WIDTH, height: EDGE_HEIGHT, isCorner: false },
  { handle: "s-resize", cursor: "s-resize", top: "100%", left: "50%", width: EDGE_WIDTH, height: EDGE_HEIGHT, isCorner: false },
  { handle: "e-resize", cursor: "e-resize", top: "50%", left: "100%", width: EDGE_HEIGHT, height: EDGE_WIDTH, isCorner: false },
  { handle: "w-resize", cursor: "w-resize", top: "50%", left: 0, width: EDGE_HEIGHT, height: EDGE_WIDTH, isCorner: false },
];

interface InteractionLayerProps {
  elements: GraphicElement[];
  selectedIds: string[];
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  activeResize: { id: string; handle: string } | null;
  onResizeStart: (e: React.MouseEvent, id: string, handle: string) => void;
  snapVLinesRef: RefObject<HTMLDivElement | null>;
  snapHLinesRef: RefObject<HTMLDivElement | null>;
}

export function InteractionLayer({
  elements,
  selectedIds,
  zoom,
  canvasWidth,
  canvasHeight,
  activeResize,
  onResizeStart,
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
            border: "2px solid var(--accent-primary)",
            borderRadius: el.type === "rect" && el.borderRadius ? el.borderRadius * zoom : 0,
            transform: `rotate(${el.rotation}deg)`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        >
          {HANDLES.map(({ handle, cursor, top, left, width, height, isCorner, borderStyle }) => {
            const isActive = activeResize?.id === el.id && activeResize.handle === handle;
            const activeColor = "#f59e0b";
            return (
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
                  cursor,
                  pointerEvents: "auto",
                  zIndex: 20,
                  transform: "translate(-50%, -50%)",
                  filter: isActive ? "drop-shadow(0 0 4px rgba(245,158,11,0.75))" : undefined,
                  // L자형 코너 꺾쇠와 변 알약 캡슐의 세련된 조건부 디자인
                  ...(isCorner
                    ? {
                        backgroundColor: "transparent",
                        boxSizing: "border-box",
                        ...borderStyle,
                        borderColor: isActive ? activeColor : undefined,
                      }
                    : {
                        backgroundColor: isActive ? activeColor : "#fff",
                        border: `1.5px solid ${isActive ? activeColor : "var(--accent-primary)"}`,
                        borderRadius: "0.25rem",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }),
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

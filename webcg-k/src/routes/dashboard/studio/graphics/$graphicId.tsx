/**
 * Graphics Editor Route
 * 그래픽 편집기 - Penpot 스타일
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { registerAction } from "@/lib/actions/actionRegistry";
import { useActionDispatcher } from "@/hooks/useActionDispatcher";
import { ArrowLeft, Save, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { GraphicsEditor } from "@/components/GraphicsEditor/GraphicsEditor";
import { useHistory } from "@/components/GraphicsEditor/hooks/useHistory";
import type { BindingContainer } from "@/lib/types/bindingTypes";

// 타입 정의
interface GraphicRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  template_data: {
    elements?: GraphicElement[];
    gridTemplateId?: string;
    canvas?: { width: number; height: number };
  };
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface GraphicElement {
  id: string;
  type: "rect" | "ellipse" | "text" | "image" | "group" | "html_plugin";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  parentId: string | null;
  customCSS?: string;
  // 타입별 속성
  fill?: Fill;
  stroke?: Stroke;
  borderRadius?: number;
  borderRadiusUnit?: "px" | "%"; // px 또는 % 단위
  borderRadiusTL?: number; // Top-Left
  borderRadiusTR?: number; // Top-Right
  borderRadiusBR?: number; // Bottom-Right
  borderRadiusBL?: number; // Bottom-Left
  borderRadiusLinked?: boolean; // 모든 코너 연결 여부
  // 텍스트 속성
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  textCase?: "none" | "uppercase" | "lowercase" | "capitalize";
  textDecoration?: "none" | "underline" | "line-through";
  // 이미지 속성
  src?: string;
  objectFit?: "cover" | "contain" | "fill";
  // 그룹 속성
  children?: string[];
  // 🆕 HTML 플러그인 (오버레이 임베딩)
  pluginTemplateId?: string;  // overlay_templates 레코드 ID (추후 라이브 연동용)
  pluginTemplateName?: string; // 오버레이 이름 (속성 패널 표시용)
  pluginSourceCode?: { html: string; css: string; js: string }; // 삽입 시점 소스 코드 스냅샷
  // 텍스트 외곽선 활성화
  textStrokeEnabled?: boolean;
  // 그림자 속성
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  
  // 🆕 Glow (외부 발광)
  glowEnabled?: boolean;
  glowColor?: string;
  glowBlur?: number;
  
  // 🆕 Inner Shadow (내곽선 그림자)
  innerShadowEnabled?: boolean;
  innerShadowColor?: string;
  innerShadowOffsetX?: number;
  innerShadowOffsetY?: number;
  innerShadowBlur?: number;

  // 🆕 고급 시각 효과 (포토샵 필수 기능 보강)
  tabularNums?: boolean;     // 고정폭 숫자 (font-variant-numeric: tabular-nums)
  blendMode?: string;        // 블렌드 모드 (normal | multiply | screen | overlay | ...)
  // 🆕 애니메이션 (Phase 34-E)
  animation?: import("@/components/GraphicPreviewRenderer").ElementAnimation;
  // 🆕 데이터 바인딩 컨테이너 (Phase D-1)
  // Shape(rect/ellipse)가 텍스트를 "소유"하는 PowerPoint 모델
  // 이 속성이 있으면 Shape 내부에 바인딩 텍스트 슬롯이 표시됨
  bindingContainer?: BindingContainer;
}

interface GradientStop {
  offset: number; // 0-100
  color: string;
  opacity?: number; // 0-1
}

interface Fill {
  type?: "solid" | "linear" | "radial" | "none"; // undefined는 solid로 처리
  color?: string;
  opacity?: number; // 0-1 (투명도)
  // 그라데이션 전용
  gradientAngle?: number; // linear gradient 각도 (0-360)
  gradientStops?: GradientStop[];
}

interface Stroke {
  color: string;
  width: number;
  style: "solid" | "dashed" | "dotted";
  opacity?: number; // 0-1
}

export const Route = createFileRoute("/dashboard/studio/graphics/$graphicId")({
  component: GraphicEditorPage,
});

function GraphicEditorPage() {
  const { graphicId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [graphicName, setGraphicName] = useState("");
  const [gridTemplateId, setGridTemplateId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // 히스토리 관리 (Undo/Redo)
  const {
    state: elements,
    setState: setElements,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  } = useHistory<GraphicElement[]>([]);

  // 그래픽 로드
  const { data: graphic, isLoading } = useQuery({
    queryKey: ["graphic", graphicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("graphics")
        .select("*")
        .eq("id", graphicId)
        .single();

      if (error) throw error;
      return data as GraphicRow;
    },
  });

  // 초기화
  useEffect(() => {
    if (graphic) {
      setGraphicName(graphic.name);
      resetHistory(graphic.template_data.elements || []);
      setGridTemplateId(graphic.template_data.gridTemplateId || null);
    }
  }, [graphic, resetHistory]);


  // Undo/Redo — Action 시스템으로 통합
  useActionDispatcher("editor");

  useEffect(() => {
    const unregUndo = registerAction({
      id: "undo",
      label: "실행 취소",
      shortcut: "Ctrl+Z",
      context: "editor",
      predicate: () => canUndo,
      execute: () => undo(),
    });
    const unregRedo = registerAction({
      id: "redo",
      label: "다시 실행",
      shortcut: "Ctrl+Y",
      context: "editor",
      predicate: () => canRedo,
      execute: () => redo(),
    });
    const unregRedoAlt = registerAction({
      id: "redoAlt",
      label: "다시 실행",
      shortcut: "Ctrl+Shift+Z",
      context: "editor",
      predicate: () => canRedo,
      execute: () => redo(),
    });

    return () => {
      unregUndo();
      unregRedo();
      unregRedoAlt();
    };
  }, [undo, redo, canUndo, canRedo]);

  // 요소 변경 핸들러 (기존 배열 교체 → Mutative draft 변이 브릿지)
  const handleElementsChange = (newElements: GraphicElement[]) => {
    setElements((draft) => {
      draft.splice(0, draft.length, ...newElements);
    });
    setHasChanges(true);
  };

  // 저장 mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!graphic) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from("graphics")
        .update({
          name: graphicName,
          template_data: {
            ...graphic.template_data,
            elements,
            gridTemplateId,
          } as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", graphicId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["graphics"] });
      queryClient.invalidateQueries({ queryKey: ["graphic", graphicId] });
      setHasChanges(false);
      alert("저장되었습니다!");
    },
    onError: (error) => {
      console.error("저장 실패:", error);
      alert("저장에 실패했습니다");
    },
  });

  // 뒤로가기
  const handleBack = () => {
    if (hasChanges && !confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?")) {
      return;
    }
    navigate({ to: "/dashboard/studio/graphics" });
  };

  if (isLoading) {
    return (
      <div className="graphics-editor-page">
        <div className="graphics-editor-header">
          <span>로딩 중...</span>
        </div>
      </div>
    );
  }

  if (!graphic) {
    return (
      <div className="graphics-editor-page">
        <div className="graphics-editor-header">
          <button type="button" className="back-btn" onClick={handleBack}>
            <ArrowLeft size={18} />
            <span>돌아가기</span>
          </button>
          <span>그래픽을 찾을 수 없습니다</span>
        </div>
      </div>
    );
  }

  return (
    <div className="graphics-editor-page">
      {/* 헤더 */}
      <div className="graphics-editor-header">
        <div className="header-left">
          <button type="button" className="back-btn" onClick={handleBack}>
            <ArrowLeft size={18} />
          </button>
        </div>

        <div className="header-center">
          {/* 제목 */}
          <div className="title-group">
            <span className="title-label">제목</span>
            <input
              type="text"
              className="graphic-name-input"
              value={graphicName}
              onChange={(e) => {
                setGraphicName(e.target.value);
                setHasChanges(true);
              }}
              placeholder="그래픽 이름"
            />
          </div>

          {/* Undo/Redo 버튼 */}
          <div className="action-group">
            <button
              type="button"
              className="icon-btn"
              onClick={undo}
              disabled={!canUndo}
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={redo}
              disabled={!canRedo}
              title="다시 실행 (Ctrl+Y)"
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>

        <div className="header-right">
          <Button
            className="save-btn"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
          >
            <Save size={18} />
            {saveMutation.isPending ? "저장 중..." : hasChanges ? "저장" : "저장됨"}
          </Button>
        </div>
      </div>

      {/* 편집기 */}
      <div className="graphics-editor-content">
        <GraphicsEditor
          elements={elements}
          onElementsChange={handleElementsChange}
          gridTemplateId={gridTemplateId}
          onGridTemplateChange={setGridTemplateId}
          canvasWidth={graphic.template_data.canvas?.width || 1920}
          canvasHeight={graphic.template_data.canvas?.height || 1080}
        />
      </div>
    </div>
  );
}

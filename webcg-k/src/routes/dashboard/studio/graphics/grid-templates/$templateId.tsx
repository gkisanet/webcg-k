/**
 * Grid Template Editor Page (전체화면)
 * FancyZones 스타일 클릭 분할 편집기
 * seed.sql의 zones-only 데이터도 시각적으로 표시 (fallback)
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../../../../lib/supabase";
import { GridTemplateRow, type Zone as GridZone } from "../../../../../lib/gridTypes";
import {
  GridSplitEditor,
  SplitLine,
} from "../../../../../components/GridEditor/GridSplitEditor";
import "../../../../../components/GridEditor/GridSplitEditor.css";
import { ArrowLeft, Save, Layers, ImagePlus, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
  "/dashboard/studio/graphics/grid-templates/$templateId",
)({
  component: GridTemplateEditorPage,
});

// ─── Zone 타입 색상 매핑 ──────────────────────────────────────
const ZONE_TYPE_COLORS: Record<string, string> = {
  band: "rgba(200, 30, 30, 0.35)",
  headline: "rgba(255, 200, 0, 0.30)",
  super: "rgba(30, 100, 200, 0.35)",
  crawl: "rgba(200, 30, 30, 0.40)",
  text: "rgba(100, 100, 255, 0.25)",
  logo: "rgba(255, 255, 255, 0.20)",
  video: "rgba(0, 200, 100, 0.25)",
  lowthird: "rgba(30, 30, 30, 0.35)",
  background: "rgba(50, 50, 50, 0.15)",
  graphic: "rgba(200, 100, 255, 0.25)",
};

function GridTemplateEditorPage() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [templateName, setTemplateName] = useState("");
  const [splits, setSplits] = useState<SplitLine[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // 배경 참고 이미지 상태
  // ■ Why 로컬 상태?
  //   이 이미지는 편집 보조용이라 DB에 저장하지 않음.
  //   Blob URL로 임시 참조하고, 페이지 떠나면 자동 해제.
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.35);
  const [bgVisible, setBgVisible] = useState(true);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // 템플릿 로드
  const { data: template, isLoading } = useQuery({
    queryKey: ["gridTemplate", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grid_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;
      return data as unknown as GridTemplateRow;
    },
  });

  // seed 데이터의 zones (splits 없이 zones만 있는 경우)
  const seedZones = useMemo(() => {
    if (!template) return [];
    const td = template.template_data;
    // splits가 없고 zones만 있는 경우 = seed 데이터
    if ((!td.splits || td.splits.length === 0) && td.zones && td.zones.length > 0) {
      return td.zones;
    }
    return [];
  }, [template]);

  // seed zones를 퍼센트 기반으로 변환 (캔버스 크기 대비)
  const seedZonesPercent = useMemo(() => {
    if (seedZones.length === 0 || !template) return [];
    const cw = template.template_data.canvas?.width || 1920;
    const ch = template.template_data.canvas?.height || 1080;
    return seedZones.map((z: GridZone) => ({
      ...z,
      pct: {
        x: (z.bounds.x / cw) * 100,
        y: (z.bounds.y / ch) * 100,
        width: (z.bounds.width / cw) * 100,
        height: (z.bounds.height / ch) * 100,
      },
    }));
  }, [seedZones, template]);

  // 템플릿 데이터 초기화
  useEffect(() => {
    if (template) {
      setTemplateName(template.name);
      setSplits(template.template_data.splits || []);
    }
  }, [template]);

  // 변경 감지
  const handleSplitsChange = (newSplits: SplitLine[]) => {
    setSplits(newSplits);
    setHasChanges(true);
  };

  // 저장 mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from("grid_templates")
        .update({
          name: templateName,
          template_data: {
            ...template.template_data,
            splits,
            zones,
          } as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gridTemplates"] });
      queryClient.invalidateQueries({ queryKey: ["gridTemplate", templateId] });
      setHasChanges(false);
      alert("저장되었습니다!");
    },
    onError: (error) => {
      console.error("저장 실패:", error);
      alert("저장에 실패했습니다");
    },
  });

  // 뒤로가기 (변경사항 확인)
  const handleBack = () => {
    if (hasChanges && !confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?")) {
      return;
    }
    // Blob URL cleanup
    if (bgImage) URL.revokeObjectURL(bgImage);
    navigate({ to: "/dashboard/studio/graphics" });
  };

  // 배경 이미지 업로드 핸들러
  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 기존 Blob URL 정리
    if (bgImage) URL.revokeObjectURL(bgImage);

    const url = URL.createObjectURL(file);
    setBgImage(url);

    // input 초기화 (같은 파일 다시 업로드 허용)
    e.target.value = "";
  };

  // 배경 이미지 제거
  const handleBgImageRemove = () => {
    if (bgImage) URL.revokeObjectURL(bgImage);
    setBgImage(null);
  };

  if (isLoading) {
    return (
      <div className="grid-editor-fullscreen">
        <div className="grid-editor-fullscreen-header">
          <span>로딩 중...</span>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="grid-editor-fullscreen">
        <div className="grid-editor-fullscreen-header">
          <button type="button" className="back-btn" onClick={handleBack}>
            <ArrowLeft size={18} />
            <span>돌아가기</span>
          </button>
          <span>템플릿을 찾을 수 없습니다</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-editor-fullscreen">
      {/* 헤더 */}
      <div className="grid-editor-fullscreen-header">
        <button type="button" className="back-btn" onClick={handleBack}>
          <ArrowLeft size={18} />
          <span>돌아가기</span>
        </button>

        <input
          type="text"
          className="template-name-input"
          value={templateName}
          onChange={(e) => {
            setTemplateName(e.target.value);
            setHasChanges(true);
          }}
          placeholder="템플릿 이름"
        />

        {/* seed zones 안내 배지 */}
        {seedZonesPercent.length > 0 && (
          <span style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 6,
            background: "rgba(100, 180, 255, 0.15)",
            color: "#7cb9ff", fontSize: 13,
          }}>
            <Layers size={14} />
            시드 영역 {seedZonesPercent.length}개 (분할선으로 편집하세요)
          </span>
        )}

        <Button
          className="save-btn"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !hasChanges}
        >
          <Save size={18} />
          {saveMutation.isPending ? "저장 중..." : hasChanges ? "저장" : "저장됨"}
        </Button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 24, background: "var(--border-default)" }} />

        {/* 배경 참고 이미지 컨트롤 */}
        <div className="bg-image-controls">
          {/* 숨겨진 파일 입력 */}
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            onChange={handleBgImageUpload}
            style={{ display: "none" }}
          />

          <button
            type="button"
            className="bg-image-upload-btn"
            onClick={() => bgInputRef.current?.click()}
          >
            <ImagePlus size={14} />
            {bgImage ? "배경 교체" : "참고사진"}
          </button>

          {bgImage && (
            <>
              {/* 보이기/숨기기 토글 — 이미지를 제거하지 않고 빠르게 on/off */}
              <button
                type="button"
                className={`bg-image-toggle-btn ${bgVisible ? 'active' : ''}`}
                onClick={() => setBgVisible((v) => !v)}
                title={bgVisible ? '배경 숨기기' : '배경 보이기'}
              >
                {bgVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

              <label>투명도</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(bgOpacity * 100)}
                onChange={(e) => setBgOpacity(Number(e.target.value) / 100)}
                disabled={!bgVisible}
              />
              <span className="bg-opacity-value">{Math.round(bgOpacity * 100)}%</span>
              <button
                type="button"
                className="bg-image-remove-btn"
                onClick={handleBgImageRemove}
                title="배경 이미지 제거"
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 편집기 */}
      <div className="grid-editor-content" style={{ position: "relative" }}>
        <GridSplitEditor
          splits={splits}
          onSplitsChange={handleSplitsChange}
          onZonesChange={setZones}
          canvasWidth={template.template_data.canvas?.width || 1920}
          canvasHeight={template.template_data.canvas?.height || 1080}
          backgroundImage={bgVisible ? bgImage : null}
          backgroundOpacity={bgOpacity}
        />

        {/* seed zones 오버레이 — splits가 없을 때만 표시 */}
        {seedZonesPercent.length > 0 && splits.length === 0 && (
          <div style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 5,
          }}>
            <div style={{
              position: "relative",
              width: "100%",
              height: "100%",
            }}>
              {seedZonesPercent.map((z: any) => (
                <div
                  key={z.id}
                  style={{
                    position: "absolute",
                    left: `${z.pct.x}%`,
                    top: `${z.pct.y}%`,
                    width: `${z.pct.width}%`,
                    height: `${z.pct.height}%`,
                    background: ZONE_TYPE_COLORS[z.type] || "rgba(100,100,255,0.2)",
                    border: "1.5px dashed rgba(255,255,255,0.5)",
                    borderRadius: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 11,
                    fontWeight: 600,
                    textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                  }}
                >
                  <span>{z.name}</span>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>
                    {z.bounds.width}×{z.bounds.height}px
                  </span>
                  <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase" }}>
                    {z.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


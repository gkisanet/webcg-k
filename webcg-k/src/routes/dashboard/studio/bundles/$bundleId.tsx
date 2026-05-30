/**
 * 번들 에디터 페이지 — 캔버스 기반 3-영역 레이아웃
 * 상단: 헤더 (번들 이름/프로그램명/뒤로)
 * 중단: 캔버스 (SVG 미리보기) + 그래픽 리스트 패널
 * 하단: CG 타입 슬롯 바 (태깅 + 매핑)
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import "./bundle-editor.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Image,
  Layers,
  Link2,
  Loader2,
  Package,
  Palette,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchBundle,
  updateBundle,
  addSlot,
  updateSlot,
  deleteSlot,
  fetchGraphicsWithPreview,
  fetchGraphicElements,
  getBundleTheme,
  saveBundleTheme,
} from "../../../../services/bundleService";
import type { BundleSlot, FieldMappingEntry } from "../../../../services/bundleService";
import { CG_TYPE_DEFAULT_FIELDS } from "../../../../services/nrcsMappingService";
import {
  CG_TYPE_LABELS,
  CG_TYPE_COLORS,
} from "../../../../lib/nrcsTypes";
import type { CgTextType } from "../../../../lib/nrcsTypes";
import { parseTemplateElements, parseCanvasSize } from "../../../../lib/schemas";
import type { ThemeTokens, ThemePresetId } from "../../../../lib/types/semanticTypes";
import { applyBundleTheme, setThemePreset, updateThemeToken } from "../../../../stores/themeStore";
import { getPresetTheme } from "../../../../components/SemanticRenderer/themePresets";
import { rgbaToHex } from "@/utils/colorUtils";

// SVG 렌더링용 느슨 타입 (동적 속성 접근 필요)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SvgElement = Record<string, any>;

export const Route = createFileRoute("/dashboard/studio/bundles/$bundleId")({
  component: BundleEditorPage,
});

// CG 타입 13종
const CG_TYPES: CgTextType[] = [
  "headline", "subheadline", "band", "super", "lowthird",
  "source", "crawl", "locator", "fullcg", "credit",
  "soundbite", "reporter", "flash",
];

// 그래픽 미리보기용 타입
interface GraphicItem {
  id: string;
  name: string;
  template_data: Record<string, unknown>;
  updated_at: string;
}

// ─── SVG 미리보기 렌더러 ──────────────────────────────────────────
// ■ Phase E-0b: 다중 그래픽 오버레이 캔버스
// 매핑된 그래픽들을 모두 겹쳐서 렌더링 (방송 화면처럼 zIndex 기반)
function OverlayCanvas({
  graphics,
  flashId,
}: {
  graphics: { graphic: GraphicItem; slot: { cg_type: string } }[];
  flashId: string | null;
}) {
  if (graphics.length === 0) {
    return (
      <div className="be-canvas-empty">
        <Package size={48} />
        <span>그래픽을 슬롯에 연결하면 캔버스에 표시됩니다</span>
      </div>
    );
  }

  // 모든 그래픽 중 가장 큰 캔버스 크기 채택 (viewBox)
  let maxW = 1920, maxH = 1080;
  for (const { graphic } of graphics) {
    const { width, height } = parseCanvasSize(graphic.template_data);
    if (width > maxW) maxW = width;
    if (height > maxH) maxH = height;
  }

  return (
    <svg
      viewBox={`0 0 ${maxW} ${maxH}`}
      preserveAspectRatio="xMidYMid meet"
      className="be-canvas-svg"
    >
      {/* 캔버스 배경 — 순수 검정 (아무 정보 없음을 명확히) */}
      <rect x={0} y={0} width={maxW} height={maxH} fill="#000" />
      {graphics.map(({ graphic }) => {
        const elements: SvgElement[] = parseTemplateElements(graphic.template_data);
        const { width: gw, height: gh } = parseCanvasSize(graphic.template_data);
        const canvasBg = (graphic.template_data as Record<string, unknown>).canvasBackground as string | undefined;
        const isFlashing = flashId === graphic.id;
        const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        return (
          <g key={graphic.id} style={{ opacity: 1 }}>
            {/* 그래픽 고유 배경 */}
            {canvasBg && canvasBg !== "transparent" && (
              <rect x={0} y={0} width={gw} height={gh} fill={canvasBg} />
            )}
            {sorted.map((el: SvgElement) => {
              if (el.visible === false) return null;
              const opacity = el.opacity ?? 1;
              if (el.type === "rect") {
                const fill = el.fill?.type === "solid" ? el.fill.color : el.fill?.type === "gradient" ? "#666" : "#333";
                return (
                  <rect
                    key={el.id} x={el.x} y={el.y} width={el.width} height={el.height}
                    fill={fill} stroke={el.stroke?.color} strokeWidth={el.stroke?.width}
                    rx={el.borderRadius || 0} style={{ opacity }}
                  />
                );
              }
              if (el.type === "text") {
                return (
                  <text
                    key={el.id}
                    x={el.x + (el.width / 2)} y={el.y + (el.height / 2)}
                    fill={el.fill?.color || "#fff"}
                    fontSize={el.fontSize || 24}
                    fontFamily={el.fontFamily || "sans-serif"}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ opacity }}
                  >
                    {el.content || "텍스트"}
                  </text>
                );
              }
              return null;
            })}
            {/* 플래시 하이라이트 테두리 — 요소들의 실제 바운딩 박스 기준 */}
            {isFlashing && (() => {
              // 요소들의 min/max 좌표로 바운딩 박스 계산
              const visible = elements.filter((e) => e.visible !== false);
              if (visible.length === 0) return null;
              const pad = 8; // 여유 패딩
              let bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity;
              for (const e of visible) {
                bx = Math.min(bx, e.x);
                by = Math.min(by, e.y);
                bx2 = Math.max(bx2, e.x + e.width);
                by2 = Math.max(by2, e.y + e.height);
              }
              return (
                <rect
                  x={bx - pad} y={by - pad}
                  width={bx2 - bx + pad * 2} height={by2 - by + pad * 2}
                  fill="none"
                  stroke="#00d1b2"
                  strokeWidth={4}
                  rx={6}
                  className="be-flash-border"
                />
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────
function BundleEditorPage() {
  const { bundleId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 상태
  const [selectedGraphic, setSelectedGraphic] = useState<GraphicItem | null>(null);
  // 🆕 플래시 하이라이트 애니메이션용 (선택 시 테두리 밝아졌다 사라지는 효과)
  const [flashGraphicId, setFlashGraphicId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLinkedOnly, setFilterLinkedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"updated" | "name">("updated");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [programValue, setProgramValue] = useState("");
  const [saving, setSaving] = useState(false);
  // 🆕 사이드바 탭 (번들 / 라이브러리)
  const [sidebarTab, setSidebarTab] = useState<"bundle" | "library" | "theme">("library");
  // 필드 매핑 인라인 편집
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [mappingElements, setMappingElements] = useState<{ id: string; type: string; content: string }[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [localMapping, setLocalMapping] = useState<Record<string, FieldMappingEntry>>({});

// Theme editing state
const [themeTokens, setThemeTokens] = useState<ThemeTokens | null>(null);
const [themeLoading, setThemeLoading] = useState(false);
const [themeSaving, setThemeSaving] = useState(false);

  // 🆕 검색 디바운스 (300ms)
  // Why: 한글 조합 중 필터가 즉시 반응하면 그래픽이 깜빡이며 사라짐
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    debounceTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery]);

  // 데이터 Fetch
  const { data: bundle, isLoading } = useQuery({
    queryKey: ["bundle", bundleId],
    queryFn: () => fetchBundle(bundleId),
  });

  const { data: allGraphics = [] } = useQuery({
    queryKey: ["graphics_for_bundle"],
    queryFn: fetchGraphicsWithPreview,
  });

  // Theme load
  useEffect(() => {
    if (!bundle) return;
    setThemeLoading(true);
    getBundleTheme(bundleId)
      .then((tokens) => {
        if (tokens) {
          setThemeTokens(tokens);
          applyBundleTheme(tokens);
        } else {
          const preset = getPresetTheme("news");
          setThemeTokens(preset);
        }
      })
      .catch((err) => { console.error(err); })
      .finally(() => setThemeLoading(false));
  }, [bundle, bundleId]);

  // 번들 이름/프로그램 저장
  const saveBundleInfo = useCallback(async () => {
    if (!bundle) return;
    setSaving(true);
    try {
      await updateBundle(bundle.id, {
        name: nameValue || bundle.name,
        program_name: programValue || null,
      });
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
      setEditingName(false);
    } catch (err) {
      console.error("번들 정보 저장 실패:", err);
    }
    setSaving(false);
  }, [bundle, nameValue, programValue, bundleId, queryClient]);

  // 슬롯 추가 (선택한 그래픽에 CG 타입 태깅)
  const handleAddSlot = useCallback(async (cgType: CgTextType) => {
    try {
      await addSlot({
        bundle_id: bundleId,
        cg_type: cgType,
        graphic_id: selectedGraphic?.id || undefined,
        sort_order: (bundle?.slots?.length ?? 0),
      });
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
    } catch (err) {
      console.error("슬롯 추가 실패:", err);
    }
  }, [bundleId, bundle, selectedGraphic, queryClient]);

  // 슬롯에 그래픽 연결
  const handleLinkGraphic = useCallback(async (slotId: string, graphicId: string | null) => {
    try {
      await updateSlot(slotId, { graphic_id: graphicId });
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
    } catch (err) {
      console.error("그래픽 연결 실패:", err);
    }
  }, [bundleId, queryClient]);

  // 슬롯 삭제
  const handleDeleteSlot = useCallback(async (slotId: string) => {
    try {
      await deleteSlot(slotId);
      if (editingSlotId === slotId) setEditingSlotId(null);
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
    } catch (err) {
      console.error("슬롯 삭제 실패:", err);
    }
  }, [bundleId, editingSlotId, queryClient]);


  // Theme handlers
  const handlePresetChange = useCallback((presetId: ThemePresetId) => {
    const preset = getPresetTheme(presetId);
    setThemeTokens(preset);
    setThemePreset(presetId);
    saveBundleTheme(bundleId, preset).catch(console.error);
  }, [bundleId]);

  const handleColorChange = useCallback((path: string, newColor: string) => {
    setThemeTokens((prev) => {
      if (!prev) return prev;
      return setColorByPath(prev, path, newColor);
    });
  }, []);

  const handleSaveTheme = useCallback(async () => {
    if (!themeTokens) return;
    setThemeSaving(true);
    try {
      await saveBundleTheme(bundleId, themeTokens);
      updateThemeToken("colors", themeTokens.colors);
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
    } catch (err) {
      console.error(err);
    }
    setThemeSaving(false);
  }, [bundleId, themeTokens, queryClient]);

  const handleResetTheme = useCallback(() => {
    const preset = getPresetTheme("news");
    setThemeTokens(preset);
    setThemePreset("news");
  }, []);
  // 필드 매핑 인라인 편집 시작
  const startEditMapping = useCallback(async (slot: BundleSlot) => {
    if (editingSlotId === slot.id) {
      setEditingSlotId(null);
      return;
    }
    setEditingSlotId(slot.id);
    setLocalMapping(slot.field_mapping || {});
    if (slot.graphic_id) {
      setMappingLoading(true);
      try {
        const els = await fetchGraphicElements(slot.graphic_id);
        setMappingElements(els);
      } catch (err) {
        console.error("요소 로드 실패:", err);
        setMappingElements([]);
      }
      setMappingLoading(false);
    }
  }, [editingSlotId]);

  // 필드 매핑 저장
  const saveMappingInline = useCallback(async (slotId: string) => {
    try {
      await updateSlot(slotId, { field_mapping: localMapping });
      queryClient.invalidateQueries({ queryKey: ["bundle", bundleId] });
      setEditingSlotId(null);
    } catch (err) {
      console.error("매핑 저장 실패:", err);
    }
  }, [localMapping, bundleId, queryClient]);

  // 매핑 필드 업데이트
  const updateFieldMapping = (fieldKey: string, elementId: string) => {
    if (!elementId) {
      const next = { ...localMapping };
      delete next[fieldKey];
      setLocalMapping(next);
    } else {
      setLocalMapping({
        ...localMapping,
        [fieldKey]: { target_element_id: elementId, target_property: "content" },
      });
    }
  };

  // 🆕 그래픽 필터링 + 정렬 (개선)
  // Why: 기존은 이름 검색만 존재, 30개+ 환경에서 원하는 그래픽 찾기 어려움
  const filteredGraphics = useMemo(() => {
    let list = allGraphics;
    // 1. 검색 필터 (디바운스된 값 사용)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    // 3. 🆕 연결된 그래픽만 보기
    if (filterLinkedOnly && bundle?.slots) {
      const linkedIds = new Set(bundle.slots.map((s) => s.graphic_id).filter(Boolean));
      list = list.filter((g) => linkedIds.has(g.id));
    }
    // 4. 🆕 정렬
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "ko");
      // 수정일 (최신순)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return list;
  }, [allGraphics, debouncedSearch, filterLinkedOnly, sortBy, bundle?.slots]);

  // 텍스트 요소가 있는 그래픽인지 확인 (CG 슬롯 추가 가능 여부)
  const hasTextElements = useMemo(() => {
    if (!selectedGraphic) return false;
    const elements = parseTemplateElements(selectedGraphic.template_data);
    return elements.some((el) => el.type === "text");
  }, [selectedGraphic]);

  // 이미 사용된 CG 타입
  const usedTypes = bundle?.slots?.map((s) => s.cg_type) || [];

  // 선택된 그래픽이 슬롯에 연결됨?
  const slotsForSelectedGraphic = useMemo(() => {
    if (!selectedGraphic || !bundle?.slots) return [];
    return bundle.slots.filter((s) => s.graphic_id === selectedGraphic.id);
  }, [selectedGraphic, bundle?.slots]);

  // 🆕 매핑된 슬롯의 그래픽 객체들 (캔버스 썸네일 strip용)
  // Why: allGraphics 배열에서 graphic_id로 찾아서 slot과 쌍으로 묶음
  const linkedGraphics = useMemo(() => {
    if (!bundle?.slots || allGraphics.length === 0) return [];
    const graphicMap = new Map(allGraphics.map((g) => [g.id, g]));
    return bundle.slots
      .filter((s) => s.graphic_id && graphicMap.has(s.graphic_id))
      .map((s) => ({ slot: s, graphic: graphicMap.get(s.graphic_id!)! }));
  }, [bundle?.slots, allGraphics]);

  // 로딩
  if (isLoading) {
    return (
      <div className="be-loading">
        <Loader2 size={24} className="animate-spin" />
        <span>번들 로딩 중...</span>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="be-loading">
        <p style={{ color: "var(--text-secondary)" }}>번들을 찾을 수 없습니다.</p>
        <Link to={"/dashboard/studio/bundles" as any}>
          <Button variant="secondary"><ArrowLeft size={14} /> 번들 목록으로</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="be-root">
      {/* ─── 헤더 ─────────────────────────────────────────── */}
      <div className="be-header">
        <div className="be-header-left">
          <Button
            variant="ghost" size="sm"
            onClick={() => navigate({ to: "/dashboard/studio/bundles" })}
            title="그래픽 목록으로"
          >
            <ArrowLeft size={16} />
          </Button>

          {editingName ? (
            <div className="be-header-edit">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="be-name-input"
                autoFocus
                placeholder="번들 이름"
              />
              <Input
                value={programValue}
                onChange={(e) => setProgramValue(e.target.value)}
                className="be-program-input"
                placeholder="프로그램명"
              />
              <Button size="sm" onClick={saveBundleInfo} disabled={saving}>
                <Save size={12} /> 저장
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>취소</Button>
            </div>
          ) : (
            <div
              className="be-header-title"
              onClick={() => {
                setNameValue(bundle.name);
                setProgramValue(bundle.program_name || "");
                setEditingName(true);
              }}
            >
              <h1>📦 {bundle.name}</h1>
              {bundle.program_name && (
                <span className="be-header-program">📺 {bundle.program_name}</span>
              )}
              <Settings2 size={12} style={{ opacity: 0.3, marginLeft: 4 }} />
            </div>
          )}
        </div>

        <div className="be-header-right">
          <span className="be-slot-count">
            <Layers size={13} /> {bundle.slots?.length ?? 0}개 슬롯
          </span>
        </div>
      </div>

      {/* ─── 메인 영역: 캔버스 + 사이드바 ──────────── */}
      <div className="be-main">
        {/* 캔버스 영역 */}
        <div className="be-canvas-area">
          <div className="be-canvas-wrapper">
            <OverlayCanvas
              graphics={linkedGraphics}
              flashId={flashGraphicId}
            />
          </div>

          {/* 🆕 매핑된 그래픽 썸네일 strip (토글 선택/해제) */}
          {linkedGraphics.length > 0 && (
            <div className="be-canvas-strip">
              {linkedGraphics.map(({ graphic, slot }) => (
                <div
                  key={slot.id}
                  className={`be-strip-thumb ${selectedGraphic?.id === graphic.id ? "active" : ""}`}
                  onClick={() => {
                    // 토글: 이미 선택된 그래픽을 다시 클릭하면 해제
                    if (selectedGraphic?.id === graphic.id) {
                      setSelectedGraphic(null);
                    } else {
                      setSelectedGraphic(graphic);
                      // 플래시 효과 트리거
                      setFlashGraphicId(graphic.id);
                      setTimeout(() => setFlashGraphicId(null), 800);
                    }
                  }}
                  title={`${CG_TYPE_LABELS[slot.cg_type]}: ${graphic.name}`}
                >
                  <SvgMiniPreview graphic={graphic} />
                  <span className="be-strip-thumb-label">{graphic.name}</span>
                  <span
                    className="be-strip-thumb-badge"
                    style={{ background: `${CG_TYPE_COLORS[slot.cg_type]}30`, color: CG_TYPE_COLORS[slot.cg_type] }}
                  >
                    {CG_TYPE_LABELS[slot.cg_type]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 상태바 (1줄) */}
          {selectedGraphic && (
            <div className="be-canvas-info">
              <Palette size={12} />
              <span className="be-canvas-info-name">{selectedGraphic.name}</span>
              {hasTextElements ? (
                <span className="be-canvas-info-tag ok">텍스트 요소 있음</span>
              ) : (
                <span className="be-canvas-info-tag warn">텍스트 요소 없음</span>
              )}
              {slotsForSelectedGraphic.length > 0 && (
                <span className="be-canvas-info-tag linked">
                  {slotsForSelectedGraphic.map((s) => CG_TYPE_LABELS[s.cg_type]).join(", ")}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── 사이드바 (2탭) ─────────────────────────── */}
        <div className="be-sidebar">
          {/* 탭 헤더 */}
          <div className="be-sidebar-tabs">
            <button
              className={`be-sidebar-tab ${sidebarTab === "bundle" ? "active" : ""}`}
              onClick={() => setSidebarTab("bundle")}
            >
              <Layers size={13} /> Bundles
              <span className="be-tab-count">{bundle.slots?.length ?? 0}</span>
            </button>
            <button
              className={`be-sidebar-tab ${sidebarTab === "theme" ? "active" : ""}`}
              onClick={() => setSidebarTab("theme")}
            >
              <Palette size={13} /> Theme
            </button>
            <button
              className={`be-sidebar-tab ${sidebarTab === "library" ? "active" : ""}`}
              onClick={() => setSidebarTab("library")}
            >
              <Image size={13} /> Library
              <span className="be-tab-count">{filteredGraphics.length}</span>
            </button>
          </div>
          <div className="be-sidebar-content">
            {/* ─── 번들 탭 ─── */}
            {sidebarTab === "bundle" && (
              <>
                {/* 슬롯 목록 */}
                <div className="be-bundle-slot-list">
                  {bundle.slots && bundle.slots.length > 0 ? (
                    bundle.slots.map((slot) => {
                      const color = CG_TYPE_COLORS[slot.cg_type] || "#888";
                      const label = CG_TYPE_LABELS[slot.cg_type] || slot.cg_type;
                      const mappedCount = Object.keys(slot.field_mapping || {}).length;
                      const isEditing = editingSlotId === slot.id;
                      const defaultFields = CG_TYPE_DEFAULT_FIELDS[slot.cg_type] || ["text"];

                      return (
                        <div key={slot.id} className="be-slot-item">
                          <div className="be-slot-row">
                            <span
                              className="be-cg-badge"
                              style={{ borderColor: `${color}50`, background: `${color}15`, color }}
                            >
                              {label}
                            </span>
                            <span className="be-slot-graphic">
                              {slot.graphic_name || (
                                <span style={{ opacity: 0.4 }}>미연결</span>
                              )}
                            </span>

                            {/* 선택한 그래픽으로 빠르게 연결 */}
                            {selectedGraphic && slot.graphic_id !== selectedGraphic.id && (
                              <Button
                                variant="outline" size="sm"
                                style={{ fontSize: 9, padding: "1px 5px", height: "auto" }}
                                onClick={() => handleLinkGraphic(slot.id, selectedGraphic.id)}
                              >
                                <Link2 size={9} /> 연결
                              </Button>
                            )}
                            {slot.graphic_id && (
                              <Button
                                variant="ghost" size="sm"
                                style={{ fontSize: 9, padding: "1px 3px", height: "auto", opacity: 0.5 }}
                                onClick={() => handleLinkGraphic(slot.id, null)}
                                title="연결 해제"
                              >
                                <Unlink size={9} />
                              </Button>
                            )}

                            <span className={`be-mapping-badge ${mappedCount > 0 ? "mapped" : ""}`}>
                              {slot.graphic_id ? (
                                mappedCount > 0 ? <><Link2 size={9} /> {mappedCount}</> : <><Unlink size={9} /></>
                              ) : "—"}
                            </span>

                            {slot.graphic_id && (
                              <Button
                                variant={isEditing ? "default" : "outline"}
                                size="sm"
                                style={{ fontSize: 9, padding: "1px 6px", height: "auto" }}
                                onClick={() => startEditMapping(slot)}
                              >
                                {isEditing ? "닫기" : "매핑"}
                              </Button>
                            )}

                            <Button
                              variant="ghost" size="sm"
                              style={{ padding: "1px 3px", height: "auto", color: "var(--accent-destructive)", opacity: 0.5 }}
                              onClick={() => handleDeleteSlot(slot.id)}
                            >
                              <Trash2 size={10} />
                            </Button>
                          </div>

                          {/* 인라인 필드 매핑 편집 */}
                          {isEditing && (
                            <div className="be-mapping-inline">
                              {mappingLoading ? (
                                <span className="be-mapping-loading">요소 로딩 중...</span>
                              ) : mappingElements.length === 0 ? (
                                <span className="be-mapping-loading">텍스트 요소 없음</span>
                              ) : (
                                <>
                                  {defaultFields.map((fieldKey) => (
                                    <div key={fieldKey} className="be-mapping-row">
                                      <span className="be-mapping-field">{fieldKey}</span>
                                      <span className="be-mapping-arrow">→</span>
                                      <select
                                        value={localMapping[fieldKey]?.target_element_id || ""}
                                        onChange={(e) => updateFieldMapping(fieldKey, e.target.value)}
                                        className="be-mapping-select"
                                      >
                                        <option value="">요소 선택...</option>
                                        {mappingElements.map((el) => (
                                          <option key={el.id} value={el.id}>
                                            {el.type === "binding-slot"
                                              ? `[📦 ${(el as any).parentShapeName || "Shape"}] ${el.content.substring(0, 25) || el.id.substring(0, 8)}`
                                              : `[${el.type}] ${el.content.substring(0, 25) || el.id.substring(0, 8)}`
                                            }
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ))}
                                  <Button
                                    size="sm" onClick={() => saveMappingInline(slot.id)}
                                    style={{ fontSize: 10, marginTop: 4 }}
                                  >
                                    <Save size={10} /> 매핑 저장
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="be-slot-empty">
                      슬롯이 없습니다.<br />라이브러리에서 그래픽을 선택한 뒤<br />아래에서 CG 타입을 추가하세요.
                    </div>
                  )}
                </div>

                {/* 슬롯 추가 버튼 그룹 */}
                <div className="be-slot-add-area">
                  <span className="be-slot-add-label">
                    <Plus size={11} /> CG 타입 슬롯 추가
                    {!hasTextElements && selectedGraphic && (
                      <span className="be-slot-add-warn"> (텍스트 요소 없음)</span>
                    )}
                  </span>
                  <div className="be-slot-add-buttons">
                    {CG_TYPES.map((t) => {
                      const used = usedTypes.includes(t);
                      return (
                        <button
                          key={t}
                          className={`be-cg-add-btn ${used ? "used" : ""}`}
                          style={{ borderColor: `${CG_TYPE_COLORS[t]}40`, color: CG_TYPE_COLORS[t] }}
                          onClick={() => handleAddSlot(t)}
                          title={used ? `이미 추가됨 (중복 가능)` : `${CG_TYPE_LABELS[t]} 슬롯 추가`}
                        >
                          {used ? "✓ " : "+ "}{CG_TYPE_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ─── 라이브러리 탭 ─── */}
            {sidebarTab === "library" && (
              <>
                <div className="be-search-bar">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="그래픽 이름 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                      onClick={() => setSearchQuery("")}
                      title="검색 초기화"
                    >✕</button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, padding: "6px 8px", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "updated" | "name")}
                    style={{
                      background: "var(--app-bg-muted)", border: "1px solid var(--border-default)",
                      borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "var(--text-secondary)",
                    }}
                  >
                    <option value="updated">수정일순</option>
                    <option value="name">이름순</option>
                  </select>

                  <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={filterLinkedOnly}
                      onChange={(e) => setFilterLinkedOnly(e.target.checked)}
                      style={{ width: 12, height: 12 }}
                    />
                    <Link2 size={10} />
                    연결됨만
                  </label>
                </div>

                <div className="be-graphic-list">
                  {filteredGraphics.map((g) => {
                    const isSelected = selectedGraphic?.id === g.id;
                    const isLinked = bundle.slots?.some((s) => s.graphic_id === g.id);
                    return (
                      <div
                        key={g.id}
                        className={`be-graphic-card ${isSelected ? "selected" : ""} ${isLinked ? "linked" : ""}`}
                        onClick={() => {
                          setSelectedGraphic(g);
                          // 🆕 그래픽 선택 시 자동으로 번들 탭 전환 (연결 워크플로 UX 개선)
                          setSidebarTab("bundle");
                        }}
                      >
                        <div className="be-graphic-card-preview">
                          <SvgMiniPreview graphic={g} />
                        </div>
                        <div className="be-graphic-card-info">
                          <span className="be-graphic-card-name">{g.name}</span>
                          {isLinked && (
                            <span className="be-graphic-card-linked">
                              <Link2 size={9} /> 연결됨
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredGraphics.length === 0 && (
                    <div className="be-graphic-empty">
                      <Search size={24} />
                      <span>
                        {debouncedSearch
                          ? `"${debouncedSearch}" 검색 결과 없음`
                          : filterLinkedOnly
                          ? "연결된 그래픽이 없습니다"
                          : "그래픽이 없습니다"}
                      </span>
                      {(debouncedSearch || filterLinkedOnly) && (
                        <button
                          style={{ marginTop: 6, background: "none", border: "1px solid var(--border-default)", borderRadius: 4, padding: "4px 10px", fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}
                          onClick={() => { setSearchQuery(""); setFilterLinkedOnly(false); }}
                        >
                          필터 초기화
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            {/* ─── 테마 탭 ─── */}
            {sidebarTab === "theme" && (
              <div className="be-theme-content">
                {themeLoading ? (
                  <div className="be-loading" style={{ height: 200 }}>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Loading theme...</span>
                  </div>
                ) : themeTokens ? (
                  <>
                    {/* Preset Selector */}
                    <div className="be-theme-section">
                      <div className="be-theme-section-title">Preset</div>
                      <div className="be-theme-presets">
                        {(["news", "variety", "sports"] as const).map((presetId) => (
                          <button
                            key={presetId}
                            className={`be-theme-preset-btn ${themeTokens.themeId === presetId ? "active" : ""}`}
                            onClick={() => handlePresetChange(presetId)}
                          >
                            {presetId === "news" ? "News" : presetId === "variety" ? "Variety" : "Sports"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Tokens */}
                    <div className="be-theme-section">
                      <div className="be-theme-section-title">Colors</div>
                      {([
                        { key: "colors.primary", label: "Primary", desc: "main brand" },
                        { key: "colors.accent", label: "Accent", desc: "highlights" },
                        { key: "colors.background", label: "BG", desc: "backdrop" },
                        { key: "colors.text.main", label: "Text", desc: "body" },
                        { key: "colors.text.muted", label: "Muted", desc: "secondary" },
                      ] as const).map(({ key, label, desc }) => {
                        const color = getColorByPath(themeTokens, key);
                        return (
                          <ColorTokenRow
                            key={key}
                            label={label}
                            desc={desc}
                            color={color}
                            onChange={(c: string) => handleColorChange(key, c)}
                          />
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="be-theme-section">
                      <div className="be-theme-actions">
                        <Button size="sm" onClick={handleSaveTheme} disabled={themeSaving}>
                          <Save size={12} /> {themeSaving ? "Saving..." : "Save Theme"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleResetTheme}>
                          Reset
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Color Utilities (local until shared utility exists) ──────────

function parseRgba(rgba: string): { r: number; g: number; b: number; a: number } {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([0-9.]+))?\s*\)/.exec(rgba);
  if (match) {
    return { r: +match[1], g: +match[2], b: +match[3], a: match[4] ? +match[4] : 1 };
  }
  // Try hex fallback
  if (/^#[0-9a-fA-F]{6}$/.test(rgba)) {
    return { r: parseInt(rgba.slice(1, 3), 16), g: parseInt(rgba.slice(3, 5), 16), b: parseInt(rgba.slice(5, 7), 16), a: 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!match) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(match[1], 16)},${parseInt(match[2], 16)},${parseInt(match[3], 16)},${alpha})`;
}

function getColorByPath(tokens: ThemeTokens, path: string): string {
  const parts = path.split(".");
  let val: unknown = tokens;
  for (const p of parts) {
    if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
  }
  return typeof val === "string" ? val : "#000000";
}

function setColorByPath(tokens: ThemeTokens, path: string, color: string): ThemeTokens {
  const parts = path.split(".");
  const clone = structuredClone(tokens);
  let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = color;
  return clone;
}

// ─── ColorTokenRow (inline component) ─────────────────────────────

function ColorTokenRow({
  label, desc, color, onChange,
}: {
  label: string;
  desc: string;
  color: string;
  onChange: (c: string) => void;
}) {
  const { a: alpha } = parseRgba(color);
  const hexValue = rgbaToHex(color);
  return (
    <div className="be-theme-color-row">
      <div className="be-theme-swatch">
        <div className="be-theme-swatch-fill" style={{ backgroundColor: color }}>
          <input
            type="color"
            value={hexValue}
            onChange={(e) => {
              if (alpha < 1) onChange(hexToRgba(e.target.value, alpha));
              else onChange(e.target.value);
            }}
            className="be-theme-color-input"
          />
        </div>
      </div>
      <div className="be-theme-color-info">
        <span className="be-theme-color-label">{label}</span>
        <span className="be-theme-color-desc">{desc}</span>
      </div>
      <input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="be-theme-text-input"
        spellCheck={false}
      />
    </div>
  );
}

// ─── 미니 SVG 미리보기 (카드용, 경량) ──────────────────────────────
function SvgMiniPreview({ graphic }: { graphic: GraphicItem }) {
  const elements: SvgElement[] = parseTemplateElements(graphic.template_data);
  const { width: cw, height: ch } = parseCanvasSize(graphic.template_data);

  if (elements.length === 0) {
    return <div className="be-mini-empty"><Palette size={14} /></div>;
  }

  const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).slice(0, 10);

  return (
    <svg viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="xMidYMid meet" className="be-mini-svg">
      {sorted.map((el: SvgElement) => {
        if (el.visible === false) return null;
        if (el.type === "rect") {
          const fill = el.fill?.type === "solid" ? el.fill.color : "#444";
          return (
            <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height}
              fill={fill} rx={el.borderRadius || 0} />
          );
        }
        if (el.type === "text") {
          return (
            <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height}
              fill="rgba(255,255,255,0.1)" rx={4} />
          );
        }
        return null;
      })}
    </svg>
  );
}

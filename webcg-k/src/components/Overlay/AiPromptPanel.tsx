/**
 * AiPromptPanel — Step 3: AI 프롬프트 입력
 * 축소된 그리드 프리뷰 + 프롬프트 텍스트에리어 + 데이터 소스 선택
 * 빌트인 + 커스텀 데이터 소스 지원
 */

import { useState, useEffect, useRef } from "react";
import { Loader2, Zap, Database } from "lucide-react";
import type { GridTemplateRow } from "../../lib/gridTypes";
import type { ZoneBounds, DataSourceType, CustomDataSource } from "../../lib/overlayTypes";
import { fetchDataByType, fetchCustomSource } from "../../services/dataProviders";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

interface AiPromptPanelProps {
    template: GridTemplateRow;
    selectedZoneIds: Set<string>;
    combinedBounds: ZoneBounds | null;
    prompt: string;
    onPromptChange: (prompt: string) => void;
    dataSourceType: DataSourceType;
    onDataSourceChange: (type: DataSourceType) => void;
    dataContext: Record<string, unknown> | null;
    onDataContextChange: (ctx: Record<string, unknown> | null) => void;
    variationCount: number;
    onVariationCountChange: (count: number) => void;
}


/** 빌트인 데이터 소스 옵션 */
const BUILTIN_OPTIONS: Array<{ value: DataSourceType; label: string }> = [
    { value: "none", label: "데이터 소스 없음" },
    { value: "weather", label: "🌤 실시간 날씨 (Open-Meteo)" },
    { value: "earthquake", label: "🌍 지진 정보 (USGS)" },
    { value: "wildfire", label: "🔥 산불 정보 (Mock)" },
    { value: "public_data", label: "📊 공공데이터 (Mock)" },
];

export function AiPromptPanel({
    template,
    selectedZoneIds,
    combinedBounds,
    prompt,
    onPromptChange,
    dataSourceType,
    onDataSourceChange,
    dataContext,
    onDataContextChange,
    variationCount,
    onVariationCountChange,
}: AiPromptPanelProps) {
    const { user } = useAuth();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isFetchingData, setIsFetchingData] = useState(false);

    // 커스텀 소스 목록
    const [customSources, setCustomSources] = useState<CustomDataSource[]>([]);
    // 현재 선택된 커스텀 소스 (custom_api 타입일 때)
    const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);

    // 프롬프트 영역에 자동 포커스
    useEffect(() => {
        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // 커스텀 소스 목록 로드
    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from("custom_data_sources")
                    .select("*")
                    .eq("is_active", true)
                    .order("created_at", { ascending: false });
                if (error) throw error;
                setCustomSources((data || []) as unknown as CustomDataSource[]);
            } catch (err) {
                console.error("[AiPromptPanel] 커스텀 소스 로드 실패:", err);
            }
        })();
    }, [user]);

    // 데이터 소스 변경 시 데이터 자동 로드
    useEffect(() => {
        if (dataSourceType === "none") {
            onDataContextChange(null);
            return;
        }

        let cancelled = false;

        async function loadData() {
            setIsFetchingData(true);
            try {
                let data: Record<string, unknown>;

                if (dataSourceType === "custom_api" && selectedCustomId) {
                    // 커스텀 소스 — fetchCustomSource 사용
                    const source = customSources.find((s) => s.id === selectedCustomId);
                    if (!source) throw new Error("커스텀 소스를 찾을 수 없습니다.");
                    data = await fetchCustomSource(source);
                } else {
                    // 빌트인 소스
                    data = await fetchDataByType(dataSourceType);
                }

                if (!cancelled) {
                    onDataContextChange(data);
                }
            } catch (err) {
                console.error("[AiPromptPanel] 데이터 로드 실패:", err);
                if (!cancelled) {
                    onDataContextChange(null);
                }
            } finally {
                if (!cancelled) setIsFetchingData(false);
            }
        }

        loadData();
        return () => { cancelled = true; };
    }, [dataSourceType, selectedCustomId]);

    // 드롭다운 변경 핸들러
    const handleSourceChange = (value: string) => {
        // "custom:{id}" 형식인지 확인
        if (value.startsWith("custom:")) {
            const customId = value.slice("custom:".length);
            setSelectedCustomId(customId);
            onDataSourceChange("custom_api" as DataSourceType);
        } else {
            setSelectedCustomId(null);
            onDataSourceChange(value as DataSourceType);
        }
    };

    // 현재 선택값 계산
    const currentSelectValue =
        dataSourceType === "custom_api" && selectedCustomId
            ? `custom:${selectedCustomId}`
            : dataSourceType;

    // Zone 프리뷰용 간단 계산
    const zones = getSimpleZones(template);

    return (
        <div className="ai-prompt-layout">
            {/* 축소된 그리드 프리뷰 */}
            <div className="ai-prompt-preview">
                <div className="ai-prompt-preview-canvas">
                    {zones.map((z) => {
                        const isHighlighted = selectedZoneIds.has(z.id);
                        return (
                            <div
                                key={z.id}
                                className={`ai-prompt-preview-zone ${isHighlighted ? "highlighted" : ""}`}
                                style={{
                                    left: `${z.x}%`,
                                    top: `${z.y}%`,
                                    width: `${z.width}%`,
                                    height: `${z.height}%`,
                                }}
                            />
                        );
                    })}
                </div>
                {combinedBounds && (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        대상 영역: {combinedBounds.width} × {combinedBounds.height}px
                    </div>
                )}
            </div>

            {/* 프롬프트 입력 */}
            <div className="ai-prompt-input-area">
                <label>
                    <Zap size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    AI 프롬프트
                </label>
                <textarea
                    ref={textareaRef}
                    className="ai-prompt-textarea"
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    placeholder={getPromptPlaceholder(dataSourceType)}
                />
            </div>

            {/* 베리에이션 개수 선택 */}
            <div className="ai-prompt-input-area">
                <label>
                    <Zap size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    생성할 개수 (Variations)
                </label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                        type="range"
                        min={1}
                        max={4}
                        step={1}
                        value={variationCount}
                        onChange={(e) => onVariationCountChange(parseInt(e.target.value))}
                        style={{ flex: 1 }}
                    />
                    <span style={{ fontWeight: "bold", width: "20px", textAlign: "right" }}>
                        {variationCount}
                    </span>
                </div>
            </div>

            {/* 데이터 소스 선택 */}
            <div className="ai-prompt-input-area">
                <label>
                    <Database size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    데이터 소스 (선택사항)
                </label>
                <div className="ai-prompt-data-source">
                    <select
                        value={currentSelectValue}
                        onChange={(e) => handleSourceChange(e.target.value)}
                    >
                        {/* 빌트인 옵션 */}
                        {BUILTIN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                        {/* 커스텀 소스 옵션 */}
                        {customSources.length > 0 && (
                            <optgroup label="── 커스텀 소스 ──">
                                {customSources.map((source) => (
                                    <option
                                        key={source.id}
                                        value={`custom:${source.id}`}
                                    >
                                        {source.icon} {source.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                    {isFetchingData && <Loader2 size={16} className="wizard-loading-spinner" style={{ width: 16, height: 16 }} />}
                </div>
            </div>

            {/* 데이터 미리보기 */}
            {dataContext && (
                <div className="ai-prompt-data-preview">
                    <strong style={{ color: "#34d399", fontSize: 11 }}>✅ 연동 데이터 로드 완료</strong>
                    <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {JSON.stringify(dataContext, null, 2).slice(0, 500)}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ─── 헬퍼 ────────────────────────────────────────────────────────

/** 데이터 소스별 플레이스홀더 */
function getPromptPlaceholder(type: DataSourceType): string {
    switch (type) {
        case "weather":
            return "예: 서울 현재 날씨를 보여주는 방송CG를 만들어줘. 온도, 날씨 아이콘, 도시명을 포함해줘.";
        case "earthquake":
            return "예: 최근 지진 정보를 알리는 긴급 CG를 만들어줘. 규모, 위치, 깊이를 표시해줘.";
        case "wildfire":
            return "예: 산불 현황을 보여주는 경보 CG를 만들어줘. 위험도, 위치, 면적을 포함해줘.";
        case "public_data":
            return "예: 최신 뉴스를 표시하는 정보 CG를 만들어줘.";
        case "custom_api":
            return "커스텀 API에서 가져온 데이터를 활용한 CG를 만들어줘.";
        default:
            return "예: 뉴스 하단 자막 CG를 만들어줘, 속보 배너를 만들어줘, 스포츠 스코어보드를 만들어줘...";
    }
}

/** 간단 Zone 계산 (GridSelector/ZoneSelector와 동일) */
function getSimpleZones(template: GridTemplateRow) {
    const td = template.template_data;
    if (td.zones && td.zones.length > 0) {
        const validZones = td.zones
            .filter((z) => z.bounds && typeof z.bounds.x === "number")
            .map((z) => ({
                id: z.id,
                x: (z.bounds.x / (td.canvas?.width || 1920)) * 100,
                y: (z.bounds.y / (td.canvas?.height || 1080)) * 100,
                width: (z.bounds.width / (td.canvas?.width || 1920)) * 100,
                height: (z.bounds.height / (td.canvas?.height || 1080)) * 100,
            }));
        // bounds가 유효한 zone이 있으면 반환, 없으면 splits fallback
        if (validZones.length > 0) return validZones;
    }
    if (td.splits && td.splits.length > 0) {
        type BspZ = { x: number; y: number; w: number; h: number };
        let zones: BspZ[] = [{ x: 0, y: 0, w: 100, h: 100 }];
        for (const s of td.splits) {
            const next: BspZ[] = [];
            for (const z of zones) {
                if (s.orientation === "vertical" && s.position > z.x && s.position < z.x + z.w) {
                    next.push({ x: z.x, y: z.y, w: s.position - z.x, h: z.h });
                    next.push({ x: s.position, y: z.y, w: z.w - (s.position - z.x), h: z.h });
                } else if (s.orientation === "horizontal" && s.position > z.y && s.position < z.y + z.h) {
                    next.push({ x: z.x, y: z.y, w: z.w, h: s.position - z.y });
                    next.push({ x: z.x, y: s.position, w: z.w, h: z.h - (s.position - z.y) });
                } else {
                    next.push(z);
                }
            }
            zones = next;
        }
        return zones.map((z, i) => ({ id: `zone-${i}`, x: z.x, y: z.y, width: z.w, height: z.h }));
    }
    return [{ id: "zone-full", x: 0, y: 0, width: 100, height: 100 }];
}

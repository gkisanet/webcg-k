/**
 * OverlayCreationWizard — 오버레이 생성 4단계 마법사
 * Step 1: 그리드 선택 → Step 2: Zone 다중 선택 → Step 3: AI 프롬프트 → Step 4: Variation 선택
 */

import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import type { GridTemplateRow } from "../../lib/gridTypes";
import type {
    WizardStep,
    DataSourceType,
    CgVariation,
    ZoneBounds,
} from "../../lib/overlayTypes";

import { GridSelector } from "./GridSelector";
import { ZoneSelector, calculateCombinedBounds } from "./ZoneSelector";
import { AiPromptPanel } from "./AiPromptPanel";
import { CgVariationGallery } from "./CgVariationGallery";
import { generateCgVariations } from "../../services/aiCgService";
import { saveOverlayTemplate, addToGallery } from "../../services/overlayApiService";
import { supabase } from "../../lib/supabase";

import "./OverlayCreationWizard.css";

// ─── 상수 ────────────────────────────────────────────────────────

const STEPS: Array<{ key: WizardStep; label: string; icon: string }> = [
    { key: "grid-select", label: "그리드 선택", icon: "📐" },
    { key: "zone-select", label: "영역 선택", icon: "🔲" },
    { key: "ai-prompt", label: "AI 프롬프트", icon: "🤖" },
    { key: "variation-select", label: "결과 선택", icon: "🎨" },
];

const STEP_INDEX: Record<WizardStep, number> = {
    "grid-select": 0,
    "zone-select": 1,
    "ai-prompt": 2,
    "variation-select": 3,
};

// ─── 모듈 스코프 상태 백업 (리마운트 시 복원용) ─────────────────────
// useAuth() 인증 갱신으로 라우트 리렌더 시 위자드가 언마운트/리마운트되는 것을 방어

interface WizardStateBackup {
    step: WizardStep;
    selectedGrid: GridTemplateRow | null;
    selectedZoneIds: string[];
    combinedBounds: ZoneBounds | null;
    prompt: string;
    dataSourceType: DataSourceType;
    dataContext: Record<string, unknown> | null;
    variations: CgVariation[];
    isGenerating: boolean;
    variationCount: number;
    timestamp: number;
}

// 백업 유효기간 (5분) — 오래된 백업은 폐기
const BACKUP_TTL_MS = 5 * 60 * 1000;

let _wizardBackup: WizardStateBackup | null = null;

// 진행 중인 AI 생성 Promise 보존 (리마운트 후에도 결과 수신)
let _pendingGeneration: Promise<CgVariation[]> | null = null;

// ─── Props ───────────────────────────────────────────────────────

interface OverlayCreationWizardProps {
    onClose: () => void;
    /** 세션에 오버레이를 바로 추가하는 콜백 */
    onAddToSession?: (templateId: string) => void;
    /**
     * 외부 저장 콜백 — 그래픽 갤러리 등 다른 컨텍스트에서 위자드를 재사용할 때 사용.
     * 제공되면 overlay_templates 대신 이 콜백으로 저장을 위임한다.
     * ■ Why 콜백 패턴? 위자드는 AI 생성 UI만 책임지고, 저장 대상(overlay vs graphics)은
     *   호출하는 쪽이 결정하도록 역할 분리 (Strategy Pattern).
     */
    onSaveVariation?: (variation: CgVariation, meta: {
        gridId?: string;
        zoneBounds?: ZoneBounds;
        prompt: string;
    }) => Promise<void>;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export function OverlayCreationWizard({ onClose, onAddToSession, onSaveVariation }: OverlayCreationWizardProps) {
    const queryClient = useQueryClient();

    // 백업에서 초기값 복원
    const backup = _wizardBackup && (Date.now() - _wizardBackup.timestamp < BACKUP_TTL_MS)
        ? _wizardBackup : null;

    // Wizard 상태
    const [step, setStep] = useState<WizardStep>(backup?.step ?? "grid-select");
    const [selectedGrid, setSelectedGrid] = useState<GridTemplateRow | null>(backup?.selectedGrid ?? null);
    const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set(backup?.selectedZoneIds ?? []));
    const [combinedBounds, setCombinedBounds] = useState<ZoneBounds | null>(backup?.combinedBounds ?? null);
    const [prompt, setPrompt] = useState(backup?.prompt ?? "");
    const [dataSourceType, setDataSourceType] = useState<DataSourceType>(backup?.dataSourceType ?? "none");
    const [dataContext, setDataContext] = useState<Record<string, unknown> | null>(backup?.dataContext ?? null);
    const [variations, setVariations] = useState<CgVariation[]>(backup?.variations ?? []);
    const [variationCount, setVariationCount] = useState<number>(backup?.variationCount ?? 4);
    const [isGenerating, setIsGenerating] = useState(backup?.isGenerating ?? false);
    const [error, setError] = useState<string | null>(null);

    // 마운트 여부 추적 (비동기 콜백에서 언마운트 후 setState 방지)
    const mountedRef = useRef(true);

    // ─── 백업 동기화: 상태 변경 시 모듈 스코프에 자동 저장 ────────
    useEffect(() => {
        _wizardBackup = {
            step, selectedGrid,
            selectedZoneIds: Array.from(selectedZoneIds),
            combinedBounds, prompt, dataSourceType,
            dataContext, variations, isGenerating,
            variationCount,
            timestamp: Date.now(),
        };
    }, [step, selectedGrid, selectedZoneIds, combinedBounds, prompt, dataSourceType, dataContext, variations, isGenerating, variationCount]);

    // ─── 리마운트 시 진행 중이던 AI 생성 결과 수신 ────────────────
    useEffect(() => {
        mountedRef.current = true;
        if (_pendingGeneration && isGenerating) {
            _pendingGeneration
                .then((result) => {
                    if (mountedRef.current) {
                        setVariations(result);
                        setStep("variation-select");
                        setIsGenerating(false);
                    }
                })
                .catch((err) => {
                    if (mountedRef.current) {
                        setError(err instanceof Error ? err.message : "CG 생성에 실패했습니다.");
                        setIsGenerating(false);
                    }
                });
        }
        return () => { mountedRef.current = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── 위자드 닫힘 시 백업 삭제 ───────────────────────────────
    const handleClose = useCallback(() => {
        _wizardBackup = null;
        _pendingGeneration = null;
        onClose();
    }, [onClose]);

    const currentStepIndex = STEP_INDEX[step];

    // ─── Step 1: 그리드 선택 ─────────────────────────────────────

    const handleGridSelect = useCallback((template: GridTemplateRow) => {
        setSelectedGrid(template);
        setSelectedZoneIds(new Set());
        setCombinedBounds(null);
    }, []);

    // ─── Step 2: Zone 토글 ───────────────────────────────────────

    const handleZoneToggle = useCallback(
        (zoneId: string) => {
            setSelectedZoneIds((prev) => {
                const next = new Set(prev);
                if (next.has(zoneId)) {
                    next.delete(zoneId);
                } else {
                    next.add(zoneId);
                }
                // 결합 Bounds 재계산
                if (selectedGrid) {
                    setCombinedBounds(calculateCombinedBounds(selectedGrid, next));
                }
                return next;
            });
        },
        [selectedGrid],
    );

    // ─── Step 3→4: AI CG 생성 ───────────────────────────────────

    const handleGenerate = useCallback(async () => {
        if (!combinedBounds || !prompt.trim()) return;

        setIsGenerating(true);
        setError(null);
        setVariations([]);

        // Promise를 모듈 스코프에 보존 (리마운트 후에도 결과 수신 가능)
        const generationPromise = generateCgVariations(
            prompt,
            combinedBounds,
            dataContext ?? undefined,
            variationCount
        );
        _pendingGeneration = generationPromise;

        try {
            const result = await generationPromise;
            if (mountedRef.current) {
                setVariations(result);
                setStep("variation-select");
            }
        } catch (err: unknown) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : "CG 생성에 실패했습니다.");
            }
        } finally {
            _pendingGeneration = null;
            if (mountedRef.current) {
                setIsGenerating(false);
            }
        }
    }, [combinedBounds, prompt, dataContext]);

    // ─── Step 4: 갤러리 저장 ─────────────────────────────────────

    const handleSaveToGallery = useCallback(
        async (variation: CgVariation) => {
            try {
                // 1. 외부 저장 콜백이 있으면 위임 (그래픽 갤러리 등)
                if (onSaveVariation) {
                    await onSaveVariation(variation, {
                        gridId: selectedGrid?.id,
                        zoneBounds: combinedBounds ?? undefined,
                        prompt,
                    });
                    handleClose();
                    return;
                }

                // 2. 기본 동작: overlay_templates에 저장
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("인증 필요");

                const template = await saveOverlayTemplate({
                    owner_id: user.id,
                    name: variation.name,
                    description: variation.description,
                    layer: 2,
                    graphic_data: variation.elements,
                    data_source: dataSourceType !== "none" ? { type: dataSourceType } : null,
                    refresh_interval: null,
                    animation_config: {
                        in: { type: "fade", duration: 500 },
                        out: { type: "fade", duration: 300 },
                    },
                    is_public: false,
                    grid_template_id: selectedGrid?.id ?? null,
                    zone_ids: Array.from(selectedZoneIds),
                    zone_bounds: combinedBounds,
                    ai_prompt: prompt,
                    source_type: "ai_generated",
                    ai_metadata: {
                        model: "gemini-2.5-flash-lite",
                        prompt,
                        dataContext: dataContext ?? undefined,
                        generatedAt: new Date().toISOString(),
                    },
                    tags: variation.tags,
                } as any);

                await addToGallery((template as any).id, variation.name, variation.tags);

                queryClient.invalidateQueries({ queryKey: ["overlayGallery"] });
                queryClient.invalidateQueries({ queryKey: ["overlayTemplates"] });

                alert(`"${variation.name}" 이(가) 갤러리에 저장되었습니다! ✅`);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
            }
        },
        [selectedGrid, selectedZoneIds, combinedBounds, prompt, dataSourceType, dataContext, queryClient, onSaveVariation, handleClose],
    );

    // ─── Step 4: 바로 사용 ───────────────────────────────────────

    const handleUseVariation = useCallback(
        async (variation: CgVariation) => {
            try {
                // 1. 외부 저장 콜백이 있으면 위임 (그래픽 갤러리 등)
                if (onSaveVariation) {
                    await onSaveVariation(variation, {
                        gridId: selectedGrid?.id,
                        zoneBounds: combinedBounds ?? undefined,
                        prompt,
                    });
                    handleClose();
                    return;
                }

                // 2. 기본 동작: overlay_templates에 저장
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("인증 필요");

                const template = await saveOverlayTemplate({
                    owner_id: user.id,
                    name: variation.name,
                    description: variation.description,
                    layer: 2,
                    graphic_data: variation.elements,
                    data_source: dataSourceType !== "none" ? { type: dataSourceType } : null,
                    refresh_interval: null,
                    animation_config: {
                        in: { type: "fade", duration: 500 },
                        out: { type: "fade", duration: 300 },
                    },
                    is_public: false,
                    grid_template_id: selectedGrid?.id ?? null,
                    zone_ids: Array.from(selectedZoneIds),
                    zone_bounds: combinedBounds,
                    ai_prompt: prompt,
                    source_type: "ai_generated",
                    ai_metadata: {
                        model: "gemini-2.5-flash-lite",
                        prompt,
                        dataContext: dataContext ?? undefined,
                        generatedAt: new Date().toISOString(),
                    },
                    tags: variation.tags,
                } as any);

                queryClient.invalidateQueries({ queryKey: ["overlayTemplates"] });

                if (onAddToSession) {
                    onAddToSession((template as any).id);
                }

                handleClose();
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "사용에 실패했습니다.");
            }
        },
        [selectedGrid, selectedZoneIds, combinedBounds, prompt, dataSourceType, dataContext, queryClient, onAddToSession, handleClose, onSaveVariation],
    );

    // ─── Navigation ──────────────────────────────────────────────

    const canGoNext = (): boolean => {
        switch (step) {
            case "grid-select":
                return selectedGrid !== null;
            case "zone-select":
                return selectedZoneIds.size > 0;
            case "ai-prompt":
                return prompt.trim().length > 0 && !isGenerating;
            case "variation-select":
                return variations.length > 0;
            default:
                return false;
        }
    };

    const goNext = () => {
        // ai-prompt → 생성 후 자동 진행
        if (step === "ai-prompt") {
            handleGenerate();
            return;
        }

        const idx = STEP_INDEX[step];
        if (idx < STEPS.length - 1) {
            setStep(STEPS[idx + 1].key);
        }
    };

    const goBack = () => {
        const idx = STEP_INDEX[step];
        if (idx > 0) {
            setStep(STEPS[idx - 1].key);
        }
    };

    // ─── Render ──────────────────────────────────────────────────

    return (
        <div className="overlay-wizard-backdrop" onClick={handleClose}>
            <div className="overlay-wizard" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="overlay-wizard-header">
                    <div className="overlay-wizard-title">
                        <Sparkles size={20} /> 새 오버레이 생성
                    </div>
                    <button className="overlay-wizard-close" onClick={handleClose}>
                        <X size={16} />
                    </button>
                </div>

                {/* Step Indicator */}
                <div className="wizard-steps">
                    {STEPS.map((s, idx) => (
                        <Fragment key={s.key}>
                            <div
                                className={`wizard-step ${step === s.key ? "active" : ""} ${idx < currentStepIndex ? "completed" : ""}`}
                            >
                                <div className="wizard-step-number">
                                    {idx < currentStepIndex ? "✓" : s.icon}
                                </div>
                                {s.label}
                            </div>
                            {idx < STEPS.length - 1 && <div className="wizard-step-connector" />}
                        </Fragment>
                    ))}
                </div>

                {/* Body */}
                <div className="overlay-wizard-body">
                    {/* 에러 표시 */}
                    {error && <div className="wizard-error">⚠️ {error}</div>}

                    {/* 로딩 */}
                    {isGenerating ? (
                        <div className="wizard-loading">
                            <div className="wizard-loading-spinner" />
                            <div className="wizard-loading-text">
                                AI가 CG를 생성하고 있습니다...
                            </div>
                            <div className="wizard-loading-sub">
                                프롬프트와 데이터를 분석 중입니다. 잠시만 기다려주세요.
                            </div>
                        </div>
                    ) : (
                        <>
                            {step === "grid-select" && (
                                <GridSelector
                                    selectedGridId={selectedGrid?.id ?? null}
                                    onSelect={handleGridSelect}
                                />
                            )}

                            {step === "zone-select" && selectedGrid && (
                                <ZoneSelector
                                    template={selectedGrid}
                                    selectedZoneIds={selectedZoneIds}
                                    onToggleZone={handleZoneToggle}
                                />
                            )}

                            {step === "ai-prompt" && selectedGrid && (
                                <AiPromptPanel
                                    template={selectedGrid}
                                    selectedZoneIds={selectedZoneIds}
                                    combinedBounds={combinedBounds}
                                    prompt={prompt}
                                    onPromptChange={setPrompt}
                                    dataSourceType={dataSourceType}
                                    onDataSourceChange={setDataSourceType}
                                    dataContext={dataContext}
                                    onDataContextChange={setDataContext}
                                    variationCount={variationCount}
                                    onVariationCountChange={setVariationCount}
                                />
                            )}

                            {step === "variation-select" && (
                                <CgVariationGallery
                                    variations={variations}
                                    onSaveToGallery={handleSaveToGallery}
                                    onUseVariation={handleUseVariation}
                                    onRegenerate={() => {
                                        setStep("ai-prompt");
                                        setVariations([]);
                                    }}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="overlay-wizard-footer">
                    <div className="wizard-footer-left">
                        {currentStepIndex > 0 && !isGenerating && (
                            <button className="btn-wizard btn-wizard-secondary" onClick={goBack}>
                                <ChevronLeft size={16} /> 이전
                            </button>
                        )}
                    </div>
                    <div className="wizard-footer-right">
                        {step !== "variation-select" && (
                            <button
                                className={`btn-wizard ${step === "ai-prompt" ? "btn-wizard-generate" : "btn-wizard-primary"}`}
                                onClick={goNext}
                                disabled={!canGoNext()}
                            >
                                {step === "ai-prompt" ? (
                                    <><Sparkles size={16} /> AI 생성하기</>
                                ) : (
                                    <>다음 <ChevronRight size={16} /></>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

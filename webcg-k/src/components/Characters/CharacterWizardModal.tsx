/**
 * AI 캐릭터 위자드 모달 컴포넌트
 * characters.tsx에서 추출된 위자드 전체 (기본정보 → Zone 선택 → 분석&매핑)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import rivePkg from "@rive-app/react-canvas";
const { Rive: RiveInstance, useRive } = rivePkg as any;
import { supabase } from "../../lib/supabase";
import type { Json } from "../../lib/database.types";
import type {
    AiCharacterPreset,
    RiveAnalysis,
    RivePropertyInfo,
    RiveViewModelInfo,
    RivePropertyType,
    CharacterZoneBounds,
} from "../../lib/aiCharacterTypes";
import { GridSelector } from "../Overlay/GridSelector";
import { ZoneSelector, calculateCombinedBounds } from "../Overlay/ZoneSelector";
import "../Overlay/OverlayCreationWizard.css";
import type { GridTemplateRow } from "../../lib/gridTypes";

// ─── Rive ViewModelProperty.type (숫자) → RivePropertyType 매핑 ──
// DataType enum은 rive_advanced.mjs 전용이므로 숫자값 직접 사용
const RIVE_DATA_TYPE_MAP: Record<number, RivePropertyType> = {
    1: "string",
    2: "number",
    3: "boolean",
    4: "color",
    5: "list",
    6: "enum",
    7: "trigger",
    // 0=none, 8=viewModel 은 사용하지 않음
};

// 런타임 버전에 따라 type이 문자열로 반환될 수 있음
const RIVE_DATA_TYPE_STR_MAP: Record<string, RivePropertyType> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    color: "color",
    list: "list",
    enum: "enum",
    trigger: "trigger",
};

// ─── 위자드 스텝 정의 ──────────────────────────────────────────
type CharacterWizardStep = "basic-info" | "zone-select" | "analysis-mapping";

const WIZARD_STEPS: Array<{ key: CharacterWizardStep; label: string; icon: string }> = [
    { key: "basic-info", label: "기본 정보", icon: "📋" },
    { key: "zone-select", label: "Zone 선택", icon: "📐" },
    { key: "analysis-mapping", label: "분석 & 매핑", icon: "🔗" },
];

// ─── Badge 컴포넌트 ─────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
    return (
        <span style={{
            padding: "2px 8px", borderRadius: 10,
            fontSize: 11, fontWeight: 500,
            background: `${color}20`, color,
            border: `1px solid ${color}40`,
        }}>
            {label}
        </span>
    );
}

// ─── 위자드 모달 ────────────────────────────────────────────────

interface CharacterWizardModalProps {
    editTarget: AiCharacterPreset | null;
    onComplete: () => void;
    onClose: () => void;
}

function CharacterWizardModal({ editTarget, onComplete, onClose }: CharacterWizardModalProps) {
    const [step, setStep] = useState<CharacterWizardStep>("basic-info");
    const [saving, setSaving] = useState(false);

    // Step 1: 기본 정보
    const [name, setName] = useState(editTarget?.name || "");
    const [description, setDescription] = useState(editTarget?.description || "");
    const [rivFile, setRivFile] = useState<File | null>(null);
    const [existingRivPath] = useState(editTarget?.riv_file_path || "");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Step 2: Zone 선택
    const [selectedGrid, setSelectedGrid] = useState<GridTemplateRow | null>(null);
    const [selectedGridId, setSelectedGridId] = useState<string | null>(editTarget?.grid_template_id || null);
    const [selectedZoneIds, setSelectedZoneIds] = useState<Set<string>>(new Set());
    const [zoneBounds, setZoneBounds] = useState<CharacterZoneBounds | null>(editTarget?.zone_bounds || null);

    // Step 3: 분석 & 프로퍼티 설정
    const [analysis, setAnalysis] = useState<RiveAnalysis | null>(editTarget?.rive_analysis || null);
    const [analyzing, setAnalyzing] = useState(false);

    // ─── Rive 분석용 숨겨진 canvas ref ──────────────────────
    const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const riveInstanceRef = useRef<InstanceType<typeof RiveInstance> | null>(null);

    // ─── .riv 파일 실제 분석 (Rive WASM 런타임) ──────────────
    const analyzeRivFile = useCallback(async (file: File) => {
        setAnalyzing(true);
        try {
            const buffer = await file.arrayBuffer();

            // 기존 Rive 인스턴스 정리
            if (riveInstanceRef.current) {
                riveInstanceRef.current.cleanup();
                riveInstanceRef.current = null;
            }

            // 숨겨진 canvas 생성 (없으면)
            if (!analysisCanvasRef.current) {
                const c = document.createElement("canvas");
                c.width = 1;
                c.height = 1;
                c.style.position = "absolute";
                c.style.left = "-9999px";
                c.style.top = "-9999px";
                document.body.appendChild(c);
                analysisCanvasRef.current = c;
            }

            // Promise 래핑: Rive onLoad 콜백에서 분석 실행
            const analysisResult = await new Promise<RiveAnalysis>((resolve, reject) => {
                try {
                    const riveObj = new RiveInstance({
                        buffer,
                        canvas: analysisCanvasRef.current!,
                        autoplay: false,
                        autoBind: true,
                        onLoad: () => {
                            try {
                                // ─── 1. 아트보드 목록 + 크기 추출 ─────
                                const contents = riveObj.contents;
                                console.log("[RivAnalyzer] contents:", contents);
                                const artboards = contents.artboards?.map((ab: any) => ab.name) || ["Main"];
                                // 아트보드 크기 추출 (기본 아트보드)
                                let artboardSize: { width: number; height: number } | undefined;
                                try {
                                    const defaultAb = (riveObj as any).artboard;
                                    if (defaultAb) {
                                        artboardSize = {
                                            width: Math.round(defaultAb.bounds?.maxX ?? defaultAb.width ?? 0),
                                            height: Math.round(defaultAb.bounds?.maxY ?? defaultAb.height ?? 0),
                                        };
                                        console.log("[RivAnalyzer] artboardSize:", artboardSize);
                                    }
                                } catch {
                                    console.log("[RivAnalyzer] 아트보드 크기 추출 실패 — 스킵");
                                }
                                // 상태 머신 이름 추출
                                const stateMachines: string[] = contents.stateMachines?.map((sm: any) => sm.name)
                                    ?? contents.artboards?.[0]?.stateMachines?.map((sm: any) => sm.name)
                                    ?? [];
                                console.log("[RivAnalyzer] artboards:", artboards, "stateMachines:", stateMachines);

                                // ─── 2. Enum 값 맵 수집 ────────────────
                                const enumMap = new Map<string, string[]>();
                                try {
                                    const dataEnums = riveObj.enums();
                                    console.log("[RivAnalyzer] enums:", dataEnums);
                                    for (const de of dataEnums) {
                                        enumMap.set(de.name, de.values);
                                    }
                                } catch {
                                    console.log("[RivAnalyzer] enums() 미지원 — 스킵");
                                }

                                // ─── 3. 프로퍼티 추출 헬퍼 ─────────────
                                const extractProperties = (vm: any): RivePropertyInfo[] => {
                                    const result: RivePropertyInfo[] = [];
                                    const vmProps = vm.properties ?? vm.propertyDescriptors ?? [];

                                    if (!Array.isArray(vmProps)) {
                                        console.log("[RivAnalyzer] properties가 배열 아님:", vmProps);
                                        return result;
                                    }

                                    for (const prop of vmProps) {
                                        console.log("[RivAnalyzer]   prop:", prop.name, "type:", prop.type);
                                        // 숫자/문자열 타입 매핑
                                        const mappedType = RIVE_DATA_TYPE_MAP[prop.type as unknown as number]
                                            ?? RIVE_DATA_TYPE_STR_MAP[String(prop.type).toLowerCase()];
                                        if (!mappedType) {
                                            console.log("[RivAnalyzer]   → 미지원 타입, 스킵");
                                            continue;
                                        }

                                        const propInfo: RivePropertyInfo = {
                                            name: prop.name,
                                            type: mappedType,
                                        };

                                        // enum → 값 목록 매핑
                                        if (mappedType === "enum" && prop.enumName) {
                                            propInfo.enumValues = enumMap.get(prop.enumName)
                                                ?? enumMap.values().next().value
                                                ?? [];
                                        } else if (mappedType === "enum") {
                                            // enumName 없으면 첫 번째 enum 사용
                                            for (const [, vals] of enumMap.entries()) {
                                                propInfo.enumValues = vals;
                                                break;
                                            }
                                        }

                                        // list → 연결된 ViewModel 참조 (있으면)
                                        if (mappedType === "list" && prop.viewModelName) {
                                            propInfo.viewModelRef = prop.viewModelName;
                                        }

                                        result.push(propInfo);
                                    }
                                    return result;
                                };

                                // ─── 4. 모든 ViewModel 순회 ───────────
                                const viewModels: RiveViewModelInfo[] = [];
                                const vmCount = riveObj.viewModelCount ?? 0;
                                console.log("[RivAnalyzer] viewModelCount:", vmCount);

                                for (let i = 0; i < vmCount; i++) {
                                    const vm = riveObj.viewModelByIndex(i);
                                    if (!vm) continue;

                                    console.log(`[RivAnalyzer] VM[${i}] "${vm.name}" — keys:`, Object.keys(vm));
                                    const props = extractProperties(vm);

                                    viewModels.push({
                                        name: vm.name ?? `ViewModel_${i}`,
                                        properties: props,
                                        isDefault: i === 0, // 첫 번째를 기본으로
                                    });
                                }

                                // fallback: viewModelCount=0이면 defaultViewModel 시도
                                if (viewModels.length === 0) {
                                    try {
                                        const defVm = riveObj.defaultViewModel();
                                        console.log("[RivAnalyzer] defaultViewModel():", defVm);
                                        if (defVm) {
                                            viewModels.push({
                                                name: defVm.name ?? "default",
                                                properties: extractProperties(defVm),
                                                isDefault: true,
                                            });
                                        }
                                    } catch {
                                        console.log("[RivAnalyzer] defaultViewModel() 미지원");
                                    }
                                }

                                // ─── 5. 하위 호환 필드 구성 ────────────
                                const defaultVm = viewModels.find(v => v.isDefault) ?? viewModels[0];
                                const viewModelName = defaultVm?.name ?? null;
                                // 모든 VM의 프로퍼티를 flat 하게 합침 (컨트롤러 하위 호환)
                                const allProperties = viewModels.flatMap(vm =>
                                    vm.properties.map(p => ({ ...p }))
                                );

                                console.log("[RivAnalyzer] 분석 완료:", {
                                    artboards,
                                    viewModels: viewModels.map(v => `${v.name}(${v.properties.length})`),
                                    totalProperties: allProperties.length,
                                });

                                resolve({
                                    artboards,
                                    artboardSize,
                                    stateMachines,
                                    viewModels,
                                    viewModelName,
                                    properties: allProperties,
                                    analyzedAt: new Date().toISOString(),
                                });
                            } catch (err) {
                                reject(err);
                            } finally {
                                // Rive 인스턴스 정리
                                riveObj.cleanup();
                            }
                        },
                        onLoadError: () => {
                            reject(new Error(".riv 파일 로드 실패"));
                        },
                    });
                    riveInstanceRef.current = riveObj;
                } catch (err) {
                    reject(err);
                }
            });

            setAnalysis(analysisResult);
            console.log("[RivAnalyzer] 분석 완료:", analysisResult);
        } catch (err) {
            console.error("Rive 파일 분석 실패:", err);
            // 분석 실패 시에도 빈 결과로 설정 (수동 입력 가능)
            setAnalysis({
                artboards: ["Main"],
                stateMachines: [],
                viewModels: [],
                viewModelName: null,
                properties: [],
                analyzedAt: new Date().toISOString(),
            });
        } finally {
            setAnalyzing(false);
        }
    }, []);

    // 언마운트 시 숨겨진 canvas + Rive 인스턴스 정리
    useEffect(() => {
        return () => {
            if (riveInstanceRef.current) {
                riveInstanceRef.current.cleanup();
            }
            if (analysisCanvasRef.current && analysisCanvasRef.current.parentNode) {
                analysisCanvasRef.current.parentNode.removeChild(analysisCanvasRef.current);
            }
        };
    }, []);

    // 파일 선택 시 자동 분석
    useEffect(() => {
        if (rivFile) {
            analyzeRivFile(rivFile);
        }
    }, [rivFile, analyzeRivFile]);

    // .riv 미리보기용 URL 생성
    const [rivPreviewUrl, setRivPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (rivFile) {
            const url = URL.createObjectURL(rivFile);
            setRivPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else if (existingRivPath) {
            // Supabase Storage에서 공개 URL 가져오기
            const { data } = supabase.storage.from("characters").getPublicUrl(existingRivPath);
            if (data?.publicUrl) setRivPreviewUrl(data.publicUrl);
        }
    }, [rivFile, existingRivPath]);

    // ─── 프로퍼티 수동 추가 ─────────────────────────────────
    const [newPropName, setNewPropName] = useState("");
    const [newPropType, setNewPropType] = useState<RivePropertyType>("trigger");

    const addProperty = useCallback(() => {
        if (!newPropName.trim()) return;
        const prop: RivePropertyInfo = {
            name: newPropName.trim(),
            type: newPropType,
        };
        setAnalysis((prev) => prev ? {
            ...prev,
            properties: [...prev.properties, prop],
        } : {
            artboards: ["Main"],
            stateMachines: [],
            viewModels: [],
            viewModelName: null,
            properties: [prop],
            analyzedAt: new Date().toISOString(),
        });
        setNewPropName("");
    }, [newPropName, newPropType]);

    const removeProperty = useCallback((propName: string) => {
        setAnalysis((prev) => prev ? {
            ...prev,
            properties: prev.properties.filter((p) => p.name !== propName),
        } : null);
    }, []);

    // ─── 프로퍼티 라벨 편집 (properties + viewModels 동기화) ──
    const updatePropertyLabel = useCallback((propName: string, label: string) => {
        setAnalysis((prev) => {
            if (!prev) return null;
            // flat properties 업데이트
            const newProperties = prev.properties.map((p) =>
                p.name === propName ? { ...p, label } : p,
            );
            // viewModels 내부 properties도 동기화
            const newViewModels = prev.viewModels.map((vm) => ({
                ...vm,
                properties: vm.properties.map((p) =>
                    p.name === propName ? { ...p, label } : p,
                ),
            }));
            return { ...prev, properties: newProperties, viewModels: newViewModels };
        });
    }, []);

    // ─── 프로퍼티 숨김 토글 (properties + viewModels 동기화) ──
    const togglePropertyHidden = useCallback((propName: string) => {
        setAnalysis((prev) => {
            if (!prev) return null;
            // flat properties 업데이트
            const newProperties = prev.properties.map((p) =>
                p.name === propName ? { ...p, hidden: !p.hidden } : p,
            );
            // viewModels 내부 properties도 동기화
            const newViewModels = prev.viewModels.map((vm) => ({
                ...vm,
                properties: vm.properties.map((p) =>
                    p.name === propName ? { ...p, hidden: !p.hidden } : p,
                ),
            }));
            return { ...prev, properties: newProperties, viewModels: newViewModels };
        });
    }, []);

    // ─── 저장 ───────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (!name.trim()) return;
        setSaving(true);

        try {
            let filePath = existingRivPath;

            // 새 파일 업로드
            if (rivFile) {
                const fileName = `${Date.now()}_${rivFile.name}`;
                const { error: uploadErr } = await supabase.storage
                    .from("characters")
                    .upload(fileName, rivFile);
                if (uploadErr) throw uploadErr;
                filePath = fileName;

                // 기존 파일 삭제
                if (existingRivPath && editTarget) {
                    await supabase.storage.from("characters").remove([existingRivPath]);
                }
            }

            const payload = {
                name: name.trim(),
                description: description.trim() || null,
                riv_file_path: filePath,
                rive_analysis: analysis as unknown as Json,
                action_mappings: [], // 레거시 호환 (빈 배열)
                grid_template_id: selectedGridId || null,
                zone_bounds: zoneBounds as unknown as Json || null,
            };

            if (editTarget) {
                await supabase
                    .from("ai_character_presets")
                    .update(payload)
                    .eq("id", editTarget.id);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                await supabase
                    .from("ai_character_presets")
                    .insert({ ...payload, owner_id: user?.id } as any);
            }

            onComplete();
        } catch (err) {
            console.error("저장 실패:", err);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setSaving(false);
        }
    }, [name, description, rivFile, existingRivPath, analysis, editTarget, onComplete]);

    // ─── Zone 선택 핸들러 ────────────────────────────────────
    const handleGridSelect = useCallback((template: GridTemplateRow) => {
        setSelectedGrid(template);
        setSelectedGridId(template.id);
        setSelectedZoneIds(new Set());
        setZoneBounds(null);
    }, []);

    const handleToggleZone = useCallback((zoneId: string) => {
        setSelectedZoneIds((prev) => {
            const next = new Set(prev);
            if (next.has(zoneId)) next.delete(zoneId);
            else next.add(zoneId);
            return next;
        });
    }, []);

    // Zone 선택 변경 시 combinedBounds 계산
    useEffect(() => {
        if (selectedGrid && selectedZoneIds.size > 0) {
            const bounds = calculateCombinedBounds(selectedGrid, selectedZoneIds);
            setZoneBounds(bounds as CharacterZoneBounds | null);
        } else {
            setZoneBounds(null);
        }
    }, [selectedGrid, selectedZoneIds]);

    // ─── 네비게이션 ─────────────────────────────────────────
    const canGoNext = () => {
        if (step === "basic-info") {
            return name.trim().length > 0 && (rivFile !== null || existingRivPath.length > 0);
        }
        // zone-select: Zone 선택은 선택사항 (skip 가능)
        return true;
    };

    const goNext = () => {
        if (step === "basic-info") setStep("zone-select");
        else if (step === "zone-select") setStep("analysis-mapping");
    };

    const goBack = () => {
        if (step === "analysis-mapping") setStep("zone-select");
        else if (step === "zone-select") setStep("basic-info");
    };

    const currentStepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);
    const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0, 0, 0, 0.7)",
        }}>
            <div style={{
                width: step === "basic-info" ? 640 : 960, maxHeight: "85vh",
                background: "var(--bg-primary, #111)", borderRadius: 16,
                border: "1px solid var(--border-secondary, #333)",
                display: "flex", flexDirection: "column",
                overflow: "hidden",
                transition: "width 0.3s ease",
            }}>
                {/* 헤더 */}
                <div style={{
                    padding: "16px 20px", display: "flex", justifyContent: "space-between",
                    alignItems: "center", borderBottom: "1px solid var(--border-secondary, #333)",
                }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary, #fff)", margin: 0 }}>
                        {editTarget ? "캐릭터 편집" : "캐릭터 등록"}
                    </h2>
                    <button onClick={onClose} style={{
                        background: "none", border: "none", color: "var(--text-tertiary, #666)",
                        fontSize: 20, cursor: "pointer",
                    }}>✕</button>
                </div>

                {/* 스텝 인디케이터 */}
                <div style={{
                    display: "flex", padding: "12px 20px",
                    borderBottom: "1px solid var(--border-secondary, #333)",
                    gap: 4,
                }}>
                    {WIZARD_STEPS.map((ws) => (
                        <div key={ws.key} style={{
                            flex: 1, display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 10px", borderRadius: 6,
                            background: ws.key === step ? "rgba(99, 102, 241, 0.15)" : "transparent",
                            color: ws.key === step ? "#6366f1" : "var(--text-tertiary, #666)",
                            fontSize: 12, fontWeight: ws.key === step ? 600 : 400,
                        }}>
                            <span>{ws.icon}</span>
                            <span>{ws.label}</span>
                        </div>
                    ))}
                </div>

                {/* 컨텐츠 (step 2,3: 2열 레이아웃) */}
                <div style={{
                    flex: 1, overflow: "hidden",
                    display: step === "basic-info" ? "block" : "flex",
                }}>
                    {/* 좌측: 메인 컨텐츠 */}
                    <div style={{
                        flex: 1, overflow: "auto", padding: 20,
                        minWidth: 0,
                    }}>
                        {step === "basic-info" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {/* 이름 */}
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, #999)" }}>
                                        캐릭터 이름 *
                                    </label>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="예: 아이돌 캐릭터"
                                        style={{
                                            width: "100%", marginTop: 4, padding: "8px 12px",
                                            borderRadius: 6, border: "1px solid var(--border-secondary, #333)",
                                            background: "var(--bg-secondary, #1a1a1a)",
                                            color: "var(--text-primary, #fff)", fontSize: 14,
                                        }}
                                    />
                                </div>

                                {/* 설명 */}
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, #999)" }}>
                                        설명
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="캐릭터에 대한 간단한 설명"
                                        rows={2}
                                        style={{
                                            width: "100%", marginTop: 4, padding: "8px 12px",
                                            borderRadius: 6, border: "1px solid var(--border-secondary, #333)",
                                            background: "var(--bg-secondary, #1a1a1a)",
                                            color: "var(--text-primary, #fff)", fontSize: 14,
                                            resize: "vertical",
                                        }}
                                    />
                                </div>

                                {/* .riv 파일 업로드 */}
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, #999)" }}>
                                        Rive 파일 (.riv) *
                                    </label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            marginTop: 4, padding: 24, borderRadius: 8,
                                            border: "2px dashed var(--border-secondary, #333)",
                                            textAlign: "center", cursor: "pointer",
                                            background: "var(--bg-secondary, #1a1a1a)",
                                            transition: "border-color 0.2s",
                                        }}
                                    >
                                        <Upload size={24} style={{ margin: "0 auto 8px", color: "var(--text-tertiary, #666)" }} />
                                        {rivFile ? (
                                            <p style={{ fontSize: 13, color: "#10b981" }}>
                                                {rivFile.name} ({(rivFile.size / 1024).toFixed(1)}KB)
                                            </p>
                                        ) : existingRivPath ? (
                                            <p style={{ fontSize: 13, color: "var(--text-secondary, #999)" }}>
                                                기존 파일: {existingRivPath.split("/").pop()} — 클릭하여 교체
                                            </p>
                                        ) : (
                                            <p style={{ fontSize: 13, color: "var(--text-tertiary, #666)" }}>
                                                클릭하여 .riv 파일 선택
                                            </p>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".riv"
                                        onChange={(e) => setRivFile(e.target.files?.[0] || null)}
                                        style={{ display: "none" }}
                                    />
                                </div>
                            </div>
                        )}

                        {step === "zone-select" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {/* 그리드 선택 */}
                                <div>
                                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #fff)", margin: "0 0 4px" }}>
                                        그리드 템플릿 선택
                                    </h3>
                                    <p style={{ fontSize: 11, color: "var(--text-tertiary, #666)", margin: "0 0 12px" }}>
                                        캐릭터가 배치될 화면 영역을 지정합니다. 건너뛰면 전체 화면에 표시됩니다.
                                    </p>
                                    <GridSelector
                                        selectedGridId={selectedGridId}
                                        onSelect={handleGridSelect}
                                    />
                                </div>

                                {/* Zone 선택 */}
                                {selectedGrid && (
                                    <div>
                                        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #fff)", margin: "0 0 4px" }}>
                                            배치 영역 선택
                                        </h3>
                                        <p style={{ fontSize: 11, color: "var(--text-tertiary, #666)", margin: "0 0 12px" }}>
                                            클릭하여 캐릭터를 배치할 Zone을 선택하세요 (다중 선택 가능)
                                        </p>
                                        <ZoneSelector
                                            template={selectedGrid}
                                            selectedZoneIds={selectedZoneIds}
                                            onToggleZone={handleToggleZone}
                                        />
                                    </div>
                                )}

                                {/* 선택 결과 요약 */}
                                {zoneBounds && (
                                    <div style={{
                                        padding: "10px 14px", borderRadius: 8,
                                        background: "rgba(16, 185, 129, 0.1)",
                                        border: "1px solid rgba(16, 185, 129, 0.3)",
                                        fontSize: 12,
                                    }}>
                                        <span style={{ color: "#10b981", fontWeight: 600 }}>✅ 배치 영역: </span>
                                        <span style={{ color: "var(--text-secondary, #aaa)" }}>
                                            {zoneBounds.width} × {zoneBounds.height}px
                                            ({zoneBounds.x}, {zoneBounds.y})
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === "analysis-mapping" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                                {/* ─── 분석 상태 배너 ──────────────────────── */}
                                {analyzing && (
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 10,
                                        padding: "12px 16px", borderRadius: 8,
                                        background: "rgba(99, 102, 241, 0.1)",
                                        border: "1px solid rgba(99, 102, 241, 0.3)",
                                    }}>
                                        <div style={{
                                            width: 16, height: 16, border: "2px solid #6366f1",
                                            borderTopColor: "transparent", borderRadius: "50%",
                                            animation: "spin 0.8s linear infinite",
                                        }} />
                                        <span style={{ fontSize: 13, color: "#6366f1" }}>
                                            .riv 파일 분석 중...
                                        </span>
                                    </div>
                                )}

                                {!analyzing && analysis && (
                                    <div style={{
                                        padding: "12px 16px", borderRadius: 8,
                                        background: analysis.viewModels?.length
                                            ? "rgba(16, 185, 129, 0.1)"
                                            : "rgba(245, 158, 11, 0.1)",
                                        border: `1px solid ${analysis.viewModels?.length
                                            ? "rgba(16, 185, 129, 0.3)"
                                            : "rgba(245, 158, 11, 0.3)"}`,
                                    }}>
                                        {analysis.viewModels?.length ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ fontSize: 14 }}>✅</span>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>
                                                        ViewModel {analysis.viewModels.length}개 발견
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, color: "var(--text-tertiary, #888)" }}>
                                                    아트보드 {analysis.artboards.length}개 · 프로퍼티 총 {analysis.properties.length}개 자동 감지
                                                </span>
                                                {/* 각 ViewModel 요약 */}
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                                                    {analysis.viewModels.map(vm => (
                                                        <span key={vm.name} style={{
                                                            display: "inline-flex", alignItems: "center", gap: 4,
                                                            padding: "2px 8px", borderRadius: 10,
                                                            background: vm.isDefault
                                                                ? "rgba(99, 102, 241, 0.15)"
                                                                : "rgba(100, 100, 100, 0.15)",
                                                            fontSize: 11,
                                                            color: vm.isDefault ? "#818cf8" : "var(--text-secondary, #aaa)",
                                                            fontFamily: "monospace",
                                                        }}>
                                                            {vm.isDefault && "★ "}
                                                            {vm.name}
                                                            <span style={{ opacity: 0.6 }}>({vm.properties.length})</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <span style={{ fontSize: 14 }}>⚠️</span>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b" }}>
                                                        ViewModel 없음
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, color: "var(--text-tertiary, #888)" }}>
                                                    이 .riv 파일에는 Data Binding ViewModel이 포함되어 있지 않습니다.
                                                    Rive 에디터에서 ViewModel을 추가하거나, 아래에서 프로퍼티를 수동으로 입력하세요.
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!analyzing && !analysis && (rivFile || existingRivPath) && (
                                    <div style={{
                                        padding: "12px 16px", borderRadius: 8,
                                        background: "rgba(100, 100, 100, 0.1)",
                                        border: "1px solid var(--border-secondary, #333)",
                                    }}>
                                        <span style={{ fontSize: 12, color: "var(--text-tertiary, #888)" }}>
                                            📋 .riv 파일을 업로드하면 ViewModel 프로퍼티를 자동 분석합니다.
                                        </span>
                                    </div>
                                )}

                                {/* ─── ViewModel 프로퍼티 설정 ─────────── */}
                                <div>
                                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #fff)", margin: "0 0 8px" }}>
                                        ViewModel 프로퍼티
                                    </h3>
                                    <p style={{ fontSize: 11, color: "var(--text-tertiary, #666)", margin: "0 0 12px" }}>
                                        {analysis?.properties.length
                                            ? "감지된 프로퍼티입니다. 라벨을 편집하고 컨트롤러에서 숨길 프로퍼티를 설정하세요."
                                            : "프로퍼티를 수동으로 추가하세요. 컨트롤러에서 타입에 맞는 UI가 자동 생성됩니다."
                                        }
                                    </p>

                                    {/* 프로퍼티 수동 추가 폼 */}
                                    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                                        <input
                                            value={newPropName}
                                            onChange={(e) => setNewPropName(e.target.value)}
                                            placeholder="프로퍼티 이름"
                                            onKeyDown={(e) => e.key === "Enter" && addProperty()}
                                            style={{
                                                flex: 1, padding: "6px 10px",
                                                borderRadius: 6, border: "1px solid var(--border-secondary, #333)",
                                                background: "var(--bg-secondary, #1a1a1a)",
                                                color: "var(--text-primary, #fff)", fontSize: 13,
                                            }}
                                        />
                                        <select
                                            value={newPropType}
                                            onChange={(e) => setNewPropType(e.target.value as RivePropertyType)}
                                            style={{
                                                padding: "6px 8px", borderRadius: 6,
                                                border: "1px solid var(--border-secondary, #333)",
                                                background: "var(--bg-secondary, #1a1a1a)",
                                                color: "var(--text-primary, #fff)", fontSize: 12,
                                            }}
                                        >
                                            <option value="trigger">⚡ Trigger</option>
                                            <option value="string">💬 String</option>
                                            <option value="number">🔢 Number</option>
                                            <option value="boolean">🔘 Boolean</option>
                                            <option value="color">🎨 Color</option>
                                            <option value="enum">📋 Enum</option>
                                        </select>
                                        <button
                                            onClick={addProperty}
                                            disabled={!newPropName.trim()}
                                            style={{
                                                padding: "6px 12px", borderRadius: 6, border: "none",
                                                background: newPropName.trim() ? "var(--brand-primary, #6366f1)" : "var(--bg-tertiary, #333)",
                                                color: "#fff", fontSize: 12, cursor: newPropName.trim() ? "pointer" : "not-allowed",
                                            }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>

                                    {/* 프로퍼티 목록 — ViewModel별 그룹 + 라벨 편집 + 숨김 토글 */}
                                    {analysis?.viewModels?.length ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                            {analysis.viewModels.map(vm => (
                                                <div key={vm.name}>
                                                    {/* VM 섹션 헤더 (2개 이상일 때만 표시) */}
                                                    {analysis.viewModels.length > 1 && (
                                                        <div style={{
                                                            display: "flex", alignItems: "center", gap: 6,
                                                            padding: "4px 0", marginBottom: 6,
                                                            borderBottom: "1px solid var(--border-secondary, #333)",
                                                        }}>
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: vm.isDefault ? "#818cf8" : "var(--text-secondary, #aaa)",
                                                                fontFamily: "monospace",
                                                            }}>
                                                                {vm.isDefault ? "★" : "◇"} {vm.name}
                                                            </span>
                                                            <span style={{ fontSize: 10, color: "var(--text-tertiary, #666)" }}>
                                                                ({vm.properties.length} props)
                                                            </span>
                                                        </div>
                                                    )}

                                                    {vm.properties.length > 0 ? (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                            {vm.properties.map((prop) => (
                                                                <div key={`${vm.name}.${prop.name}`} style={{
                                                                    display: "flex", alignItems: "center", gap: 6,
                                                                    padding: "8px 10px", borderRadius: 6,
                                                                    background: prop.hidden
                                                                        ? "var(--bg-tertiary, #222)"
                                                                        : "var(--bg-secondary, #1a1a1a)",
                                                                    border: `1px solid ${prop.hidden
                                                                        ? "var(--border-secondary, #333)"
                                                                        : "var(--border-secondary, #444)"}`,
                                                                    opacity: prop.hidden ? 0.5 : 1,
                                                                    transition: "all 0.2s",
                                                                }}>
                                                                    {/* 타입 배지 */}
                                                                    <Badge label={prop.type} color={getTypeColor(prop.type)} />

                                                                    {/* 프로퍼티 이름 */}
                                                                    <span style={{
                                                                        fontSize: 11, color: "var(--text-tertiary, #888)",
                                                                        fontFamily: "monospace", minWidth: 60,
                                                                    }}>
                                                                        {prop.name}
                                                                    </span>

                                                                    {/* list 타입이면 참조 ViewModel 표시 */}
                                                                    {prop.type === "list" && prop.viewModelRef && (
                                                                        <span style={{
                                                                            fontSize: 10, padding: "1px 6px",
                                                                            borderRadius: 8,
                                                                            background: "rgba(99, 102, 241, 0.1)",
                                                                            color: "#818cf8",
                                                                        }}>
                                                                            → {prop.viewModelRef}
                                                                        </span>
                                                                    )}

                                                                    {/* 라벨 입력 */}
                                                                    <input
                                                                        value={prop.label || ""}
                                                                        onChange={(e) => updatePropertyLabel(prop.name, e.target.value)}
                                                                        placeholder="한글 라벨 (선택)"
                                                                        style={{
                                                                            flex: 1, padding: "3px 8px",
                                                                            borderRadius: 4,
                                                                            border: "1px solid var(--border-secondary, #333)",
                                                                            background: "var(--bg-tertiary, #222)",
                                                                            color: "var(--text-primary, #fff)",
                                                                            fontSize: 12,
                                                                        }}
                                                                    />

                                                                    {/* 숨김 토글 */}
                                                                    <button
                                                                        onClick={() => togglePropertyHidden(prop.name)}
                                                                        title={prop.hidden ? "컨트롤러에 표시" : "컨트롤러에서 숨김"}
                                                                        style={{
                                                                            padding: "3px 6px", borderRadius: 4,
                                                                            border: "none",
                                                                            background: prop.hidden
                                                                                ? "rgba(239, 68, 68, 0.15)"
                                                                                : "rgba(16, 185, 129, 0.15)",
                                                                            color: prop.hidden ? "#ef4444" : "#10b981",
                                                                            fontSize: 11, cursor: "pointer",
                                                                        }}
                                                                    >
                                                                        {prop.hidden ? "숨김" : "표시"}
                                                                    </button>

                                                                    {/* 삭제 */}
                                                                    <button
                                                                        onClick={() => removeProperty(prop.name)}
                                                                        style={{
                                                                            padding: 3, border: "none", background: "none",
                                                                            color: "#ef4444", cursor: "pointer",
                                                                        }}
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            padding: 8, textAlign: "center",
                                                            color: "var(--text-tertiary, #666)", fontSize: 11,
                                                        }}>
                                                            프로퍼티 없음
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : analysis?.properties.length ? (
                                        /* 하위 호환: viewModels 없이 properties만 있는 경우 */
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            {analysis.properties.map((prop) => (
                                                <div key={prop.name} style={{
                                                    display: "flex", alignItems: "center", gap: 6,
                                                    padding: "8px 10px", borderRadius: 6,
                                                    background: prop.hidden
                                                        ? "var(--bg-tertiary, #222)"
                                                        : "var(--bg-secondary, #1a1a1a)",
                                                    border: `1px solid ${prop.hidden
                                                        ? "var(--border-secondary, #333)"
                                                        : "var(--border-secondary, #444)"}`,
                                                    opacity: prop.hidden ? 0.5 : 1,
                                                }}>
                                                    <Badge label={prop.type} color={getTypeColor(prop.type)} />
                                                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-tertiary, #888)", minWidth: 60 }}>
                                                        {prop.name}
                                                    </span>
                                                    <input
                                                        value={prop.label || ""}
                                                        onChange={(e) => updatePropertyLabel(prop.name, e.target.value)}
                                                        placeholder="한글 라벨 (선택)"
                                                        style={{
                                                            flex: 1, padding: "3px 8px", borderRadius: 4,
                                                            border: "1px solid var(--border-secondary, #333)",
                                                            background: "var(--bg-tertiary, #222)",
                                                            color: "var(--text-primary, #fff)", fontSize: 12,
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => togglePropertyHidden(prop.name)}
                                                        style={{
                                                            padding: "3px 6px", borderRadius: 4, border: "none",
                                                            background: prop.hidden ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                                                            color: prop.hidden ? "#ef4444" : "#10b981", fontSize: 11, cursor: "pointer",
                                                        }}
                                                    >
                                                        {prop.hidden ? "숨김" : "표시"}
                                                    </button>
                                                    <button
                                                        onClick={() => removeProperty(prop.name)}
                                                        style={{ padding: 3, border: "none", background: "none", color: "#ef4444", cursor: "pointer" }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{
                                            padding: 16, textAlign: "center",
                                            color: "var(--text-tertiary, #666)", fontSize: 12,
                                            border: "1px dashed var(--border-secondary, #333)",
                                            borderRadius: 8,
                                        }}>
                                            프로퍼티를 추가하세요
                                        </div>
                                    )}
                                </div>

                                {/* ─── 컨트롤러 미리보기 안내 ─────────── */}
                                {analysis?.properties.some(p => !p.hidden) && (
                                    <div style={{
                                        padding: "10px 14px", borderRadius: 8,
                                        background: "rgba(99, 102, 241, 0.05)",
                                        border: "1px solid rgba(99, 102, 241, 0.2)",
                                    }}>
                                        <p style={{ fontSize: 11, color: "var(--text-tertiary, #888)", margin: 0 }}>
                                            💡 컨트롤러에서 타입별 자동 UI가 생성됩니다:
                                            <strong> trigger</strong>→버튼,
                                            <strong> string</strong>→텍스트입력,
                                            <strong> number</strong>→슬라이더,
                                            <strong> boolean</strong>→토글,
                                            <strong> enum</strong>→드롭다운,
                                            <strong> color</strong>→컬러피커
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 우측: 미리보기 사이드 패널 (step 2,3에서만 표시) */}
                    {step !== "basic-info" && rivPreviewUrl && (
                        <div style={{
                            width: 300, borderLeft: "1px solid var(--border-secondary, #333)",
                            display: "flex", flexDirection: "column",
                            background: "var(--bg-secondary, #1a1a1a)",
                        }}>
                            {/* 미리보기 헤더 */}
                            <div style={{
                                padding: "10px 14px",
                                borderBottom: "1px solid var(--border-secondary, #333)",
                                fontSize: 12, fontWeight: 600,
                                color: "var(--text-primary, #fff)",
                            }}>
                                🎬 미리보기
                            </div>

                            {/* Rive 캔버스 */}
                            <div style={{
                                flex: 1, minHeight: 200, maxHeight: 300,
                                position: "relative",
                                background: "#000",
                            }}>
                                <RivePreviewPanel
                                    src={rivPreviewUrl}
                                    stateMachineName={analysis?.stateMachines?.[0]}
                                />
                            </div>

                            {/* 메타 정보 */}
                            <div style={{
                                padding: "10px 14px",
                                display: "flex", flexDirection: "column", gap: 8,
                                fontSize: 11,
                                overflow: "auto",
                            }}>
                                {/* State Machine */}
                                {analysis?.stateMachines && analysis.stateMachines.length > 0 && (
                                    <div>
                                        <span style={{ color: "var(--text-tertiary, #888)" }}>State Machine: </span>
                                        <span style={{ color: "#6366f1", fontWeight: 600 }}>
                                            {analysis.stateMachines.join(", ")}
                                        </span>
                                    </div>
                                )}

                                {/* 아트보드 크기 & 비율 */}
                                {analysis?.artboardSize && (
                                    <div>
                                        <span style={{ color: "var(--text-tertiary, #888)" }}>아트보드: </span>
                                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                                            {analysis.artboardSize.width} × {analysis.artboardSize.height}px
                                        </span>
                                        <span style={{ color: "var(--text-tertiary, #888)", marginLeft: 6 }}>
                                            (비율 {(analysis.artboardSize.width / analysis.artboardSize.height).toFixed(2)}:1)
                                        </span>
                                    </div>
                                )}

                                {/* Artboard 이름 */}
                                {analysis?.artboards && analysis.artboards.length > 0 && (
                                    <div>
                                        <span style={{ color: "var(--text-tertiary, #888)" }}>아트보드: </span>
                                        <span style={{ color: "var(--text-secondary, #aaa)" }}>
                                            {analysis.artboards.join(", ")}
                                        </span>
                                    </div>
                                )}

                                {/* Zone 비율 vs 아트보드 비율 비교 */}
                                {step === "zone-select" && analysis?.artboardSize && zoneBounds && (
                                    (() => {
                                        const abRatio = analysis.artboardSize.width / analysis.artboardSize.height;
                                        const zoneRatio = zoneBounds.width / zoneBounds.height;
                                        const diff = Math.abs(abRatio - zoneRatio);
                                        const isMatch = diff < 0.1;
                                        return (
                                            <div style={{
                                                padding: "8px 10px", borderRadius: 6,
                                                background: isMatch ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                                border: `1px solid ${isMatch ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                                            }}>
                                                <div style={{ fontWeight: 600, color: isMatch ? "#10b981" : "#ef4444", marginBottom: 4 }}>
                                                    {isMatch ? "✅ 비율 일치" : "⚠️ 비율 불일치"}
                                                </div>
                                                <div style={{ color: "var(--text-tertiary, #888)" }}>
                                                    아트보드: {abRatio.toFixed(2)}:1 / Zone: {zoneRatio.toFixed(2)}:1
                                                </div>
                                                {!isMatch && (
                                                    <div style={{ color: "#f59e0b", marginTop: 4, fontSize: 10 }}>
                                                        비율이 다르면 캐릭터가 찌그러질 수 있습니다
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div style={{
                    padding: "12px 20px", display: "flex", justifyContent: "space-between",
                    borderTop: "1px solid var(--border-secondary, #333)",
                }}>
                    <button
                        onClick={currentStepIndex > 0 ? goBack : onClose}
                        style={{
                            padding: "8px 16px", borderRadius: 6,
                            border: "1px solid var(--border-secondary, #333)",
                            background: "transparent", color: "var(--text-secondary, #999)",
                            fontSize: 13, cursor: "pointer",
                        }}
                    >
                        {currentStepIndex > 0 ? "← 이전" : "취소"}
                    </button>

                    {isLastStep ? (
                        <button
                            onClick={handleSave}
                            disabled={saving || !canGoNext()}
                            style={{
                                padding: "8px 20px", borderRadius: 6, border: "none",
                                background: saving ? "#888" : "var(--brand-primary, #6366f1)",
                                color: "#fff", fontSize: 13, fontWeight: 600,
                                cursor: saving ? "not-allowed" : "pointer",
                            }}
                        >
                            {saving ? "저장 중..." : editTarget ? "수정 완료" : "등록 완료"}
                        </button>
                    ) : (
                        <button
                            onClick={goNext}
                            disabled={!canGoNext()}
                            style={{
                                padding: "8px 20px", borderRadius: 6, border: "none",
                                background: canGoNext() ? "var(--brand-primary, #6366f1)" : "var(--bg-tertiary, #333)",
                                color: "#fff", fontSize: 13, fontWeight: 600,
                                cursor: canGoNext() ? "pointer" : "not-allowed",
                            }}
                        >
                            다음 →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Rive 미리보기 패널 컴포넌트 ──────────────────────────────────

/** 사이드 패널에서 .riv 파일을 렌더링하는 미리보기 */
function RivePreviewPanel({ src, stateMachineName }: { src: string; stateMachineName?: string }) {
    const { RiveComponent } = useRive({
        src,
        stateMachines: stateMachineName || undefined,
        autoplay: true,
        automaticallyHandleEvents: true,
    });

    return (
        <RiveComponent
            style={{
                width: "100%", height: "100%",
                display: "block",
            }}
        />
    );
}

// ─── 유틸리티 ───────────────────────────────────────────────────

function getTypeColor(type: RivePropertyType): string {
    switch (type) {
        case "trigger": return "#f59e0b";
        case "boolean": return "#10b981";
        case "number": return "#6366f1";
        case "string": return "#ec4899";
        case "color": return "#8b5cf6";
        case "enum": return "#14b8a6";
        case "image": return "#f97316";
        case "list": return "#06b6d4";
        default: return "#666";
    }
}

export { CharacterWizardModal, Badge, RivePreviewPanel, getTypeColor };
export type { CharacterWizardModalProps };

/**
 * AiCharacterPanel — AI 캐릭터 컨트롤러 패널
 *
 * ViewModel 프로퍼티 타입에 따라 적절한 UI 컨트롤을 자동 생성:
 *   trigger  → 버튼 (제스처 실행)
 *   string   → 텍스트 입력 + 전송 (말풍선 등)
 *   number   → 슬라이더 + 숫자 입력 (위치, 크기)
 *   boolean  → 토글 스위치 (표시/숨김)
 *   enum     → 드롭다운 (표정 선택)
 *   color    → 컬러 피커
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Radio, Eye, EyeOff, Bot, Send, Play, Pause, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type {
    AiCharacterPreset,
    AiCharacterState,
    RivePropertyInfo,
} from "../../lib/aiCharacterTypes";

// ─── Props ──────────────────────────────────────────────────────

interface AiCharacterPanelProps {
    sessionId: string;
    isActiveTab: boolean;
}

// ─── 상수 ───────────────────────────────────────────────────────

// 프로퍼티 타입별 아이콘/색상
const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
    trigger: { icon: "⚡", color: "#f59e0b", label: "Trigger" },
    string: { icon: "💬", color: "#3b82f6", label: "String" },
    number: { icon: "🔢", color: "#8b5cf6", label: "Number" },
    boolean: { icon: "🔘", color: "#10b981", label: "Boolean" },
    enum: { icon: "📋", color: "#ec4899", label: "Enum" },
    color: { icon: "🎨", color: "#06b6d4", label: "Color" },
    list: { icon: "📑", color: "#6366f1", label: "List" },
    image: { icon: "🖼️", color: "#84cc16", label: "Image" },
};

// ─── 메인 컴포넌트 ──────────────────────────────────────────────

export function AiCharacterPanel({
    sessionId,
    isActiveTab: _isActiveTab,
}: AiCharacterPanelProps) {
    // ─── 상태 ───────────────────────────────────────────────
    const [presets, setPresets] = useState<AiCharacterPreset[]>([]);
    const [characterState, setCharacterState] = useState<AiCharacterState | null>(null);
    const [loading, setLoading] = useState(true);

    // ─── 데이터 로드 ────────────────────────────────────────
    useEffect(() => {
        if (!sessionId) return;

        const loadData = async () => {
            try {
                // 프리셋 목록
                const { data: presetData } = await supabase
                    .from("ai_character_presets")
                    .select("*")
                    .order("created_at", { ascending: false });
                if (presetData) setPresets(presetData as unknown as AiCharacterPreset[]);

                // 현재 세션 상태
                const { data: stateData } = await supabase
                    .from("ai_character_state")
                    .select("*")
                    .eq("session_id", sessionId)
                    .single();
                if (stateData) setCharacterState(stateData as unknown as AiCharacterState);
            } catch (err) {
                console.error("[AiCharacterPanel] 로드 실패:", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [sessionId]);

    // ─── 렌더러용 Broadcast 채널 (사전 구독 필수) ─────────
    const broadcastChannelRef = useRef<any>(null);
    useEffect(() => {
        if (!sessionId) return;
        const ch = supabase.channel(`ai-char-sync:${sessionId}`);
        ch.subscribe((status: string) => {
            console.log(`[AiCharacterPanel] Broadcast 채널 상태: ${status}`);
        });
        broadcastChannelRef.current = ch;
        return () => {
            ch.unsubscribe();
            broadcastChannelRef.current = null;
        };
    }, [sessionId]);

    // ─── 상태 변경을 Layer에 전파하는 이벤트 발송 ──────────
    const broadcastStateChange = useCallback(
        (newState: AiCharacterState) => {
            // 같은 페이지의 AiCharacterLayer에 전달 (CustomEvent)
            window.dispatchEvent(
                new CustomEvent("ai-character-state-change", {
                    detail: { sessionId, state: newState },
                }),
            );
            // 렌더러(다른 페이지)에 전달 (Supabase Broadcast)
            broadcastChannelRef.current?.send({
                type: "broadcast",
                event: "state-change",
                payload: newState,
            });
        },
        [sessionId],
    );

    // ─── Rive 런타임 커맨드 발송 (Play/Pause/Reset 등) ────
    const sendRiveCommand = useCallback(
        (command: string) => {
            console.log(`[AiCharacterPanel] Rive 커맨드 발송: ${command}`);
            const payload = { sessionId, command };
            // 같은 페이지 Layer에 전달
            window.dispatchEvent(
                new CustomEvent("ai-character-command", { detail: payload }),
            );
            // 렌더러에 전달
            broadcastChannelRef.current?.send({
                type: "broadcast",
                event: "rive-command",
                payload,
            });
        },
        [sessionId],
    );

    // ─── DB 업데이트 헬퍼 (optimistic + 이벤트 발송) ──────
    const updateState = useCallback(
        async (partial: Partial<AiCharacterState>) => {
            if (!characterState?.id) return;

            // 로컬 상태 즉시 반영 (optimistic update)
            const merged = { ...characterState, ...partial };
            setCharacterState(merged as AiCharacterState);
            broadcastStateChange(merged as AiCharacterState);

            try {
                await supabase
                    .from("ai_character_state")
                    .update({
                        ...partial,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", characterState.id);
            } catch (err) {
                console.error("[AiCharacterPanel] 업데이트 실패:", err);
            }
        },
        [characterState, broadcastStateChange],
    );

    // ─── vm_values 프로퍼티 단일 업데이트 ───────────────────
    const updateVmValue = useCallback(
        async (propName: string, value: any) => {
            if (!characterState) return;
            const newValues = {
                ...(characterState.vm_values || {}),
                [propName]: value,
            };
            await updateState({ vm_values: newValues });
        },
        [characterState, updateState],
    );

    // ─── 프리셋 선택 ────────────────────────────────────────
    const handlePresetSelect = useCallback(
        async (presetId: string) => {
            if (!sessionId) return;

            if (!characterState) {
                const { data, error } = await supabase
                    .from("ai_character_state")
                    .insert({
                        session_id: sessionId,
                        preset_id: presetId || null,
                        is_on_air: false,
                        vm_values: {},
                        visible: !!presetId,
                    })
                    .select()
                    .single();
                if (!error && data) {
                    setCharacterState(data as unknown as AiCharacterState);
                    broadcastStateChange(data as unknown as AiCharacterState);
                }
            } else {
                await updateState({
                    preset_id: presetId || null,
                    is_on_air: false,
                    vm_values: {},
                    visible: !!presetId,
                });
            }
        },
        [sessionId, characterState, updateState],
    );

    // ─── ON AIR 토글 ────────────────────────────────────────
    const handleToggleOnAir = useCallback(async () => {
        if (!characterState?.preset_id) return;
        if (characterState.is_on_air) {
            // OFF → 프리셋 초기화 (PVW에서도 사라짐)
            await updateState({
                is_on_air: false,
                preset_id: null,
                visible: false,
                vm_values: {},
            });
        } else {
            // ON → PGM 송출
            await updateState({ is_on_air: true });
        }
    }, [characterState, updateState]);

    // ─── 현재 프리셋 & 프로퍼티 목록 ────────────────────────
    const activePreset = presets.find((p) => p.id === characterState?.preset_id);

    // 컨트롤러에 표시할 프로퍼티 목록 (hidden 제외, order 정렬)
    const visibleProperties = (activePreset?.rive_analysis?.properties || [])
        .filter((p) => !p.hidden)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    // ─── 로딩 ───────────────────────────────────────────────
    if (loading) {
        return (
            <div className="ai-char-panel" style={{
                padding: 24, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10,
                height: "100%", opacity: 0.7,
            }}>
                <div style={{
                    width: 24, height: 24,
                    border: "2.5px solid rgba(99, 102, 241, 0.2)",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                }} />
                <span style={{ fontSize: 12, color: "var(--text-tertiary, #888)" }}>
                    캐릭터 데이터 로드 중...
                </span>
            </div>
        );
    }

    return (
        <div className="ai-char-panel" style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
            gap: 8,
            padding: "8px 12px",
        }}>
            {/* ─── 프리셋 선택 + ON AIR 토글 ──────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                    value={characterState?.preset_id || ""}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    style={{
                        flex: 1, padding: "6px 8px", borderRadius: 6,
                        border: "1px solid var(--border-secondary, #333)",
                        background: "var(--bg-secondary, #1a1a1a)",
                        color: "var(--text-primary, #fff)", fontSize: 13,
                    }}
                >
                    <option value="">캐릭터 선택...</option>
                    {presets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <button
                    onClick={handleToggleOnAir}
                    disabled={!characterState?.preset_id}
                    title={characterState?.is_on_air ? "OFF" : "PGM"}
                    style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 12px", borderRadius: 6, border: "none",
                        fontWeight: 600, fontSize: 12,
                        cursor: characterState?.preset_id ? "pointer" : "not-allowed",
                        transition: "all 0.2s",
                        background: characterState?.is_on_air ? "#ef4444" : "var(--bg-tertiary, #333)",
                        color: characterState?.is_on_air ? "#fff" : "var(--text-secondary, #999)",
                        opacity: characterState?.preset_id ? 1 : 0.4,
                    }}
                >
                    <Radio size={14} />
                    {characterState?.is_on_air ? "PGM" : "PVW"}
                </button>
            </div>

            {/* ─── 상태 인디케이터 ────────────────────────── */}
            {characterState?.preset_id && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 11, color: "var(--text-tertiary, #666)", padding: "0 2px",
                }}>
                    {characterState.is_on_air ? (
                        <>
                            <Eye size={12} style={{ color: "#ef4444" }} />
                            <span style={{ color: "#ef4444" }}>PGM + Renderer 송출 중</span>
                        </>
                    ) : (
                        <>
                            <EyeOff size={12} />
                            <span>PVW 프리뷰 중</span>
                        </>
                    )}
                </div>
            )}

            {/* ─── Rive 기본 컨트롤 ────────────────────────── */}
            {characterState?.preset_id && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 0",
                    borderBottom: "1px solid var(--border-secondary, #333)",
                }}>
                    <span style={{
                        fontSize: 10, color: "var(--text-tertiary, #666)",
                        marginRight: 4, whiteSpace: "nowrap",
                    }}>기본 컨트롤</span>
                    <button
                        onClick={() => sendRiveCommand("play")}
                        title="재생"
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: 6,
                            border: "1px solid var(--border-secondary, #333)",
                            background: "var(--bg-secondary, #1a1a1a)",
                            color: "#10b981", cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                    >
                        <Play size={13} fill="currentColor" />
                    </button>
                    <button
                        onClick={() => sendRiveCommand("pause")}
                        title="일시정지"
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: 6,
                            border: "1px solid var(--border-secondary, #333)",
                            background: "var(--bg-secondary, #1a1a1a)",
                            color: "#f59e0b", cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                    >
                        <Pause size={13} />
                    </button>
                    <button
                        onClick={() => sendRiveCommand("reset")}
                        title="리셋 (처음부터)"
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: 6,
                            border: "1px solid var(--border-secondary, #333)",
                            background: "var(--bg-secondary, #1a1a1a)",
                            color: "#6366f1", cursor: "pointer",
                            transition: "all 0.15s",
                        }}
                    >
                        <RotateCcw size={13} />
                    </button>
                </div>
            )}
            {activePreset && visibleProperties.length > 0 ? (
                <div style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    flex: 1, overflowY: "auto", padding: "4px 0",
                }}>
                    {visibleProperties.map((prop) => (
                        <PropertyControl
                            key={prop.name}
                            property={prop}
                            value={characterState?.vm_values?.[prop.name]}
                            onValueChange={(val) => updateVmValue(prop.name, val)}
                        />
                    ))}
                </div>
            ) : activePreset && visibleProperties.length === 0 ? (
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flex: 1, color: "var(--text-tertiary, #666)", fontSize: 12,
                }}>
                    <div style={{ textAlign: "center" }}>
                        <Bot size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                        <p>ViewModel 프로퍼티가 없습니다</p>
                        <p style={{ fontSize: 11, opacity: 0.7 }}>
                            대시보드에서 .riv 파일을 분석하세요
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flex: 1, color: "var(--text-tertiary, #666)", fontSize: 12,
                }}>
                    <div style={{ textAlign: "center" }}>
                        <Bot size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                        <p>캐릭터를 선택하세요</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── 프로퍼티 타입별 자동 UI 컨트롤 ─────────────────────────────

interface PropertyControlProps {
    property: RivePropertyInfo;
    value: any;
    onValueChange: (value: any) => void;
}

/** 프로퍼티 타입에 따라 적절한 UI 컨트롤을 자동 렌더링 */
function PropertyControl({ property, value, onValueChange }: PropertyControlProps) {
    const meta = TYPE_META[property.type] || TYPE_META.string;
    const displayLabel = property.label || property.name;

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            padding: "8px 10px", borderRadius: 8,
            background: "var(--bg-secondary, #1a1a1a)",
            border: "1px solid var(--border-secondary, #333)",
        }}>
            {/* 라벨 행 */}
            <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 2,
            }}>
                <span style={{ fontSize: 12 }}>{meta.icon}</span>
                <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: "var(--text-primary, #fff)", flex: 1,
                }}>
                    {displayLabel}
                </span>
                <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 4,
                    background: `${meta.color}20`, color: meta.color,
                }}>
                    {meta.label}
                </span>
            </div>

            {/* 타입별 컨트롤 */}
            {property.type === "trigger" && (
                <TriggerControl name={property.name} label={displayLabel} onFire={onValueChange} />
            )}
            {property.type === "string" && (
                <StringControl value={value ?? ""} onChange={onValueChange} />
            )}
            {property.type === "number" && (
                <NumberControl value={value ?? 0} onChange={onValueChange} />
            )}
            {property.type === "boolean" && (
                <BooleanControl value={!!value} onChange={onValueChange} />
            )}
            {property.type === "enum" && (
                <EnumControl
                    value={value ?? ""}
                    options={property.enumValues || []}
                    onChange={onValueChange}
                />
            )}
            {property.type === "color" && (
                <ColorControl value={value ?? 0xFF000000} onChange={onValueChange} />
            )}
        </div>
    );
}

// ─── Trigger 버튼 ───────────────────────────────────────────────

function TriggerControl({
    name: _name, label, onFire,
}: { name: string; label: string; onFire: (v: any) => void }) {
    const handleClick = () => {
        // 특수 시그널로 전송 → 렌더러에서 trigger() 실행
        onFire(`__trigger__${Date.now()}`);
    };

    return (
        <button
            onClick={handleClick}
            style={{
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b", fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseDown={(e) => {
                (e.target as HTMLElement).style.transform = "scale(0.95)";
            }}
            onMouseUp={(e) => {
                (e.target as HTMLElement).style.transform = "scale(1)";
            }}
        >
            ⚡ {label}
        </button>
    );
}

// ─── String 텍스트 입력 ─────────────────────────────────────────

function StringControl({
    value, onChange,
}: { value: string; onChange: (v: string) => void }) {
    const [draft, setDraft] = useState(value);

    // 외부 값 동기화
    useEffect(() => { setDraft(value); }, [value]);

    const handleSend = () => {
        if (draft.trim()) {
            onChange(draft.trim());
        }
    };

    return (
        <div style={{ display: "flex", gap: 4 }}>
            <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="텍스트 입력..."
                style={{
                    flex: 1, padding: "5px 8px", borderRadius: 6,
                    border: "1px solid var(--border-secondary, #444)",
                    background: "var(--bg-tertiary, #222)",
                    color: "var(--text-primary, #fff)", fontSize: 12,
                }}
            />
            <button
                onClick={handleSend}
                disabled={!draft.trim()}
                style={{
                    padding: "5px 10px", borderRadius: 6, border: "none",
                    background: draft.trim() ? "#3b82f6" : "var(--bg-tertiary, #333)",
                    color: "#fff", cursor: draft.trim() ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center",
                }}
            >
                <Send size={12} />
            </button>
        </div>
    );
}

// ─── Number 슬라이더 ────────────────────────────────────────────

function NumberControl({
    value, onChange,
}: { value: number; onChange: (v: number) => void }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
                type="range"
                min={-500}
                max={500}
                step={1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#8b5cf6" }}
            />
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{
                    width: 60, padding: "4px 6px", borderRadius: 4,
                    border: "1px solid var(--border-secondary, #444)",
                    background: "var(--bg-tertiary, #222)",
                    color: "var(--text-primary, #fff)", fontSize: 12,
                    textAlign: "center",
                }}
            />
        </div>
    );
}

// ─── Boolean 토글 ───────────────────────────────────────────────

function BooleanControl({
    value, onChange,
}: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 10px", borderRadius: 6,
                border: `1px solid ${value ? "#10b981" : "var(--border-secondary, #444)"}`,
                background: value ? "rgba(16, 185, 129, 0.1)" : "transparent",
                color: value ? "#10b981" : "var(--text-secondary, #999)",
                fontSize: 12, cursor: "pointer", transition: "all 0.2s",
                width: "100%", justifyContent: "center",
            }}
        >
            <div style={{
                width: 32, height: 16, borderRadius: 8,
                background: value ? "#10b981" : "#555",
                position: "relative", transition: "background 0.2s",
            }}>
                <div style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: "#fff", position: "absolute", top: 2,
                    left: value ? 18 : 2,
                    transition: "left 0.2s",
                }} />
            </div>
            {value ? "ON" : "OFF"}
        </button>
    );
}

// ─── Enum 드롭다운 ──────────────────────────────────────────────

function EnumControl({
    value, options, onChange,
}: { value: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
                padding: "5px 8px", borderRadius: 6,
                border: "1px solid var(--border-secondary, #444)",
                background: "var(--bg-tertiary, #222)",
                color: "var(--text-primary, #fff)", fontSize: 12,
                width: "100%",
            }}
        >
            <option value="">선택...</option>
            {options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    );
}

// ─── Color 피커 ─────────────────────────────────────────────────

function ColorControl({
    value, onChange,
}: { value: number; onChange: (v: number) => void }) {
    // Rive 색상: 0xAARRGGBB → HTML: #RRGGBB
    const hex = `#${((value >>> 0) & 0x00FFFFFF).toString(16).padStart(6, "0")}`;

    const handleChange = (hexStr: string) => {
        // HTML #RRGGBB → Rive 0xFFRRGGBB (불투명)
        const rgb = parseInt(hexStr.slice(1), 16);
        onChange(0xFF000000 + rgb);
    };

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
                type="color"
                value={hex}
                onChange={(e) => handleChange(e.target.value)}
                style={{
                    width: 32, height: 24, border: "none",
                    borderRadius: 4, cursor: "pointer",
                    background: "transparent",
                }}
            />
            <span style={{ fontSize: 11, color: "var(--text-tertiary, #888)", fontFamily: "monospace" }}>
                {hex.toUpperCase()}
            </span>
        </div>
    );
}

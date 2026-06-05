/**
 * AiCharacterLayer — Rive ViewModel 기반 AI 캐릭터 렌더러 레이어
 *
 * PVW/PGM/렌더러에 캐릭터를 투명 합성
 *   mode="preview" → preset 선택 중 + OFF 상태만 표시
 *   mode="pgm"     → is_on_air=true 일 때만 표시
 *
 * 구조:
 *   AiCharacterLayer (상태 관리 + 커맨드 수신)
 *     └─ RiveRenderer (useRive 훅 + VMI 바인딩)  ← key={riveKey}로 리마운트
 *
 * reset 시 riveKey를 증가시켜 RiveRenderer를 완전 언마운트/리마운트.
 * 이렇게 하면 useRive가 새 인스턴스를 생성하고 autoBind가 새 VMI를 바인딩.
 */

import { useEffect, useState, useRef, useCallback, memo } from "react";
import rivePkg from "@rive-app/react-canvas";
const { useRive } = rivePkg as any;
// ■ Why react-canvas?
//   OBS Browser Source의 CEF(Chromium Embedded Framework) 버전에 따라
//   WebGL2 컨텍스트 생성이 실패할 수 있음 (OBS 32.x CEF ~127).
//   Canvas2D 렌더러는 모든 CEF 버전에서 안정적으로 동작하며,
//   단일 캐릭터 애니메이션 수준에서는 성능 차이가 무시 가능.
//   이전: @rive-app/react-webgl2 (GPU 가속, CEF 호환성 불안정)
import { supabase } from "../../lib/supabase";
import type { AiCharacterState, AiCharacterPreset } from "../../lib/aiCharacterTypes";

// trigger 시그널 접두사 (__trigger__ + timestamp)
const TRIGGER_PREFIX = "__trigger__";

// ─── 내부 Rive 렌더러 컴포넌트 ──────────────────────────────
// key={riveKey}로 완전 리마운트 → useRive 재초기화 → autoBind 새 VMI
interface RiveRendererProps {
    rivUrl: string;
    stateMachineName: string;
    vmValues: Record<string, any> | null;
    riveRef: React.MutableRefObject<any>;
}

const RiveRenderer = memo(function RiveRenderer({
    rivUrl,
    stateMachineName,
    vmValues,
    riveRef,
}: RiveRendererProps) {
    const prevVmValuesRef = useRef<Record<string, any>>({});

    const { rive, RiveComponent } = useRive({
        src: rivUrl,
        stateMachines: stateMachineName,
        autoplay: true,
        automaticallyHandleEvents: true,
        autoBind: true,
        // ■ 로드 성공/실패 로깅 — SilentErrorBoundary가 에러를 삼키기 때문에
        //   여기서 명시적으로 로그를 남겸야 디버깅 가능
        onLoad: () => console.log("[RiveRenderer] ✅ Rive 파일 로드 성공:", rivUrl),
        onLoadError: (err: any) => console.error("[RiveRenderer] ❌ Rive 파일 로드 실패:", rivUrl, err),
    });

    // 부모 컴포넌트에서 접근할 수 있도록 ref 동기화
    riveRef.current = rive;

    // VMI 바인딩 완료 여부 추적
    const vmiReadyRef = useRef(false);

    // ─── ViewModel 값 적용 ──────────────────────────────────
    useEffect(() => {
        if (!rive || !vmValues) return;

        // VMI에 값을 적용하는 내부 함수
        const apply = () => {
            try {
                const vmi = (rive as any).viewModelInstance;
                if (!vmi) {
                    console.warn("[RiveRenderer] VMI 없음 - autoBind 미완료");
                    return;
                }
                vmiReadyRef.current = true;

                const prevValues = prevVmValuesRef.current;

                for (const [key, value] of Object.entries(vmValues)) {
                    try {
                        if (typeof value === "string" && value.startsWith(TRIGGER_PREFIX)) {
                            if (prevValues[key] !== value) {
                                const prop = vmi.trigger(key);
                                if (prop) prop.trigger();
                            }
                        } else if (typeof value === "boolean") {
                            const prop = vmi.boolean(key);
                            if (prop) prop.value = value;
                        } else if (typeof value === "number") {
                            const prop = vmi.number(key);
                            if (prop) prop.value = value;
                        } else if (typeof value === "string") {
                            const prop = vmi.string(key);
                            if (prop) prop.value = value;
                        }
                    } catch (propErr) {
                        console.warn(`[RiveRenderer] 프로퍼티 ${key} 적용 실패:`, propErr);
                    }
                }

                prevVmValuesRef.current = { ...vmValues };
            } catch (err) {
                console.error("[RiveRenderer] ViewModel 적용 실패:", err);
            }
        };

        if (vmiReadyRef.current) {
            // VMI가 이미 준비됨 → 즉시 적용 (슬라이더 반응성 유지)
            apply();
        } else {
            // 초기 마운트 → autoBind 완료 대기 후 적용
            const timer = setTimeout(apply, 100);
            return () => clearTimeout(timer);
        }
    }, [rive, vmValues]);

    return (
        <div
            className="ai-character-sprite"
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
            }}
        >
            <RiveComponent
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
});

// ─── 메인 레이어 ─────────────────────────────────────────────
interface AiCharacterLayerProps {
    sessionId: string;
    mode?: "preview" | "pgm"; // 기본: pgm
}

export function AiCharacterLayer({
    sessionId,
    mode = "pgm",
}: AiCharacterLayerProps) {
    const [characterState, setCharacterState] = useState<AiCharacterState | null>(null);
    const [preset, setPreset] = useState<AiCharacterPreset | null>(null);
    const [rivUrl, setRivUrl] = useState<string | null>(null);
    // reset 시 증가 → RiveRenderer 컴포넌트 완전 리마운트
    const [riveKey, setRiveKey] = useState(0);

    // 최신 preset.id 추적 (Realtime 콜백 stale closure 방지)
    const presetIdRef = useRef<string | null>(null);
    // Rive 인스턴스 ref (커맨드 핸들러에서 사용)
    const riveRef = useRef<any>(null);

    // ─── 프리셋에서 상태 머신 이름 추출 (fallback: "Motion") ────
    const stateMachineName = preset?.rive_analysis?.stateMachines?.[0] ?? "Motion";

    // ─── 프리셋 → rivUrl 헬퍼 ─────────────────────────────────
    const loadPresetAndUrl = useCallback(async (presetId: string) => {
        try {
            const { data: presetData } = await supabase
                .from("ai_character_presets")
                .select("*")
                .eq("id", presetId)
                .single();
            if (!presetData) return;
            setPreset(presetData as unknown as AiCharacterPreset);
            presetIdRef.current = presetData.id;
            const { data: urlData } = supabase.storage
                .from("characters")
                .getPublicUrl(presetData.riv_file_path);
            if (urlData?.publicUrl) setRivUrl(urlData.publicUrl);
        } catch (err) {
            console.error("[AiCharacterLayer] 프리셋 로드 실패:", err);
        }
    }, []);

    // ─── 초기 상태 로드 ──────────────────────────────────────
    useEffect(() => {
        if (!sessionId) return;

        const loadState = async () => {
            try {
                const { data, error } = await supabase
                    .from("ai_character_state")
                    .select("*, ai_character_presets(*)")
                    .eq("session_id", sessionId)
                    .maybeSingle();

                // ■ 디버깅: 초기 로드 결과 전체를 로그로 출력
                console.log("[AiCharacterLayer] 초기 로드:", {
                    hasData: !!data,
                    hasError: !!error,
                    error: error?.message,
                    visible: data?.visible,
                    is_on_air: data?.is_on_air,
                    preset_id: data?.preset_id,
                    // ■ 이 값이 null이면 RLS 정책이 프리셋 접근을 차단한 것
                    hasPresets: !!data?.ai_character_presets,
                });

                if (error || !data) return;
                setCharacterState(data as unknown as AiCharacterState);

                if (data.ai_character_presets) {
                    setPreset(data.ai_character_presets as unknown as AiCharacterPreset);
                    presetIdRef.current = data.ai_character_presets.id;
                    const { data: urlData } = supabase.storage
                        .from("characters")
                        .getPublicUrl(data.ai_character_presets.riv_file_path);
                    console.log("[AiCharacterLayer] Rive URL:", urlData?.publicUrl);
                    if (urlData?.publicUrl) setRivUrl(urlData.publicUrl);
                } else {
                    // ■ 프리셋이 null → RLS 정책이 비인증 접근을 차단 중
                    console.warn("[AiCharacterLayer] ⚠️ ai_character_presets가 null — RLS 정책 확인 필요");
                }
            } catch (err) {
                console.error("[AiCharacterLayer] 초기 로드 실패:", err);
            }
        };

        loadState();
    }, [sessionId]);

    // ─── 상태 변경 수신 (CustomEvent + Supabase Broadcast) ────────
    const handleStateChange = useCallback(async (newState: AiCharacterState) => {
        setCharacterState(newState);

        if (newState.preset_id && newState.preset_id !== presetIdRef.current) {
            await loadPresetAndUrl(newState.preset_id);
        } else if (!newState.preset_id) {
            setPreset(null);
            presetIdRef.current = null;
            setRivUrl(null);
        }
    }, [loadPresetAndUrl]);

    useEffect(() => {
        if (!sessionId) return;

        // 같은 페이지에서 Panel의 CustomEvent 수신 (상태 변경)
        const onCustomEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.sessionId === sessionId && detail?.state) {
                handleStateChange(detail.state);
            }
        };
        window.addEventListener("ai-character-state-change", onCustomEvent);

        // 같은 페이지에서 Panel의 커맨드 수신 (play/pause/reset)
        const onCommand = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.sessionId === sessionId && detail?.command) {
                switch (detail.command) {
                    case "play": riveRef.current?.play(); break;
                    case "pause": riveRef.current?.pause(); break;
                    case "reset":
                        // RiveRenderer를 완전 리마운트하여 모든 상태 초기화
                        // → useRive 재초기화 → autoBind 새 VMI 생성
                        // → vm_values useEffect가 자동으로 재실행됨
                        setRiveKey((k) => k + 1);
                        break;
                }
            }
        };
        window.addEventListener("ai-character-command", onCommand);

        // 렌더러(다른 페이지)에서 Supabase Broadcast 수신
        const channel = supabase
            .channel(`ai-char-sync:${sessionId}`)
            .on("broadcast", { event: "state-change" }, (payload: any) => {
                if (payload.payload) {
                    handleStateChange(payload.payload as AiCharacterState);
                }
            })
            .on("broadcast", { event: "rive-command" }, (payload: any) => {
                if (payload.payload?.command) {
                    switch (payload.payload.command) {
                        case "play": riveRef.current?.play(); break;
                        case "pause": riveRef.current?.pause(); break;
                        case "reset":
                            setRiveKey((k) => k + 1);
                            break;
                    }
                }
            })
            .subscribe();

        // DB 직접 구독 (postgres_changes) — Broadcast 실패 시에도 확실한 동기화
        const dbChannel = supabase
            .channel(`ai-char-db:${sessionId}`)
            .on(
                "postgres_changes" as any,
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "ai_character_state",
                    filter: `session_id=eq.${sessionId}`,
                },
                (payload: any) => {
                    if (payload.new) {
                        handleStateChange(payload.new as AiCharacterState);
                    }
                },
            )
            .subscribe();

        return () => {
            window.removeEventListener("ai-character-state-change", onCustomEvent);
            window.removeEventListener("ai-character-command", onCommand);
            channel.unsubscribe();
            dbChannel.unsubscribe();
        };
    }, [sessionId, mode, handleStateChange]);

    // ─── 가시성 판단 ─────────────────────────────────────────
    // PVW: 선택 중 + OFF 상태만 표시, PGM: ON AIR만 표시 (배타적)
    const shouldShow = (() => {
        if (!characterState?.preset_id || !characterState?.visible) return false;
        if (mode === "preview") return !characterState.is_on_air;
        return characterState.is_on_air;
    })();

    if (!shouldShow || !rivUrl) return null;

    // zone_bounds: 프리셋에 저장된 배치 영역 (calculateCombinedBounds는 px 단위 반환)
    const zbRaw = preset?.zone_bounds as { x: number; y: number; width: number; height: number } | null | undefined;
    // px 단위를 % 단위로 변환 (캔버스 1920x1080 기준)
    const CANVAS_W = 1920;
    const CANVAS_H = 1080;
    const zb = zbRaw && typeof zbRaw.x === "number" && zbRaw.width > 0 ? {
        x: (zbRaw.x / CANVAS_W) * 100,
        y: (zbRaw.y / CANVAS_H) * 100,
        width: (zbRaw.width / CANVAS_W) * 100,
        height: (zbRaw.height / CANVAS_H) * 100,
    } : null;

    return (
        <div
            className="ai-character-layer"
            style={{
                // ■ Why 인라인으로 position/inset을 명시?
                //   CSS .ai-character-layer에 inset:0이 있어서
                //   zone_bounds 사용 시 left/top/width/height와 충돌함.
                //   인라인 스타일이 CSS보다 우선하므로 여기서 완전히 제어.
                position: "absolute",
                zIndex: 100,
                pointerEvents: "none",
                overflow: "hidden",
                ...(zb ? {
                    left: `${zb.x}%`,
                    top: `${zb.y}%`,
                    width: `${zb.width}%`,
                    height: `${zb.height}%`,
                    // inset: 0 대신 개별 설정으로 충돌 방지
                    right: "auto",
                    bottom: "auto",
                } : {
                    inset: 0,
                }),
            }}
        >
            <RiveRenderer
                key={`rive-${riveKey}`}
                rivUrl={rivUrl}
                stateMachineName={stateMachineName}
                vmValues={characterState?.vm_values ?? null}
                riveRef={riveRef}
            />
        </div>
    );
}

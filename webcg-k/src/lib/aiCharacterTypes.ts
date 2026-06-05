/**
 * AI 캐릭터 시스템 타입 정의
 * Rive Data Binding (ViewModel) 기반
 *
 * .riv 파일 업로드 시 ViewModel 프로퍼티를 자동 분석하고,
 * 프로퍼티 타입에 따라 컨트롤러에서 적절한 UI 컨트롤을 자동 생성
 */

// ─── .riv 파일 분석 결과 ────────────────────────────────────────

/** Rive ViewModel 프로퍼티 타입 */
export type RivePropertyType =
    | "string"
    | "number"
    | "boolean"
    | "color"
    | "trigger"
    | "enum"
    | "image"
    | "list";

/** Rive ViewModel 프로퍼티 정보 */
export interface RivePropertyInfo {
    name: string;            // ViewModel 프로퍼티 이름 (Rive 에디터에서 정의)
    type: RivePropertyType;
    label?: string;          // 한글 라벨 (대시보드에서 편집, 예: "말풍선 텍스트")
    hidden?: boolean;        // true면 컨트롤러에서 숨김
    order?: number;          // 컨트롤러 UI 정렬 순서
    enumValues?: string[];   // enum 타입일 때 선택 가능한 값 목록
    viewModelRef?: string;   // list 항목의 ViewModel 이름 (list 타입일 때)
}

/** 개별 ViewModel 분석 결과 */
export interface RiveViewModelInfo {
    name: string;                      // ViewModel 이름
    properties: RivePropertyInfo[];    // 해당 VM의 프로퍼티 목록
    isDefault?: boolean;               // 기본(아트보드에 바인딩된) ViewModel 여부
}

/** .riv 파일 분석 결과 (프리셋에 JSON으로 저장) */
export interface RiveAnalysis {
    artboards: string[];               // 아트보드 목록
    artboardSize?: { width: number; height: number }; // 기본 아트보드 크기
    stateMachines: string[];           // 상태 머신 이름 목록
    viewModels: RiveViewModelInfo[];   // 모든 ViewModel 분석 결과
    viewModelName: string | null;      // 기본 ViewModel 이름 (하위 호환)
    properties: RivePropertyInfo[];    // 기본 VM의 프로퍼티 (하위 호환, flat 목록)
    analyzedAt: string;                // 분석 시각 (ISO)
}

// ─── 액션 버튼 매핑 (레거시 호환, 점진적 폐기 예정) ──────────────

/** 액션 타입: ViewModel 프로퍼티에 대해 수행할 동작 */
export type CharacterActionType =
    | { type: "trigger" }                       // Trigger: fire()
    | { type: "toggle" }                        // Boolean: true↔false
    | { type: "set"; value: any }               // 특정 값으로 설정
    | { type: "cycle"; values: any[] };          // 값 순환 (다음 값으로)

/** 프리셋에 저장되는 액션 버튼 매핑 (레거시) */
export interface CharacterActionMapping {
    id: string;
    label: string;
    icon?: string;
    propertyName: string;
    propertyType: RivePropertyType;
    action: CharacterActionType;
}

// ─── 캐릭터 프리셋 (DB: ai_character_presets) ───────────────────

/** Zone 배치 영역 (overlayTypes.ZoneBounds와 동일 구조) */
export interface CharacterZoneBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AiCharacterPreset {
    id: string;
    owner_id: string;
    name: string;
    description: string | null;
    riv_file_path: string;              // Supabase Storage 경로
    rive_analysis: RiveAnalysis | null; // .riv 파일 분석 결과
    action_mappings: CharacterActionMapping[]; // 레거시 호환
    grid_template_id: string | null;    // 그리드 템플릿 참조
    zone_bounds: CharacterZoneBounds | null; // 선택된 Zone 결합 영역
    created_at: string;
}

// ─── 세션별 캐릭터 상태 (DB: ai_character_state) ────────────────

export interface AiCharacterState {
    id: string;
    session_id: string;
    preset_id: string | null;           // 현재 선택된 프리셋
    is_on_air: boolean;                 // false=PVW만, true=PGM+렌더러
    vm_values: Record<string, any>;     // ViewModel 프로퍼티 현재값
    visible: boolean;                   // 캐릭터 표시 여부
    updated_at: string;
}

// ─── 기본 상태 ──────────────────────────────────────────────────

export const DEFAULT_CHARACTER_STATE: Omit<
    AiCharacterState,
    "id" | "session_id" | "updated_at"
> = {
    preset_id: null,
    is_on_air: false,
    vm_values: {},
    visible: false,
};

/**
 * AI 큐시트 Wizard 상태 Reducer (Phase 2)
 *
 * 10개로 파편화된 useState를 단일 useReducer로 중앙화.
 * 모든 상태 전이는 명시적 Action 타입으로 추적 가능.
 */

import type {
  CuesheetWizardStep,
  CuesheetWizardState,
  ParseResult,
  SceneContent,
  TextSlot,
  SceneGraphicState,
  ExtractedTheme,
} from "@/lib/aiCuesheetTypes";

// ─── Action Types ─────────────────────────────────────────────────

export type WizardAction =
  | { type: "SET_STEP"; step: CuesheetWizardStep }
  | { type: "VISIT_STEP"; step: CuesheetWizardStep }
  | { type: "SET_SOURCE_MATERIAL"; value: string }
  | { type: "SET_RAW_JSON"; value: string }
  | { type: "SET_PARSE_RESULT"; result: ParseResult | null }
  | { type: "SET_SESSION_ID"; id: string | null }
  | { type: "INIT_GRAPHIC_STATES"; sceneCount: number }
  | { type: "UPDATE_GRAPHIC_STATE"; sceneIdx: number; patch: Partial<SceneGraphicState> }
  | { type: "EXTRACT_THEME"; id: string; theme: ExtractedTheme }
  | { type: "RESTORE_SESSION"; data: Partial<CuesheetWizardState> }
  // Scene/Slot editing (문제 1)
  | { type: "UPDATE_SLOT"; sceneIdx: number; slotIdx: number; patch: Partial<TextSlot> }
  | { type: "UPDATE_SCENE"; sceneIdx: number; patch: Partial<SceneContent> }
  | { type: "ADD_SLOT"; sceneIdx: number }
  | { type: "REMOVE_SLOT"; sceneIdx: number; slotIdx: number }
  | { type: "ADD_SCENE" }
  | { type: "REMOVE_SCENE"; sceneIdx: number };

// ─── Initial State Factory ────────────────────────────────────────

export function createInitialState(mode: "manual" | "api", systemPrompt: string): CuesheetWizardState {
  return {
    sessionId: null,
    mode,
    step: mode === "manual" ? "system-prompt" : "source-input",
    visitedSteps: [],
    sourceMaterial: "",
    systemPrompt,
    rawJson: "",
    parseResult: null,
    graphicStates: [],
    extractedThemes: {},
  };
}

// ─── Reducer ──────────────────────────────────────────────────────

export function wizardReducer(state: CuesheetWizardState, action: WizardAction): CuesheetWizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    case "VISIT_STEP":
      if (state.visitedSteps.includes(action.step)) return state;
      return { ...state, visitedSteps: [...state.visitedSteps, action.step] };

    case "SET_SOURCE_MATERIAL":
      return { ...state, sourceMaterial: action.value };

    case "SET_RAW_JSON":
      return { ...state, rawJson: action.value };

    case "SET_PARSE_RESULT":
      return { ...state, parseResult: action.result };

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.id };

    case "INIT_GRAPHIC_STATES":
      return {
        ...state,
        graphicStates: Array.from({ length: action.sceneCount }, (_, i) => ({
          sceneIndex: i,
          status: "idle" as const,
        })),
      };

    case "UPDATE_GRAPHIC_STATE":
      return {
        ...state,
        graphicStates: state.graphicStates.map((gs, i) =>
          i === action.sceneIdx ? { ...gs, ...action.patch } : gs,
        ),
      };

    case "EXTRACT_THEME":
      return {
        ...state,
        extractedThemes: { ...state.extractedThemes, [action.id]: action.theme },
      };

    // ─── Scene/Slot editing (문제 1) ────────────────────

    case "UPDATE_SLOT": {
      if (!state.parseResult?.cuesheet) return state;
      const scenes = state.parseResult.cuesheet.scenes.map((s, si) => {
        if (si !== action.sceneIdx) return s;
        return {
          ...s,
          text_slots: s.text_slots.map((slot, sj) =>
            sj === action.slotIdx ? { ...slot, ...action.patch } : slot,
          ),
        };
      });
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    case "UPDATE_SCENE": {
      if (!state.parseResult?.cuesheet) return state;
      const scenes = state.parseResult.cuesheet.scenes.map((s, si) =>
        si === action.sceneIdx ? { ...s, ...action.patch } : s,
      );
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    case "ADD_SLOT": {
      if (!state.parseResult?.cuesheet) return state;
      const scenes = state.parseResult.cuesheet.scenes.map((s, si) => {
        if (si !== action.sceneIdx) return s;
        const newSlot: TextSlot = {
          id: `scene-${s.order}-slot-${s.text_slots.length + 1}`,
          semantic_role: "subtitle", value: "", source_value: "", display_value: "", importance: 3,
          zone_hint: s.text_slots[0]?.zone_hint ?? "bottom_bar",
          style_hint: "normal",
        };
        return { ...s, text_slots: [...s.text_slots, newSlot] };
      });
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    case "REMOVE_SLOT": {
      if (!state.parseResult?.cuesheet) return state;
      const scenes = state.parseResult.cuesheet.scenes.map((s, si) => {
        if (si !== action.sceneIdx) return s;
        return { ...s, text_slots: s.text_slots.filter((_, sj) => sj !== action.slotIdx) };
      });
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    case "ADD_SCENE": {
      if (!state.parseResult?.cuesheet) return state;
      const maxOrder = state.parseResult.cuesheet.scenes.reduce(
        (max, s) => Math.max(max, s.order), 0,
      );
      const newScene: SceneContent = {
        order: maxOrder + 1,
        graphic_type: "explainer_caption",
        trigger: "새 장면",
        graphic_intent: "",
        duration: 15,
        text_slots: [{ id: `scene-${maxOrder + 1}-slot-1`, semantic_role: "subtitle", value: "", source_value: "", display_value: "", importance: 3, zone_hint: "bottom_bar", style_hint: "normal" }],
      };
      const scenes = [...state.parseResult.cuesheet.scenes, newScene];
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    case "REMOVE_SCENE": {
      if (!state.parseResult?.cuesheet) return state;
      const scenes = state.parseResult.cuesheet.scenes.filter((_, si) => si !== action.sceneIdx);
      if (scenes.length === 0) return state; // 마지막 씬은 삭제 불가
      const cuesheet = { ...state.parseResult.cuesheet, scenes };
      return {
        ...state,
        rawJson: JSON.stringify(cuesheet, null, 2),
        parseResult: { ...state.parseResult!, cuesheet, errors: [], warnings: [] },
      };
    }

    // ─── Restore ─────────────────────────────────────

    case "RESTORE_SESSION":
      return { ...state, ...action.data };

    default:
      return state;
  }
}

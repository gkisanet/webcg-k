import { useCallback, useReducer, useState } from "react";
import type { SetStateAction } from "react";
import type {
  DashboardSchema,
  PluginSourceCode,
} from "../../../../lib/overlayTypes";
import { DEFAULT_CSS, DEFAULT_HTML, DEFAULT_JS, DEFAULT_SCHEMA } from "../defaults";

export type EditorTab = "html" | "css" | "js" | "schema";

const MAX_CODE_HISTORY = 80;

interface CodeHistoryState {
  present: PluginSourceCode;
  past: PluginSourceCode[];
  future: PluginSourceCode[];
}

type CodeHistoryAction =
  | { type: "set"; value: SetStateAction<PluginSourceCode> }
  | { type: "undo" }
  | { type: "redo" };

function isSameCode(a: PluginSourceCode, b: PluginSourceCode) {
  return a.html === b.html && a.css === b.css && a.js === b.js;
}

function trimHistory(history: PluginSourceCode[]) {
  return history.length > MAX_CODE_HISTORY ? history.slice(history.length - MAX_CODE_HISTORY) : history;
}

function codeHistoryReducer(state: CodeHistoryState, action: CodeHistoryAction): CodeHistoryState {
  if (action.type === "set") {
    const next = typeof action.value === "function"
      ? action.value(state.present)
      : action.value;
    if (isSameCode(state.present, next)) return state;
    return {
      present: next,
      past: trimHistory([...state.past, state.present]),
      future: [],
    };
  }

  if (action.type === "undo") {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      present: previous,
      past: state.past.slice(0, -1),
      future: trimHistory([state.present, ...state.future]),
    };
  }

  const next = state.future[0];
  if (!next) return state;
  return {
    present: next,
    past: trimHistory([...state.past, state.present]),
    future: state.future.slice(1),
  };
}

export function usePluginCode(
  initialCode?: PluginSourceCode,
  initialSchema?: DashboardSchema | null,
  initialDefaults?: Record<string, unknown> | null,
) {
  const [activeTab, setActiveTab] = useState<EditorTab>("html");
  const [codeHistory, dispatchCodeHistory] = useReducer(codeHistoryReducer, {
    present: initialCode || { html: DEFAULT_HTML, css: DEFAULT_CSS, js: DEFAULT_JS },
    past: [],
    future: [],
  });
  const code = codeHistory.present;
  const setCode = useCallback((value: SetStateAction<PluginSourceCode>) => {
    dispatchCodeHistory({ type: "set", value });
  }, []);
  const undoCode = useCallback(() => {
    dispatchCodeHistory({ type: "undo" });
  }, []);
  const redoCode = useCallback(() => {
    dispatchCodeHistory({ type: "redo" });
  }, []);
  const [schema, setSchema] = useState<DashboardSchema | null>(
    initialSchema || DEFAULT_SCHEMA,
  );

  const handleSchemaChange = useCallback((newSchema: DashboardSchema) => {
    setSchema(newSchema);
    const defaults: Record<string, unknown> = {};
    if (newSchema?.properties) {
      for (const [key, prop] of Object.entries(newSchema.properties)) {
        defaults[key] = prop.default ?? "";
      }
    }
    setTestData((prev) => {
      const next: Record<string, unknown> = {};
      for (const key of Object.keys(newSchema.properties || {})) {
        next[key] = key in prev ? prev[key] : (defaults[key] ?? "");
      }
      return next;
    });
  }, []);

  const [testData, setTestData] = useState<Record<string, unknown>>(() => {
    if (initialDefaults) return { ...initialDefaults };
    const effectiveSchema = initialSchema || DEFAULT_SCHEMA;
    const defaults: Record<string, unknown> = {};
    if (effectiveSchema?.properties) {
      for (const [key, prop] of Object.entries(effectiveSchema.properties)) {
        defaults[key] = prop.default ?? "";
      }
    }
    return defaults;
  });

  return {
    activeTab,
    setActiveTab,
    code,
    setCode,
    undoCode,
    redoCode,
    canUndoCode: codeHistory.past.length > 0,
    canRedoCode: codeHistory.future.length > 0,
    schema,
    setSchema,
    handleSchemaChange,
    testData,
    setTestData,
  };
}

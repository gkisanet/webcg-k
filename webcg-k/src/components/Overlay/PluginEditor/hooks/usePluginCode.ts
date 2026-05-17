import { useCallback, useState } from "react";
import type {
  DashboardSchema,
  PluginSourceCode,
} from "../../../../lib/overlayTypes";
import { DEFAULT_CSS, DEFAULT_HTML, DEFAULT_JS, DEFAULT_SCHEMA } from "../defaults";

export type EditorTab = "html" | "css" | "js" | "schema";

export function usePluginCode(
  initialCode?: PluginSourceCode,
  initialSchema?: DashboardSchema | null,
  initialDefaults?: Record<string, unknown> | null,
) {
  const [activeTab, setActiveTab] = useState<EditorTab>("html");
  const [code, setCode] = useState<PluginSourceCode>(
    initialCode || { html: DEFAULT_HTML, css: DEFAULT_CSS, js: DEFAULT_JS },
  );
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
    schema,
    setSchema,
    handleSchemaChange,
    testData,
    setTestData,
  };
}

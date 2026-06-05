import type { DashboardSchema } from "../../../../lib/overlayTypes";
import { DashboardField } from "./DashboardField";
import { Code } from "lucide-react";

export function DashboardPanel({
  schema,
  testData,
  onTestDataChange,
}: {
  schema: DashboardSchema | null;
  testData: Record<string, unknown>;
  onTestDataChange: (key: string, value: unknown) => void;
}) {
  return (
    <div style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}>
      {schema?.properties &&
        Object.entries(schema.properties).map(([key, prop]) => (
          <DashboardField
            key={key}
            prop={prop}
            value={testData[key]}
            onChange={(val) => onTestDataChange(key, val)}
          />
        ))}
      {(!schema?.properties || Object.keys(schema.properties).length === 0) && (
        <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-tertiary, #666)", fontSize: "12px" }}>
          <Code size={20} style={{ opacity: 0.3 }} />
          <p>대시보드 스키마가 정의되지 않았습니다</p>
        </div>
      )}
    </div>
  );
}

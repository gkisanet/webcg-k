import type { DashboardSchemaProperty } from "../../../../lib/overlayTypes";

/** 색상으로 보이는 string 필드를 탐지 (hex 값 또는 색상 키워드 기반) */
function isColorLikeField(prop: DashboardSchemaProperty, value: unknown): boolean {
  if (prop.type === "color") return true;
  if (prop.type !== "string") return false;
  const title = (prop.title || "").toLowerCase();
  const keywords = ["color", "colour", "색", "fill", "bg", "background", "gradient", "그레디언트", "border", "stroke"];
  if (keywords.some((k) => title.includes(k))) return true;
  const val = String(value || "");
  if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(val)) return true;
  return false;
}

const numBtn: React.CSSProperties = {
  width: "28px", height: "28px",
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "1px solid var(--border-default, #333)",
  borderRadius: "6px",
  background: "var(--app-bg-muted, #111)",
  color: "var(--text-primary, #fff)",
  fontSize: "16px", fontWeight: 600, cursor: "pointer",
};

const toggleBtn: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid",
  borderRadius: "4px",
  fontSize: "11px", fontWeight: 600, cursor: "pointer", color: "#fff",
};

export function DashboardField({
  prop,
  value,
  onChange,
}: {
  prop: DashboardSchemaProperty;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const containerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", color: "var(--text-tertiary, #888)", fontWeight: 500,
    width: "35%", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: "4px 8px", borderRadius: "4px",
    border: "1px solid var(--border-default, #333)",
    background: "var(--app-bg, #0a0a0f)", color: "var(--text-primary, #fff)",
    fontSize: "12px", outline: "none",
  };

  switch (prop.type) {
    case "number":
      return (
        <div style={containerStyle}>
          <label style={labelStyle} title={prop.title}>{prop.title}</label>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
            <button type="button" onClick={() => onChange(Math.max(prop.min ?? -Infinity, ((value as number) || 0) - 1))} style={numBtn}>−</button>
            <input
              type="number" value={String(value ?? 0)}
              min={prop.min} max={prop.max} step={prop.step || 1}
              onChange={(e) => onChange(Number(e.target.value) || 0)}
              style={{ ...inputStyle, textAlign: "center", flex: 1 }}
            />
            <button type="button" onClick={() => onChange(Math.min(prop.max ?? Infinity, ((value as number) || 0) + 1))} style={numBtn}>+</button>
          </div>
        </div>
      );
    case "boolean":
      return (
        <div style={containerStyle}>
          <label style={labelStyle} title={prop.title}>{prop.title}</label>
          <button
            type="button" onClick={() => onChange(!value)}
            style={{
              ...toggleBtn, flex: 1, padding: "4px 8px",
              background: value ? "rgba(16,185,129,0.3)" : "rgba(100,100,100,0.3)",
              borderColor: value ? "rgba(16,185,129,0.5)" : "rgba(100,100,100,0.3)",
            }}
          >
            {value ? "ON" : "OFF"}
          </button>
        </div>
      );
    case "color":
      return (
        <div style={containerStyle}>
          <label style={labelStyle} title={prop.title}>{prop.title}</label>
          <input
            type="color" value={String(value || "#ffffff")}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, height: "26px", padding: "0" }}
          />
        </div>
      );
    case "select":
      return (
        <div style={containerStyle}>
          <label style={labelStyle} title={prop.title}>{prop.title}</label>
          <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
            {prop.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    case "string":
    default:
      if (prop.enum && prop.enum.length > 0) {
        return (
          <div style={containerStyle}>
            <label style={labelStyle} title={prop.title}>{prop.title}</label>
            <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
              {prop.enum.map((opt) => (<option key={String(opt)} value={String(opt)}>{opt}</option>))}
            </select>
          </div>
        );
      }
      // 색상으로 보이는 string 필드 → color picker + hex text
      if (isColorLikeField(prop, value)) {
        return (
          <div style={containerStyle}>
            <label style={labelStyle} title={prop.title}>{prop.title}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
              <input
                type="color"
                value={String(value || "#ffffff")}
                onChange={(e) => onChange(e.target.value)}
                style={{ ...inputStyle, width: "32px", height: "26px", padding: "2px", flex: "none", cursor: "pointer" }}
              />
              <input
                type="text"
                value={String(value ?? "")}
                onChange={(e) => onChange(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>
        );
      }
      return (
        <div style={containerStyle}>
          <label style={labelStyle} title={prop.title}>{prop.title}</label>
          <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        </div>
      );
  }
}

import { useMemo } from "react";

export function VizNumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const isKeyword = /^(auto|inherit|unset|initial|none|normal)$/.test(value);
  const isComplex = /^(calc|var|min|max|clamp)\(/.test(value);
  const showNumber = !isKeyword && !isComplex;
  const num = parseFloat(value) || 0;
  const unit = String(value).replace(/^[\d.-]+/, "") || "px";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <label style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>{label}</label>
      <div style={{ display: "flex", gap: "4px" }}>
        {showNumber ? (
          <><input
            type="number"
            value={num}
            step={1}
            onChange={(e) => onChange(e.target.value + unit)}
            style={{
              flex: 1, padding: "4px 6px", borderRadius: "4px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.3)", color: "#e2e8f0",
              fontSize: "12px", outline: "none",
            }}
          />
          <span style={{ fontSize: "11px", color: "#64748b", alignSelf: "center" }}>{unit}</span></>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              flex: 1, padding: "4px 6px", borderRadius: "4px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(0,0,0,0.3)",
              color: isComplex ? "#fbbf24" : "#94a3b8",
              fontSize: "11px", fontFamily: "monospace", outline: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

export function VizTextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <label style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "4px 6px", borderRadius: "4px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.3)", color: "#e2e8f0",
          fontSize: "12px", outline: "none",
        }}
      />
    </div>
  );
}

export function VizColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const hexFromRgb = (v: string) => {
    const m = /rgb[a]?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
    if (!m) return "#ffffff";
    return "#" + [m[1], m[2], m[3]].map((x) => parseInt(x).toString(16).padStart(2, "0")).join("");
  };
  const displayValue = value && value.startsWith("rgb") ? hexFromRgb(value) : (value || "#ffffff");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <label style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>{label}</label>
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input
          type="color"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "28px", height: "28px", padding: 0,
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px",
            background: "transparent", cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1, padding: "4px 6px", borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(0,0,0,0.3)", color: "#e2e8f0",
            fontSize: "11px", outline: "none", fontFamily: "monospace",
          }}
        />
      </div>
    </div>
  );
}

export function RootVarsPanel({ cssText, onChange }: { cssText: string; onChange: (name: string, value: string) => void }) {
  const vars = useMemo(() => {
    const map: Record<string, string> = {};
    const m = cssText.match(/:root\s*\{([^}]*)\}/);
    if (!m) return map;
    const re = /--([\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = re.exec(m[1])) !== null) {
      map["--" + match[1]] = match[2].trim();
    }
    return map;
  }, [cssText]);

  const entries = Object.entries(vars);
  if (entries.length === 0) return <div style={{ fontSize: "10px", color: "#64748b", fontStyle: "italic" }}>No :root CSS variables found</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
      {entries.map(([name, value]) => {
        const isColor = /^#|^rgb|^hsl/.test(value);
        return (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {isColor && (
              <div style={{ width: "22px", height: "22px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)", background: value, flexShrink: 0, position: "relative", overflow: "hidden" }}>
                <input
                  type="color"
                  value={/^#/.test(value) ? value : value.replace(/^rgba?\(([^)]+)\)$/, (_, v) => { const p = v.split(/[,\s]+/).filter(Boolean).map(Number); if (p.length < 3) return value; const h = (n: number) => Math.round(n).toString(16).padStart(2, "0"); return "#" + h(p[0]) + h(p[1]) + h(p[2]); })}
                  onChange={(e) => onChange(name, e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                />
              </div>
            )}
            <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#a78bfa", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(name, e.target.value)}
              style={{
                width: "200px", flexShrink: 0, padding: "2px 6px", borderRadius: "4px",
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)",
                color: "#e2e8f0", fontSize: "10px", fontFamily: "monospace", outline: "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

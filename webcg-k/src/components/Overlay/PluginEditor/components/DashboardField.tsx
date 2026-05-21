import { useEffect, useState } from "react";
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

  // ─── [ADR] 중첩 구조 및 Array 전용 GUI 에디터 도입 ──────────────────
  // ■ 도입 목적: 기존 단순 JSON 텍스트 에디터의 불편함을 해소하고, 중첩된 객체/배열 데이터를
  //   행(Row) 기반의 GUI 컨트롤로 쉽게 수정할 수 있도록 재귀적 구조의 에디터를 도입합니다.
  if (prop.type === "array") {
    if (prop.items) {
      return (
        <ArrayDashboardField
          prop={prop}
          value={value}
          onChange={onChange}
          containerStyle={containerStyle}
          labelStyle={labelStyle}
        />
      );
    }
    // Fallback: items 스키마가 없는 경우
    return (
      <JsonDashboardField
        prop={prop}
        value={value}
        onChange={onChange}
        containerStyle={containerStyle}
        labelStyle={labelStyle}
        inputStyle={inputStyle}
      />
    );
  }

  if (prop.type === "object" || (typeof value === "object" && value !== null && !Array.isArray(value))) {
    if (prop.properties) {
      return (
        <ObjectDashboardField
          prop={prop}
          value={value}
          onChange={onChange}
          containerStyle={containerStyle}
          labelStyle={labelStyle}
        />
      );
    }
    // Fallback: properties 스키마가 없는 경우
    return (
      <JsonDashboardField
        prop={prop}
        value={value}
        onChange={onChange}
        containerStyle={containerStyle}
        labelStyle={labelStyle}
        inputStyle={inputStyle}
      />
    );
  }

  const uiWidget = prop["ui:widget"];
  if (uiWidget === "slider" && prop.type === "number") {
    return (
      <div style={containerStyle}>
        <label style={labelStyle} title={prop.title}>{prop.title}</label>
        <input
          type="range"
          min={prop.min ?? prop.minimum ?? 0}
          max={prop.max ?? prop.maximum ?? 100}
          step={prop.step ?? 1}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: "11px", color: "#94a3b8", minWidth: "32px", textAlign: "right" }}>
          {String(value ?? 0)}
        </span>
      </div>
    );
  }

  if (uiWidget === "textarea" && prop.type === "string") {
    return (
      <div style={{ ...containerStyle, flexDirection: "column", alignItems: "stretch" }}>
        <label style={{ ...labelStyle, width: "auto" }} title={prop.title}>{prop.title}</label>
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
    );
  }

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

/**
 * [ADR] 중첩 데이터(Array/Object) 편집을 위한 실시간 검증형 JSON 에디터
 * 
 * ■ Why 분리?
 *   React 컴포넌트 최상단이 아닌 조건부 분기(if) 안에서 useState나 useEffect 등의 Hook을 사용하면
 *   렌더링 주기에 따라 Hook 호출 횟수와 순서가 달라져 React 런타임 에러(Rules of Hooks 위반)가 발생합니다.
 *   따라서 해당 비즈니스 로직을 온전히 격리한 별도의 서브 컴포넌트로 분리하여 안전성과 정합성을 유지합니다.
 */
function JsonDashboardField({
  prop,
  value,
  onChange,
  containerStyle,
  labelStyle,
  inputStyle,
}: {
  prop: DashboardSchemaProperty;
  value: unknown;
  onChange: (val: unknown) => void;
  containerStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}) {
  const [localStr, setLocalStr] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      try {
        setLocalStr(value ? JSON.stringify(value, null, 2) : "[]");
        setIsValid(true);
      } catch {
        setLocalStr(String(value || "[]"));
        setIsValid(false);
      }
    }
  }, [value, isFocused]);

  const handleTextChange = (valStr: string) => {
    setLocalStr(valStr);
    try {
      const parsed = JSON.parse(valStr);
      setIsValid(true);
      onChange(parsed);
    } catch {
      setIsValid(false);
    }
  };

  return (
    <div style={{ ...containerStyle, flexDirection: "column", alignItems: "stretch", gap: "4px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ ...labelStyle, width: "auto" }} title={prop.title}>{prop.title}</label>
        {!isValid && (
          <span style={{ fontSize: "10px", color: "#f87171", fontWeight: 500 }}>
            ⚠️ 올바른 JSON 형식이 아닙니다
          </span>
        )}
      </div>
      <textarea
        value={localStr}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          try {
            const parsed = JSON.parse(localStr);
            setLocalStr(JSON.stringify(parsed, null, 2));
            setIsValid(true);
          } catch {
            setIsValid(false);
          }
        }}
        rows={5}
        style={{
          ...inputStyle,
          fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
          fontSize: "11px",
          lineHeight: "1.4",
          color: isValid ? "#a5f3fc" : "#f87171",
          border: isValid ? "1px solid var(--border-default, #333)" : "1px solid #f87171",
          resize: "vertical",
          padding: "6px 8px",
          backgroundColor: "rgba(0,0,0,0.4)"
        }}
        spellCheck={false}
      />
    </div>
  );
}

/** 배열(Array) 데이터를 관리하는 GUI 폼 컴포넌트 */
function ArrayDashboardField({
  prop, value, onChange, containerStyle, labelStyle
}: {
  prop: DashboardSchemaProperty;
  value: unknown;
  onChange: (val: unknown) => void;
  containerStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const items = Array.isArray(value) ? value : [];

  const handleItemChange = (index: number, newVal: unknown) => {
    const newItems = [...items];
    newItems[index] = newVal;
    onChange(newItems);
  };

  const handleAddItem = () => {
    let defaultVal: unknown = "";
    if (prop.items?.type === "object") defaultVal = {};
    else if (prop.items?.type === "number") defaultVal = 0;
    else if (prop.items?.type === "boolean") defaultVal = false;
    else if (prop.items?.type === "array") defaultVal = [];
    onChange([...items, defaultVal]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  return (
    <div style={{ ...containerStyle, flexDirection: "column", alignItems: "stretch", gap: "8px", marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ ...labelStyle, width: "auto" }} title={prop.title}>{prop.title}</label>
        <button type="button" onClick={handleAddItem} style={{ ...toggleBtn, background: "rgba(16,185,129,0.2)", borderColor: "rgba(16,185,129,0.4)" }}>+ 추가</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderLeft: "2px solid rgba(255,255,255,0.1)", paddingLeft: "10px" }}>
        {items.map((item, index) => (
          <div key={index} style={{ display: "flex", flexDirection: "column", gap: "6px", background: "rgba(255,255,255,0.02)", padding: "8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "10px", color: "#666" }}>Item {index + 1}</span>
              <button type="button" onClick={() => handleRemoveItem(index)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", padding: 0 }}>×</button>
            </div>
            {prop.items ? (
              <DashboardField
                prop={{ ...prop.items, title: "" }}
                value={item}
                onChange={(newVal) => handleItemChange(index, newVal)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 객체(Object) 데이터를 관리하는 GUI 폼 컴포넌트 */
function ObjectDashboardField({
  prop, value, onChange, containerStyle, labelStyle
}: {
  prop: DashboardSchemaProperty;
  value: unknown;
  onChange: (val: unknown) => void;
  containerStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  const obj = (typeof value === "object" && value !== null && !Array.isArray(value)) ? (value as Record<string, unknown>) : {};
  const properties = prop.properties || {};

  const handleFieldChange = (key: string, newVal: unknown) => {
    onChange({ ...obj, [key]: newVal });
  };

  return (
    <div style={{ ...containerStyle, flexDirection: "column", alignItems: "stretch", gap: "6px", marginBottom: prop.title ? "8px" : "0" }}>
      {prop.title && <label style={{ ...labelStyle, width: "auto", marginBottom: "4px" }} title={prop.title}>{prop.title}</label>}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: prop.title ? "10px" : "0", borderLeft: prop.title ? "2px solid rgba(255,255,255,0.05)" : "none" }}>
        {Object.entries(properties).map(([key, childProp]) => (
          <DashboardField
            key={key}
            prop={{ ...childProp, title: childProp.title || key }}
            value={obj[key] ?? childProp.default}
            onChange={(newVal) => handleFieldChange(key, newVal)}
          />
        ))}
      </div>
    </div>
  );
}

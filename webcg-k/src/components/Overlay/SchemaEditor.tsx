/**
 * SchemaEditor — 대시보드 스키마 비주얼 편집기
 *
 * ■ 역할:
 *   dashboard_schema의 필드를 GUI로 추가/수정/삭제.
 *   HTML/CSS/JS 탭 옆의 "Schema" 탭에서 표시된다.
 *
 * ■ Why 비주얼 에디터?
 *   비유: Google Forms의 질문 편집기.
 *   JSON을 직접 쓰는 대신, 타입 선택 → 라벨 입력 → 기본값 설정으로
 *   비개발자도 대시보드 컨트롤을 설계할 수 있게 한다.
 *
 * ■ JS 바인딩 힌트:
 *   스키마 필드를 분석하여 webcgk.onData() 보일러플레이트를
 *   자동 생성. 복사 버튼으로 JS 탭에 바로 적용 가능.
 */

import { useCallback, useMemo, useState } from "react";
import { Copy, Plus, Trash2, Zap, Code } from "lucide-react";
import type {
	DashboardSchema,
	DashboardSchemaProperty,
} from "../../lib/overlayTypes";

// ─── 타입 ────────────────────────────────────────────────────
const FIELD_TYPES = [
	{ value: "string", label: "텍스트 (string)" },
	{ value: "number", label: "숫자 (number)" },
	{ value: "boolean", label: "ON/OFF (boolean)" },
	{ value: "enum", label: "드롭다운 (enum)" },
	{ value: "color", label: "색상 (color)" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

interface SchemaEditorProps {
	schema: DashboardSchema | null;
	onChange: (schema: DashboardSchema) => void;
}

// ─── 한글 → camelCase 키 자동 생성 (향후 사용 예정) ──────────
// "홈팀 점수" 라벨 입력 → "homeScore" 키 자동 제안.
// 한글은 그대로 사용하되, 공백과 특수문자 제거.
// function titleToKey(title: string): string { ... }

// ─── 메인 컴포넌트 ──────────────────────────────────────────
export function SchemaEditor({ schema, onChange }: SchemaEditorProps) {
	const properties = schema?.properties || {};
	const entries = Object.entries(properties);

	const [viewMode, setViewMode] = useState<"gui" | "json">("gui");
	const [jsonText, setJsonText] = useState("");

	const toggleViewMode = () => {
		if (viewMode === "gui") {
			setJsonText(JSON.stringify(schema || { properties: {} }, null, 2));
			setViewMode("json");
		} else {
			setViewMode("gui");
		}
	};

	const handleApplyJson = () => {
		try {
			const parsed = JSON.parse(jsonText);
			onChange(parsed);
			setViewMode("gui");
		} catch (e) {
			alert("JSON 형식이 올바르지 않습니다. 구문을 확인해주세요.");
		}
	};

	// ─── 필드 추가 ───
	const handleAdd = useCallback(() => {
		const newKey = `field_${Date.now().toString(36).slice(-4)}`;
		const updated: DashboardSchema = {
			properties: {
				...properties,
				[newKey]: {
					type: "string",
					title: "새 필드",
					default: "",
				},
			},
		};
		onChange(updated);
	}, [properties, onChange]);

	// ─── 필드 삭제 ───
	const handleRemove = useCallback(
		(key: string) => {
			const next = { ...properties };
			delete next[key];
			onChange({ properties: next });
		},
		[properties, onChange],
	);

	// ─── 필드 키 변경 ───
	const handleKeyChange = useCallback(
		(oldKey: string, newKey: string) => {
			if (!newKey || newKey === oldKey || properties[newKey]) return;
			// 순서를 유지하면서 키 변경
			const next: Record<string, DashboardSchemaProperty> = {};
			for (const [k, v] of Object.entries(properties)) {
				next[k === oldKey ? newKey : k] = v;
			}
			onChange({ properties: next });
		},
		[properties, onChange],
	);

	// ─── 필드 프로퍼티 변경 ───
	const handlePropChange = useCallback(
		(key: string, updates: Partial<DashboardSchemaProperty>) => {
			const prev = properties[key];
			if (!prev) return;

			const merged = { ...prev, ...updates };

			// 타입 변경 시 기본값과 옵션 리셋
			if (updates.type && updates.type !== prev.type) {
				// enum은 UI 전용 타입 — 실제 DB에는 type="string" + enum[] 조합
				if ((updates.type as string) === "enum") {
					merged.type = "string";
					merged.enum = ["옵션1", "옵션2"];
					merged.default = "옵션1";
					delete merged.min;
					delete merged.max;
				} else {
					switch (updates.type) {
						case "number":
							merged.default = 0;
							merged.min = 0;
							merged.max = 100;
							delete merged.enum;
							break;
						case "boolean":
							merged.default = false;
							delete merged.enum;
							delete merged.min;
							delete merged.max;
							break;
						case "color":
							merged.default = "#ffffff";
							delete merged.enum;
							delete merged.min;
							delete merged.max;
							break;
						default:
							merged.default = "";
							delete merged.enum;
							delete merged.min;
							delete merged.max;
					}
				}
			}

			onChange({
				properties: { ...properties, [key]: merged },
			});
		},
		[properties, onChange],
	);

	// ─── JS 바인딩 코드 힌트 ───
	const jsHint = useMemo(() => {
		if (entries.length === 0) return "";

		const lines = entries.map(([key, prop]) => {
			const comment = `  // ${key} (${prop.enum ? "enum" : prop.type}) → "${prop.title}"`;
			if (prop.type === "number") {
				return `${comment}\n  el = document.getElementById("${key}");\n  if (el) el.textContent = String(data.${key} || 0);`;
			}
			if (prop.type === "boolean") {
				return `${comment}\n  // data.${key} → true/false`;
			}
			if (prop.type === "color") {
				return `${comment}\n  el = document.getElementById("${key}");\n  if (el) el.style.color = data.${key};`;
			}
			return `${comment}\n  el = document.getElementById("${key}");\n  if (el) el.textContent = data.${key} || "";`;
		});

		return `webcgk.onData(function(data) {\n  var el;\n${lines.join("\n\n")}\n});`;
	}, [entries]);

	const handleCopyHint = useCallback(() => {
		navigator.clipboard.writeText(jsHint);
	}, [jsHint]);

	return (
		<div style={S.container}>
			{/* ─── 헤더 ─── */}
			<div style={S.header}>
				<span style={S.headerTitle}>📐 대시보드 스키마</span>
				<span style={S.fieldCount}>{entries.length}개 필드</span>
				<button type="button" onClick={toggleViewMode} style={{ ...S.addBtn, background: "transparent", borderColor: "rgba(255,255,255,0.2)", color: "#94a3b8" }}>
					<Code size={12} /> {viewMode === "gui" ? "JSON 모드" : "GUI 모드"}
				</button>
				{viewMode === "gui" && (
					<button type="button" onClick={handleAdd} style={S.addBtn}>
						<Plus size={12} /> 필드 추가
					</button>
				)}
			</div>

			{/* ─── 본문 ─── */}
			{viewMode === "json" ? (
				<div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px", gap: "8px", overflow: "hidden" }}>
					<div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
						직접 JSON 스키마를 수정하거나 AI가 생성한 스키마를 붙여넣으세요.
					</div>
					<textarea
						value={jsonText}
						onChange={(e) => setJsonText(e.target.value)}
						style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", color: "#a5f3fc", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", padding: "8px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", outline: "none", resize: "none", whiteSpace: "pre", overflow: "auto" }}
						spellCheck={false}
					/>
					<button type="button" onClick={handleApplyJson} style={{ padding: "8px", backgroundColor: "#0ea5e9", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem", fontWeight: "bold", transition: "background 0.2s" }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#0284c7"} onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#0ea5e9"}>
						JSON 적용 및 GUI로 돌아가기
					</button>
				</div>
			) : (
				<>
					{/* ─── 필드 목록 ─── */}
					<div style={S.fieldList}>
						{entries.length === 0 && (
							<div style={S.empty}>
								<p style={{ margin: 0, fontWeight: 600 }}>필드가 없습니다</p>
								<p style={{ margin: "4px 0 0", fontSize: "0.6875rem", color: "#64748b" }}>
									"필드 추가" 버튼으로 대시보드 컨트롤을 정의하세요.
								</p>
							</div>
						)}

						{entries.map(([key, prop], index) => (
							<FieldCard
								key={index}
								fieldKey={key}
								prop={prop}
								onKeyChange={handleKeyChange}
								onPropChange={handlePropChange}
								onRemove={handleRemove}
							/>
						))}
					</div>

					{/* ─── JS 바인딩 힌트 ─── */}
					{entries.length > 0 && (
						<div style={S.hintSection}>
							<div style={S.hintHeader}>
								<Zap size={12} style={{ color: "#f59e0b" }} />
								<span>JS 바인딩 코드 (자동 생성)</span>
								<button type="button" onClick={handleCopyHint} style={S.copyBtn}>
									<Copy size={10} /> 복사
								</button>
							</div>
							<pre style={S.hintCode}>{jsHint}</pre>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ─── FieldCard — 개별 필드 편집 카드 ───────────────────────
function FieldCard({
	fieldKey,
	prop,
	onKeyChange,
	onPropChange,
	onRemove,
}: {
	fieldKey: string;
	prop: DashboardSchemaProperty;
	onKeyChange: (oldKey: string, newKey: string) => void;
	onPropChange: (key: string, updates: Partial<DashboardSchemaProperty>) => void;
	onRemove: (key: string) => void;
}) {
	// enum 타입 감지 (type=string + enum 배열이 있으면 enum)
	const effectiveType: FieldType = prop.enum && prop.enum.length > 0
		? "enum"
		: (prop.type as FieldType);

	return (
		<div style={S.card}>
			{/* 1행: 키 + 타입 + 삭제 */}
			<div style={S.cardRow}>
				<input
					type="text"
					value={fieldKey}
					onChange={(e) => onKeyChange(fieldKey, e.target.value.replace(/\s/g, ""))}
					style={{ ...S.input, width: "120px", fontFamily: "monospace", fontSize: "0.75rem" }}
					placeholder="fieldKey"
					title="JS에서 data.fieldKey로 접근하는 키"
				/>
				<select
					value={effectiveType}
					onChange={(e) => onPropChange(fieldKey, { type: e.target.value as any })}
					style={{ ...S.input, width: "140px", cursor: "pointer" }}
				>
					{FIELD_TYPES.map((t) => (
						<option key={t.value} value={t.value}>{t.label}</option>
					))}
				</select>
				<div style={{ flex: 1 }} />
				<button
					type="button"
					onClick={() => onRemove(fieldKey)}
					style={S.removeBtn}
					title="필드 삭제"
				>
					<Trash2 size={12} />
				</button>
			</div>

			{/* 2행: 라벨 + 기본값 */}
			<div style={S.cardRow}>
				<label style={S.miniLabel}>라벨</label>
				<input
					type="text"
					value={prop.title}
					onChange={(e) => {
						const title = e.target.value;
						onPropChange(fieldKey, { title });
					}}
					style={{ ...S.input, flex: 1 }}
					placeholder="표시 이름"
				/>
				<label style={S.miniLabel}>기본값</label>
				{prop.type === "boolean" ? (
					<button
						type="button"
						onClick={() => onPropChange(fieldKey, { default: !prop.default })}
						style={{
							...S.input,
							width: "50px",
							cursor: "pointer",
							textAlign: "center",
							background: prop.default ? "#22c55e" : "var(--app-bg-muted, #1e1e1e)",
							color: prop.default ? "#fff" : "#94a3b8",
							border: "none",
						}}
					>
						{prop.default ? "ON" : "OFF"}
					</button>
				) : prop.type === "color" ? (
					<input
						type="color"
						value={String(prop.default || "#ffffff")}
						onChange={(e) => onPropChange(fieldKey, { default: e.target.value })}
						style={{ width: "32px", height: "24px", border: "none", cursor: "pointer", borderRadius: "3px" }}
					/>
				) : effectiveType === "enum" ? (
					<select
						value={String(prop.default ?? "")}
						onChange={(e) => onPropChange(fieldKey, { default: e.target.value })}
						style={{ ...S.input, width: "100px" }}
					>
						{(prop.enum || []).map((opt) => (
							<option key={opt} value={opt}>{opt}</option>
						))}
					</select>
				) : (
					<input
						type={prop.type === "number" ? "number" : "text"}
						value={String(prop.default ?? "")}
						onChange={(e) =>
							onPropChange(fieldKey, {
								default: prop.type === "number" ? Number(e.target.value) || 0 : e.target.value,
							})
						}
						style={{ ...S.input, width: "100px" }}
					/>
				)}
			</div>

			{/* 3행: 타입별 추가 옵션 */}
			{prop.type === "number" && (
				<div style={S.cardRow}>
					<label style={S.miniLabel}>최소</label>
					<input
						type="number"
						value={prop.min ?? prop.minimum ?? 0}
						onChange={(e) => onPropChange(fieldKey, { min: Number(e.target.value), minimum: Number(e.target.value) })}
						style={{ ...S.input, width: "60px" }}
					/>
					<label style={S.miniLabel}>최대</label>
					<input
						type="number"
						value={prop.max ?? prop.maximum ?? 100}
						onChange={(e) => onPropChange(fieldKey, { max: Number(e.target.value), maximum: Number(e.target.value) })}
						style={{ ...S.input, width: "60px" }}
					/>
					<label style={S.miniLabel}>단위</label>
					<input
						type="number"
						value={prop.step ?? 1}
						onChange={(e) => onPropChange(fieldKey, { step: Number(e.target.value) || 1 })}
						style={{ ...S.input, width: "50px" }}
					/>
				</div>
			)}

			{/* enum 옵션 편집 */}
			{effectiveType === "enum" && (
				<div style={{ ...S.cardRow, flexWrap: "wrap" }}>
					<label style={S.miniLabel}>옵션</label>
					{(prop.enum || []).map((opt, i) => (
						<div key={i} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
							<input
								type="text"
								value={opt}
								onChange={(e) => {
									const next = [...(prop.enum || [])];
									next[i] = e.target.value;
									onPropChange(fieldKey, { enum: next });
								}}
								style={{ ...S.input, width: "80px" }}
							/>
							<button
								type="button"
								onClick={() => {
									const next = (prop.enum || []).filter((_, j) => j !== i);
									onPropChange(fieldKey, { enum: next });
								}}
								style={{ ...S.removeBtn, padding: "2px" }}
								title="옵션 삭제"
							>
								×
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={() => {
							const next = [...(prop.enum || []), `옵션${(prop.enum?.length || 0) + 1}`];
							onPropChange(fieldKey, { enum: next });
						}}
						style={{ ...S.addBtn, padding: "2px 6px", fontSize: "0.625rem" }}
					>
						+ 추가
					</button>
				</div>
			)}
		</div>
	);
}

// ─── 스타일 ─────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
	container: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
		backgroundColor: "#0d0f12",
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		padding: "8px 12px",
		borderBottom: "1px solid rgba(255,255,255,0.06)",
		flexShrink: 0,
	},
	headerTitle: {
		fontSize: "0.8125rem",
		fontWeight: 700,
		color: "#e2e8f0",
	},
	fieldCount: {
		fontSize: "0.6875rem",
		color: "#64748b",
		flex: 1,
	},
	addBtn: {
		display: "flex",
		alignItems: "center",
		gap: "4px",
		padding: "4px 10px",
		borderRadius: "5px",
		border: "1px dashed rgba(6,182,212,0.4)",
		background: "rgba(6,182,212,0.08)",
		color: "#22d3ee",
		cursor: "pointer",
		fontSize: "0.6875rem",
		fontWeight: 600,
	},
	fieldList: {
		flex: 1,
		overflow: "auto",
		padding: "8px",
		display: "flex",
		flexDirection: "column",
		gap: "6px",
	},
	empty: {
		textAlign: "center",
		padding: "32px 16px",
		color: "#94a3b8",
		fontSize: "0.8125rem",
	},
	card: {
		padding: "8px 10px",
		borderRadius: "6px",
		border: "1px solid rgba(255,255,255,0.06)",
		backgroundColor: "rgba(255,255,255,0.02)",
		display: "flex",
		flexDirection: "column",
		gap: "6px",
	},
	cardRow: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
	},
	input: {
		padding: "3px 6px",
		borderRadius: "3px",
		border: "1px solid rgba(255,255,255,0.1)",
		backgroundColor: "rgba(0,0,0,0.3)",
		color: "#e2e8f0",
		fontSize: "0.6875rem",
		outline: "none",
		boxSizing: "border-box" as const,
	},
	miniLabel: {
		fontSize: "0.625rem",
		color: "#64748b",
		fontWeight: 600,
		flexShrink: 0,
	},
	removeBtn: {
		display: "flex",
		alignItems: "center",
		padding: "3px",
		borderRadius: "3px",
		border: "none",
		background: "none",
		color: "#64748b",
		cursor: "pointer",
		transition: "color 0.15s",
	},
	hintSection: {
		flexShrink: 0,
		borderTop: "1px solid rgba(255,255,255,0.06)",
		maxHeight: "40%",
		display: "flex",
		flexDirection: "column",
	},
	hintHeader: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		padding: "6px 12px",
		fontSize: "0.6875rem",
		fontWeight: 600,
		color: "#94a3b8",
	},
	copyBtn: {
		marginLeft: "auto",
		display: "flex",
		alignItems: "center",
		gap: "3px",
		padding: "2px 8px",
		borderRadius: "3px",
		border: "1px solid rgba(255,255,255,0.1)",
		background: "rgba(255,255,255,0.04)",
		color: "#94a3b8",
		cursor: "pointer",
		fontSize: "0.625rem",
	},
	hintCode: {
		flex: 1,
		overflow: "auto",
		margin: 0,
		padding: "8px 12px",
		fontSize: "0.6875rem",
		lineHeight: 1.5,
		color: "#a5f3fc",
		backgroundColor: "rgba(0,0,0,0.4)",
		fontFamily: "'JetBrains Mono', monospace",
		whiteSpace: "pre-wrap",
	},
};

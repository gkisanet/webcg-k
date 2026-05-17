/**
 * Binding Tab — Shape 요소의 Text Frame 편집
 *
 * Shape(rect/ellipse)를 선택했을 때 표시되는 "Bind" 탭.
 * 바인딩 컨테이너를 활성화하고, Text Frame 위치와 텍스트 스타일을 편집한다.
 *
 * Phase D-1.5: Text Frame 아키텍처
 * → 기존 padding + yPosition/heightRatio 방식을 frameX/Y/W/H로 전환.
 * → Shape 더블클릭 시 캔버스에서 직접 텍스트 편집 가능.
 * → 이 탭에서는 Text Frame 좌표, 스타일, 바인딩 키를 사이드바에서 제어.
 */

import { Trash2 } from "lucide-react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import {
	createDefaultBindingContainer,
	createDefaultSlot,
	type BindingContainer,
	type BindingTextSlot,
} from "@/lib/types/bindingTypes";
import { SYSTEM_FONTS } from "@/lib/fontRegistry";
import { checkTextOverflow } from "@/lib/textMeasure";

interface BindingTabProps {
	element: GraphicElement;
	onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
}

/** Weight 라벨 매핑 */
const WEIGHT_LABELS: Record<number, string> = {
	100: "Thin", 200: "ExtraLight", 300: "Light",
	400: "Regular", 500: "Medium", 600: "SemiBold",
	700: "Bold", 800: "ExtraBold", 900: "Black",
};

/** 자주 사용되는 바인딩 키 프리셋 (방송 CG 표준) */
const BINDING_KEY_PRESETS = [
	{ key: "personName", label: "이름" },
	{ key: "personTitle", label: "직함" },
	{ key: "headline", label: "헤드라인" },
	{ key: "subHeadline", label: "서브 헤드라인" },
	{ key: "source", label: "출처" },
	{ key: "location", label: "장소" },
	{ key: "dateTime", label: "날짜/시간" },
	{ key: "custom", label: "사용자 정의" },
];

export function BindingTab({ element, onUpdate }: BindingTabProps) {
	const bc = element.bindingContainer;
	const isEnabled = bc?.enabled ?? false;

	// ─── 바인딩 컨테이너 업데이트 헬퍼 ─────────────────────────

	/** bindingContainer 전체를 업데이트 */
	const updateContainer = (updates: Partial<BindingContainer>) => {
		onUpdate(element.id, {
			bindingContainer: {
				...(bc || createDefaultBindingContainer()),
				...updates,
			},
		});
	};

	/** 슬롯 하나를 업데이트 (1 Shape = 1 슬롯) */
	const updateSlot = (slotId: string, updates: Partial<BindingTextSlot>) => {
		if (!bc) return;
		const newSlots = bc.slots.map((s) =>
			s.id === slotId ? { ...s, ...updates } : s,
		);
		updateContainer({ slots: newSlots });
	};

	/** 슬롯 삭제 */
	const removeSlot = (slotId: string) => {
		if (!bc) return;
		const remaining = bc.slots.filter((s) => s.id !== slotId);
		updateContainer({ slots: remaining });
	};

	// 현재 슬롯 (1개만 지원)
	const slot = bc?.slots[0] ?? null;

	return (
		<>
			{/* 활성화 토글 */}
			<div className="ins-section">
				<div className="ins-section-title">
					<label className="toggle-label" style={{ gap: 8, cursor: "pointer" }}>
						<input
							type="checkbox"
							checked={isEnabled}
							onChange={(e) => {
								if (e.target.checked && !bc) {
									// 최초 활성화: 기본 컨테이너 + 슬롯 1개 자동 생성
									// Text Frame을 Shape 안쪽 16px margin으로 초기화
									const container = createDefaultBindingContainer();
									container.slots = [createDefaultSlot(
										{ label: "텍스트 1", bindingKey: "personName" },
										element.width,
										element.height,
									)];
									onUpdate(element.id, { bindingContainer: container });
								} else {
									updateContainer({ enabled: e.target.checked });
								}
							}}
						/>
						<span>데이터 바인딩 컨테이너</span>
					</label>
				</div>
				{!isEnabled && (
					<div style={{ padding: "8px 12px", color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
						활성화하면 Shape 더블클릭으로 텍스트를 직접 입력할 수 있습니다.
					</div>
				)}
			</div>

			{/* 바인딩 컨테이너 설정 (활성화 시에만) */}
			{isEnabled && bc && (
				<>
					{/* 오버플로우 모드 (라디오 — 택일) */}
					<div className="ins-section">
						<div className="ins-section-title">오버플로우 모드</div>
						{(["shrink", "wrap", "none"] as const).map((mode) => (
							<label
								key={mode}
								className="toggle-label"
								style={{
									gap: 8, cursor: "pointer",
									padding: "3px 12px",
									fontSize: "0.75rem",
									color: bc.autoFit === mode ? "var(--accent-blue)" : "var(--text-secondary)",
								}}
							>
								<input
									type="radio"
									name="autoFit"
									value={mode}
									checked={bc.autoFit === mode}
									onChange={() => updateContainer({ autoFit: mode })}
								/>
								{mode === "shrink" ? "자동 축소 (Shrink)" : mode === "wrap" ? "줄바꿈 (Wrap)" : "없음 (None)"}
							</label>
						))}
					</div>

					{/* 슬롯이 없으면 추가 안내 */}
					{!slot && (
						<div className="ins-section">
							<button
								type="button"
								className="icon-btn"
								onClick={() => {
									const newSlot = createDefaultSlot(
										{ label: "텍스트 1", bindingKey: "personName" },
										element.width,
										element.height,
									);
									updateContainer({ slots: [newSlot] });
								}}
								style={{
									width: "100%", padding: "8px",
									border: "1px dashed var(--border-color)",
									borderRadius: 6, cursor: "pointer",
									color: "var(--text-tertiary)", fontSize: "0.75rem",
								}}
							>
								+ 텍스트 슬롯 추가
							</button>
						</div>
					)}

					{/* 텍스트 슬롯 편집 */}
					{slot && (
						<SlotEditor
							slot={slot}
							autoFit={bc.autoFit}
							element={element}
							onUpdate={(updates) => updateSlot(slot.id, updates)}
							onRemove={() => removeSlot(slot.id)}
						/>
					)}
				</>
			)}
		</>
	);
}


// ─── 서브 컴포넌트: 슬롯 에디터 ────────────────────────────────

function SlotEditor({
	slot,
	autoFit,
	element,
	onUpdate,
	onRemove,
}: {
	slot: BindingTextSlot;
	autoFit: BindingContainer["autoFit"];
	element: GraphicElement;
	onUpdate: (updates: Partial<BindingTextSlot>) => void;
	onRemove: () => void;
}) {
	return (
		<>
			{/* 슬롯 헤더 */}
			<div className="ins-section">
				<div className="ins-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span>📝 {slot.label || slot.bindingKey || "텍스트 슬롯"}</span>
					<button
						type="button"
						className="icon-btn"
						onClick={onRemove}
						title="슬롯 삭제"
						style={{ padding: 2, width: 20, height: 20, color: "#ef4444" }}
					>
						<Trash2 size={12} />
					</button>
				</div>
			</div>

			{/* 바인딩 키 */}
			<div className="ins-section">
				<div className="ins-section-title">바인딩 키</div>
				<div className="ins-row">
					<span className="ins-label">프리셋</span>
					<select
						className="ins-select"
						value={BINDING_KEY_PRESETS.some(p => p.key === slot.bindingKey) ? slot.bindingKey : "custom"}
						onChange={(e) => {
							const preset = BINDING_KEY_PRESETS.find(p => p.key === e.target.value);
							if (preset && preset.key !== "custom") {
								onUpdate({ bindingKey: preset.key, label: preset.label });
							}
						}}
					>
						{BINDING_KEY_PRESETS.map((p) => (
							<option key={p.key} value={p.key}>{p.label}</option>
						))}
					</select>
				</div>

				{/* 커스텀 키 입력 */}
				{!BINDING_KEY_PRESETS.some(p => p.key === slot.bindingKey) && (
					<div className="ins-row">
						<span className="ins-label">키</span>
						<input
							type="text" className="ins-input"
							value={slot.bindingKey}
							onChange={(e) => onUpdate({ bindingKey: e.target.value })}
							placeholder="customField"
						/>
					</div>
				)}

				{/* 라벨 */}
				<div className="ins-row">
					<span className="ins-label">라벨</span>
					<input
						type="text" className="ins-input"
						value={slot.label}
						onChange={(e) => onUpdate({ label: e.target.value })}
						placeholder="표시명"
					/>
				</div>
			</div>

			{/* 기본 텍스트 (미리보기) */}
			<div className="ins-section">
				<div className="ins-section-title">기본 텍스트</div>
				<div className="ins-row">
					<input
						type="text" className="ins-input"
						value={slot.content}
						onChange={(e) => onUpdate({ content: e.target.value })}
						placeholder="미리보기 텍스트 (더블클릭으로도 편집)"
					/>
				</div>
			</div>

			{/* Text Frame 위치/크기 (px) */}
			<div className="ins-section">
				<div className="ins-section-title">
					Text Frame (px)
					<button
						type="button"
						className="icon-btn"
						onClick={() => {
							// Shape 안쪽 16px margin으로 리셋
							const m = 16;
							onUpdate({
								frameX: m,
								frameY: m,
								frameWidth: Math.max(element.width - m * 2, 40),
								frameHeight: Math.max(element.height - m * 2, 20),
							});
						}}
						title="Shape에 맞춰 리셋"
						style={{ marginLeft: 8, padding: "1px 6px", fontSize: "0.65rem", color: "var(--text-tertiary)" }}
					>
						리셋
					</button>
				</div>
				<div className="ins-row-2col">
					<span className="ins-label">X</span>
					<input
						type="number" className="ins-input" min={0}
						value={Math.round(slot.frameX)}
						onChange={(e) => onUpdate({ frameX: Number(e.target.value) || 0 })}
					/>
					<span className="ins-label">Y</span>
					<input
						type="number" className="ins-input" min={0}
						value={Math.round(slot.frameY)}
						onChange={(e) => onUpdate({ frameY: Number(e.target.value) || 0 })}
					/>
				</div>
				<div className="ins-row-2col">
					<span className="ins-label">W</span>
					<input
						type="number" className="ins-input" min={20}
						value={Math.round(slot.frameWidth)}
						onChange={(e) => onUpdate({ frameWidth: Number(e.target.value) || 40 })}
					/>
					<span className="ins-label">H</span>
					<input
						type="number" className="ins-input" min={10}
						value={Math.round(slot.frameHeight)}
						onChange={(e) => onUpdate({ frameHeight: Number(e.target.value) || 20 })}
					/>
				</div>
			</div>

			{/* 폰트 설정 */}
			<div className="ins-section">
				<div className="ins-section-title">텍스트 스타일</div>
				<div className="ins-row">
					<span className="ins-label">폰트</span>
					<select
						className="ins-select"
						value={slot.fontFamily}
						onChange={(e) => onUpdate({ fontFamily: e.target.value })}
					>
						<optgroup label="🇰🇷 한글">
							{SYSTEM_FONTS.filter(f => f.isKorean).map(f => (
								<option key={f.family} value={f.family}>{f.label}</option>
							))}
						</optgroup>
						<optgroup label="🔤 영문">
							{SYSTEM_FONTS.filter(f => !f.isKorean).map(f => (
								<option key={f.family} value={f.family}>{f.label}</option>
							))}
						</optgroup>
					</select>
				</div>
				<div className="ins-row-2col">
					<span className="ins-label">크기</span>
					<input
						type="number" className="ins-input" min={1}
						value={slot.fontSize}
						onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 24 })}
					/>
					<span className="ins-label">Wt</span>
					<select
						className="ins-select"
						value={slot.fontWeight}
						onChange={(e) => onUpdate({ fontWeight: Number(e.target.value) })}
					>
						{(() => {
							const fontDef = SYSTEM_FONTS.find(f => f.family === slot.fontFamily);
							const weights = fontDef ? fontDef.weights : [400, 700];
							return weights.map(w => (
								<option key={w} value={w}>{WEIGHT_LABELS[w] || `w${w}`}</option>
							));
						})()}
					</select>
				</div>

				{/* 색상 + 정렬 */}
				<div className="ins-row">
					<span className="ins-label">색상</span>
					<div className="ins-color">
						<input
							type="color" className="ins-color-swatch"
							value={slot.color}
							onChange={(e) => onUpdate({ color: e.target.value })}
						/>
						<input
							type="text" className="ins-input"
							value={slot.color}
							onChange={(e) => onUpdate({ color: e.target.value })}
						/>
					</div>
				</div>
				<div className="ins-row">
					<span className="ins-label">정렬</span>
					<select
						className="ins-select"
						value={slot.textAlign}
						onChange={(e) => onUpdate({ textAlign: e.target.value as BindingTextSlot["textAlign"] })}
					>
						<option value="left">Left</option>
						<option value="center">Center</option>
						<option value="right">Right</option>
					</select>
				</div>
			</div>

			{/* 도움말 */}
			<div className="ins-section">
				<div style={{ padding: "6px 12px", color: "var(--text-tertiary)", fontSize: "0.7rem", lineHeight: 1.4 }}>
					💡 Shape를 더블클릭하면 Text Frame 안에서 직접 텍스트를 편집할 수 있습니다.
				</div>
			</div>

			{/* 🆕 오버플로우 경고 */}
			<OverflowWarning slot={slot} autoFit={autoFit} />
		</>
	);
}

// ─── 오버플로우 경고 컴포넌트 ─────────────────────────────────────
// 텍스트가 Text Frame을 초과할 때 경고 메시지 표시
// ratio > 1.5이면 빨간 경고 + 그래픽 분리 권장

interface OverflowWarningProps {
	slot: BindingTextSlot;
	autoFit: BindingContainer["autoFit"];
}

function OverflowWarning({ slot, autoFit }: OverflowWarningProps) {
	if (!slot.content) return null;

	const result = checkTextOverflow(
		slot.content,
		slot.fontSize,
		slot.fontFamily,
		slot.fontWeight,
		slot.frameWidth,
		slot.frameHeight,
		autoFit,
	);

	// 정상: ratio ≤ 1.0
	if (!result.overflow) {
		return (
			<div style={{ padding: "4px 12px", color: "#22c55e", fontSize: "0.7rem" }}>
				✅ 텍스트가 프레임 안에 맞습니다
			</div>
		);
	}

	const pct = Math.round((result.ratio - 1) * 100);

	// 심각: ratio > 1.5 — 분리 권장
	if (result.ratio > 1.5) {
		return (
			<div style={{
				padding: "6px 12px",
				background: "rgba(239,68,68,0.1)",
				borderLeft: "3px solid #ef4444",
				borderRadius: "0 4px 4px 0",
				color: "#ef4444",
				fontSize: "0.7rem",
				lineHeight: 1.5,
				margin: "0 8px 8px",
			}}>
				🔴 텍스트가 프레임을 <strong>{pct}%</strong> 초과합니다.<br />
				그래픽을 <strong>2개 이상으로 분리</strong>하는 것을 권장합니다.
			</div>
		);
	}

	// 경고: 1.0 < ratio ≤ 1.5
	return (
		<div style={{
			padding: "4px 12px",
			borderLeft: "3px solid #f59e0b",
			borderRadius: "0 4px 4px 0",
			color: "#f59e0b",
			fontSize: "0.7rem",
			margin: "0 8px 8px",
		}}>
			⚠️ 텍스트가 프레임을 {pct}% 초과합니다.
		</div>
	);
}

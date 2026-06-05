/**
 * BlockEditDrawer — 방송 중 텍스트 핫 수정 드로어
 *
 * ■ 워크플로우:
 *   타임라인 블록 더블클릭 → 슬라이드 오버 드로어 표시
 *   → sourceData의 텍스트 요소만 편집 가능
 *   → "적용" 클릭 → sourceData 직접 갱신 → 렌더러 즉시 반영
 *   → ESC 또는 드로어 밖 클릭 → 원래 상태로 복귀
 *
 * ■ Why 접근법 ② (드로어)?
 *   방송 환경의 제1원칙: "현재 화면을 잃지 마라"
 *   페이지 이동 없이 PVW/PGM 모니터를 보면서 수정 가능.
 *   ESC로 즉시 복귀.
 *
 * ■ Why 옵션 B (큐시트/런다운 우회)?
 *   sourceData를 인메모리에서 직접 수정.
 *   DB 트랜잭션 없이 즉시 렌더러 반영.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Pencil, X, Check, AlertTriangle } from "lucide-react";
import { type GraphicBlock, updateBlockSourceData } from "../../stores/timelineStore";

interface BlockEditDrawerProps {
	/** 편집 대상 블록 (null이면 드로어 닫힘) */
	block: GraphicBlock | null;
	/** 드로어 닫기 콜백 */
	onClose: () => void;
	/** 적용 후 렌더러 재발행 콜백 */
	onApply: (blockId: string) => void;
}

/** sourceData 내부의 텍스트 요소 구조 */
interface TextElement {
	id: string;
	type: string;
	text?: string;
	bindingKey?: string;
	// 기타 속성
	[key: string]: any;
}

export function BlockEditDrawer({ block, onClose, onApply }: BlockEditDrawerProps) {
	// ─── 편집 상태 (원본과 분리) ───────────────────────
	const [editedFields, setEditedFields] = useState<Record<string, string>>({});
	const [isDirty, setIsDirty] = useState(false);

	// 블록이 변경되면 편집 상태 초기화
	useEffect(() => {
		if (block?.sourceData) {
			const initial: Record<string, string> = {};
			const elements = block.sourceData.elements || [];
			for (const el of elements) {
				if (el.type === "text" && el.text !== undefined) {
					initial[el.id] = el.text;
				}
			}
			setEditedFields(initial);
			setIsDirty(false);
		}
	}, [block?.id, block?.sourceData]);

	// ─── 텍스트 요소 추출 ─────────────────────────────
	const textElements: TextElement[] = useMemo(() => {
		if (!block?.sourceData?.elements) return [];
		return (block.sourceData.elements as TextElement[]).filter(
			(el) => el.type === "text" && el.text !== undefined,
		);
	}, [block?.sourceData]);

	// ─── 필드 변경 핸들러 ─────────────────────────────
	const handleFieldChange = useCallback(
		(elementId: string, value: string) => {
			setEditedFields((prev) => ({ ...prev, [elementId]: value }));
			setIsDirty(true);
		},
		[],
	);

	// ─── 적용 핸들러 (옵션 B: sourceData 직접 갱신) ──
	const handleApply = useCallback(() => {
		if (!block) return;

		// 1. sourceData의 elements 배열에서 텍스트만 교체
		const newElements = (block.sourceData?.elements || []).map(
			(el: TextElement) => {
				if (el.type === "text" && editedFields[el.id] !== undefined) {
					return { ...el, text: editedFields[el.id] };
				}
				return el;
			},
		);

		const newSourceData = {
			...block.sourceData,
			elements: newElements,
		};

		// 2. timelineStore 직접 갱신 (DB 우회)
		updateBlockSourceData(block.id, newSourceData);

		// 3. PGM 블록이면 렌더러 재발행 (또는 항상 재발행)
		onApply(block.id);

		setIsDirty(false);
		onClose();
	}, [block, editedFields, onApply, onClose]);

	// ─── ESC 키 핸들러 ────────────────────────────────
	useEffect(() => {
		if (!block) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [block, onClose]);

	// 블록이 없으면 렌더링하지 않음
	if (!block) return null;

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1000,
				display: "flex",
				justifyContent: "flex-end",
			}}
		>
			{/* 배경 딤 (클릭 시 닫기) */}
			<div
				style={{
					position: "absolute",
					inset: 0,
					background: "rgba(0,0,0,0.4)",
				}}
				onClick={onClose}
			/>

			{/* 드로어 패널 */}
			<div
				style={{
					position: "relative",
					width: "400px",
					maxWidth: "90vw",
					height: "100%",
					background: "var(--app-bg, #0a0a0f)",
					borderLeft: "1px solid var(--border-default)",
					display: "flex",
					flexDirection: "column",
					animation: "blockEditSlideIn 0.2s ease-out",
				}}
			>
				{/* 드로어 헤더 */}
				<div
					style={{
						padding: "1rem",
						borderBottom: "1px solid var(--border-default)",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
						<Pencil size={16} style={{ color: "var(--accent-primary)" }} />
						<span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
							텍스트 핫 수정
						</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: "var(--text-tertiary)",
							padding: "0.25rem",
						}}
					>
						<X size={18} />
					</button>
				</div>

				{/* 블록 정보 */}
				<div
					style={{
						padding: "0.75rem 1rem",
						borderBottom: "1px solid var(--border-default)",
						background: "var(--app-bg-muted, #111)",
					}}
				>
					<div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
						{block.name}
					</div>
					<div style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "flex", gap: "0.75rem" }}>
						<span>소스: {block.sourceType || "—"}</span>
						<span>트랙: {block.trackId}</span>
						{block.cuesheetItemId && (
							<span style={{ color: "var(--accent-primary)" }}>큐시트 연결됨</span>
						)}
					</div>
				</div>

				{/* 텍스트 편집 영역 */}
				<div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
					{textElements.length === 0 ? (
						<div
							style={{
								textAlign: "center",
								padding: "3rem 1rem",
								color: "var(--text-tertiary)",
								fontSize: "13px",
							}}
						>
							<AlertTriangle size={32} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
							<p>편집 가능한 텍스트 요소가 없습니다</p>
							<p style={{ fontSize: "11px", marginTop: "0.25rem" }}>
								sourceData에 type=&quot;text&quot; 요소가 필요합니다
							</p>
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
							{textElements.map((el) => (
								<TextFieldEditor
									key={el.id}
									element={el}
									value={editedFields[el.id] ?? el.text ?? ""}
									originalValue={el.text ?? ""}
									onChange={(value) => handleFieldChange(el.id, value)}
								/>
							))}
						</div>
					)}
				</div>

				{/* 하단 액션 바 */}
				<div
					style={{
						padding: "0.75rem 1rem",
						borderTop: "1px solid var(--border-default)",
						display: "flex",
						justifyContent: "flex-end",
						gap: "0.5rem",
					}}
				>
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "0.5rem 1rem",
							background: "none",
							border: "1px solid var(--border-default)",
							borderRadius: "6px",
							color: "var(--text-secondary)",
							fontSize: "13px",
							cursor: "pointer",
						}}
					>
						취소
					</button>
					<button
						type="button"
						onClick={handleApply}
						disabled={!isDirty}
						style={{
							padding: "0.5rem 1.25rem",
							background: isDirty ? "var(--accent-primary, #06b6d4)" : "var(--app-bg-muted)",
							border: "none",
							borderRadius: "6px",
							color: isDirty ? "#fff" : "var(--text-tertiary)",
							fontSize: "13px",
							fontWeight: 600,
							cursor: isDirty ? "pointer" : "default",
							opacity: isDirty ? 1 : 0.5,
							display: "flex",
							alignItems: "center",
							gap: "4px",
							transition: "all 0.2s",
						}}
					>
						<Check size={14} />
						적용 & PVW 반영
					</button>
				</div>
			</div>

			{/* 애니메이션 */}
			<style>{`
				@keyframes blockEditSlideIn {
					from { transform: translateX(100%); }
					to { transform: translateX(0); }
				}
			`}</style>
		</div>
	);
}

// ─── TextFieldEditor — 개별 텍스트 필드 편집기 ──────────────

function TextFieldEditor({
	element,
	value,
	originalValue,
	onChange,
}: {
	element: TextElement;
	value: string;
	originalValue: string;
	onChange: (value: string) => void;
}) {
	const isChanged = value !== originalValue;
	// bindingKey를 한글 레이블로 매핑
	const label = getFieldLabel(element.bindingKey || element.id);

	return (
		<div>
			<label
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.375rem",
					fontSize: "11px",
					color: "var(--text-tertiary)",
					marginBottom: "0.25rem",
				}}
			>
				{label}
				{isChanged && (
					<span style={{ color: "#f59e0b", fontSize: "10px" }}>● 수정됨</span>
				)}
			</label>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{
					width: "100%",
					padding: "0.5rem 0.75rem",
					background: isChanged
						? "rgba(245, 158, 11, 0.08)"
						: "var(--app-bg-muted, #111)",
					border: isChanged
						? "1px solid rgba(245, 158, 11, 0.4)"
						: "1px solid var(--border-default)",
					borderRadius: "6px",
					color: "var(--text-primary)",
					fontSize: "14px",
					outline: "none",
					transition: "border-color 0.15s, background 0.15s",
				}}
				onFocus={(e) => {
					e.target.style.borderColor = "var(--accent-primary, #06b6d4)";
				}}
				onBlur={(e) => {
					e.target.style.borderColor = isChanged
						? "rgba(245, 158, 11, 0.4)"
						: "var(--border-default)";
				}}
			/>
			{/* 원본 값 표시 (변경된 경우) */}
			{isChanged && (
				<div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "0.125rem" }}>
					원본: <span style={{ textDecoration: "line-through" }}>{originalValue || "(빈 값)"}</span>
				</div>
			)}
		</div>
	);
}

// ─── 유틸 ──────────────────────────────────────────────────────

/** bindingKey → 한글 레이블 매핑 */
function getFieldLabel(key: string): string {
	const labelMap: Record<string, string> = {
		personName: "이름",
		personTitle: "직함",
		text: "본문",
		subtitle: "부제",
		source: "출처",
		headline: "헤드라인",
		crawlText: "크롤 텍스트",
		name: "이름",
		title: "제목",
		description: "설명",
	};
	return labelMap[key] || key;
}

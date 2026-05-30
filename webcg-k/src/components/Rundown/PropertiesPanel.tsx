import { memo } from "react";
import { Layers } from "lucide-react";
import { useRundownState, useRundownActions } from "./RundownEditorContext";
import {
	BINDING_AUTO_FIT_OPTIONS,
	getBindingAutoFitLabel,
	type BindingAutoFit,
} from "../../lib/textFitPolicy";

/**
 * ⚡ 오른쪽 하단: 선택된 런다운 아이템의 상세 속성 및 텍스트 맞춤(Text-fit) 바인딩 편집 패널
 * React.memo로 밀봉하고 Context로부터 필요한 상태와 액션만 격리 구독합니다.
 */
export const PropertiesPanel = memo(function PropertiesPanel() {
	const {
		selectedItemId,
		items,
		sections,
		selectedItem,
		selectedOverlaySchemaEntries,
		selectedOverlayData,
		selectedGraphicElements,
		selectedEditableTextElements,
	} = useRundownState();

	const {
		setItems,
		updateSelectedGraphicElements,
	} = useRundownActions();

	// 스키마 기본값 파싱
	const getSchemaDefaultValue = (property: any): unknown => {
		if (property.default !== undefined) return property.default;
		if (property.type === "boolean") return false;
		if (property.type === "number") return 0;
		return "";
	};

	// 오버레이 Replicant 값 수정 헬퍼
	const setOverlayReplicantValue = (
		itemData: any,
		fieldKey: string,
		nextValue: unknown,
	): any => {
		const prevElements = Array.isArray(itemData?.elements)
			? itemData.elements
			: [];
		const isExisting = prevElements.some((el: any) => el.id === fieldKey);

		if (isExisting) {
			return {
				...itemData,
				elements: prevElements.map((el: any) =>
					el.id === fieldKey ? { ...el, text: nextValue } : el,
				),
			};
		} else {
			return {
				...itemData,
				elements: [
					...prevElements,
					{ id: fieldKey, type: "text", text: nextValue },
				],
			};
		}
	};

	if (!selectedItemId || !selectedItem) {
		return (
			<div className="properties-section">
				<h3>속성</h3>
				<div className="properties-empty">
					아이템을 선택하면
					<br />
					속성을 편집할 수 있습니다
				</div>
			</div>
		);
	}

	return (
		<div className="properties-section">
			<h3>속성</h3>
			<div className="properties-form">
			{/* 메타 정보 */}
			<div className="property-group">
				<label>이름</label>
				<input
					type="text"
					className="input"
					value={selectedItem.source_name}
					onChange={(e) => {
						const nextName = e.target.value;
						setItems((prev) =>
							prev.map((item) =>
								item.id === selectedItem.id
									? { ...item, source_name: nextName }
									: item,
							),
						);
					}}
				/>
			</div>

			<div className="property-row-2">
				<div className="property-group">
					<label>송출 트랙 레이어</label>
					<select
						className="input"
						value={selectedItem.track_layer || "main"}
						onChange={(e) => {
							const nextLayer = e.target.value;
							setItems((prev) =>
								prev.map((item) =>
									item.id === selectedItem.id
										? {
												...item,
												track_layer:
													nextLayer === "wrap" ? "wrap" : null,
											}
										: item,
								),
							);
						}}
					>
						<option value="main">기본 메인 CG (Track 2)</option>
						<option value="wrap">속보/배경판 Wrap (Track 1)</option>
					</select>
				</div>

				{/* ⚡ 부모 할당 수동 선택 (트랙 레이어 트리 2차 가드) */}
				<div className="property-group">
					<label>소속 Wrap CG (부모)</label>
					<select
						className="input"
						disabled={selectedItem.track_layer === "wrap"}
						value={selectedItem.parent_item_id || ""}
						onChange={(e) => {
							const nextParent = e.target.value || null;
							setItems((prev) =>
								prev.map((item) =>
									item.id === selectedItem.id
										? { ...item, parent_item_id: nextParent }
										: item,
								),
							);
						}}
					>
						<option value="">없음 (Main 독단 배치)</option>
						{items
							.filter(
								(i) =>
									i.track_layer === "wrap" &&
									i.id !== selectedItem.id &&
									i.section_id === selectedItem.section_id,
							)
							.map((parent) => (
								<option key={parent.id} value={parent.id}>
									{parent.source_name}
								</option>
							))}
					</select>
				</div>
			</div>

			<div className="property-row-2">
				<div className="property-group">
					<label>소속 섹션</label>
					<select
						className="input"
						value={selectedItem.section_id || ""}
						onChange={(e) => {
							const nextSection = e.target.value || null;
							setItems((prev) =>
								prev.map((item) => {
									if (item.id === selectedItem.id) {
										// 섹션 이동 시 자식들의 section_id도 함께 이동하여 동기화
										const updated = { ...item, section_id: nextSection };
										if (item.track_layer === "wrap") {
											// 자식들도 동일 섹션으로 일괄 강제 동기화
											return updated;
										}
										return updated;
									}
									// 자식이면 부모가 이동했을 때 따라옴
									if (
										selectedItem.track_layer === "wrap" &&
										item.parent_item_id === selectedItem.id
									) {
										return { ...item, section_id: nextSection };
									}
									return item;
								}),
							);
						}}
					>
						<option value="">지정 안 함 (미분류)</option>
						{sections.map((sec) => (
							<option key={sec.id} value={sec.id}>
								{sec.label}
							</option>
						))}
					</select>
				</div>
				<div className="property-group">
					<label>송출 지속 시간 (초)</label>
					<input
						type="number"
						className="input"
						min={1}
						value={selectedItem.duration || 10}
						onChange={(e) => {
							const nextDuration = Math.max(1, Number(e.target.value) || 10);
							setItems((prev) =>
								prev.map((item) =>
									item.id === selectedItem.id
										? { ...item, duration: nextDuration }
										: item,
								),
							);
						}}
					/>
				</div>
			</div>

			{/* 오버레이 데이터 편집 폼 */}
			{selectedItem.source_type === "overlay" &&
				selectedOverlaySchemaEntries.length > 0 && (
					<>
						<div className="property-divider" />
						<h4 className="overlay-property-title">오버레이 데이터</h4>
						{selectedOverlaySchemaEntries.map(([fieldKey, property]: any) => {
							const fieldType =
								typeof property.type === "string"
									? property.type
									: "string";
							const value = Object.prototype.hasOwnProperty.call(
								selectedOverlayData,
								fieldKey,
							)
								? selectedOverlayData[fieldKey]
								: getSchemaDefaultValue(property);
							const label =
								typeof property.title === "string"
									? property.title
									: fieldKey;
							const description =
								typeof property.description === "string"
									? property.description
									: undefined;
							const updateValue = (nextValue: unknown) => {
								setItems((prev) =>
									prev.map((item) =>
										item.id === selectedItem.id
											? {
													...item,
													data: setOverlayReplicantValue(
														item.data,
														fieldKey,
														nextValue,
													),
												}
											: item,
									),
								);
							};

							return (
								<div className="property-group" key={fieldKey}>
									<label title={description}>{label}</label>
									{fieldType === "boolean" ? (
										<input
											type="checkbox"
											checked={Boolean(value)}
											onChange={(e) => updateValue(e.target.checked)}
										/>
									) : Array.isArray(property.enum) ? (
										<select
											className="input"
											value={String(value ?? "")}
											onChange={(e) => updateValue(e.target.value)}
											title={description}
										>
											{(property.enum as unknown[]).map((option) => (
												<option key={String(option)} value={String(option)}>
													{String(option)}
												</option>
											))}
										</select>
									) : fieldType === "number" ? (
										<input
											type="number"
											className="input"
											value={Number(value ?? 0)}
											onChange={(e) => updateValue(Number(e.target.value) || 0)}
										/>
									) : (
										<input
											type="text"
											className="input"
											value={String(value ?? "")}
											onChange={(e) => updateValue(e.target.value)}
										/>
									)}
								</div>
							);
						})}
					</>
				)}

			{/* ⚡ 그래픽 텍스트 맞춤(Text-fit) 바인딩 편집 영역 */}
			{selectedItem.source_type === "graphic" &&
				selectedEditableTextElements.length > 0 && (
					<>
						<div className="property-divider" />
						<h4 className="overlay-property-title">그래픽 텍스트 맞춤 편집</h4>
						{selectedEditableTextElements.map((textEl: any) => (
							<div className="property-group" key={textEl.id}>
								<label>
									{textEl.label} ({textEl.bindingKey || "텍스트"})
								</label>
								<input
									type="text"
									className="input"
									value={textEl.text || ""}
									onChange={(e) => {
										const newContent = e.target.value;
										updateSelectedGraphicElements((elements) =>
											elements.map((el) => {
												if (el.id === textEl.id) {
													return { ...el, text: newContent };
												}
												if (
													el.id === textEl.parentElementId &&
													el.bindingContainer
												) {
													return {
														...el,
														bindingContainer: {
															...el.bindingContainer,
															slots: el.bindingContainer.slots.map((slot) =>
																slot.id === textEl.id
																	? { ...slot, content: newContent }
																	: slot,
															),
														},
													};
												}
												return el;
											}),
										);
									}}
									placeholder="텍스트 입력"
								/>
								{textEl.kind === "binding-slot" && textEl.autoFit && (
									<div className="text-fit-row">
										<label>자동 맞춤</label>
										<select
											className="input text-fit-select"
											value={textEl.autoFit}
											onChange={(e) => {
												const nextMode = e.target.value as BindingAutoFit;
												updateSelectedGraphicElements((elements) =>
													elements.map((el) => {
														if (
															el.id !== textEl.parentElementId ||
															!el.bindingContainer
														)
															return el;
														return {
															...el,
															bindingContainer: {
																...el.bindingContainer,
																autoFit: nextMode,
															},
														};
													}),
												);
											}}
										>
											{BINDING_AUTO_FIT_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								)}
								{textEl.fitResult && (
									<div
										className={`text-fit-alert text-fit-alert--${textEl.fitResult.severity}`}
									>
										<span>{textEl.fitResult.message}</span>
										<span className="text-fit-meta">
											Shape {Math.round(textEl.fitResult.renderShapeWidth)}
											px
											{textEl.fitResult.textScaleX < 1
												? ` / 축소 ${Math.round(textEl.fitResult.textScaleX * 100)}%`
												: ""}
										</span>
									</div>
								)}
								{textEl.groupOverflow && (
									<div className="text-fit-alert text-fit-alert--warning">
										<span>
											부모 Group "{textEl.groupOverflow.groupName}" 오른쪽 경계를{" "}
											{textEl.groupOverflow.overflowRight}px 초과합니다.
										</span>
										<span className="text-fit-meta">
											Group은 자동 확장하지 않습니다. 필요하면 Shape 모드나 Group
											폭을 조정하세요.
										</span>
									</div>
								)}
							</div>
						))}
					</>
				)}
			</div>
		</div>
	);
});

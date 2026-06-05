import {
	CheckCircle2,
	Loader2,
	RefreshCw,
	Shield,
	XCircle,
} from "lucide-react";
import { memo, useId } from "react";
import { buildGraphicPackageUiSummary } from "@/lib/graphicPackageUi";
import type { RundownQualityStatus } from "@/lib/rundownQualityGate";
import {
	BINDING_AUTO_FIT_OPTIONS,
	type BindingAutoFit,
} from "../../lib/textFitPolicy";
import {
	type RundownItem,
	useRundownActions,
	useRundownState,
} from "./RundownEditorContext";

const QUALITY_STATUS_LABEL: Record<RundownQualityStatus, string> = {
	ok: "통과",
	warning: "확인 필요",
	error: "차단",
};

const QUALITY_STATUS_ICON = {
	ok: CheckCircle2,
	warning: Shield,
	error: XCircle,
};

function toDomIdPart(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function QualityGateCard({
	selectedItemId,
}: {
	selectedItemId: string | null;
}) {
	const {
		qualitySummary,
		qualityLoading,
		qualityValidationStale,
		qualityValidationApproved,
		qualityApproving,
		reusePolicy,
	} = useRundownState();
	const { refetchQualityGate, handleApproveQualityGate, setReusePolicy } =
		useRundownActions();

	const status = selectedItemId
		? (qualitySummary.itemStatusById[selectedItemId] ?? "ok")
		: qualitySummary.status;
	const issues = selectedItemId
		? (qualitySummary.issuesByItemId[selectedItemId] ?? [])
		: qualitySummary.itemResults.flatMap((result) => result.issues);
	const StatusIcon = QUALITY_STATUS_ICON[status];
	const canApprove =
		qualitySummary.totalItems > 0 && qualitySummary.status !== "error";

	return (
		<div className={`quality-gate-card quality-gate-card--${status}`}>
			<div className="quality-gate-header">
				<div className="quality-gate-title">
					<StatusIcon size={14} />
					<span>송출 체크</span>
					<strong>{QUALITY_STATUS_LABEL[status]}</strong>
				</div>
				<button
					type="button"
					className="quality-gate-icon-btn"
					onClick={refetchQualityGate}
					disabled={qualityLoading}
					title="재검증"
				>
					{qualityLoading ? (
						<Loader2 size={12} className="animate-spin" />
					) : (
						<RefreshCw size={12} />
					)}
				</button>
			</div>

			<div className="quality-gate-metrics">
				<span>{qualitySummary.okCount} 통과</span>
				<span>{qualitySummary.warningCount} 경고</span>
				<span>{qualitySummary.errorCount} 차단</span>
			</div>

			<div className="quality-gate-controls">
				<select
					className="input quality-gate-policy"
					value={reusePolicy}
					onChange={(event) =>
						setReusePolicy(event.target.value as typeof reusePolicy)
					}
				>
					<option value="reusable">재활용 기준</option>
					<option value="single_air">단일 송출 기준</option>
				</select>
				<button
					type="button"
					className="quality-gate-approve"
					onClick={handleApproveQualityGate}
					disabled={!canApprove || qualityLoading || qualityApproving}
				>
					{qualityApproving ? "승인 중" : "승인"}
				</button>
			</div>

			<div className="quality-gate-approval">
				{qualityValidationApproved
					? "현재 내용 승인됨"
					: qualityValidationStale
						? "수정 후 재승인 필요"
						: "아직 승인되지 않음"}
			</div>

			{issues.length > 0 ? (
				<div className="quality-gate-issues">
					{issues.slice(0, 4).map((issue) => (
						<div
							key={issue.id}
							className={`quality-gate-issue quality-gate-issue--${issue.severity}`}
						>
							<span className="quality-gate-issue-label">{issue.label}</span>
							<span className="quality-gate-issue-message">
								{issue.message}
							</span>
						</div>
					))}
					{issues.length > 4 && (
						<div className="quality-gate-more">
							외 {issues.length - 4}개 이슈
						</div>
					)}
				</div>
			) : (
				<div className="quality-gate-empty">
					{selectedItemId
						? "선택한 아이템의 검증 이슈가 없습니다."
						: "런다운 전체 검증 이슈가 없습니다."}
				</div>
			)}
		</div>
	);
}

function formatCompactList(values: string[], emptyText: string): string {
	if (values.length === 0) return emptyText;
	const preview = values.slice(0, 4).join(", ");
	return values.length > 4 ? `${preview} 외 ${values.length - 4}` : preview;
}

function PackageContractCard({ item }: { item: RundownItem }) {
	const packageSummary = buildGraphicPackageUiSummary(item);
	const actionLabels = packageSummary.customActions.map(
		(action) => action.label,
	);
	const firstRequirement =
		packageSummary.renderRequirementLines[0] ?? "선언된 렌더 요구사항 없음";

	return (
		<div
			className={`package-contract-card ${
				packageSummary.targetWarning || packageSummary.motionWarning
					? "package-contract-card--warning"
					: ""
			}`}
		>
			<div className="package-contract-header">
				<div className="package-contract-title-group">
					<span>패키지 계약</span>
					<strong title={packageSummary.packageName}>
						{packageSummary.packageName}
					</strong>
				</div>
				<span className="package-contract-runtime">
					{packageSummary.runtimeLabel}
				</span>
			</div>

			<div className="package-contract-badges">
				{packageSummary.badgeLabels.map((badge) => (
					<span
						key={badge.label}
						className={`package-badge package-badge--${badge.tone}`}
						title={badge.title ?? badge.label}
					>
						{badge.label}
					</span>
				))}
			</div>

			<div className="package-contract-rows">
				<div className="package-contract-row">
					<span>Target</span>
					<strong>{packageSummary.targetProfileLabel}</strong>
				</div>
				<div className="package-contract-row">
					<span>Data</span>
					<strong>
						{formatCompactList(packageSummary.requiredFields, "필수 입력 없음")}
					</strong>
				</div>
				<div className="package-contract-row">
					<span>Action</span>
					<strong>{formatCompactList(actionLabels, "커스텀 액션 없음")}</strong>
				</div>
				<div className="package-contract-row">
					<span>Req</span>
					<strong>{firstRequirement}</strong>
				</div>
			</div>

			{packageSummary.targetWarning ? (
				<div className="package-contract-note package-contract-note--warning">
					{packageSummary.targetWarning}
				</div>
			) : null}

			{packageSummary.motionWarning ? (
				<div className="package-contract-note package-contract-note--warning">
					{packageSummary.motionWarning}
				</div>
			) : null}

			{!packageSummary.targetWarning &&
			!packageSummary.motionWarning &&
			!packageSummary.isManifestBacked ? (
				<div className="package-contract-note">
					Manifest가 없어 기존 데이터 구조에서 계약을 추정했습니다.
				</div>
			) : null}
		</div>
	);
}

/**
 * ⚡ 오른쪽 하단: 선택된 런다운 아이템의 상세 속성 및 텍스트 맞춤(Text-fit) 바인딩 편집 패널
 * React.memo로 밀봉하고 Context로부터 필요한 상태와 액션만 격리 구독합니다.
 */
export const PropertiesPanel = memo(function PropertiesPanel() {
	const formId = useId();
	const {
		selectedItemId,
		items,
		sections,
		selectedItem,
		selectedOverlaySchemaEntries,
		selectedOverlayData,
		selectedEditableTextElements,
	} = useRundownState();

	const { setItems, updateSelectedGraphicElements } = useRundownActions();

	// 스키마 기본값 파싱
	const getSchemaDefaultValue = (
		property: Record<string, unknown>,
	): unknown => {
		if (property.default !== undefined) return property.default;
		if (property.type === "boolean") return false;
		if (property.type === "number") return 0;
		return "";
	};

	// 오버레이 Replicant 값 수정 헬퍼
	const setOverlayReplicantValue = (
		itemData: Record<string, unknown>,
		fieldKey: string,
		nextValue: unknown,
	): Record<string, unknown> => {
		const prevElements = Array.isArray(itemData?.elements)
			? (itemData.elements as Array<Record<string, unknown>>)
			: [];
		const isExisting = prevElements.some((el) => el.id === fieldKey);

		if (isExisting) {
			return {
				...itemData,
				elements: prevElements.map((el) =>
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
				<div className="properties-form">
					<QualityGateCard selectedItemId={null} />
				</div>
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
				<QualityGateCard selectedItemId={selectedItem.id} />
				<PackageContractCard item={selectedItem} />
				{/* 메타 정보 */}
				<div className="property-group">
					<label htmlFor={`${formId}-name`}>이름</label>
					<input
						id={`${formId}-name`}
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
						<label htmlFor={`${formId}-track-layer`}>송출 트랙 레이어</label>
						<select
							id={`${formId}-track-layer`}
							className="input"
							value={selectedItem.track_layer || "main"}
							onChange={(e) => {
								const nextLayer = e.target.value;
								setItems((prev) =>
									prev.map((item) =>
										item.id === selectedItem.id
											? {
													...item,
													track_layer: nextLayer === "wrap" ? "wrap" : null,
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
						<label htmlFor={`${formId}-parent-wrap`}>소속 Wrap CG (부모)</label>
						<select
							id={`${formId}-parent-wrap`}
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
						<label htmlFor={`${formId}-section`}>소속 섹션</label>
						<select
							id={`${formId}-section`}
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
						<label htmlFor={`${formId}-duration`}>송출 지속 시간 (초)</label>
						<input
							id={`${formId}-duration`}
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
							{selectedOverlaySchemaEntries.map(([fieldKey, property]) => {
								const inputId = `${formId}-overlay-${toDomIdPart(fieldKey)}`;
								const fieldType =
									typeof property.type === "string" ? property.type : "string";
								const value = Object.hasOwn(selectedOverlayData, fieldKey)
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
										<label htmlFor={inputId} title={description}>
											{label}
										</label>
										{fieldType === "boolean" ? (
											<input
												id={inputId}
												type="checkbox"
												checked={Boolean(value)}
												onChange={(e) => updateValue(e.target.checked)}
											/>
										) : Array.isArray(property.enum) ? (
											<select
												id={inputId}
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
												id={inputId}
												type="number"
												className="input"
												value={Number(value ?? 0)}
												onChange={(e) =>
													updateValue(Number(e.target.value) || 0)
												}
											/>
										) : (
											<input
												id={inputId}
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
							<h4 className="overlay-property-title">
								그래픽 텍스트 맞춤 편집
							</h4>
							{selectedEditableTextElements.map((textEl) => {
								const textInputId = `${formId}-text-${toDomIdPart(String(textEl.id))}`;
								const textFitId = `${textInputId}-fit`;
								return (
									<div className="property-group" key={textEl.id}>
										<label htmlFor={textInputId}>
											{textEl.name || "텍스트"}
										</label>
										<input
											id={textInputId}
											type="text"
											className="input"
											value={textEl.content || ""}
											onChange={(e) => {
												const newContent = e.target.value;
												updateSelectedGraphicElements((elements) =>
													elements.map((el) => {
														if (el.id === textEl.id) {
															return { ...el, content: newContent };
														}
														if (
															el.id === textEl.parentElementId &&
															el.bindingContainer
														) {
															return {
																...el,
																bindingContainer: {
																	...el.bindingContainer,
																	slots: el.bindingContainer.slots.map(
																		(slot) =>
																			slot.id === textEl.slotId
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
												<label htmlFor={textFitId}>자동 맞춤</label>
												<select
													id={textFitId}
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
													부모 Group "{textEl.groupOverflow.groupName}" 오른쪽
													경계를 {textEl.groupOverflow.overflowRight}px
													초과합니다.
												</span>
												<span className="text-fit-meta">
													Group은 자동 확장하지 않습니다. 필요하면 Shape 모드나
													Group 폭을 조정하세요.
												</span>
											</div>
										)}
									</div>
								);
							})}
						</>
					)}
			</div>
		</div>
	);
});

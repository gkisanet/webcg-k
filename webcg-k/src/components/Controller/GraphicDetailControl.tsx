import { AlertTriangle, Box, Info, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	applyGraphicDetailDataField,
	buildGraphicDetailControlModel,
	type GraphicDetailDataField,
} from "../../lib/graphicDetailControlModel";
import type { RendererGraphicCommandResultStatus } from "../../lib/rendererGraphicCommand";
import type { GraphicBlock } from "../../stores/timelineStore";

export interface GraphicRuntimeCommandState {
	seqNum: number;
	status: "pending" | RendererGraphicCommandResultStatus;
	message?: string;
	currentStep?: number;
	updatedAt: number;
}

interface GraphicDetailControlProps {
	block: GraphicBlock | null;
	disabled?: boolean;
	isProgram?: boolean;
	isPlayoutActive?: boolean;
	runtimeCommandState?: GraphicRuntimeCommandState | null;
	onApplyData: (blockId: string, sourceData: Record<string, unknown>) => void;
	onRunCustomAction?: (block: GraphicBlock, actionId: string) => void;
	onRunStep?: (block: GraphicBlock, delta: number) => void;
}

type DraftValue = string | number | boolean;

function initialDraftValues(fields: GraphicDetailDataField[]) {
	return Object.fromEntries(
		fields.map((field) => [field.key, field.value]),
	) as Record<string, DraftValue>;
}

function isRequiredFieldEmpty(
	field: GraphicDetailDataField,
	value: DraftValue | undefined,
) {
	return (
		field.required &&
		field.type !== "boolean" &&
		String(value ?? "").trim().length === 0
	);
}

function getRuntimeCommandStatusLabel(
	status: GraphicRuntimeCommandState["status"],
) {
	switch (status) {
		case "pending":
			return "실행 중";
		case "handled":
			return "실행 완료";
		case "unsupported":
			return "미지원";
		case "error":
			return "실패";
	}
}

function getRuntimeCommandStatusTone(
	status: GraphicRuntimeCommandState["status"],
) {
	switch (status) {
		case "pending":
			return "pending";
		case "handled":
			return "ok";
		case "unsupported":
			return "warning";
		case "error":
			return "error";
	}
}

function GraphicDetailFieldInput({
	id,
	field,
	value,
	disabled,
	onChange,
}: {
	id: string;
	field: GraphicDetailDataField;
	value: DraftValue | undefined;
	disabled?: boolean;
	onChange: (value: DraftValue) => void;
}) {
	if (field.type === "boolean") {
		return (
			<label className="graphic-detail-toggle" htmlFor={id}>
				<input
					id={id}
					type="checkbox"
					checked={value === true}
					disabled={disabled}
					onChange={(event) => onChange(event.target.checked)}
				/>
				<span>{value === true ? "On" : "Off"}</span>
			</label>
		);
	}

	return (
		<input
			id={id}
			className="graphic-detail-input"
			type={field.type === "number" ? "number" : "text"}
			value={value ?? ""}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value)}
		/>
	);
}

export function GraphicDetailControl({
	block,
	disabled = false,
	isProgram = false,
	isPlayoutActive = false,
	runtimeCommandState = null,
	onApplyData,
	onRunCustomAction,
	onRunStep,
}: GraphicDetailControlProps) {
	const model = useMemo(() => buildGraphicDetailControlModel(block), [block]);
	const [draftValues, setDraftValues] = useState<Record<string, DraftValue>>(
		{},
	);

	useEffect(() => {
		setDraftValues(initialDraftValues(model.dataFields));
	}, [model.dataFields]);

	const isDirty = model.dataFields.some(
		(field) => draftValues[field.key] !== field.value,
	);
	const hasInvalidRequiredField = model.dataFields.some((field) =>
		isRequiredFieldEmpty(field, draftValues[field.key]),
	);
	const canApply =
		model.selected &&
		model.dataFields.length > 0 &&
		isDirty &&
		!hasInvalidRequiredField &&
		!disabled;
	const commandDisabledReason = disabled
		? "제어 권한이 없습니다"
		: !model.supportsRuntimeCommands
			? "OGraf Web Component runtime만 직접 제어할 수 있습니다"
			: runtimeCommandState?.status === "pending"
				? "이전 runtime 명령 실행 결과를 기다리는 중입니다"
				: !isPlayoutActive
					? "리허설 또는 라이브 상태에서만 실행할 수 있습니다"
					: !isProgram
						? "현재 PGM에 올라간 방송 그래픽만 제어할 수 있습니다"
						: null;
	const canRunRuntimeCommand = commandDisabledReason == null;

	const handleApply = () => {
		if (!block || !model.blockId || !canApply) return;

		const nextSourceData = model.dataFields.reduce<Record<string, unknown>>(
			(currentSourceData, field) =>
				applyGraphicDetailDataField(
					currentSourceData,
					field,
					draftValues[field.key] ?? field.value,
				),
			block.sourceData ?? {},
		);

		onApplyData(model.blockId, nextSourceData);
	};

	if (!model.selected) {
		return (
			<aside className="graphic-detail-control graphic-detail-control-empty">
				<Box size={20} />
				<div>
					<h2>Graphic Detail</h2>
					<p>타임라인의 방송 그래픽을 선택하면 세부 제어가 표시됩니다.</p>
				</div>
			</aside>
		);
	}

	return (
		<aside className="graphic-detail-control">
			<header className="graphic-detail-header">
				<div>
					<p className="graphic-detail-kicker">Graphic Detail</p>
					<h2>{model.blockName}</h2>
				</div>
				<span className="graphic-detail-source">{model.sourceType}</span>
			</header>

			<section className="graphic-detail-section">
				<div className="graphic-detail-meta-row">
					<span>Track {model.trackId ?? "-"}</span>
					<span>{model.runtimeKind || "Legacy"}</span>
				</div>
				{model.packageSummary && (
					<div className="graphic-detail-package">
						<strong>{model.packageSummary.packageName}</strong>
						<div className="graphic-detail-badges">
							{model.packageSummary.badgeLabels.map((badge) => (
								<span
									key={`${badge.label}-${badge.tone}`}
									className={`graphic-detail-badge graphic-detail-badge-${badge.tone}`}
									title={badge.title}
								>
									{badge.label}
								</span>
							))}
						</div>
					</div>
				)}
				{model.infoLines.map((line) => (
					<p key={line} className="graphic-detail-info">
						<Info size={12} />
						<span>{line}</span>
					</p>
				))}
			</section>

			<section className="graphic-detail-section">
				<div className="graphic-detail-section-title">
					<SlidersHorizontal size={14} />
					<span>Data</span>
				</div>
				{model.dataFields.length === 0 ? (
					<p className="graphic-detail-muted">
						이 방송 그래픽은 아직 제어 가능한 data schema가 없습니다.
					</p>
				) : (
					<div className="graphic-detail-fields">
						{model.dataFields.map((field) => {
							const inputId = `graphic-detail-${model.blockId}-${field.key}`;
							return (
								<div key={field.key} className="graphic-detail-field">
									<label
										className="graphic-detail-field-label"
										htmlFor={inputId}
									>
										{field.label}
										{field.required && (
											<span className="graphic-detail-required">required</span>
										)}
									</label>
									<GraphicDetailFieldInput
										id={inputId}
										field={field}
										value={draftValues[field.key]}
										disabled={disabled}
										onChange={(value) =>
											setDraftValues((current) => ({
												...current,
												[field.key]: value,
											}))
										}
									/>
									{field.description && (
										<span className="graphic-detail-description">
											{field.description}
										</span>
									)}
								</div>
							);
						})}
						<button
							type="button"
							className="graphic-detail-apply"
							disabled={!canApply}
							onClick={handleApply}
						>
							Apply Data
						</button>
						{hasInvalidRequiredField && (
							<p className="graphic-detail-warning">
								<AlertTriangle size={12} />
								<span>필수 필드를 채워야 적용할 수 있습니다.</span>
							</p>
						)}
					</div>
				)}
			</section>

			<section className="graphic-detail-section">
				<div className="graphic-detail-section-title">
					<Box size={14} />
					<span>Actions</span>
				</div>
				{model.customActions.length === 0 ? (
					<p className="graphic-detail-muted">
						이 방송 그래픽은 customAction을 선언하지 않았습니다.
					</p>
				) : (
					<div className="graphic-detail-actions">
						{model.customActions.map((action) => (
							<button
								key={action.id}
								type="button"
								disabled={!canRunRuntimeCommand || !onRunCustomAction}
								title={commandDisabledReason ?? action.description}
								className="graphic-detail-action"
								onClick={() => {
									if (!block || !onRunCustomAction) return;
									onRunCustomAction(block, action.id);
								}}
							>
								{action.label}
							</button>
						))}
					</div>
				)}
				{model.stepCount && (
					<div className="graphic-detail-step">
						<p className="graphic-detail-muted">
							Step {model.stepCount}개 선언됨
							{runtimeCommandState?.currentStep != null
								? ` · renderer currentStep ${runtimeCommandState.currentStep}`
								: " · renderer currentStep 대기 중"}
						</p>
						<div className="graphic-detail-step-controls">
							<button
								type="button"
								className="graphic-detail-step-button"
								disabled={!canRunRuntimeCommand || !onRunStep}
								title={commandDisabledReason ?? "Previous step"}
								onClick={() => {
									if (!block || !onRunStep) return;
									onRunStep(block, -1);
								}}
							>
								Prev
							</button>
							<button
								type="button"
								className="graphic-detail-step-button"
								disabled={!canRunRuntimeCommand || !onRunStep}
								title={commandDisabledReason ?? "Next step"}
								onClick={() => {
									if (!block || !onRunStep) return;
									onRunStep(block, 1);
								}}
							>
								Next
							</button>
						</div>
					</div>
				)}
				{runtimeCommandState && (
					<div
						className={`graphic-detail-runtime-status graphic-detail-runtime-status-${getRuntimeCommandStatusTone(runtimeCommandState.status)}`}
					>
						<span>
							{getRuntimeCommandStatusLabel(runtimeCommandState.status)}
						</span>
						{runtimeCommandState.currentStep != null && (
							<strong>Step {runtimeCommandState.currentStep}</strong>
						)}
						{runtimeCommandState.message && (
							<small>{runtimeCommandState.message}</small>
						)}
					</div>
				)}
				{commandDisabledReason && (
					<p className="graphic-detail-muted">{commandDisabledReason}</p>
				)}
			</section>
		</aside>
	);
}

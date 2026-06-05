import { useStore } from "@tanstack/react-store";
import { Activity, Bell, Check, CheckCheck, Clock, RotateCcw, ScrollText, X, XCircle } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	ACTION_LABELS,
	type ActionLogEntry,
	actionLogStore,
	clearActionLog,
} from "../../stores/actionLogStore";
import {
	approveAllPendingChanges,
	approvePendingChange,
	clearProcessedChanges,
	dismissAllPendingChanges,
	dismissPendingChange,
	getPendingChanges,
	getPendingCount,
	pendingChangesStore,
	type PendingChange,
} from "../../stores/pendingChangesStore";
import { updateBlockSourceData } from "../../stores/timelineStore";

interface ControllerActivityPanelProps {
	onApplyNrcsChange?: (blockId: string) => void;
	canApplyNrcs?: boolean;
}

export function ControllerActivityPanel({
	onApplyNrcsChange,
	canApplyNrcs = true,
}: ControllerActivityPanelProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"nrcs" | "log">("nrcs");
	const entries = useStore(actionLogStore, (state) => state.entries);
	const pendingCount = useStore(pendingChangesStore, getPendingCount);
	const pendingChanges = useStore(pendingChangesStore, getPendingChanges);
	const totalCount = pendingCount + entries.length;

	const handleClose = useCallback(() => {
		setIsOpen(false);
		clearProcessedChanges();
	}, []);

	const applyChange = useCallback(
		(change: PendingChange) => {
			approvePendingChange(change.id);
			if (!canApplyNrcs || !change.blockId || !change.newRecord) return;
			const isPgm = updateBlockSourceData(change.blockId, change.newRecord);
			if (isPgm) onApplyNrcsChange?.(change.blockId);
		},
		[canApplyNrcs, onApplyNrcsChange],
	);

	const applyAllChanges = useCallback(() => {
		const approved = approveAllPendingChanges();
		if (!canApplyNrcs) return;
		for (const change of approved) {
			if (!change.blockId || !change.newRecord) continue;
			const isPgm = updateBlockSourceData(change.blockId, change.newRecord);
			if (isPgm) onApplyNrcsChange?.(change.blockId);
		}
	}, [canApplyNrcs, onApplyNrcsChange]);

	return (
		<div style={{ position: "relative" }}>
			<Button
				variant="secondary"
				onClick={() => setIsOpen((open) => !open)}
				style={{
					padding: "0.375rem 0.625rem",
					position: "relative",
					display: "flex",
					alignItems: "center",
					gap: "0.375rem",
					fontSize: "0.75rem",
					fontWeight: 600,
				}}
				title="NRCS 변경 및 액션 로그"
			>
				<Activity size={14} />
				활동
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						minWidth: 18,
						height: 16,
						borderRadius: 999,
						padding: "0 5px",
						background: pendingCount > 0 ? "var(--accent-danger)" : totalCount > 0 ? "var(--accent-primary)" : "transparent",
						border: totalCount > 0 ? "none" : "1px solid var(--border-default)",
						color: totalCount > 0 ? "white" : "var(--text-tertiary)",
						fontSize: "0.625rem",
						fontWeight: 700,
						lineHeight: 1,
					}}
				>
					{totalCount}
				</span>
			</Button>

			{isOpen && (
				<div
					style={{
						position: "absolute",
						top: "calc(100% + 8px)",
						right: 0,
						width: 440,
						maxHeight: 560,
						background: "var(--app-bg-alt)",
						border: "1px solid var(--border-default)",
						borderRadius: "0.75rem",
						boxShadow: "var(--glass-shadow)",
						zIndex: 120,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							padding: "0.75rem",
							borderBottom: "1px solid var(--border-subtle)",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "0.75rem",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 700 }}>
							<Activity size={15} style={{ color: "var(--accent-primary)" }} />
							활동
						</div>
						<button
							type="button"
							onClick={handleClose}
							style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: 4 }}
							title="닫기"
						>
							<X size={16} />
						</button>
					</div>

					<div style={{ display: "flex", gap: 4, padding: "0.5rem", borderBottom: "1px solid var(--border-subtle)" }}>
						<ActivityTab
							active={activeTab === "nrcs"}
							icon={<Bell size={13} />}
							label="NRCS"
							count={pendingCount}
							onClick={() => setActiveTab("nrcs")}
							danger={pendingCount > 0}
						/>
						<ActivityTab
							active={activeTab === "log"}
							icon={<ScrollText size={13} />}
							label="로그"
							count={entries.length}
							onClick={() => setActiveTab("log")}
						/>
					</div>

					<div style={{ flex: 1, overflow: "auto" }}>
						{activeTab === "nrcs" ? (
							<NrcsActivityTab
								pendingChanges={pendingChanges}
								pendingCount={pendingCount}
								canApply={canApplyNrcs}
								onApprove={applyChange}
								onApproveAll={applyAllChanges}
							/>
						) : (
							<ActionLogActivityTab entries={entries} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function ActivityTab({
	active,
	icon,
	label,
	count,
	onClick,
	danger = false,
}: {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	count: number;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				flex: 1,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.375rem",
				padding: "0.4rem 0.5rem",
				borderRadius: "0.5rem",
				border: active ? "1px solid var(--accent-subtle-border)" : "1px solid transparent",
				background: active ? "var(--accent-subtle-bg)" : "transparent",
				color: active ? "var(--accent-primary)" : "var(--text-secondary)",
				fontSize: "0.75rem",
				fontWeight: 600,
				cursor: "pointer",
			}}
		>
			{icon}
			{label}
			<span style={{ color: danger ? "var(--accent-danger)" : "inherit", fontVariantNumeric: "tabular-nums" }}>
				{count}
			</span>
		</button>
	);
}

function NrcsActivityTab({
	pendingChanges,
	pendingCount,
	canApply,
	onApprove,
	onApproveAll,
}: {
	pendingChanges: PendingChange[];
	pendingCount: number;
	canApply: boolean;
	onApprove: (change: PendingChange) => void;
	onApproveAll: () => void;
}) {
	return (
		<div style={{ padding: "0.75rem" }}>
			{pendingCount > 0 && (
				<div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
					<button type="button" className="activity-action-button success" onClick={onApproveAll} disabled={!canApply}>
						<CheckCheck size={14} />
						전체 승인
					</button>
					<button type="button" className="activity-action-button danger" onClick={dismissAllPendingChanges}>
						<XCircle size={14} />
						전체 무시
					</button>
				</div>
			)}
			{pendingChanges.length === 0 ? (
				<EmptyActivity icon={<Bell size={26} />} label="대기 중인 NRCS 변경사항이 없습니다" />
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
					{pendingChanges.map((change) => (
						<NrcsChangeItem
							key={change.id}
							change={change}
							canApply={canApply}
							onApprove={() => onApprove(change)}
							onDismiss={() => dismissPendingChange(change.id)}
						/>
					))}
				</div>
			)}
			<ActivityPanelStyles />
		</div>
	);
}

function NrcsChangeItem({
	change,
	canApply,
	onApprove,
	onDismiss,
}: {
	change: PendingChange;
	canApply: boolean;
	onApprove: () => void;
	onDismiss: () => void;
}) {
	const changedFields = change.fieldChanges?.length ?? 0;
	const title = change.blockName || change.cuesheetItemId.slice(0, 8);
	return (
		<div className="activity-card">
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
				<div style={{ minWidth: 0 }}>
					<div style={{ color: "var(--text-primary)", fontSize: "0.8125rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{title}
					</div>
					<div style={{ marginTop: 2, color: "var(--text-tertiary)", fontSize: "0.6875rem" }}>
						{change.eventType} · 변경 필드 {changedFields}개
					</div>
				</div>
				<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
					<button type="button" className="activity-icon-button success" onClick={onApprove} disabled={!canApply} title="승인">
						<Check size={13} />
					</button>
					<button type="button" className="activity-icon-button danger" onClick={onDismiss} title="무시">
						<X size={13} />
					</button>
				</div>
			</div>
		</div>
	);
}

function ActionLogActivityTab({ entries }: { entries: ActionLogEntry[] }) {
	const sortedEntries = useMemo(() => entries.slice(0, 80), [entries]);
	return (
		<div style={{ padding: "0.75rem" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
				<span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600 }}>
					최근 액션 {entries.length}개
				</span>
				<button
					type="button"
					className="activity-reset-button"
					onClick={() => {
						if (entries.length > 0) clearActionLog();
					}}
					disabled={entries.length === 0}
				>
					<RotateCcw size={12} />
					Reset
				</button>
			</div>
			{sortedEntries.length === 0 ? (
				<EmptyActivity icon={<Clock size={26} />} label="기록된 액션 로그가 없습니다" />
			) : (
				<div style={{ display: "flex", flexDirection: "column" }}>
					{sortedEntries.map((entry) => (
						<ActionLogItem key={entry.id} entry={entry} />
					))}
				</div>
			)}
			<ActivityPanelStyles />
		</div>
	);
}

function ActionLogItem({ entry }: { entry: ActionLogEntry }) {
	const { t } = useTranslation("common");
	const info = ACTION_LABELS[entry.type];
	const time = entry.timestamp.toLocaleTimeString("ko-KR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	return (
		<div className="activity-log-row">
			<span style={{ color: "var(--text-tertiary)", fontFamily: "monospace", fontSize: "0.625rem", flexShrink: 0 }}>
				{time}
			</span>
			<span style={{ flexShrink: 0 }}>{info.icon}</span>
			<div style={{ minWidth: 0 }}>
				<div style={{ color: info.color, fontSize: "0.75rem", fontWeight: 700 }}>
					{t(info.label)}
				</div>
				<div style={{ color: "var(--text-tertiary)", fontSize: "0.6875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
					{entry.targetName || entry.detail || entry.userName}
				</div>
			</div>
		</div>
	);
}

function EmptyActivity({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "2.5rem 1rem", color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
			<div style={{ opacity: 0.45 }}>{icon}</div>
			{label}
		</div>
	);
}

function ActivityPanelStyles() {
	return (
		<style>{`
			.activity-card {
				background: var(--surface-card);
				border: 1px solid var(--border-subtle);
				border-radius: 0.5rem;
				padding: 0.625rem;
			}
			.activity-action-button,
			.activity-icon-button,
			.activity-reset-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 0.25rem;
				border-radius: 0.375rem;
				border: 1px solid var(--border-default);
				background: var(--surface-input);
				color: var(--text-secondary);
				cursor: pointer;
				transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
			}
			.activity-action-button {
				flex: 1;
				padding: 0.375rem;
				font-size: 0.75rem;
				font-weight: 700;
			}
			.activity-icon-button {
				width: 1.75rem;
				height: 1.75rem;
			}
			.activity-reset-button {
				padding: 0.25rem 0.5rem;
				font-size: 0.6875rem;
				font-weight: 600;
			}
			.activity-action-button:disabled,
			.activity-icon-button:disabled,
			.activity-reset-button:disabled {
				opacity: 0.45;
				cursor: not-allowed;
			}
			.activity-action-button.success,
			.activity-icon-button.success {
				color: var(--accent-success);
				background: rgba(16, 185, 129, 0.12);
				border-color: rgba(16, 185, 129, 0.32);
			}
			.activity-action-button.danger,
			.activity-icon-button.danger {
				color: var(--accent-danger);
				background: rgba(239, 68, 68, 0.1);
				border-color: rgba(239, 68, 68, 0.28);
			}
			.activity-log-row {
				display: grid;
				grid-template-columns: auto auto minmax(0, 1fr);
				gap: 0.5rem;
				align-items: flex-start;
				padding: 0.5rem 0.25rem;
				border-bottom: 1px solid rgba(255, 255, 255, 0.04);
			}
		`}</style>
	);
}

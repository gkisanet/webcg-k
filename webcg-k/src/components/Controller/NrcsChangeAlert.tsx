/**
 * NrcsChangeAlert — NRCS 변경 알림 배지 + Diff 드로어
 *
 * ■ 워크플로우:
 *   1. 헤더에 🔔 알림 배지 표시 (pending 변경 건수)
 *   2. 클릭 → 드로어 열기 → 필드 레벨 Diff 비교 표시
 *   3. PD가 개별/일괄 승인 또는 무시
 *   4. 승인 시 → updateBlockSourceData() → 렌더러 재발행
 *
 * ■ Why 인메모리?
 *   알림은 현재 세션 한정 정보. 페이지 새로고침 시 소멸되어도 무방.
 */

import { Bell, Check, CheckCheck, X, XCircle } from "lucide-react";
import { useState, useCallback } from "react";
import { useStore } from "@tanstack/react-store";
import {
	pendingChangesStore,
	getPendingCount,
	getPendingChanges,
	approvePendingChange,
	dismissPendingChange,
	approveAllPendingChanges,
	dismissAllPendingChanges,
	clearProcessedChanges,
	type PendingChange,
	type FieldChange,
} from "../../stores/pendingChangesStore";
import { updateBlockSourceData } from "../../stores/timelineStore";

interface NrcsChangeAlertProps {
	/** 승인 후 렌더러 재발행 콜백 */
	onApplyChange?: (blockId: string) => void;
}

export function NrcsChangeAlert({ onApplyChange }: NrcsChangeAlertProps) {
	const [isOpen, setIsOpen] = useState(false);

	// Pending 변경 건수 구독
	const pendingCount = useStore(pendingChangesStore, getPendingCount);
	const pendingChanges = useStore(pendingChangesStore, getPendingChanges);

	// ─── 개별 승인 ─────────────────────────────────────
	const handleApprove = useCallback(
		(change: PendingChange) => {
			// 1. pending → approved 상태로 전환
			approvePendingChange(change.id);

			// 2. 매핑된 타임라인 블록이 있으면 sourceData 직접 교체
			if (change.blockId && change.newRecord) {
				const isPgm = updateBlockSourceData(
					change.blockId,
					change.newRecord,
				);
				// 3. PGM 블록이면 렌더러 재발행
				if (isPgm && onApplyChange) {
					onApplyChange(change.blockId);
				}
			}
		},
		[onApplyChange],
	);

	// ─── 일괄 승인 ─────────────────────────────────────
	const handleApproveAll = useCallback(() => {
		const approved = approveAllPendingChanges();
		for (const change of approved) {
			if (change.blockId && change.newRecord) {
				const isPgm = updateBlockSourceData(
					change.blockId,
					change.newRecord,
				);
				if (isPgm && onApplyChange) {
					onApplyChange(change.blockId);
				}
			}
		}
	}, [onApplyChange]);

	// ─── 드로어 닫기 ───────────────────────────────────
	const handleClose = useCallback(() => {
		setIsOpen(false);
		// 처리 완료된 항목 정리
		clearProcessedChanges();
	}, []);

	return (
		<>
			{/* ─── 알림 배지 버튼 ─────────────────────────── */}
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				style={{
					position: "relative",
					background: pendingCount > 0 ? "rgba(239, 68, 68, 0.15)" : "var(--app-bg-muted)",
					border: pendingCount > 0 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid var(--border-default)",
					borderRadius: "6px",
					padding: "0.375rem",
					cursor: "pointer",
					color: pendingCount > 0 ? "#ef4444" : "var(--text-tertiary)",
					transition: "all 0.2s",
				}}
				title={pendingCount > 0 ? `NRCS 변경 ${pendingCount}건 대기 중` : "NRCS 변경 알림 없음"}
			>
				<Bell size={16} />
				{/* 배지 카운트 */}
				{pendingCount > 0 && (
					<span
						style={{
							position: "absolute",
							top: "-4px",
							right: "-4px",
							background: "#ef4444",
							color: "#fff",
							borderRadius: "999px",
							padding: "0 5px",
							fontSize: "10px",
							fontWeight: 700,
							lineHeight: "16px",
							minWidth: "16px",
							textAlign: "center",
							animation: "pulse 2s ease-in-out infinite",
						}}
					>
						{pendingCount}
					</span>
				)}
			</button>

			{/* ─── 드로어 오버레이 ────────────────────────── */}
			{isOpen && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 1000,
						display: "flex",
						justifyContent: "flex-end",
					}}
				>
					{/* 배경 딤 */}
					<div
						style={{
							position: "absolute",
							inset: 0,
							background: "rgba(0,0,0,0.4)",
						}}
						onClick={handleClose}
					/>

					{/* 드로어 패널 */}
					<div
						style={{
							position: "relative",
							width: "420px",
							maxWidth: "90vw",
							height: "100%",
							background: "var(--app-bg, #0a0a0f)",
							borderLeft: "1px solid var(--border-default)",
							display: "flex",
							flexDirection: "column",
							animation: "slideInRight 0.2s ease-out",
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
								<Bell size={16} style={{ color: "var(--accent-primary)" }} />
								<span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
									NRCS 변경 알림
								</span>
								{pendingCount > 0 && (
									<span
										style={{
											background: "#ef4444",
											color: "#fff",
											borderRadius: "999px",
											padding: "0 6px",
											fontSize: "11px",
											fontWeight: 700,
										}}
									>
										{pendingCount}건
									</span>
								)}
							</div>
							<button
								type="button"
								onClick={handleClose}
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

						{/* 일괄 액션 바 */}
						{pendingCount > 0 && (
							<div
								style={{
									padding: "0.5rem 1rem",
									borderBottom: "1px solid var(--border-default)",
									display: "flex",
									gap: "0.5rem",
								}}
							>
								<button
									type="button"
									onClick={handleApproveAll}
									style={{
										flex: 1,
										padding: "0.375rem",
										background: "rgba(16, 185, 129, 0.15)",
										border: "1px solid rgba(16, 185, 129, 0.4)",
										borderRadius: "4px",
										color: "#10b981",
										fontSize: "12px",
										fontWeight: 600,
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: "4px",
									}}
								>
									<CheckCheck size={14} />
									전체 승인
								</button>
								<button
									type="button"
									onClick={dismissAllPendingChanges}
									style={{
										flex: 1,
										padding: "0.375rem",
										background: "rgba(239, 68, 68, 0.1)",
										border: "1px solid rgba(239, 68, 68, 0.3)",
										borderRadius: "4px",
										color: "#ef4444",
										fontSize: "12px",
										fontWeight: 600,
										cursor: "pointer",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: "4px",
									}}
								>
									<XCircle size={14} />
									전체 무시
								</button>
							</div>
						)}

						{/* 변경 목록 */}
						<div style={{ flex: 1, overflow: "auto", padding: "0.75rem" }}>
							{pendingChanges.length === 0 ? (
								<div
									style={{
										textAlign: "center",
										padding: "3rem 1rem",
										color: "var(--text-tertiary)",
										fontSize: "13px",
									}}
								>
									<Bell size={32} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
									<p>대기 중인 변경사항이 없습니다</p>
								</div>
							) : (
								<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
									{pendingChanges.map((change) => (
										<ChangeCard
											key={change.id}
											change={change}
											onApprove={() => handleApprove(change)}
											onDismiss={() => dismissPendingChange(change.id)}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* 애니메이션 CSS */}
			<style>{`
				@keyframes slideInRight {
					from { transform: translateX(100%); }
					to { transform: translateX(0); }
				}
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.6; }
				}
			`}</style>
		</>
	);
}

// ─── ChangeCard — 개별 변경 카드 ─────────────────────────────

function ChangeCard({
	change,
	onApprove,
	onDismiss,
}: {
	change: PendingChange;
	onApprove: () => void;
	onDismiss: () => void;
}) {
	const timeAgo = getTimeAgo(change.timestamp);

	return (
		<div
			style={{
				background: "var(--app-bg-muted, #111)",
				border: "1px solid var(--border-default)",
				borderRadius: "8px",
				padding: "0.75rem",
				borderLeft: change.eventType === "DELETE"
					? "3px solid #ef4444"
					: change.eventType === "INSERT"
						? "3px solid #10b981"
						: "3px solid #f59e0b",
			}}
		>
			{/* 카드 헤더 */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "0.5rem",
				}}
			>
				<div>
					<span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
						{change.blockName || change.cuesheetItemId.slice(0, 8)}
					</span>
					<span
						style={{
							marginLeft: "0.5rem",
							fontSize: "10px",
							padding: "1px 5px",
							borderRadius: "3px",
							background:
								change.eventType === "DELETE"
									? "rgba(239,68,68,0.2)"
									: change.eventType === "INSERT"
										? "rgba(16,185,129,0.2)"
										: "rgba(245,158,11,0.2)",
							color:
								change.eventType === "DELETE"
									? "#ef4444"
									: change.eventType === "INSERT"
										? "#10b981"
										: "#f59e0b",
						}}
					>
						{change.eventType === "DELETE" ? "삭제" : change.eventType === "INSERT" ? "추가" : "수정"}
					</span>
				</div>
				<span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{timeAgo}</span>
			</div>

			{/* 필드 변경 Diff */}
			{change.fieldChanges.length > 0 && (
				<div style={{ marginBottom: "0.5rem" }}>
					{change.fieldChanges.map((field: FieldChange) => (
						<FieldDiff key={field.fieldKey} field={field} />
					))}
				</div>
			)}

			{/* 액션 버튼 */}
			<div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
				<button
					type="button"
					onClick={onDismiss}
					style={{
						padding: "0.25rem 0.625rem",
						background: "none",
						border: "1px solid var(--border-default)",
						borderRadius: "4px",
						color: "var(--text-tertiary)",
						fontSize: "11px",
						cursor: "pointer",
					}}
				>
					무시
				</button>
				<button
					type="button"
					onClick={onApprove}
					style={{
						padding: "0.25rem 0.625rem",
						background: "rgba(16, 185, 129, 0.2)",
						border: "1px solid rgba(16, 185, 129, 0.5)",
						borderRadius: "4px",
						color: "#10b981",
						fontSize: "11px",
						fontWeight: 600,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: "3px",
					}}
				>
					<Check size={12} />
					반영
				</button>
			</div>
		</div>
	);
}

// ─── FieldDiff — 필드 레벨 변경 표시 ─────────────────────────

function FieldDiff({ field }: { field: FieldChange }) {
	return (
		<div
			style={{
				padding: "0.25rem 0.5rem",
				marginBottom: "0.25rem",
				background: "rgba(0,0,0,0.3)",
				borderRadius: "4px",
				fontSize: "12px",
			}}
		>
			<span style={{ color: "var(--text-tertiary)", marginRight: "0.375rem" }}>
				{field.fieldLabel}:
			</span>
			<span style={{ color: "#ef4444", textDecoration: "line-through", marginRight: "0.375rem" }}>
				{field.oldValue || "(빈 값)"}
			</span>
			<span style={{ color: "var(--text-tertiary)" }}>→</span>
			<span style={{ color: "#10b981", marginLeft: "0.375rem", fontWeight: 600 }}>
				{field.newValue || "(빈 값)"}
			</span>
		</div>
	);
}

// ─── 유틸 ──────────────────────────────────────────────────────

function getTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return `${seconds}초 전`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}분 전`;
	return `${Math.floor(minutes / 60)}시간 전`;
}

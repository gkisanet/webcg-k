import { useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	AlertTriangle,
	XCircle,
	Shield,
	Loader2,
	Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
	type CuesheetReusePolicy,
	type CuesheetValidationReportRecord,
	type CuesheetValidationStatus,
} from "@/services/cuesheetCheckService";
import {
	type PreflightReport,
	type PreflightItemResult,
	type PreflightCgResult,
} from "@/services/preflightService";
import { linkCuesheetToRundown } from "@/services/cuesheetService";
import { CG_TYPE_COLORS, CG_TYPE_LABELS } from "@/lib/nrcsTypes";

export interface PreflightPanelProps {
	mode?: "cuesheet" | "rundown";
	report: PreflightReport | null;
	loading: boolean;
	onRefresh: () => void;
	cuesheetId: string;
	linkedRundownId: string | null;
	reusePolicy: CuesheetReusePolicy;
	onReusePolicyChange: (policy: CuesheetReusePolicy) => void;
	latestValidation: CuesheetValidationReportRecord | null;
	validationStale: boolean;
	validationLoading: boolean;
	approvingCheck: boolean;
	onApproveCheck: () => void;
}

export function PreflightPanel({
	mode = "cuesheet",
	report,
	loading,
	onRefresh,
	cuesheetId,
	linkedRundownId,
	reusePolicy,
	onReusePolicyChange,
	latestValidation,
	validationStale,
	validationLoading,
	approvingCheck,
	onApproveCheck,
}: PreflightPanelProps) {
	const [sending, setSending] = useState(false);
	const [rundownId, setRundownId] = useState("");
	const reusePolicySelectId = useId();
	const canApprove = !!report && report.validationStatus !== "blocked";
	const hasCurrentValidation =
		!!latestValidation &&
		!validationStale &&
		latestValidation.status !== "blocked";

	// 🆕 런다운 목록 조회 (드롭다운용, 큐시트 모드일 때만 가동)
	const { data: rundowns = [] } = useQuery({
		queryKey: ["rundowns_for_preflight"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("rundowns")
				.select("id, title, created_at")
				.order("created_at", { ascending: false })
				.limit(50);
			if (error) return [];
			return data || [];
		},
		enabled: mode === "cuesheet",
	});

	// 런다운으로 전송
	const handleSendToRundown = async () => {
		if (
			mode !== "cuesheet" ||
			!rundownId.trim() ||
			!latestValidation ||
			validationStale ||
			latestValidation.status === "blocked"
		)
			return;
		setSending(true);
		try {
			await linkCuesheetToRundown(cuesheetId, rundownId.trim(), {
				reportId: latestValidation.id,
				contentHash: latestValidation.contentHash,
				status: latestValidation.status,
				checkedAt: latestValidation.checkedAt,
			});
		} catch (err) {
			console.error("런다운 전송 실패:", err);
		}
		setSending(false);
	};

	const STATUS_ICON = {
		ok: <CheckCircle2 size={14} style={{ color: "#10b981" }} />,
		warning: <AlertTriangle size={14} style={{ color: "#f59e0b" }} />,
		error: <XCircle size={14} style={{ color: "#ef4444" }} />,
	};

	const STATUS_COLORS = {
		ok: { bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)" },
		warning: {
			bg: "rgba(245, 158, 11, 0.08)",
			border: "rgba(245, 158, 11, 0.2)",
		},
		error: { bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)" },
	};

	return (
		<div className="dash-surface cuesheet-check-panel" style={{ flexShrink: 0, width: 300 }}>
			{/* 헤더 */}
			<div className="dash-surface-header">
				<div className="dash-surface-header-title">
					<Shield size={13} style={{ color: "#60a5fa" }} />
					{mode === "rundown" ? "런다운 체크" : "큐시트 체크"}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onRefresh}
					disabled={loading}
					style={{ fontSize: 10, padding: "2px 8px", height: "auto" }}
				>
					{loading ? <Loader2 size={10} className="animate-spin" /> : "재검증"}
				</Button>
			</div>

			{/* 기준시점/재활용 정책 */}
			<div
				style={{
					padding: "8px 14px",
					borderBottom: "1px solid var(--border-default)",
					display: "flex",
					flexDirection: "column",
					gap: 6,
				}}
			>
				<label
					htmlFor={reusePolicySelectId}
					style={{
						fontSize: 10,
						color: "var(--text-tertiary)",
						fontWeight: 700,
					}}
				>
					시제 기준
				</label>
				<select
					id={reusePolicySelectId}
					value={reusePolicy}
					onChange={(e) =>
						onReusePolicyChange(e.target.value as CuesheetReusePolicy)
					}
					style={{
						background: "var(--app-bg-muted)",
						border: "1px solid var(--border-default)",
						borderRadius: 6,
						padding: "6px 8px",
						fontSize: 11,
						width: "100%",
					}}
				>
					<option value="reusable">재활용 런다운 기준 — 상대시제 경고</option>
					<option value="single_air">
						단일 송출 기준 — 상대시제 정보 표시
					</option>
				</select>

				<div
					style={{
						fontSize: 10,
						color: validationLoading
							? "var(--text-tertiary)"
							: hasCurrentValidation
								? "#10b981"
								: validationStale && latestValidation
									? "#f59e0b"
									: "#ef4444",
						lineHeight: 1.35,
					}}
				>
					{validationLoading
						? "검증 승인 상태 확인 중..."
						: hasCurrentValidation
							? `검증 승인됨 · ${latestValidation?.status === "needs_review" ? "경고 포함" : "정상"}`
							: validationStale && latestValidation
								? "검증 후 내용이 변경됨"
								: "현재 내용에 대한 검증 승인이 없음"}
				</div>
			</div>

			{/* 요약 바 */}
			{report && (
				<div
					style={{
						padding: "8px 14px",
						borderBottom: "1px solid var(--border-default)",
						display: "flex",
						gap: 10,
						fontSize: 11,
					}}
				>
					<span style={{ color: "#10b981", fontWeight: 600 }}>
						✅ {report.okCount}
					</span>
					<span style={{ color: "#f59e0b", fontWeight: 600 }}>
						🟡 {report.warningCount}
					</span>
					<span style={{ color: "#ef4444", fontWeight: 600 }}>
						🔴 {report.errorCount}
					</span>
					{report.contentIssueCount > 0 && (
						<span style={{ color: "#a78bfa", fontWeight: 600 }}>
							📝 {report.contentIssueCount}
						</span>
					)}
					<span style={{ color: "var(--text-tertiary)", marginLeft: "auto" }}>
						/ {report.totalItems}건
					</span>
				</div>
			)}

			{/* 아이템별 검증 결과 */}
			<div className="dash-surface-scroll">
				{loading ? (
					<div className="dash-surface-empty" style={{ padding: 40 }}>
						<Loader2
							size={20}
							className="animate-spin"
							style={{ margin: "0 auto 8px" }}
						/>
						<div style={{ fontSize: 12 }}>검증 중...</div>
					</div>
				) : !report ? (
					<div
						className="dash-surface-empty"
						style={{ padding: 40, fontSize: 12 }}
					>
						번들이 연결되지 않았습니다
					</div>
				) : report.items.length === 0 ? (
					<div
						className="dash-surface-empty"
						style={{ padding: 40, fontSize: 12 }}
					>
						아이템이 없습니다
					</div>
				) : (
					report.items.map((itemResult: PreflightItemResult) => {
						const { item, cgResults, contentIssues, status } = itemResult;
						const colors = STATUS_COLORS[status];

						return (
							<div
								key={item.id}
								style={{
									padding: "8px 12px",
									borderBottom: "1px solid var(--border-default)",
									background: colors.bg,
								}}
							>
								{/* 아이템 헤더 */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										marginBottom: 4,
									}}
								>
									{STATUS_ICON[status]}
									<span
										style={{
											fontWeight: 600,
											fontSize: 12,
											flex: 1,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{item.title || item.slug}
									</span>
								</div>

								{/* 방송 그래픽별 상세 */}
								{cgResults.length > 0 ? (
									<div
										style={{
											marginLeft: 20,
											display: "flex",
											flexDirection: "column",
											gap: 3,
										}}
									>
										{cgResults.map((cg) => {
											const typeColor =
												CG_TYPE_COLORS[
													cg.cgItem.type as keyof typeof CG_TYPE_COLORS
												] || "#888";
											return (
												<div
													key={cg.cgItem.id}
													style={{
														display: "flex",
														alignItems: "center",
														gap: 4,
														fontSize: 10,
													}}
												>
													{/* 방송 그래픽 타입 */}
													<span
														style={{
															padding: "0 4px",
															borderRadius: 2,
															background: `${typeColor}15`,
															color: typeColor,
															fontWeight: 600,
														}}
													>
														{CG_TYPE_LABELS[
															cg.cgItem.type as keyof typeof CG_TYPE_LABELS
														] || cg.cgItem.type}
													</span>

													{/* 그래픽 상태 */}
													{!cg.slot ? (
														<span style={{ color: "#ef4444" }}>슬롯 없음</span>
													) : !cg.graphicExists ? (
														<span style={{ color: "#ef4444" }}>
															그래픽 미존재
														</span>
													) : (
														<span
															style={{
																color: "var(--text-tertiary)",
																overflow: "hidden",
																textOverflow: "ellipsis",
																whiteSpace: "nowrap",
																maxWidth: 100,
															}}
														>
															{cg.graphicName}
														</span>
													)}

													{/* 매핑 비율 */}
													{cg.graphicExists && (
														<span
															style={{
																marginLeft: "auto",
																color:
																	cg.mappingRatio >= 1 ? "#10b981" : "#f59e0b",
																fontWeight: 600,
															}}
														>
															{cg.mappedFieldCount}/{cg.totalFieldCount}
														</span>
													)}

													{/* 오버플로우 */}
													{cg.overflowWarnings.length > 0 && (
														<span
															title={cg.overflowWarnings
																.map(
																	(w) =>
																		`${w.fieldKey}: ${Math.round(w.ratio * 100)}%`,
																)
																.join(", ")}
															style={{
																color: cg.overflowWarnings.some(
																	(w) => w.severity === "error",
																)
																	? "#ef4444"
																	: "#f59e0b",
															}}
														>
															⚠️
														</span>
													)}
												</div>
											);
										})}
									</div>
								) : (
									<div
										style={{
											marginLeft: 20,
											fontSize: 10,
											color: "var(--text-tertiary)",
										}}
									>
										방송 그래픽 데이터 없음
									</div>
								)}

								{/* 콘텐츠 검증 이슈 (맞춤법/금칙어/직함/시제) */}
								{contentIssues.length > 0 && (
									<div
										style={{
											marginLeft: 20,
											marginTop: 4,
											display: "flex",
											flexDirection: "column",
											gap: 2,
										}}
									>
										{contentIssues.map((issue) => (
											<div
												key={`${issue.type}-${issue.field}-${issue.original}-${issue.message}`}
												style={{
													fontSize: 10,
													display: "flex",
													alignItems: "flex-start",
													gap: 4,
													padding: "2px 4px",
													borderRadius: 3,
													background:
														issue.severity === "error"
															? "rgba(239, 68, 68, 0.08)"
															: issue.severity === "warning"
																? "rgba(245, 158, 11, 0.08)"
																: "rgba(167, 139, 250, 0.08)",
												}}
											>
												<span style={{ flexShrink: 0 }}>
													{issue.severity === "error"
														? "🚫"
														: issue.severity === "warning"
															? "⚠️"
															: "💡"}
												</span>
												<span
													style={{
														color:
															issue.severity === "error"
																? "#ef4444"
																: issue.severity === "warning"
																	? "#f59e0b"
																	: "#a78bfa",
														lineHeight: 1.3,
													}}
												>
													{issue.message}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			{/* 하단: 런다운 전송 및 승인 제어 (cuesheet 모드일 때만 활성) */}
			{mode === "cuesheet" && (
				<div
					style={{
						padding: "10px 12px",
						borderTop: "1px solid var(--border-default)",
						display: "flex",
						flexDirection: "column",
						gap: 6,
					}}
				>
					{linkedRundownId ? (
						<>
							<div
								style={{ fontSize: 11, color: "#10b981", textAlign: "center" }}
							>
								✅ 런다운에 연결됨
							</div>
							{validationStale && latestValidation && (
								<div
									style={{ fontSize: 10, color: "#f59e0b", textAlign: "center" }}
								>
									⚠️ 검증 후 변경됨 — 재검증 필요
								</div>
							)}
						</>
					) : (
						<>
							<Button
								size="sm"
								variant={
									report?.validationStatus === "needs_review"
										? "secondary"
										: "default"
								}
								onClick={onApproveCheck}
								disabled={approvingCheck || loading || !canApprove}
								style={{ fontSize: 11 }}
							>
								<CheckCircle2 size={12} />
								{approvingCheck
									? "승인 중..."
									: report?.validationStatus === "needs_review"
										? "경고 포함 승인"
										: "검증 승인"}
							</Button>
							{report?.validationStatus === "blocked" && (
								<div
									style={{ fontSize: 10, color: "#ef4444", textAlign: "center" }}
								>
									🔴 차단 이슈 해결 후 승인 가능
								</div>
							)}
							<select
								value={rundownId}
								onChange={(e) => setRundownId(e.target.value)}
								style={{
									background: "var(--app-bg-muted)",
									border: "1px solid var(--border-default)",
									borderRadius: 6,
									padding: "6px 8px",
									fontSize: 11,
									width: "100%",
								}}
							>
								<option value="">런다운 선택...</option>
								{rundowns.map((r) => (
									<option key={r.id} value={r.id}>
										{r.title || r.id.substring(0, 8)}
									</option>
								))}
							</select>
							<Button
								size="sm"
								onClick={handleSendToRundown}
								disabled={
									sending ||
									!rundownId ||
									!hasCurrentValidation ||
									(report?.errorCount ?? 0) > 0
								}
								style={{ fontSize: 11 }}
							>
								<Send size={12} />
								{sending ? "전송 중..." : "런다운으로 전송"}
							</Button>
							{report && report.errorCount > 0 && (
								<div
									style={{ fontSize: 10, color: "#ef4444", textAlign: "center" }}
								>
									⚠️ {report.errorCount}개 에러 해결 후 전송 가능
								</div>
							)}
							{!hasCurrentValidation && (report?.errorCount ?? 0) === 0 && (
								<div
									style={{ fontSize: 10, color: "#f59e0b", textAlign: "center" }}
								>
									검증 승인 후 런다운 전송 가능
								</div>
							)}
						</>
					)}
				</div>
			)}

			{/* 런다운 모드일 때의 하단 승인 폼 (Rundown-specific 승인 뱃지 및 재검증 가이드) */}
			{mode === "rundown" && (
				<div
					style={{
						padding: "10px 12px",
						borderTop: "1px solid var(--border-default)",
						display: "flex",
						flexDirection: "column",
						gap: 6,
					}}
				>
					<Button
						size="sm"
						variant={
							report?.validationStatus === "needs_review"
								? "secondary"
								: "default"
						}
						onClick={onApproveCheck}
						disabled={approvingCheck || loading || !canApprove}
						style={{ fontSize: 11 }}
					>
						<CheckCircle2 size={12} />
						{approvingCheck
							? "승인 중..."
							: report?.validationStatus === "needs_review"
								? "경고 포함 승인"
								: "런다운 검증 승인"}
					</Button>
					{report?.validationStatus === "blocked" && (
						<div
							style={{ fontSize: 10, color: "#ef4444", textAlign: "center" }}
						>
							🔴 차단 이슈 해결 후 승인 가능
						</div>
					)}
					{hasCurrentValidation ? (
						<div
							style={{ fontSize: 11, color: "#10b981", textAlign: "center", fontWeight: 600 }}
						>
							✅ 런다운 오탈 검증 승인 완료
						</div>
					) : (
						<div
							style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center" }}
						>
							송출 전 모든 에러를 해결하고 검증을 승인하십시오.
						</div>
					)}
				</div>
			)}
		</div>
	);
}

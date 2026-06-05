import { Play, Plus, Square, Trash2, Wand2, Waves } from "lucide-react";
import {
	addMotionTimelineItem,
	createDefaultMotionManifest,
	ensureEditableMotionManifest,
	getMotionAuthoringSummary,
	MOTION_AUTHORING_DRIVERS,
	MOTION_AUTHORING_PRESETS,
	removeMotionTimelineItem,
	updateMotionTimelineItem,
} from "../../../../lib/graphicMotionAuthoring";
import type {
	GraphicMotionManifest,
	GraphicMotionPreset,
} from "../../../../lib/graphicMotionManifest";

interface MotionPanelProps {
	motion: GraphicMotionManifest | null | undefined;
	onChange: (motion: GraphicMotionManifest | null) => void;
	onPreviewLifecycle: (type: "SHOW" | "HIDE") => void;
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		padding: "10px 12px",
		overflowY: "auto",
		flex: 1,
		display: "flex",
		flexDirection: "column",
		gap: "10px",
	},
	headerCard: {
		border: "1px solid rgba(34, 211, 238, 0.18)",
		background:
			"linear-gradient(135deg, rgba(8, 47, 73, 0.62), rgba(15, 23, 42, 0.72))",
		borderRadius: "10px",
		padding: "10px",
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: "8px",
	},
	title: {
		fontSize: "0.8125rem",
		fontWeight: 800,
		color: "#e0f2fe",
	},
	copy: {
		margin: "6px 0 0 0",
		fontSize: "0.6875rem",
		lineHeight: 1.45,
		color: "#94a3b8",
	},
	badge: {
		padding: "2px 7px",
		borderRadius: "999px",
		border: "1px solid rgba(34, 211, 238, 0.34)",
		background: "rgba(34, 211, 238, 0.12)",
		color: "#67e8f9",
		fontSize: "0.625rem",
		fontWeight: 800,
		letterSpacing: "0.04em",
	},
	actions: {
		display: "flex",
		gap: "6px",
		flexWrap: "wrap",
	},
	button: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: "5px",
		padding: "6px 10px",
		borderRadius: "7px",
		border: "1px solid rgba(255,255,255,0.1)",
		background: "rgba(15, 23, 42, 0.78)",
		color: "#cbd5e1",
		fontSize: "0.6875rem",
		fontWeight: 700,
		cursor: "pointer",
	},
	primaryButton: {
		border: "1px solid rgba(34, 211, 238, 0.42)",
		background: "rgba(34, 211, 238, 0.14)",
		color: "#67e8f9",
	},
	dangerButton: {
		border: "1px solid rgba(248, 113, 113, 0.35)",
		background: "rgba(127, 29, 29, 0.25)",
		color: "#fca5a5",
	},
	itemCard: {
		border: "1px solid rgba(255,255,255,0.08)",
		background: "rgba(2, 6, 23, 0.38)",
		borderRadius: "9px",
		padding: "10px",
		display: "flex",
		flexDirection: "column",
		gap: "8px",
	},
	itemHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "8px",
	},
	itemTitle: {
		color: "#e2e8f0",
		fontSize: "0.75rem",
		fontWeight: 800,
	},
	grid: {
		display: "grid",
		gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
		gap: "8px",
	},
	field: {
		display: "flex",
		flexDirection: "column",
		gap: "4px",
		minWidth: 0,
	},
	label: {
		color: "#64748b",
		fontSize: "0.625rem",
		fontWeight: 800,
		textTransform: "uppercase",
		letterSpacing: "0.04em",
	},
	input: {
		width: "100%",
		border: "1px solid rgba(255,255,255,0.1)",
		borderRadius: "6px",
		background: "rgba(0,0,0,0.28)",
		color: "#e2e8f0",
		fontSize: "0.75rem",
		padding: "7px 8px",
		outline: "none",
	},
	rangeRow: {
		display: "grid",
		gridTemplateColumns: "1fr 52px",
		gap: "8px",
		alignItems: "center",
	},
	empty: {
		border: "1px dashed rgba(148, 163, 184, 0.22)",
		borderRadius: "10px",
		padding: "18px 14px",
		textAlign: "center",
		color: "#94a3b8",
		fontSize: "0.75rem",
		background: "rgba(15, 23, 42, 0.36)",
	},
};

export function MotionPanel({
	motion,
	onChange,
	onPreviewLifecycle,
}: MotionPanelProps) {
	const summary = getMotionAuthoringSummary(motion);
	const editableMotion = summary.enabled
		? ensureEditableMotionManifest(motion)
		: null;

	return (
		<div style={styles.container}>
			<div style={styles.headerCard}>
				<div style={styles.row}>
					<Waves size={15} style={{ color: "#22d3ee" }} />
					<span style={styles.title}>Package Motion</span>
					<span style={{ marginLeft: "auto", ...styles.badge }}>
						{summary.enabled ? `${summary.itemCount} ITEM` : "OFF"}
					</span>
					{summary.usesGsap && <span style={styles.badge}>GSAP</span>}
				</div>
				<p style={styles.copy}>
					이 motion contract는 런다운 타임라인 fade보다 우선합니다. 타임라인은
					TAKE/OUT 시점만 정하고, 그래픽 내부 객체의 SHOW/HIDE motion은 여기서
					정의합니다.
				</p>
			</div>

			<div style={styles.actions}>
				<button
					type="button"
					style={{ ...styles.button, ...styles.primaryButton }}
					onClick={() => onChange(createDefaultMotionManifest())}
				>
					<Wand2 size={13} />
					{summary.enabled ? "기본값으로 재설정" : "Motion 켜기"}
				</button>
				{summary.enabled && (
					<>
						<button
							type="button"
							style={styles.button}
							onClick={() => onPreviewLifecycle("SHOW")}
						>
							<Play size={12} />
							SHOW 테스트
						</button>
						<button
							type="button"
							style={styles.button}
							onClick={() => onPreviewLifecycle("HIDE")}
						>
							<Square size={12} />
							HIDE 테스트
						</button>
						<button
							type="button"
							style={styles.button}
							onClick={() => onChange(addMotionTimelineItem(motion))}
						>
							<Plus size={12} />
							Target 추가
						</button>
						<button
							type="button"
							style={{ ...styles.button, ...styles.dangerButton }}
							onClick={() => onChange(null)}
						>
							Motion 끄기
						</button>
					</>
				)}
			</div>

			{!editableMotion ? (
				<div style={styles.empty}>
					<Waves
						size={28}
						style={{ color: "#22d3ee", opacity: 0.55, marginBottom: 8 }}
					/>
					<div style={{ fontWeight: 800, color: "#cbd5e1", marginBottom: 4 }}>
						아직 package motion이 없습니다
					</div>
					<div>
						기존 HTML/CSS/JS는 그대로 동작합니다. 복합 in/out이 필요한 방송
						그래픽(Broadcast Graphics)에만 Motion을 켜십시오.
					</div>
				</div>
			) : (
				editableMotion.timeline.map((item, index) => (
					<div key={`${item.target}-${index}`} style={styles.itemCard}>
						<div style={styles.itemHeader}>
							<span style={styles.itemTitle}>Target {index + 1}</span>
							<button
								type="button"
								style={{ ...styles.button, padding: "4px 7px" }}
								onClick={() =>
									onChange(removeMotionTimelineItem(motion, index))
								}
								title="이 target motion 제거"
							>
								<Trash2 size={12} />
							</button>
						</div>

						<div style={styles.field}>
							<span style={styles.label}>CSS Target</span>
							<input
								style={styles.input}
								value={item.target}
								placeholder="#overlay, .headline, [data-role=name]"
								onChange={(event) =>
									onChange(
										updateMotionTimelineItem(motion, index, {
											target: event.target.value,
										}),
									)
								}
							/>
						</div>

						<div style={styles.grid}>
							<MotionSelect
								label="In"
								value={item.in ?? "fade"}
								onChange={(value) =>
									onChange(
										updateMotionTimelineItem(motion, index, { in: value }),
									)
								}
							/>
							<MotionSelect
								label="Out"
								value={item.out ?? "fade"}
								onChange={(value) =>
									onChange(
										updateMotionTimelineItem(motion, index, { out: value }),
									)
								}
							/>
							<FieldShell label="Duration">
								<div style={styles.rangeRow}>
									<input
										type="range"
										min={100}
										max={2000}
										step={20}
										value={item.duration ?? 520}
										onChange={(event) =>
											onChange(
												updateMotionTimelineItem(motion, index, {
													duration: Number(event.target.value),
												}),
											)
										}
									/>
									<span style={{ color: "#cbd5e1", fontSize: "0.6875rem" }}>
										{item.duration ?? 520}ms
									</span>
								</div>
							</FieldShell>
							<FieldShell label="Start">
								<input
									style={styles.input}
									type="number"
									min={0}
									step={20}
									value={item.at ?? item.delay ?? 0}
									onChange={(event) =>
										onChange(
											updateMotionTimelineItem(motion, index, {
												at: Number(event.target.value),
												delay: undefined,
											}),
										)
									}
								/>
							</FieldShell>
							<FieldShell label="Stagger">
								<input
									style={styles.input}
									type="number"
									min={0}
									step={10}
									value={item.stagger ?? 0}
									onChange={(event) =>
										onChange(
											updateMotionTimelineItem(motion, index, {
												stagger: Number(event.target.value),
											}),
										)
									}
								/>
							</FieldShell>
							<FieldShell label="Driver">
								<select
									style={styles.input}
									value={item.driver ?? "waapi"}
									onChange={(event) =>
										onChange(
											updateMotionTimelineItem(motion, index, {
												driver: event.target.value as "waapi" | "gsap",
											}),
										)
									}
								>
									{MOTION_AUTHORING_DRIVERS.map((driver) => (
										<option key={driver.value} value={driver.value}>
											{driver.label}
										</option>
									))}
								</select>
							</FieldShell>
						</div>
					</div>
				))
			)}
		</div>
	);
}

function MotionSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: GraphicMotionPreset;
	onChange: (value: GraphicMotionPreset) => void;
}) {
	return (
		<FieldShell label={label}>
			<select
				style={styles.input}
				value={value}
				onChange={(event) =>
					onChange(event.target.value as GraphicMotionPreset)
				}
			>
				{MOTION_AUTHORING_PRESETS.map((preset) => (
					<option key={preset.value} value={preset.value}>
						{preset.label}
					</option>
				))}
			</select>
		</FieldShell>
	);
}

function FieldShell({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div style={styles.field}>
			<span style={styles.label}>{label}</span>
			{children}
		</div>
	);
}

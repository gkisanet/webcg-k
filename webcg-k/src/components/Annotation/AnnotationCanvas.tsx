import { Eraser, Highlighter, PenLine, RotateCcw, Trash2 } from "lucide-react";
import {
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ANNOTATION_VIEWPORT,
	type AnnotationDocument,
	type AnnotationPoint,
	type AnnotationStroke,
	type AnnotationTool,
	compactStrokePoints,
	createStroke,
	finalizeStrokePoints,
	normalizePointerPoint,
	shouldAppendPointerMove,
} from "../../lib/annotation/annotationDocument";
import { AnnotationRenderer } from "./AnnotationRenderer";

interface AnnotationCanvasProps {
	document: AnnotationDocument;
	status: "loading" | "ready" | "error";
	error?: string | null;
	onAppendStroke: (stroke: AnnotationStroke) => Promise<void>;
	onBeginStroke?: (stroke: AnnotationStroke) => void;
	onStreamStrokePoints?: (strokeId: string, points: AnnotationPoint[]) => void;
	onFinishStroke?: (stroke: AnnotationStroke) => Promise<void>;
	onCancelStroke?: (strokeId: string) => void;
	onPublishCursor?: (cursor: {
		point: AnnotationPoint;
		tool: AnnotationTool;
		color: string;
		width: number;
	}) => void;
	onUndo: () => Promise<void>;
	onClear: () => Promise<void>;
	remoteDraftStrokes?: AnnotationStroke[];
	backgroundRenderUrl?: string | null;
}

const COLOR_SWATCHES = ["#ffffff", "#fef08a", "#67e8f9", "#fb7185", "#86efac"];
const STREAM_POINT_MIN_DISTANCE = 0.9;

interface ActiveStrokeSeed {
	id: string;
	tool: AnnotationTool;
	color: string;
	width: number;
	opacity: number;
	createdAt: string;
}

export function AnnotationCanvas({
	document,
	status,
	error,
	onAppendStroke,
	onBeginStroke,
	onStreamStrokePoints,
	onFinishStroke,
	onCancelStroke,
	onPublishCursor,
	onUndo,
	onClear,
	remoteDraftStrokes = [],
	backgroundRenderUrl,
}: AnnotationCanvasProps) {
	const surfaceRef = useRef<HTMLDivElement>(null);
	const lastCursorSentAtRef = useRef(0);
	const rafRef = useRef<number | null>(null);
	const queuedPointsRef = useRef<AnnotationPoint[]>([]);
	const currentPointsRef = useRef<AnnotationPoint[]>([]);
	const currentStrokeIdRef = useRef<string | null>(null);
	const activeStrokeSeedRef = useRef<ActiveStrokeSeed | null>(null);
	const [tool, setTool] = useState<AnnotationTool>("pen");
	const [color, setColor] = useState("#ffffff");
	const [width, setWidth] = useState(10);
	const [currentPoints, setCurrentPoints] = useState<AnnotationPoint[]>([]);
	const [activeStrokeSeed, setActiveStrokeSeed] =
		useState<ActiveStrokeSeed | null>(null);
	const [saving, setSaving] = useState(false);

	const currentStroke = useMemo<AnnotationStroke | null>(() => {
		if (!activeStrokeSeed || currentPoints.length === 0) return null;
		return createStroke({
			...activeStrokeSeed,
			points: currentPoints,
		});
	}, [activeStrokeSeed, currentPoints]);

	useEffect(() => {
		return () => {
			if (rafRef.current != null) {
				window.cancelAnimationFrame(rafRef.current);
			}
		};
	}, []);

	const addEventPoints = useCallback((event: PointerEvent<HTMLDivElement>) => {
		const rect = surfaceRef.current?.getBoundingClientRect();
		if (!rect) return [];
		const native = event.nativeEvent;
		const coalesced =
			typeof native.getCoalescedEvents === "function"
				? native.getCoalescedEvents()
				: [];
		const events = coalesced.length > 0 ? coalesced : [native];

		return events.map((pointEvent) =>
			normalizePointerPoint({
				clientX: pointEvent.clientX,
				clientY: pointEvent.clientY,
				pressure: pointEvent.pressure,
				rect,
				now: performance.now(),
			}),
		);
	}, []);

	const flushQueuedPoints = useCallback(
		(extraPoints: AnnotationPoint[] = []) => {
			if (rafRef.current != null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}

			const pendingPoints =
				extraPoints.length > 0
					? [...queuedPointsRef.current, ...extraPoints]
					: queuedPointsRef.current;
			queuedPointsRef.current = [];
			if (pendingPoints.length === 0) return currentPointsRef.current;

			const nextPoints = compactStrokePoints(
				pendingPoints,
				STREAM_POINT_MIN_DISTANCE,
				currentPointsRef.current.at(-1),
			);
			if (nextPoints.length === 0) return currentPointsRef.current;

			const nextCurrentPoints = [...currentPointsRef.current, ...nextPoints];
			currentPointsRef.current = nextCurrentPoints;
			setCurrentPoints(nextCurrentPoints);

			const strokeId = currentStrokeIdRef.current;
			if (strokeId) {
				onStreamStrokePoints?.(strokeId, nextPoints);
			}

			return nextCurrentPoints;
		},
		[onStreamStrokePoints],
	);

	const queueStrokePoints = useCallback(
		(points: AnnotationPoint[]) => {
			if (points.length === 0) return;
			queuedPointsRef.current.push(...points);
			if (rafRef.current != null) return;
			rafRef.current = window.requestAnimationFrame(() => {
				rafRef.current = null;
				flushQueuedPoints();
			});
		},
		[flushQueuedPoints],
	);

	const resetCurrentStroke = useCallback(() => {
		if (rafRef.current != null) {
			window.cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		queuedPointsRef.current = [];
		currentPointsRef.current = [];
		currentStrokeIdRef.current = null;
		activeStrokeSeedRef.current = null;
		setCurrentPoints([]);
		setActiveStrokeSeed(null);
	}, []);

	const cancelCurrentStroke = useCallback(() => {
		const strokeId = currentStrokeIdRef.current;
		resetCurrentStroke();
		if (strokeId) {
			onCancelStroke?.(strokeId);
		}
	}, [onCancelStroke, resetCurrentStroke]);

	const publishPointerCursor = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!onPublishCursor || status !== "ready") return;
			const now = performance.now();
			if (now - lastCursorSentAtRef.current < 33) return;
			const points = addEventPoints(event);
			const point = points.at(-1);
			if (!point) return;
			lastCursorSentAtRef.current = now;
			onPublishCursor({ point, tool, color, width });
		},
		[addEventPoints, color, onPublishCursor, status, tool, width],
	);

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (status !== "ready") return;
			event.preventDefault();
			event.currentTarget.setPointerCapture(event.pointerId);
			publishPointerCursor(event);
			const initialPoints = compactStrokePoints(
				addEventPoints(event),
				STREAM_POINT_MIN_DISTANCE,
			);
			const seed = {
				id: createStrokeId(),
				tool,
				color,
				width,
				opacity: tool === "highlighter" ? 0.35 : 1,
				createdAt: new Date().toISOString(),
			};
			currentStrokeIdRef.current = seed.id;
			activeStrokeSeedRef.current = seed;
			currentPointsRef.current = initialPoints;
			queuedPointsRef.current = [];
			setActiveStrokeSeed(seed);
			setCurrentPoints(initialPoints);
			if (initialPoints.length > 0) {
				onBeginStroke?.(
					createStroke({
						...seed,
						points: initialPoints,
					}),
				);
			}
		},
		[
			addEventPoints,
			color,
			onBeginStroke,
			publishPointerCursor,
			status,
			tool,
			width,
		],
	);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			publishPointerCursor(event);
			if (
				!shouldAppendPointerMove(
					currentPointsRef.current.length,
					event.buttons,
					event.pointerType,
				)
			) {
				return;
			}
			const nextPoints = addEventPoints(event);
			if (nextPoints.length === 0) return;
			queueStrokePoints(nextPoints);
		},
		[addEventPoints, publishPointerCursor, queueStrokePoints],
	);

	const finishStroke = useCallback(
		async (event: PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const seed = activeStrokeSeedRef.current;
			if (!seed || currentPointsRef.current.length === 0) return;
			const finalPoints = flushQueuedPoints(addEventPoints(event));
			resetCurrentStroke();
			if (finalPoints.length < 2) {
				onCancelStroke?.(seed.id);
				return;
			}

			const optimizedPoints = finalizeStrokePoints(finalPoints, seed.tool);
			const finalStroke = createStroke({
				...seed,
				points: optimizedPoints,
			});
			setSaving(true);
			try {
				await (onFinishStroke ?? onAppendStroke)(finalStroke);
			} finally {
				setSaving(false);
			}
		},
		[
			addEventPoints,
			flushQueuedPoints,
			onAppendStroke,
			onCancelStroke,
			onFinishStroke,
			resetCurrentStroke,
		],
	);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "72px minmax(0, 1fr)",
				height: "100%",
				minHeight: 0,
				background: "var(--app-bg-primary, #111827)",
			}}
		>
			<Toolbar
				tool={tool}
				color={color}
				width={width}
				saving={saving}
				strokeCount={document.strokes.length}
				onToolChange={setTool}
				onColorChange={setColor}
				onWidthChange={setWidth}
				onUndo={onUndo}
				onClear={onClear}
			/>
			<div
				style={{
					minWidth: 0,
					minHeight: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					/* 패딩을 16px로 줄여 캔버스가 더 넓게 표시되도록 */
					padding: 16,
					background:
						"linear-gradient(135deg, #171717 0%, #252525 45%, #111827 100%)",
					/* 캔버스 자식이 aspect-ratio를 유지하면서 공간을 채우도록 */
					alignSelf: "stretch",
				}}
			>
				{/* aspect-ratio 16:9를 유지하며 공간을 최대한 활용하는 캔버스 컨테이너 */}
				{/* width: 100% 로 횡폭 꽉 채우고, maxWidth를 높이 기준 aspect-ratio로 제한 */}
				<div
					ref={surfaceRef}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={finishStroke}
					onPointerCancel={() => cancelCurrentStroke()}
					style={{
						width: "100%",
						/* 원본 maxWidth(1920px)보다 뷰포트 높이 기반 최대폭을 우선 적용 */
						/* calc(100vh * 16/9)는 화면 높이 안에서 16:9를 꽉 채우는 너비 */
						maxWidth: `min(${ANNOTATION_VIEWPORT.width}px, calc((100vh - 56px - 32px) * ${ANNOTATION_VIEWPORT.width} / ${ANNOTATION_VIEWPORT.height}))`,
						aspectRatio: `${ANNOTATION_VIEWPORT.width}/${ANNOTATION_VIEWPORT.height}`,
						position: "relative",
						overflow: "hidden",
						border: "1px solid rgba(255,255,255,0.18)",
						background: backgroundRenderUrl
							? "#000"
							: "linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%)",
						backgroundSize: "32px 32px",
						backgroundPosition: "0 0, 0 16px, 16px -16px, -16px 0px",
						touchAction: "none",
						userSelect: "none",
						cursor: tool === "eraser" ? "cell" : "crosshair",
					}}
				>
					{backgroundRenderUrl && (
						<iframe
							src={backgroundRenderUrl}
							title="실제 송출 합성 배경"
							style={{
								position: "absolute",
								inset: 0,
								width: "100%",
								height: "100%",
								border: 0,
								background: "transparent",
								pointerEvents: "none",
							}}
						/>
					)}
					<div style={{ position: "absolute", inset: 0 }}>
						<AnnotationRenderer
							document={document}
							currentStroke={currentStroke}
							draftStrokes={remoteDraftStrokes}
						/>
					</div>
					{status !== "ready" && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#fff",
								fontSize: 13,
								background: "rgba(0,0,0,0.45)",
							}}
						>
							{status === "loading"
								? "불러오는 중..."
								: error || "판서 레이어를 불러오지 못했습니다."}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

interface ToolbarProps {
	tool: AnnotationTool;
	color: string;
	width: number;
	saving: boolean;
	strokeCount: number;
	onToolChange: (tool: AnnotationTool) => void;
	onColorChange: (color: string) => void;
	onWidthChange: (width: number) => void;
	onUndo: () => Promise<void>;
	onClear: () => Promise<void>;
}

function Toolbar({
	tool,
	color,
	width,
	saving,
	strokeCount,
	onToolChange,
	onColorChange,
	onWidthChange,
	onUndo,
	onClear,
}: ToolbarProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 10,
				padding: "14px 10px",
				borderRight: "1px solid rgba(255,255,255,0.08)",
				background: "var(--app-bg-secondary, #18181b)",
			}}
		>
			<IconButton
				active={tool === "pen"}
				title="펜"
				onClick={() => onToolChange("pen")}
			>
				<PenLine size={18} />
			</IconButton>
			<IconButton
				active={tool === "highlighter"}
				title="하이라이터"
				onClick={() => onToolChange("highlighter")}
			>
				<Highlighter size={18} />
			</IconButton>
			<IconButton
				active={tool === "eraser"}
				title="지우개"
				onClick={() => onToolChange("eraser")}
			>
				<Eraser size={18} />
			</IconButton>
			<div
				style={{
					width: 32,
					height: 1,
					background: "rgba(255,255,255,0.12)",
					margin: "4px 0",
				}}
			/>
			{COLOR_SWATCHES.map((swatch) => (
				<button
					key={swatch}
					type="button"
					title={swatch}
					onClick={() => onColorChange(swatch)}
					style={{
						width: 28,
						height: 28,
						borderRadius: "50%",
						border:
							color === swatch
								? "2px solid var(--accent-primary, #60a5fa)"
								: "1px solid rgba(255,255,255,0.35)",
						background: swatch,
						cursor: "pointer",
					}}
				/>
			))}
			<input
				title="선 두께"
				type="range"
				min={4}
				max={36}
				value={width}
				onChange={(event) => onWidthChange(Number(event.target.value))}
				style={{
					width: 96,
					transform: "rotate(-90deg)",
					margin: "38px 0",
					accentColor: "var(--accent-primary, #60a5fa)",
				}}
			/>
			<IconButton
				disabled={strokeCount === 0 || saving}
				title="되돌리기"
				onClick={onUndo}
			>
				<RotateCcw size={17} />
			</IconButton>
			<IconButton
				disabled={strokeCount === 0 || saving}
				title="전체 지우기"
				onClick={onClear}
			>
				<Trash2 size={17} />
			</IconButton>
		</div>
	);
}

function IconButton({
	children,
	active,
	disabled,
	title,
	onClick,
}: {
	children: ReactNode;
	active?: boolean;
	disabled?: boolean;
	title: string;
	onClick: () => void | Promise<void>;
}) {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			style={{
				width: 38,
				height: 38,
				display: "grid",
				placeItems: "center",
				borderRadius: 8,
				border: active
					? "1px solid var(--accent-primary, #60a5fa)"
					: "1px solid rgba(255,255,255,0.12)",
				background: active ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)",
				color: disabled ? "rgba(255,255,255,0.25)" : "#fff",
				cursor: disabled ? "not-allowed" : "pointer",
			}}
		>
			{children}
		</button>
	);
}

function createStrokeId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

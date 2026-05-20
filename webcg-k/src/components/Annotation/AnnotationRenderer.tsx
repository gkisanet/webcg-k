import { type CSSProperties, memo, useMemo, useRef } from "react";
import {
	ANNOTATION_VIEWPORT,
	type AnnotationCursor,
	type AnnotationDocument,
	type AnnotationStroke,
	getStrokeSvgPath,
} from "../../lib/annotation/annotationDocument";

interface AnnotationRendererProps {
	document: AnnotationDocument;
	currentStroke?: AnnotationStroke | null;
	draftStrokes?: AnnotationStroke[];
	cursors?: AnnotationCursor[];
	style?: CSSProperties;
}

interface RenderableStroke {
	id: string;
	tool: AnnotationStroke["tool"];
	color: string;
	width: number;
	opacity: number;
	path: string;
}

export function AnnotationRenderer({
	document,
	currentStroke,
	draftStrokes = [],
	cursors = [],
	style,
}: AnnotationRendererProps) {
	const activeStrokes = useMemo(
		() => (currentStroke ? [...draftStrokes, currentStroke] : draftStrokes),
		[currentStroke, draftStrokes],
	);
	const staticStrokePaths = useStrokePathCache(document.strokes);
	const activeStrokePaths = useStrokePathCache(activeStrokes);

	return (
		<div
			aria-hidden
			style={{
				position: "relative",
				display: "block",
				width: "100%",
				height: "100%",
				background: "transparent",
				pointerEvents: "none",
				...style,
			}}
		>
			<svg
				viewBox={`0 0 ${ANNOTATION_VIEWPORT.width} ${ANNOTATION_VIEWPORT.height}`}
				width="100%"
				height="100%"
				preserveAspectRatio="xMidYMid meet"
				style={{
					display: "block",
					background: "transparent",
				}}
			>
				<title>방송 판서 레이어</title>
				{staticStrokePaths.map((stroke) => (
					<StrokePath key={stroke.id} stroke={stroke} />
				))}
			</svg>
			{(activeStrokes.length > 0 || cursors.length > 0) && (
				<svg
					viewBox={`0 0 ${ANNOTATION_VIEWPORT.width} ${ANNOTATION_VIEWPORT.height}`}
					width="100%"
					height="100%"
					preserveAspectRatio="xMidYMid meet"
					style={{
						position: "absolute",
						inset: 0,
						display: "block",
						background: "transparent",
					}}
				>
					<title>실시간 방송 판서 레이어</title>
					{activeStrokePaths.map((stroke) => (
						<StrokePath key={stroke.id} stroke={stroke} />
					))}
					{cursors.map((cursor) => (
						<AnnotationCursorMark key={cursor.clientId} cursor={cursor} />
					))}
				</svg>
			)}
		</div>
	);
}

const StrokePath = memo(function StrokePath({
	stroke,
}: {
	stroke: RenderableStroke;
}) {
	if (!stroke.path) return null;

	if (stroke.tool === "eraser") {
		return (
			<path
				d={stroke.path}
				fill="none"
				stroke="rgba(255,255,255,0.65)"
				strokeDasharray="12 10"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={stroke.width}
				opacity={0.5}
			/>
		);
	}

	return (
		<path
			d={stroke.path}
			fill={stroke.color}
			opacity={stroke.opacity}
			style={{
				mixBlendMode: stroke.tool === "highlighter" ? "screen" : "normal",
			}}
		/>
	);
});

function useStrokePathCache(strokes: AnnotationStroke[]): RenderableStroke[] {
	const cacheRef = useRef(
		new Map<string, { signature: string; path: string }>(),
	);

	return useMemo(() => {
		const cache = cacheRef.current;
		const activeIds = new Set<string>();

		const paths = strokes.map((stroke) => {
			activeIds.add(stroke.id);
			const signature = createStrokeSignature(stroke);
			const cached = cache.get(stroke.id);
			const path =
				cached?.signature === signature
					? cached.path
					: getStrokeSvgPath(stroke);

			if (cached?.signature !== signature) {
				cache.set(stroke.id, { signature, path });
			}

			return {
				id: stroke.id,
				tool: stroke.tool,
				color: stroke.color,
				width: stroke.width,
				opacity: stroke.opacity,
				path,
			};
		});

		for (const strokeId of cache.keys()) {
			if (!activeIds.has(strokeId)) {
				cache.delete(strokeId);
			}
		}

		return paths;
	}, [strokes]);
}

function createStrokeSignature(stroke: AnnotationStroke): string {
	const first = stroke.points[0];
	const middle = stroke.points[Math.floor(stroke.points.length / 2)];
	const last = stroke.points.at(-1);
	return [
		stroke.id,
		stroke.tool,
		stroke.color,
		stroke.width,
		stroke.opacity,
		stroke.points.length,
		first?.x,
		first?.y,
		first?.t,
		middle?.x,
		middle?.y,
		middle?.t,
		last?.x,
		last?.y,
		last?.t,
	].join(":");
}

function AnnotationCursorMark({ cursor }: { cursor: AnnotationCursor }) {
	const size = Math.max(18, Math.min(cursor.width * 2.4, 56));
	const color = cursor.tool === "eraser" ? "#f8fafc" : cursor.color;
	const secondary =
		cursor.tool === "highlighter"
			? "rgba(254,240,138,0.5)"
			: "rgba(0,0,0,0.45)";

	return (
		<g
			transform={`translate(${cursor.point.x.toFixed(2)} ${cursor.point.y.toFixed(2)}) rotate(-28)`}
			style={{
				filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.45))",
			}}
		>
			<path
				d={`M0 ${-size * 0.58} L${size * 0.18} ${size * 0.28} L0 ${size * 0.52} L${-size * 0.18} ${size * 0.28} Z`}
				fill={color}
				opacity={cursor.tool === "highlighter" ? 0.72 : 0.96}
				stroke="rgba(15,23,42,0.9)"
				strokeWidth={Math.max(1.4, size * 0.06)}
				strokeLinejoin="round"
			/>
			<circle
				cx="0"
				cy={size * 0.36}
				r={Math.max(3, size * 0.12)}
				fill={secondary}
				stroke={color}
				strokeWidth={Math.max(1.2, size * 0.04)}
			/>
		</g>
	);
}

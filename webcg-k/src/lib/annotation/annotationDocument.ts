import { getStroke } from "perfect-freehand";

export const ANNOTATION_VIEWPORT = {
	width: 1920,
	height: 1080,
} as const;

export type AnnotationTool = "pen" | "highlighter" | "eraser";

export interface AnnotationPoint {
	x: number;
	y: number;
	pressure?: number;
	t: number;
}

export interface AnnotationStroke {
	id: string;
	tool: AnnotationTool;
	color: string;
	width: number;
	opacity: number;
	points: AnnotationPoint[];
	createdAt: string;
	createdBy?: string;
}

export interface AnnotationCursor {
	clientId: string;
	point: AnnotationPoint;
	tool: AnnotationTool;
	color: string;
	width: number;
	updatedAt: number;
}

export interface AnnotationDocument {
	version: 1;
	strokes: AnnotationStroke[];
	updatedAt: string;
}

export interface PointerNormalizationInput {
	clientX: number;
	clientY: number;
	pressure?: number;
	rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
	now?: number;
}

export interface CreateStrokeInput {
	id: string;
	tool?: AnnotationTool;
	color?: string;
	width?: number;
	opacity?: number;
	points: AnnotationPoint[];
	createdAt?: string;
	createdBy?: string;
}

export interface CreateAnnotationCursorInput {
	clientId: string;
	point: AnnotationPoint;
	tool?: AnnotationTool;
	color?: string;
	width?: number;
	updatedAt?: number;
}

const DEFAULT_STROKE_WIDTH = 10;
const DEFAULT_STROKE_COLOR = "#ffffff";

export function createEmptyAnnotationDocument(): AnnotationDocument {
	return {
		version: 1,
		strokes: [],
		updatedAt: new Date().toISOString(),
	};
}

export function isAnnotationDocument(
	value: unknown,
): value is AnnotationDocument {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<AnnotationDocument>;
	return candidate.version === 1 && Array.isArray(candidate.strokes);
}

export function coerceAnnotationDocument(value: unknown): AnnotationDocument {
	if (!isAnnotationDocument(value)) return createEmptyAnnotationDocument();
	return {
		version: 1,
		strokes: value.strokes
			.map(coerceAnnotationStroke)
			.filter((stroke): stroke is AnnotationStroke => stroke != null),
		updatedAt:
			typeof value.updatedAt === "string"
				? value.updatedAt
				: new Date().toISOString(),
	};
}

export function coerceAnnotationStroke(
	value: unknown,
): AnnotationStroke | null {
	if (!isAnnotationStroke(value)) return null;
	return {
		id: value.id,
		tool: value.tool,
		color: value.color,
		width: value.width,
		opacity: value.opacity,
		points: coerceAnnotationPoints(value.points),
		createdAt:
			typeof value.createdAt === "string"
				? value.createdAt
				: new Date().toISOString(),
		createdBy: value.createdBy,
	};
}

export function coerceAnnotationPoints(value: unknown): AnnotationPoint[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isAnnotationPoint);
}

export function createStroke(input: CreateStrokeInput): AnnotationStroke {
	return {
		id: input.id,
		tool: input.tool ?? "pen",
		color: input.color ?? DEFAULT_STROKE_COLOR,
		width: input.width ?? DEFAULT_STROKE_WIDTH,
		opacity: input.opacity ?? (input.tool === "highlighter" ? 0.35 : 1),
		points: input.points,
		createdAt: input.createdAt ?? new Date().toISOString(),
		createdBy: input.createdBy,
	};
}

export function appendPointsToStroke(
	stroke: AnnotationStroke,
	points: AnnotationPoint[],
): AnnotationStroke {
	if (points.length === 0) return stroke;
	return {
		...stroke,
		points: [...stroke.points, ...points],
	};
}

export function compactStrokePoints(
	points: AnnotationPoint[],
	minDistance = 0.75,
	previousPoint?: AnnotationPoint,
): AnnotationPoint[] {
	if (points.length === 0) return [];

	const compacted: AnnotationPoint[] = [];
	let lastAccepted = previousPoint ?? points[0];
	if (!previousPoint) {
		compacted.push(lastAccepted);
	}

	for (const point of previousPoint ? points : points.slice(1)) {
		if (distance(lastAccepted, point) >= minDistance) {
			compacted.push(point);
			lastAccepted = point;
		}
	}

	const finalPoint = points.at(-1);
	if (
		finalPoint &&
		compacted.at(-1) !== finalPoint &&
		finalPoint !== previousPoint &&
		distance(lastAccepted, finalPoint) > 0
	) {
		compacted.push(finalPoint);
	}

	return compacted;
}

export function simplifyStrokePoints(
	points: AnnotationPoint[],
	epsilon = 0.85,
): AnnotationPoint[] {
	if (points.length <= 2) return points;
	const keep = new Array(points.length).fill(false);
	keep[0] = true;
	keep[points.length - 1] = true;
	simplifySection(points, 0, points.length - 1, epsilon, keep);
	return points.filter((_, index) => keep[index]);
}

export function finalizeStrokePoints(
	points: AnnotationPoint[],
	tool: AnnotationTool,
): AnnotationPoint[] {
	if (tool === "eraser") return simplifyStrokePoints(points, 0.55);
	if (shouldPreserveRawStroke(points)) return points;
	return simplifyStrokePoints(points, 0.55);
}

export function createAnnotationCursor(
	input: CreateAnnotationCursorInput,
): AnnotationCursor {
	return {
		clientId: input.clientId,
		point: input.point,
		tool: input.tool ?? "pen",
		color: input.color ?? DEFAULT_STROKE_COLOR,
		width: input.width ?? DEFAULT_STROKE_WIDTH,
		updatedAt: input.updatedAt ?? Date.now(),
	};
}

export function isAnnotationCursorVisible(
	cursor: AnnotationCursor,
	now = Date.now(),
	timeoutMs = 1500,
): boolean {
	return now - cursor.updatedAt <= timeoutMs;
}

export function shouldAppendPointerMove(
	currentPointCount: number,
	buttons: number,
	pointerType = "mouse",
): boolean {
	if (currentPointCount === 0) return false;
	if (pointerType === "mouse") return buttons === 1;
	return true;
}

export function normalizePointerPoint(
	input: PointerNormalizationInput,
): AnnotationPoint {
	const width = Math.max(input.rect.width, 1);
	const height = Math.max(input.rect.height, 1);
	const xRatio = clamp((input.clientX - input.rect.left) / width, 0, 1);
	const yRatio = clamp((input.clientY - input.rect.top) / height, 0, 1);

	return {
		x: round(xRatio * ANNOTATION_VIEWPORT.width),
		y: round(yRatio * ANNOTATION_VIEWPORT.height),
		pressure: normalizePressure(input.pressure),
		t: input.now ?? performance.now(),
	};
}

export function getStrokeSvgPath(stroke: AnnotationStroke): string {
	if (stroke.points.length === 0) return "";
	if (stroke.tool === "eraser") {
		return getPolylinePath(stroke.points);
	}

	const outline = getStroke(
		stroke.points.map((point) => [point.x, point.y, point.pressure ?? 0.5]),
		{
			size: stroke.width,
			thinning: stroke.tool === "highlighter" ? 0.15 : 0.55,
			smoothing: 0.62,
			streamline: 0.52,
			simulatePressure: stroke.points.some((point) => point.pressure == null),
			start: { taper: stroke.tool === "highlighter" ? 0 : stroke.width * 0.45 },
			end: { taper: stroke.tool === "highlighter" ? 0 : stroke.width * 0.85 },
			last: true,
		},
	);

	return getSvgPathFromOutline(outline);
}

export function appendStroke(
	document: AnnotationDocument,
	stroke: AnnotationStroke,
): AnnotationDocument {
	const existingStrokeIndex = document.strokes.findIndex(
		(item) => item.id === stroke.id,
	);
	const strokes =
		stroke.tool === "eraser"
			? eraseIntersectingStrokes(document.strokes, stroke)
			: existingStrokeIndex >= 0
				? document.strokes.map((item, index) =>
						index === existingStrokeIndex ? stroke : item,
					)
				: [...document.strokes, stroke];
	return {
		version: 1,
		strokes,
		updatedAt: new Date().toISOString(),
	};
}

export function removeLastStroke(
	document: AnnotationDocument,
): AnnotationDocument {
	return {
		version: 1,
		strokes: document.strokes.slice(0, -1),
		updatedAt: new Date().toISOString(),
	};
}

function isAnnotationStroke(value: unknown): value is AnnotationStroke {
	if (!value || typeof value !== "object") return false;
	const stroke = value as Partial<AnnotationStroke>;
	return (
		typeof stroke.id === "string" &&
		(stroke.tool === "pen" ||
			stroke.tool === "highlighter" ||
			stroke.tool === "eraser") &&
		typeof stroke.color === "string" &&
		typeof stroke.width === "number" &&
		typeof stroke.opacity === "number" &&
		Array.isArray(stroke.points)
	);
}

function isAnnotationPoint(value: unknown): value is AnnotationPoint {
	if (!value || typeof value !== "object") return false;
	const point = value as Partial<AnnotationPoint>;
	return (
		typeof point.x === "number" &&
		typeof point.y === "number" &&
		typeof point.t === "number" &&
		(typeof point.pressure === "number" || point.pressure == null)
	);
}

function eraseIntersectingStrokes(
	strokes: AnnotationStroke[],
	eraser: AnnotationStroke,
): AnnotationStroke[] {
	return strokes.filter((stroke) => {
		const threshold = Math.max(eraser.width, stroke.width) * 0.9;
		return !stroke.points.some((point) =>
			eraser.points.some(
				(eraserPoint) => distance(point, eraserPoint) <= threshold,
			),
		);
	});
}

function getSvgPathFromOutline(points: number[][]): string {
	const len = points.length;
	if (len < 4) return "";

	const average = (a: number, b: number) => (a + b) / 2;
	let a = points[0];
	let b = points[1];
	const c = points[2];
	let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;

	for (let i = 2, max = len - 1; i < max; i += 1) {
		a = points[i];
		b = points[i + 1];
		result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
	}

	return `${result}Z`;
}

function getPolylinePath(points: AnnotationPoint[]): string {
	const [first, ...rest] = points;
	if (!first) return "";
	return rest.reduce(
		(path, point) => `${path} L${point.x.toFixed(2)},${point.y.toFixed(2)}`,
		`M${first.x.toFixed(2)},${first.y.toFixed(2)}`,
	);
}

function normalizePressure(pressure: number | undefined): number {
	if (typeof pressure !== "number" || pressure <= 0) return 0.5;
	return clamp(pressure, 0.05, 1);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function distance(a: AnnotationPoint, b: AnnotationPoint): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function shouldPreserveRawStroke(points: AnnotationPoint[]): boolean {
	if (points.length <= 8) return true;

	const first = points[0];
	const last = points.at(-1);
	if (!first || !last) return true;

	const durationMs = Math.max(last.t - first.t, 0);
	const pathLength = points.reduce((total, point, index) => {
		const previous = points[index - 1];
		return previous ? total + distance(previous, point) : total;
	}, 0);

	return durationMs <= 180 && pathLength >= 160;
}

function simplifySection(
	points: AnnotationPoint[],
	startIndex: number,
	endIndex: number,
	epsilon: number,
	keep: boolean[],
): void {
	if (endIndex <= startIndex + 1) return;

	let maxDistance = 0;
	let maxIndex = startIndex;
	const start = points[startIndex];
	const end = points[endIndex];

	for (let index = startIndex + 1; index < endIndex; index += 1) {
		const pointDistance = distanceToSegment(points[index], start, end);
		if (pointDistance > maxDistance) {
			maxDistance = pointDistance;
			maxIndex = index;
		}
	}

	if (maxDistance <= epsilon) return;
	keep[maxIndex] = true;
	simplifySection(points, startIndex, maxIndex, epsilon, keep);
	simplifySection(points, maxIndex, endIndex, epsilon, keep);
}

function distanceToSegment(
	point: AnnotationPoint,
	start: AnnotationPoint,
	end: AnnotationPoint,
): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return distance(point, start);

	const t = clamp(
		((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
		0,
		1,
	);
	return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

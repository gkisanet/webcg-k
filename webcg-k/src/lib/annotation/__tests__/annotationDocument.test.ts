import { describe, expect, it } from "vitest";
import {
	ANNOTATION_VIEWPORT,
	appendPointsToStroke,
	appendStroke,
	compactStrokePoints,
	createAnnotationCursor,
	createEmptyAnnotationDocument,
	createStroke,
	finalizeStrokePoints,
	getStrokeSvgPath,
	isAnnotationCursorVisible,
	normalizePointerPoint,
	shouldAppendPointerMove,
	simplifyStrokePoints,
} from "../annotationDocument";

describe("annotationDocument", () => {
	it("creates a transparent broadcast annotation document with white pen defaults", () => {
		const document = createEmptyAnnotationDocument();
		const stroke = createStroke({
			id: "stroke-1",
			points: [
				{ x: 100, y: 100, pressure: 0.5, t: 1 },
				{ x: 140, y: 140, pressure: 0.6, t: 2 },
			],
		});

		expect(document).toEqual({
			version: 1,
			strokes: [],
			updatedAt: expect.any(String),
		});
		expect(stroke).toMatchObject({
			id: "stroke-1",
			tool: "pen",
			color: "#ffffff",
			width: 10,
			opacity: 1,
		});
	});

	it("normalizes pointer coordinates into the 1920x1080 broadcast viewport", () => {
		const point = normalizePointerPoint({
			clientX: 960,
			clientY: 270,
			pressure: 0.75,
			rect: { left: 480, top: 90, width: 960, height: 540 },
			now: 1234,
		});

		expect(point).toEqual({
			x: ANNOTATION_VIEWPORT.width / 2,
			y: ANNOTATION_VIEWPORT.height / 3,
			pressure: 0.75,
			t: 1234,
		});
	});

	it("turns a pressure stroke into a filled svg path", () => {
		const stroke = createStroke({
			id: "stroke-2",
			width: 18,
			points: [
				{ x: 100, y: 100, pressure: 0.4, t: 1 },
				{ x: 180, y: 130, pressure: 0.6, t: 2 },
				{ x: 260, y: 160, pressure: 0.7, t: 3 },
				{ x: 340, y: 180, pressure: 0.5, t: 4 },
			],
		});

		const path = getStrokeSvgPath(stroke);

		expect(path.startsWith("M")).toBe(true);
		expect(path.endsWith("Z")).toBe(true);
		expect(path).toContain("Q");
	});

	it("keeps a render cursor visible only inside its idle timeout", () => {
		const cursor = createAnnotationCursor({
			clientId: "operator-1",
			point: { x: 960, y: 540, pressure: 0.5, t: 1000 },
			tool: "pen",
			color: "#ffffff",
			width: 12,
			updatedAt: 1000,
		});

		expect(isAnnotationCursorVisible(cursor, 2100, 1500)).toBe(true);
		expect(isAnnotationCursorVisible(cursor, 2601, 1500)).toBe(false);
	});

	it("continues pointer strokes for touch and pen even when buttons is zero", () => {
		expect(shouldAppendPointerMove(3, 0, "mouse")).toBe(false);
		expect(shouldAppendPointerMove(3, 1, "mouse")).toBe(true);
		expect(shouldAppendPointerMove(3, 0, "pen")).toBe(true);
		expect(shouldAppendPointerMove(3, 0, "touch")).toBe(true);
	});

	it("compacts streamed stroke points while preserving the latest point", () => {
		const points = [
			{ x: 0, y: 0, pressure: 0.5, t: 1 },
			{ x: 0.2, y: 0.2, pressure: 0.5, t: 2 },
			{ x: 4, y: 0, pressure: 0.5, t: 3 },
			{ x: 4.2, y: 0.1, pressure: 0.5, t: 4 },
		];

		expect(compactStrokePoints(points, 1)).toEqual([
			points[0],
			points[2],
			points[3],
		]);
		expect(compactStrokePoints([points[1]], 1, points[0])).toEqual([points[1]]);
	});

	it("simplifies final stroke points with Ramer-Douglas-Peucker reduction", () => {
		const points = [
			{ x: 0, y: 0, pressure: 0.5, t: 1 },
			{ x: 10, y: 0.1, pressure: 0.5, t: 2 },
			{ x: 20, y: 0, pressure: 0.5, t: 3 },
			{ x: 30, y: 12, pressure: 0.5, t: 4 },
			{ x: 40, y: 0, pressure: 0.5, t: 5 },
		];

		expect(simplifyStrokePoints(points, 1)).toEqual([
			points[0],
			points[2],
			points[3],
			points[4],
		]);
	});

	it("preserves sparse fast pen strokes instead of over-simplifying them", () => {
		const points = [
			{ x: 120, y: 180, pressure: 0.5, t: 1000 },
			{ x: 190, y: 320, pressure: 0.5, t: 1030 },
			{ x: 280, y: 250, pressure: 0.5, t: 1060 },
			{ x: 360, y: 420, pressure: 0.5, t: 1090 },
			{ x: 480, y: 300, pressure: 0.5, t: 1120 },
			{ x: 620, y: 520, pressure: 0.5, t: 1150 },
		];

		expect(finalizeStrokePoints(points, "pen")).toBe(points);
	});

	it("appends streamed point batches to an active draft stroke", () => {
		const stroke = createStroke({
			id: "streaming-stroke",
			points: [{ x: 0, y: 0, pressure: 0.5, t: 1 }],
		});
		const next = appendPointsToStroke(stroke, [
			{ x: 8, y: 4, pressure: 0.6, t: 2 },
		]);

		expect(stroke.points).toHaveLength(1);
		expect(next.points).toHaveLength(2);
		expect(next.points[1]).toMatchObject({ x: 8, y: 4 });
	});

	it("keeps final stroke commits idempotent by stroke id", () => {
		const document = createEmptyAnnotationDocument();
		const stroke = createStroke({
			id: "stroke-once",
			points: [
				{ x: 0, y: 0, pressure: 0.5, t: 1 },
				{ x: 4, y: 4, pressure: 0.5, t: 2 },
			],
		});

		const once = appendStroke(document, stroke);
		const twice = appendStroke(once, stroke);

		expect(twice.strokes).toHaveLength(1);
		expect(twice.strokes[0]).toBe(stroke);
	});
});

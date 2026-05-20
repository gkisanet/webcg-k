import { buildOverlayReplicantData, isRecord } from "./rundownOverlayData";

export type BroadcastSourceType =
	| "image"
	| "graphic"
	| "template"
	| "overlay"
	| "whiteboard"
	| string
	| undefined;

export interface BroadcastOverlayPayload {
	html: string;
	css: string;
	js: string;
	data?: Record<string, unknown>;
}

export type NormalizedBroadcastSourceData =
	| {
			kind: "overlay";
			overlay: BroadcastOverlayPayload;
			raw: any;
	  }
	| {
			kind: "template";
			elements: any[];
			canvasWidth: number;
			canvasHeight: number;
			raw: any;
	  }
	| {
			kind: "image";
			imageUrl: string;
			imageName?: string;
			imageX?: number;
			imageY?: number;
			imageW?: number;
			imageH?: number;
			raw: any;
	  }
	| {
			kind: "whiteboard";
			whiteboardId: string;
			raw: any;
	  }
	| {
			kind: "empty";
			raw: any;
	  };

function toStringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function extractOverlayPayload(sourceData: unknown): BroadcastOverlayPayload | null {
	if (!isRecord(sourceData)) return null;

	const nestedData = isRecord(sourceData.data) ? sourceData.data : {};
	const candidates = [
		sourceData,
		sourceData.payload,
		sourceData.source_code,
		sourceData.sourceCode,
		nestedData,
		nestedData.payload,
		nestedData.source_code,
	];

	for (const candidate of candidates) {
		if (!isRecord(candidate)) continue;

		const html = toStringOrEmpty(candidate.html);
		const css = toStringOrEmpty(candidate.css);
		const js = toStringOrEmpty(candidate.js);

		if (html || css || js) {
			return { html, css, js };
		}
	}

	return null;
}

export function normalizeBroadcastSourceData(
	sourceType: BroadcastSourceType,
	sourceData: unknown,
): NormalizedBroadcastSourceData {
	if (!isRecord(sourceData)) {
		return { kind: "empty", raw: sourceData };
	}

	const whiteboardId =
		typeof sourceData.whiteboardId === "string" ? sourceData.whiteboardId : null;
	if (sourceType === "whiteboard" && whiteboardId) {
		return { kind: "whiteboard", whiteboardId, raw: sourceData };
	}

	const overlay = extractOverlayPayload(sourceData);
	if (sourceType === "overlay" && overlay) {
		const data = buildOverlayReplicantData(sourceData);
		return {
			kind: "overlay",
			overlay:
				Object.keys(data).length > 0
					? { ...overlay, data }
					: overlay,
			raw: sourceData,
		};
	}

	if (Array.isArray(sourceData.elements) && sourceData.elements.length > 0) {
		return {
			kind: "template",
			elements: sourceData.elements,
			canvasWidth:
				typeof sourceData.canvasWidth === "number" ? sourceData.canvasWidth : 1920,
			canvasHeight:
				typeof sourceData.canvasHeight === "number" ? sourceData.canvasHeight : 1080,
			raw: sourceData,
		};
	}

	if (sourceType === "image" && typeof sourceData.imageUrl === "string") {
		return {
			kind: "image",
			imageUrl: sourceData.imageUrl,
			imageName:
				typeof sourceData.imageName === "string" ? sourceData.imageName : undefined,
			imageX: typeof sourceData.imageX === "number" ? sourceData.imageX : undefined,
			imageY: typeof sourceData.imageY === "number" ? sourceData.imageY : undefined,
			imageW: typeof sourceData.imageW === "number" ? sourceData.imageW : undefined,
			imageH: typeof sourceData.imageH === "number" ? sourceData.imageH : undefined,
			raw: sourceData,
		};
	}

	return { kind: "empty", raw: sourceData };
}

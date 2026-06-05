import { buildMotionManifestFromGraphicElements } from "./graphicElementMotionBridge";
import {
	type GraphicPackageManifest,
	parseGraphicPackageManifest,
} from "./graphicManifest";
import {
	type GraphicMotionManifest,
	normalizeGraphicMotionManifest,
} from "./graphicMotionManifest";
import { buildOverlayReplicantData, isRecord } from "./rundownOverlayData";

export type BroadcastSourceType =
	| "image"
	| "graphic"
	| "template"
	| "overlay"
	| "whiteboard"
	| "ograf"
	| string
	| undefined;

export interface BroadcastOverlayPayload {
	html: string;
	css: string;
	js: string;
	data?: Record<string, unknown>;
	motion?: GraphicMotionManifest | null;
}

export interface BroadcastOgrafPayload {
	manifest: GraphicPackageManifest;
	data: Record<string, unknown>;
	entrypoint: string;
	tagName?: string;
	moduleCode?: string;
	importSource?: string;
	packagePath?: string;
	motion?: GraphicMotionManifest | null;
}

export type NormalizedBroadcastSourceData =
	| {
			kind: "overlay";
			overlay: BroadcastOverlayPayload;
			raw: unknown;
	  }
	| {
			kind: "template";
			elements: unknown[];
			canvasWidth: number;
			canvasHeight: number;
			motion?: GraphicMotionManifest | null;
			raw: unknown;
	  }
	| {
			kind: "image";
			imageUrl: string;
			imageName?: string;
			imageX?: number;
			imageY?: number;
			imageW?: number;
			imageH?: number;
			raw: unknown;
	  }
	| {
			kind: "whiteboard";
			whiteboardId: string;
			raw: unknown;
	  }
	| {
			kind: "ograf";
			ograf: BroadcastOgrafPayload;
			raw: unknown;
	  }
	| {
			kind: "empty";
			raw: unknown;
	  };

function toStringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function extractOverlayPayload(
	sourceData: unknown,
): BroadcastOverlayPayload | null {
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
			const motion = extractMotionManifest(sourceData);
			return motion ? { html, css, js, motion } : { html, css, js };
		}
	}

	return null;
}

function extractMotionManifest(
	sourceData: unknown,
	manifest?: Pick<GraphicPackageManifest, "motion"> | null,
): GraphicMotionManifest | null {
	if (manifest?.motion) return manifest.motion;
	if (!isRecord(sourceData)) return null;

	const nestedData = isRecord(sourceData.data) ? sourceData.data : {};
	const payload = isRecord(sourceData.payload) ? sourceData.payload : {};
	const sourceCode = isRecord(sourceData.source_code)
		? sourceData.source_code
		: isRecord(sourceData.sourceCode)
			? sourceData.sourceCode
			: {};
	const payloadSourceCode = isRecord(payload.source_code)
		? payload.source_code
		: isRecord(payload.sourceCode)
			? payload.sourceCode
			: {};

	const candidates = [
		sourceData.motion,
		sourceData.motion_manifest,
		sourceData.motionManifest,
		payload.motion,
		payload.motion_manifest,
		payload.motionManifest,
		nestedData.motion,
		nestedData.motion_manifest,
		nestedData.motionManifest,
		sourceCode.motion,
		sourceCode.motion_manifest,
		sourceCode.motionManifest,
		payloadSourceCode.motion,
		payloadSourceCode.motion_manifest,
		payloadSourceCode.motionManifest,
	];

	for (const candidate of candidates) {
		const motion = normalizeGraphicMotionManifest(candidate);
		if (motion) return motion;
	}

	return null;
}

function extractTemplateMotionManifest(
	sourceData: unknown,
): GraphicMotionManifest | null {
	const explicitMotion = extractMotionManifest(sourceData);
	if (explicitMotion) return explicitMotion;
	if (!isRecord(sourceData)) return null;
	return buildMotionManifestFromGraphicElements(sourceData.elements);
}

function extractCanvasDimension(
	sourceData: Record<string, unknown>,
	dimension: "width" | "height",
): number {
	const directKey = dimension === "width" ? "canvasWidth" : "canvasHeight";
	if (typeof sourceData[directKey] === "number") return sourceData[directKey];

	const canvas = isRecord(sourceData.canvas) ? sourceData.canvas : null;
	if (typeof canvas?.[dimension] === "number") return canvas[dimension];

	const canvasSize = isRecord(sourceData.canvas_size)
		? sourceData.canvas_size
		: isRecord(sourceData.canvasSize)
			? sourceData.canvasSize
			: null;
	if (typeof canvasSize?.[dimension] === "number") return canvasSize[dimension];

	return dimension === "width" ? 1920 : 1080;
}

function extractOgrafPayload(
	sourceData: unknown,
): BroadcastOgrafPayload | null {
	if (!isRecord(sourceData)) return null;

	const manifestInput = sourceData.manifest ?? sourceData.ografManifest;
	const parsed = parseGraphicPackageManifest(manifestInput);
	if (!parsed.ok || !parsed.manifest) return null;
	if (parsed.manifest.runtimeKind !== "ograf-web-component") return null;

	const entrypoint =
		typeof sourceData.entrypoint === "string"
			? sourceData.entrypoint
			: parsed.manifest.entrypoint;
	if (!entrypoint) return null;

	const data = isRecord(sourceData.data) ? sourceData.data : {};
	const tagName =
		typeof sourceData.tagName === "string" ? sourceData.tagName : undefined;
	const moduleCode =
		typeof sourceData.moduleCode === "string"
			? sourceData.moduleCode
			: undefined;
	const importSource =
		typeof sourceData.importSource === "string"
			? sourceData.importSource
			: undefined;
	const packagePath =
		typeof sourceData.packagePath === "string"
			? sourceData.packagePath
			: undefined;

	return {
		manifest: parsed.manifest,
		data,
		entrypoint,
		tagName,
		moduleCode,
		importSource,
		packagePath,
		motion: extractMotionManifest(sourceData, parsed.manifest),
	};
}

export function normalizeBroadcastSourceData(
	sourceType: BroadcastSourceType,
	sourceData: unknown,
): NormalizedBroadcastSourceData {
	if (!isRecord(sourceData)) {
		return { kind: "empty", raw: sourceData };
	}

	const whiteboardId =
		typeof sourceData.whiteboardId === "string"
			? sourceData.whiteboardId
			: null;
	if (sourceType === "whiteboard" && whiteboardId) {
		return { kind: "whiteboard", whiteboardId, raw: sourceData };
	}

	const ograf = extractOgrafPayload(sourceData);
	if ((sourceType === "ograf" || ograf) && ograf) {
		return { kind: "ograf", ograf, raw: sourceData };
	}

	const overlay = extractOverlayPayload(sourceData);
	if ((sourceType === "overlay" || sourceType === "template") && overlay) {
		const data = buildOverlayReplicantData(sourceData);
		return {
			kind: "overlay",
			overlay: Object.keys(data).length > 0 ? { ...overlay, data } : overlay,
			raw: sourceData,
		};
	}

	if (Array.isArray(sourceData.elements) && sourceData.elements.length > 0) {
		const motion = extractTemplateMotionManifest(sourceData);
		return {
			kind: "template",
			elements: sourceData.elements,
			canvasWidth: extractCanvasDimension(sourceData, "width"),
			canvasHeight: extractCanvasDimension(sourceData, "height"),
			...(motion ? { motion } : {}),
			raw: sourceData,
		};
	}

	if (sourceType === "image" && typeof sourceData.imageUrl === "string") {
		return {
			kind: "image",
			imageUrl: sourceData.imageUrl,
			imageName:
				typeof sourceData.imageName === "string"
					? sourceData.imageName
					: undefined,
			imageX:
				typeof sourceData.imageX === "number" ? sourceData.imageX : undefined,
			imageY:
				typeof sourceData.imageY === "number" ? sourceData.imageY : undefined,
			imageW:
				typeof sourceData.imageW === "number" ? sourceData.imageW : undefined,
			imageH:
				typeof sourceData.imageH === "number" ? sourceData.imageH : undefined,
			raw: sourceData,
		};
	}

	return { kind: "empty", raw: sourceData };
}

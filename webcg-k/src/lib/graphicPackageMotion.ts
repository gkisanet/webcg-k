import { buildMotionManifestFromGraphicElements } from "./graphicElementMotionBridge";
import type { GraphicPackageManifest } from "./graphicManifest";
import {
	type GraphicMotionManifest,
	normalizeGraphicMotionManifest,
} from "./graphicMotionManifest";
import { isRecord } from "./rundownOverlayData";

function getCandidateMotion(data: unknown): unknown {
	if (!isRecord(data)) return undefined;

	const payload = isRecord(data.payload) ? data.payload : null;
	const nestedData = isRecord(data.data) ? data.data : null;
	const sourceCode = isRecord(data.source_code) ? data.source_code : null;
	const sourceCodeCamel = isRecord(data.sourceCode) ? data.sourceCode : null;
	const payloadSourceCode =
		payload && isRecord(payload.source_code) ? payload.source_code : null;

	return (
		data.motion ??
		data.motion_manifest ??
		data.motionManifest ??
		sourceCode?.motion ??
		sourceCode?.motion_manifest ??
		sourceCode?.motionManifest ??
		sourceCodeCamel?.motion ??
		sourceCodeCamel?.motion_manifest ??
		sourceCodeCamel?.motionManifest ??
		payload?.motion ??
		payload?.motion_manifest ??
		payload?.motionManifest ??
		payloadSourceCode?.motion ??
		payloadSourceCode?.motion_manifest ??
		payloadSourceCode?.motionManifest ??
		nestedData?.motion ??
		nestedData?.motion_manifest ??
		nestedData?.motionManifest
	);
}

function getCandidateElements(data: unknown): unknown {
	if (!isRecord(data)) return undefined;

	const payload = isRecord(data.payload) ? data.payload : null;
	const nestedData = isRecord(data.data) ? data.data : null;
	const templateData = isRecord(data.template_data) ? data.template_data : null;
	const sourceCode = isRecord(data.source_code) ? data.source_code : null;

	return (
		data.elements ??
		templateData?.elements ??
		payload?.elements ??
		nestedData?.elements ??
		sourceCode?.elements
	);
}

export function extractGraphicPackageMotion(
	data: unknown,
	manifest?: Pick<GraphicPackageManifest, "motion"> | null,
): GraphicMotionManifest | null {
	return (
		manifest?.motion ??
		normalizeGraphicMotionManifest(getCandidateMotion(data)) ??
		buildMotionManifestFromGraphicElements(getCandidateElements(data))
	);
}

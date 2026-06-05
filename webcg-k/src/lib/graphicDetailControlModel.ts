import type { GraphicBlock } from "../stores/timelineStore";
import {
	buildGraphicPackageUiSummary,
	type GraphicPackageUiSummary,
} from "./graphicPackageUi";
import {
	buildOverlayReplicantData,
	getDashboardSchemaProperties,
	isRecord,
	setOverlayReplicantValue,
} from "./rundownOverlayData";

export type GraphicDetailFieldType = "string" | "number" | "boolean";

export interface GraphicDetailDataField {
	key: string;
	label: string;
	description?: string;
	type: GraphicDetailFieldType;
	required: boolean;
	value: string | number | boolean;
}

export interface GraphicDetailCustomAction {
	id: string;
	label: string;
	description?: string;
	disabledReason?: string;
}

export interface GraphicDetailControlModel {
	selected: boolean;
	blockId: string | null;
	blockName: string;
	sourceType: string;
	trackId: number | null;
	packageSummary: GraphicPackageUiSummary | null;
	dataFields: GraphicDetailDataField[];
	customActions: GraphicDetailCustomAction[];
	stepCount: number | null;
	runtimeKind: string;
	supportsRuntimeCommands: boolean;
	infoLines: string[];
}

function schemaTypeToFieldType(value: unknown): GraphicDetailFieldType {
	if (Array.isArray(value)) {
		if (value.includes("boolean")) return "boolean";
		if (value.includes("number") || value.includes("integer")) return "number";
	}
	if (value === "boolean") return "boolean";
	if (value === "number" || value === "integer") return "number";
	return "string";
}

function getRuntimeData(sourceData: unknown): Record<string, unknown> {
	if (!isRecord(sourceData)) return {};
	if (Object.keys(getDashboardSchemaProperties(sourceData)).length > 0) {
		return buildOverlayReplicantData(sourceData);
	}
	return isRecord(sourceData.data) ? sourceData.data : sourceData;
}

function getSchemaProperties(
	summary: GraphicPackageUiSummary,
	sourceData: unknown,
): Record<string, unknown> {
	const manifestProperties = isRecord(summary.manifest?.dataSchema?.properties)
		? summary.manifest.dataSchema.properties
		: null;
	if (manifestProperties) return manifestProperties;

	return getDashboardSchemaProperties(sourceData);
}

function fieldValueForType(
	value: unknown,
	type: GraphicDetailFieldType,
): string | number | boolean {
	if (type === "boolean") return typeof value === "boolean" ? value : false;
	if (type === "number") return typeof value === "number" ? value : 0;
	return typeof value === "string" ? value : value == null ? "" : String(value);
}

function buildDataFields(params: {
	summary: GraphicPackageUiSummary;
	sourceData: unknown;
}): GraphicDetailDataField[] {
	const properties = getSchemaProperties(params.summary, params.sourceData);
	const runtimeData = getRuntimeData(params.sourceData);
	const requiredFields = new Set(params.summary.requiredFields);

	return Object.entries(properties).map(([key, property]) => {
		const propertyRecord = isRecord(property) ? property : {};
		const type = schemaTypeToFieldType(propertyRecord.type);
		const label =
			typeof propertyRecord.title === "string" ? propertyRecord.title : key;
		const description =
			typeof propertyRecord.description === "string"
				? propertyRecord.description
				: undefined;
		const required =
			requiredFields.has(key) ||
			propertyRecord.required === true ||
			propertyRecord.minLength === 1;
		const fallback =
			propertyRecord.default != null
				? propertyRecord.default
				: runtimeData[key];

		return {
			key,
			label,
			description,
			type,
			required,
			value: fieldValueForType(runtimeData[key] ?? fallback, type),
		};
	});
}

function getStepCount(summary: GraphicPackageUiSummary): number | null {
	const stepCount = summary.manifest?.stepCount;
	return typeof stepCount === "number" && stepCount > 1 ? stepCount : null;
}

function buildInfoLines(summary: GraphicPackageUiSummary): string[] {
	const lines: string[] = [];
	if (summary.description) lines.push(summary.description);
	if (summary.targetWarning) lines.push(summary.targetWarning);
	if (summary.motionWarning) lines.push(summary.motionWarning);
	if (summary.renderRequirementLines.length > 0) {
		lines.push(`Target: ${summary.targetProfileLabel}`);
	}
	return lines;
}

export function buildGraphicDetailControlModel(
	block: GraphicBlock | null,
): GraphicDetailControlModel {
	if (!block) {
		return {
			selected: false,
			blockId: null,
			blockName: "",
			sourceType: "",
			trackId: null,
			packageSummary: null,
			dataFields: [],
			customActions: [],
			stepCount: null,
			runtimeKind: "",
			supportsRuntimeCommands: false,
			infoLines: [],
		};
	}

	const sourceType = block.sourceType ?? "unknown";
	const summary = buildGraphicPackageUiSummary({
		id: block.sourceId ?? block.id,
		name: block.name,
		source_type: sourceType,
		data: block.sourceData ?? {},
	});

	return {
		selected: true,
		blockId: block.id,
		blockName: block.name,
		sourceType,
		trackId: block.trackId,
		packageSummary: summary,
		dataFields: buildDataFields({
			summary,
			sourceData: block.sourceData,
		}),
		customActions: summary.customActions.map((action) => ({
			...action,
		})),
		stepCount: getStepCount(summary),
		runtimeKind: summary.runtimeLabel,
		supportsRuntimeCommands:
			summary.manifest?.runtimeKind === "ograf-web-component",
		infoLines: buildInfoLines(summary),
	};
}

function coerceFieldValue(
	field: Pick<GraphicDetailDataField, "type">,
	value: string | number | boolean,
): string | number | boolean {
	if (field.type === "boolean") return value === true || value === "true";
	if (field.type === "number") {
		const numericValue =
			typeof value === "number" ? value : Number.parseFloat(String(value));
		return Number.isFinite(numericValue) ? numericValue : 0;
	}
	return String(value);
}

export function applyGraphicDetailDataField(
	sourceData: unknown,
	field: Pick<GraphicDetailDataField, "key" | "type">,
	value: string | number | boolean,
): Record<string, unknown> {
	const base = isRecord(sourceData) ? sourceData : {};
	const nextValue = coerceFieldValue(field, value);
	if (Object.keys(getDashboardSchemaProperties(base)).length > 0) {
		return setOverlayReplicantValue(base, field.key, nextValue);
	}

	const existingData = isRecord(base.data) ? base.data : {};

	return {
		...base,
		data: {
			...existingData,
			[field.key]: nextValue,
		},
	};
}

export type JsonRecord = Record<string, unknown>;

export interface DashboardSchemaLike {
	properties?: Record<string, Record<string, unknown>>;
}

export function isRecord(value: unknown): value is JsonRecord {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeRecord(target: JsonRecord, value: unknown): JsonRecord {
	if (!isRecord(value)) return target;
	return { ...target, ...value };
}

export function getDashboardSchemaProperties(
	sourceData: unknown,
): Record<string, Record<string, unknown>> {
	if (!isRecord(sourceData)) return {};

	const candidates = [
		sourceData.dashboard_schema,
		sourceData.dashboardSchema,
		isRecord(sourceData.payload) ? sourceData.payload.dashboard_schema : undefined,
		isRecord(sourceData.data) ? sourceData.data.dashboard_schema : undefined,
		isRecord(sourceData.data) && isRecord(sourceData.data.payload)
			? sourceData.data.payload.dashboard_schema
			: undefined,
	];

	for (const candidate of candidates) {
		if (isRecord(candidate) && isRecord(candidate.properties)) {
			return candidate.properties as Record<string, Record<string, unknown>>;
		}
	}

	return {};
}

export function buildOverlayReplicantData(sourceData: unknown): JsonRecord {
	if (!isRecord(sourceData)) return {};

	let result: JsonRecord = {};
	const defaults = [
		sourceData.replicant_defaults,
		sourceData.replicantDefaults,
		isRecord(sourceData.payload) ? sourceData.payload.replicant_defaults : undefined,
		isRecord(sourceData.data) ? sourceData.data.replicant_defaults : undefined,
		isRecord(sourceData.data) && isRecord(sourceData.data.payload)
			? sourceData.data.payload.replicant_defaults
			: undefined,
	];

	for (const value of defaults) {
		result = mergeRecord(result, value);
	}

	const overrides = [
		sourceData.dashboard_data,
		isRecord(sourceData.data) ? sourceData.data.dashboard_data : undefined,
		sourceData.replicant_data,
		isRecord(sourceData.data) ? sourceData.data.replicant_data : undefined,
	];

	for (const value of overrides) {
		result = mergeRecord(result, value);
	}

	return result;
}

export function setOverlayReplicantValue(
	itemData: unknown,
	key: string,
	value: unknown,
): JsonRecord {
	const base = isRecord(itemData) ? itemData : {};
	const current = buildOverlayReplicantData(base);

	return {
		...base,
		replicant_data: {
			...current,
			[key]: value,
		},
	};
}

export function getSchemaDefaultValue(property: Record<string, unknown>): unknown {
	return Object.prototype.hasOwnProperty.call(property, "default")
		? property.default
		: "";
}

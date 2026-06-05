import type { NrcsCuesheetItem } from "@/services/cuesheetService";
import type { CgTextItem, CgTextType } from "./nrcsTypes";
import {
	buildOverlayReplicantData,
	getDashboardSchemaProperties,
	isRecord,
} from "./rundownOverlayData";

export interface RundownPreflightItemLike {
	id: string;
	rundown_id: string;
	source_type: string;
	source_name: string;
	data: unknown;
	item_order: number;
}

const VALID_CG_TYPES = new Set<CgTextType>([
	"super",
	"source",
	"band",
	"headline",
	"subheadline",
	"crawl",
	"locator",
	"lowthird",
	"fullcg",
	"credit",
	"soundbite",
	"reporter",
	"flash",
]);

function normalizeCgType(value: unknown): CgTextType {
	return typeof value === "string" && VALID_CG_TYPES.has(value as CgTextType)
		? (value as CgTextType)
		: "headline";
}

function addStringField(
	fields: Record<string, string>,
	key: unknown,
	value: unknown,
) {
	if (typeof key !== "string" || key.trim() === "") return;
	if (value == null) return;
	const text = String(value);
	if (text.trim() === "") return;
	fields[key] = text;
}

function extractOverlayFields(data: unknown): Record<string, string> {
	const fields: Record<string, string> = {};
	const schemaProperties = getDashboardSchemaProperties(data);
	const replicantData = buildOverlayReplicantData(data);

	const schemaKeys = Object.keys(schemaProperties);
	const candidateKeys =
		schemaKeys.length > 0 ? schemaKeys : Object.keys(replicantData);

	for (const key of candidateKeys) {
		addStringField(fields, key, replicantData[key]);
	}

	return fields;
}

function extractGraphicFields(data: unknown): Record<string, string> {
	const fields: Record<string, string> = {};
	if (!isRecord(data) || !Array.isArray(data.elements)) return fields;

	data.elements.forEach((element, elementIndex) => {
		if (!isRecord(element)) return;
		const elementId =
			typeof element.id === "string" ? element.id : `element_${elementIndex}`;

		if (element.type === "text") {
			addStringField(
				fields,
				element.name ?? elementId,
				element.content ?? element.text,
			);
		}

		const bindingContainer = element.bindingContainer;
		if (!isRecord(bindingContainer) || !Array.isArray(bindingContainer.slots)) {
			return;
		}

		bindingContainer.slots.forEach((slot, slotIndex) => {
			if (!isRecord(slot)) return;
			const slotKey =
				slot.bindingKey ??
				slot.label ??
				slot.name ??
				slot.id ??
				`${elementId}_slot_${slotIndex}`;
			addStringField(fields, slotKey, slot.content ?? slot.text ?? slot.value);
		});
	});

	return fields;
}

function extractOgrafFields(data: unknown): Record<string, string> {
	const fields: Record<string, string> = {};
	if (!isRecord(data)) return fields;

	const payload = isRecord(data.payload) ? data.payload : null;
	const ografData = isRecord(data.data)
		? data.data
		: isRecord(payload?.data)
			? payload.data
			: null;
	if (!ografData) return fields;

	Object.entries(ografData).forEach(([key, value]) => {
		addStringField(fields, key, value);
	});

	return fields;
}

function buildCgData(item: RundownPreflightItemLike): CgTextItem[] {
	const fields =
		item.source_type === "overlay"
			? extractOverlayFields(item.data)
			: item.source_type === "ograf"
				? extractOgrafFields(item.data)
				: extractGraphicFields(item.data);

	if (Object.keys(fields).length === 0) return [];

	return [
		{
			id: `${item.id}:text`,
			type: normalizeCgType(
				isRecord(item.data)
					? (item.data.cg_type ?? item.data.cgType)
					: undefined,
			),
			fields,
			order: 0,
		},
	];
}

export function mapRundownItemsToCuesheetItems(
	rundownItems: RundownPreflightItemLike[],
): NrcsCuesheetItem[] {
	return rundownItems.map((item) => ({
		id: item.id,
		cuesheet_id: item.rundown_id,
		nrcs_item_id: item.id,
		title: item.source_name,
		slug: item.source_name,
		reporter: "System",
		article_type: item.source_type,
		status: "mapped",
		cg_data: buildCgData(item),
		mapping_result: {},
		item_order: item.item_order,
		linked_rundown_item_id: item.id,
		source_row_id: null,
		created_at: "",
		updated_at: "",
	}));
}

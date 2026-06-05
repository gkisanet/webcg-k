import {
	type GraphicPackageCustomAction,
	type GraphicPackageManifest,
	type GraphicPackageNumberConstraint,
	type GraphicPackageRenderRequirement,
	type GraphicPackageRuntimeKind,
	type GraphicPackageSourceSpec,
	getRequiredSchemaFields,
	parseGraphicPackageManifest,
} from "./graphicManifest";
import { getGraphicMotionCapabilityWarning } from "./graphicMotionCapability";
import { extractGraphicPackageMotion } from "./graphicPackageMotion";
import { getDashboardSchemaProperties, isRecord } from "./rundownOverlayData";
import {
	buildRundownRendererCapabilityFromEnv,
	getRenderRequirementFailures,
	type RundownRendererCapability,
} from "./rundownQualityGate";

export type GraphicPackageBadgeTone = "neutral" | "ok" | "warning" | "error";

export interface GraphicPackageBadge {
	label: string;
	tone: GraphicPackageBadgeTone;
	title?: string;
}

export interface GraphicPackageUiSource {
	id?: string;
	name?: string;
	source_type?: string;
	data: unknown;
}

export interface GraphicPackageUiSummary {
	manifest: GraphicPackageManifest | null;
	packageName: string;
	description?: string;
	sourceLabel: string;
	runtimeLabel: string;
	badgeLabels: GraphicPackageBadge[];
	requiredFields: string[];
	customActions: Pick<GraphicPackageCustomAction, "id" | "label">[];
	renderRequirementCount: number;
	motionItemCount: number;
	renderRequirementLines: string[];
	targetProfileLabel: string;
	targetWarning: string | null;
	motionWarning: string | null;
	manifestIssueCount: number;
	isManifestBacked: boolean;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function getCandidateManifest(data: unknown): unknown {
	if (!isRecord(data)) return undefined;

	const payload = isRecord(data.payload) ? data.payload : null;
	const nestedData = isRecord(data.data) ? data.data : null;

	return (
		data.manifest ??
		data.graphic_manifest ??
		data.graphicManifest ??
		data.ograf_manifest ??
		data.ografManifest ??
		payload?.manifest ??
		payload?.graphic_manifest ??
		payload?.graphicManifest ??
		payload?.ograf_manifest ??
		payload?.ografManifest ??
		nestedData?.manifest ??
		nestedData?.graphic_manifest ??
		nestedData?.graphicManifest ??
		nestedData?.ograf_manifest ??
		nestedData?.ografManifest
	);
}

function getDashboardSchema(data: unknown): Record<string, unknown> | null {
	if (!isRecord(data)) return null;

	const payload = isRecord(data.payload) ? data.payload : null;
	const nestedData = isRecord(data.data) ? data.data : null;
	const candidates = [
		data.dashboard_schema,
		data.dashboardSchema,
		payload?.dashboard_schema,
		payload?.dashboardSchema,
		nestedData?.dashboard_schema,
		nestedData?.dashboardSchema,
	];

	for (const candidate of candidates) {
		if (isRecord(candidate) && isRecord(candidate.properties)) {
			return candidate;
		}
	}

	return null;
}

function getRequiredFieldsFromSchema(
	schema: Record<string, unknown> | undefined,
): string[] {
	if (!schema) return [];
	const properties = isRecord(schema.properties)
		? (schema.properties as Record<string, unknown>)
		: {};
	const schemaRequired = Array.isArray(schema.required)
		? schema.required.filter(
				(field): field is string => typeof field === "string",
			)
		: [];
	const propertyRequired = Object.entries(properties)
		.filter(([, property]) => isRecord(property) && property.required === true)
		.map(([field]) => field);

	return uniqueStrings([...schemaRequired, ...propertyRequired]);
}

function getManifestRequiredFields(manifest: GraphicPackageManifest): string[] {
	return uniqueStrings([
		...getRequiredSchemaFields(manifest),
		...getRequiredFieldsFromSchema(manifest.dataSchema),
	]);
}

function getLegacyRequiredFields(data: unknown): string[] {
	const properties = getDashboardSchemaProperties(data);
	const dashboardSchema = getDashboardSchema(data);
	const schemaRequired = Array.isArray(dashboardSchema?.required)
		? dashboardSchema.required.filter(
				(field): field is string => typeof field === "string",
			)
		: [];
	const propertyRequired = Object.entries(properties)
		.filter(([, property]) => property.required === true)
		.map(([field]) => field);

	return uniqueStrings([...schemaRequired, ...propertyRequired]);
}

function getLegacyActions(
	data: unknown,
): Pick<GraphicPackageCustomAction, "id" | "label">[] {
	if (!isRecord(data)) return [];
	const animationConfig = isRecord(data.animation_config)
		? data.animation_config
		: isRecord(data.animationConfig)
			? data.animationConfig
			: null;
	if (!animationConfig || !Array.isArray(animationConfig.actions)) return [];

	return animationConfig.actions
		.map((action, index) => {
			if (!isRecord(action)) return null;
			const id =
				typeof action.id === "string"
					? action.id
					: typeof action.name === "string"
						? action.name
						: `action-${index + 1}`;
			const label =
				typeof action.label === "string"
					? action.label
					: typeof action.name === "string"
						? action.name
						: id;
			return { id, label };
		})
		.filter(
			(action): action is Pick<GraphicPackageCustomAction, "id" | "label"> =>
				action != null && action.id.trim().length > 0,
		);
}

function sourceLabelForManifest(sourceSpec: GraphicPackageSourceSpec): string {
	switch (sourceSpec) {
		case "ograf-v1":
			return "OGraf";
		case "webcgk-manifest-v1":
			return "WebCG-K";
		case "legacy-overlay-template":
			return "Legacy";
	}
}

function runtimeLabelForManifest(
	runtimeKind: GraphicPackageRuntimeKind,
): string {
	switch (runtimeKind) {
		case "ograf-web-component":
			return "OGraf Component";
		case "html-iframe":
			return "HTML iframe";
		case "webcgk-vector":
			return "Vector";
	}
}

function inferLegacyRuntimeLabel(source: GraphicPackageUiSource): string {
	if (source.source_type === "graphic") return "Vector";
	if (source.source_type === "overlay" || source.source_type === "template") {
		return "HTML iframe";
	}
	return "Legacy";
}

function inferLegacySourceLabel(source: GraphicPackageUiSource): string {
	return source.source_type === "graphic" ? "WebCG-K" : "Legacy";
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatRate(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function constraintLabel(
	label: string,
	constraint: GraphicPackageNumberConstraint | undefined,
	unit = "",
): string | null {
	if (!constraint) return null;
	if (typeof constraint.exact === "number") {
		return `${label} ${formatNumber(constraint.exact)}${unit}`;
	}
	if (typeof constraint.min === "number") {
		return `${label} ${formatNumber(constraint.min)}${unit}+`;
	}
	if (typeof constraint.max === "number") {
		return `${label} <=${formatNumber(constraint.max)}${unit}`;
	}
	if (typeof constraint.ideal === "number") {
		return `${label} ideal ${formatNumber(constraint.ideal)}${unit}`;
	}
	return null;
}

function dimensionConstraint(
	requirement: GraphicPackageRenderRequirement,
	dimension: "width" | "height",
): GraphicPackageNumberConstraint | undefined {
	const resolution = requirement.resolution;
	if (!resolution) return undefined;

	const specConstraint = resolution[dimension];
	const legacyMin = resolution.min?.[dimension];
	const legacyExact = resolution.exact?.[dimension];
	const hasLegacy =
		typeof legacyMin === "number" || typeof legacyExact === "number";

	if (!specConstraint && !hasLegacy) return undefined;

	return {
		...(specConstraint ?? {}),
		min: legacyMin ?? specConstraint?.min,
		exact: legacyExact ?? specConstraint?.exact,
	};
}

function summarizeResolution(
	requirement: GraphicPackageRenderRequirement,
): string | null {
	const width = dimensionConstraint(requirement, "width");
	const height = dimensionConstraint(requirement, "height");
	if (!width && !height) return null;

	if (typeof width?.exact === "number" && typeof height?.exact === "number") {
		return `${formatNumber(width.exact)}x${formatNumber(height.exact)}`;
	}
	if (typeof width?.min === "number" && typeof height?.min === "number") {
		return `${formatNumber(width.min)}x${formatNumber(height.min)}+`;
	}

	return [constraintLabel("W", width, "px"), constraintLabel("H", height, "px")]
		.filter((part): part is string => part != null)
		.join(" / ");
}

function summarizeRequirement(
	requirement: GraphicPackageRenderRequirement,
): string {
	const engineLabel =
		requirement.engine && requirement.engine.length > 0
			? requirement.engine
					.map((engine) =>
						engine.minVersion
							? `${engine.name} ${engine.minVersion}+`
							: engine.name,
					)
					.join(", ")
			: null;
	const internetLabel =
		typeof requirement.accessToPublicInternet?.exact === "boolean"
			? requirement.accessToPublicInternet.exact
				? "public internet"
				: "offline"
			: null;
	const parts = [
		summarizeResolution(requirement),
		constraintLabel("fps", requirement.frameRate),
		engineLabel,
		internetLabel,
	].filter((part): part is string => part != null && part.length > 0);

	return parts.length > 0 ? parts.join(" / ") : "렌더 요구사항 상세 없음";
}

function buildTargetProfileLabel(
	capability: RundownRendererCapability,
): string {
	const base =
		capability.videoMode ??
		`${capability.resolution.width}x${capability.resolution.height}`;
	const renderCadence = `${formatRate(capability.frameRate)}fps render`;
	const fieldCadence =
		capability.scanMode === "interlaced" && capability.fieldRate
			? ` / ${formatRate(capability.fieldRate)} fields`
			: "";

	return `${base} · ${renderCadence}${fieldCadence}`;
}

function buildBadges(params: {
	sourceLabel: string;
	requiredFields: string[];
	customActions: Pick<GraphicPackageCustomAction, "id" | "label">[];
	renderRequirementCount: number;
	motionItemCount: number;
	motionWarning: string | null;
	targetWarning: string | null;
	manifestIssueCount: number;
}): GraphicPackageBadge[] {
	const badges: GraphicPackageBadge[] = [];

	if (params.manifestIssueCount > 0) {
		badges.push({
			label: "Manifest 오류",
			tone: "error",
			title: `${params.manifestIssueCount}개 manifest 해석 오류`,
		});
	} else {
		badges.push({ label: params.sourceLabel, tone: "neutral" });
	}

	if (params.requiredFields.length > 0) {
		badges.push({
			label: `Schema ${params.requiredFields.length}`,
			tone: "ok",
			title: params.requiredFields.join(", "),
		});
	}
	if (params.customActions.length > 0) {
		badges.push({
			label: `Action ${params.customActions.length}`,
			tone: "neutral",
			title: params.customActions.map((action) => action.label).join(", "),
		});
	}
	if (params.motionItemCount > 0) {
		badges.push({
			label: `Motion ${params.motionItemCount}`,
			tone: params.motionWarning ? "warning" : "ok",
			title: params.motionWarning ?? "그래픽 패키지 내부 motion manifest",
		});
	}
	if (params.renderRequirementCount > 0) {
		badges.push({
			label: `Req ${params.renderRequirementCount}`,
			tone: params.targetWarning ? "warning" : "ok",
			title: params.targetWarning ?? "현재 타깃 프로파일과 호환",
		});
	}

	return badges;
}

export function buildGraphicPackageUiSummary(
	source: GraphicPackageUiSource,
	capability: RundownRendererCapability = buildRundownRendererCapabilityFromEnv(),
): GraphicPackageUiSummary {
	const candidateManifest = getCandidateManifest(source.data);
	const parsedManifest =
		candidateManifest != null
			? parseGraphicPackageManifest(candidateManifest)
			: null;
	const manifest =
		parsedManifest?.ok && parsedManifest.manifest
			? parsedManifest.manifest
			: null;
	const manifestIssueCount =
		parsedManifest && !parsedManifest.ok ? parsedManifest.issues.length : 0;

	const requiredFields = manifest
		? getManifestRequiredFields(manifest)
		: getLegacyRequiredFields(source.data);
	const customActions = manifest
		? manifest.customActions.map(({ id, label }) => ({ id, label }))
		: getLegacyActions(source.data);
	const renderRequirements = manifest?.renderRequirements ?? [];
	const motion = extractGraphicPackageMotion(source.data, manifest);
	const motionItemCount = motion?.timeline.length ?? 0;
	const motionWarning = getGraphicMotionCapabilityWarning(motion, capability);
	const targetFailures = getRenderRequirementFailures(
		renderRequirements,
		capability,
	);
	const targetWarning =
		targetFailures.length > 0 ? targetFailures.slice(0, 2).join(" · ") : null;
	const sourceLabel = manifest
		? sourceLabelForManifest(manifest.sourceSpec)
		: inferLegacySourceLabel(source);
	const runtimeLabel = manifest
		? runtimeLabelForManifest(manifest.runtimeKind)
		: inferLegacyRuntimeLabel(source);

	return {
		manifest,
		packageName: manifest?.name ?? source.name ?? source.id ?? "Untitled",
		description: manifest?.description,
		sourceLabel,
		runtimeLabel,
		badgeLabels: buildBadges({
			sourceLabel,
			requiredFields,
			customActions,
			renderRequirementCount: renderRequirements.length,
			motionItemCount,
			motionWarning,
			targetWarning,
			manifestIssueCount,
		}),
		requiredFields,
		customActions,
		renderRequirementCount: renderRequirements.length,
		motionItemCount,
		renderRequirementLines: renderRequirements.map(summarizeRequirement),
		targetProfileLabel: buildTargetProfileLabel(capability),
		targetWarning,
		motionWarning,
		manifestIssueCount,
		isManifestBacked: manifest != null,
	};
}

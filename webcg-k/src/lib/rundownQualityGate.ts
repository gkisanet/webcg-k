import type {
	ContentIssue,
	PreflightItemResult,
	PreflightReport,
} from "@/services/preflightService";
import {
	findMissingManifestDataFields,
	type GraphicPackageManifest,
	type GraphicPackageNumberConstraint,
	type GraphicPackageRenderRequirement,
	parseGraphicPackageManifest,
} from "./graphicManifest";
import {
	type GraphicMotionRuntimeCapability,
	getGraphicMotionCapabilityIssues,
} from "./graphicMotionCapability";
import { extractGraphicPackageMotion } from "./graphicPackageMotion";
import {
	buildOverlayReplicantData,
	getDashboardSchemaProperties,
	isRecord,
} from "./rundownOverlayData";

export type RundownQualityStatus = "ok" | "warning" | "error";
export type RundownQualityCategory =
	| "content"
	| "package"
	| "structure"
	| "runtime";

export interface RundownQualityItemLike {
	id: string;
	source_type: string;
	source_name: string;
	data: unknown;
}

export interface RundownQualityIssue {
	id: string;
	itemId: string;
	severity: RundownQualityStatus;
	category: RundownQualityCategory;
	label: string;
	message: string;
	field?: string;
	suggestion?: string;
}

export interface RundownQualityItemResult {
	itemId: string;
	status: RundownQualityStatus;
	issueCount: number;
	issues: RundownQualityIssue[];
}

export interface RundownQualitySummary {
	status: RundownQualityStatus;
	totalItems: number;
	okCount: number;
	warningCount: number;
	errorCount: number;
	contentIssueCount: number;
	packageIssueCount: number;
	runtimeIssueCount: number;
	itemResults: RundownQualityItemResult[];
	itemStatusById: Record<string, RundownQualityStatus>;
	itemIssueCountById: Record<string, number>;
	issuesByItemId: Record<string, RundownQualityIssue[]>;
}

export type RundownRendererScanMode = "progressive" | "interlaced";

export interface RundownRendererCapability {
	// Validation-only target profile. CasparCG still owns actual output conversion.
	videoMode?: string;
	resolution: {
		width: number;
		height: number;
	};
	// OGraf frameRate is checked against the progressive render cadence.
	frameRate: number;
	scanMode?: RundownRendererScanMode;
	fieldRate?: number;
	frameRateTolerance?: number;
	engines: Record<string, string | null | undefined>;
	accessToPublicInternet: boolean;
	motionDrivers?: GraphicMotionRuntimeCapability["motionDrivers"];
}

export const DEFAULT_RUNDOWN_RENDERER_CAPABILITY: RundownRendererCapability = {
	videoMode: "1080i5994",
	resolution: { width: 1920, height: 1080 },
	frameRate: 59.94,
	scanMode: "interlaced",
	fieldRate: 59.94,
	frameRateTolerance: 0.1,
	engines: { chromium: "120" },
	accessToPublicInternet: false,
	motionDrivers: { waapi: true, gsap: false },
};

export type RundownRendererCapabilityEnv = Record<
	string,
	string | boolean | undefined
>;

function parseBooleanEnv(value: string | boolean | undefined): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return null;

	switch (value.trim().toLowerCase()) {
		case "1":
		case "true":
		case "yes":
		case "on":
		case "enabled":
			return true;
		case "0":
		case "false":
		case "no":
		case "off":
		case "disabled":
			return false;
		default:
			return null;
	}
}

export function buildRundownRendererCapabilityFromEnv(
	env: RundownRendererCapabilityEnv = import.meta.env,
): RundownRendererCapability {
	const gsapEnabled = parseBooleanEnv(
		env.VITE_WEBCGK_MOTION_GSAP_ENABLED ??
			env.VITE_WEBCGK_RENDERER_GSAP_ENABLED,
	);

	return {
		...DEFAULT_RUNDOWN_RENDERER_CAPABILITY,
		resolution: { ...DEFAULT_RUNDOWN_RENDERER_CAPABILITY.resolution },
		engines: { ...DEFAULT_RUNDOWN_RENDERER_CAPABILITY.engines },
		motionDrivers: {
			...DEFAULT_RUNDOWN_RENDERER_CAPABILITY.motionDrivers,
			...(gsapEnabled === null ? {} : { gsap: gsapEnabled }),
		},
	};
}

const EMPTY_SUMMARY: RundownQualitySummary = {
	status: "ok",
	totalItems: 0,
	okCount: 0,
	warningCount: 0,
	errorCount: 0,
	contentIssueCount: 0,
	packageIssueCount: 0,
	runtimeIssueCount: 0,
	itemResults: [],
	itemStatusById: {},
	itemIssueCountById: {},
	issuesByItemId: {},
};

function maxStatus(
	left: RundownQualityStatus,
	right: RundownQualityStatus,
): RundownQualityStatus {
	if (left === "error" || right === "error") return "error";
	if (left === "warning" || right === "warning") return "warning";
	return "ok";
}

function statusFromIssues(issues: RundownQualityIssue[]): RundownQualityStatus {
	return issues.reduce<RundownQualityStatus>(
		(status, issue) => maxStatus(status, issue.severity),
		"ok",
	);
}

function severityFromContentIssue(issue: ContentIssue): RundownQualityStatus {
	return issue.severity === "error" ? "error" : "warning";
}

function contentLabel(issue: ContentIssue): string {
	switch (issue.type) {
		case "spelling":
			return "맞춤법";
		case "profanity":
			return "금칙어";
		case "title_format":
			return "표기";
		case "temporal":
			return "시제";
	}
}

function toContentQualityIssue(
	itemId: string,
	issue: ContentIssue,
	index: number,
): RundownQualityIssue {
	return {
		id: `${itemId}:content:${index}:${issue.type}:${issue.field}`,
		itemId,
		severity: severityFromContentIssue(issue),
		category: "content",
		label: contentLabel(issue),
		message: issue.message,
		field: issue.field,
		suggestion: issue.suggestion,
	};
}

function getCandidateManifest(data: unknown): unknown {
	if (!isRecord(data)) return undefined;
	return (
		data.manifest ??
		data.graphic_manifest ??
		data.graphicManifest ??
		data.ograf_manifest ??
		data.ografManifest ??
		(isRecord(data.payload)
			? (data.payload.manifest ??
				data.payload.graphic_manifest ??
				data.payload.graphicManifest ??
				data.payload.ograf_manifest ??
				data.payload.ografManifest)
			: undefined)
	);
}

function getDashboardSchema(data: unknown): Record<string, unknown> | null {
	if (!isRecord(data)) return null;
	const candidates = [
		data.dashboard_schema,
		data.dashboardSchema,
		isRecord(data.payload) ? data.payload.dashboard_schema : undefined,
		isRecord(data.data) ? data.data.dashboard_schema : undefined,
		isRecord(data.data) && isRecord(data.data.payload)
			? data.data.payload.dashboard_schema
			: undefined,
	];

	for (const candidate of candidates) {
		if (isRecord(candidate) && isRecord(candidate.properties)) {
			return candidate;
		}
	}

	return null;
}

function buildManifestFromDashboardSchema(
	item: RundownQualityItemLike,
): Pick<GraphicPackageManifest, "dataSchema"> | null {
	const dashboardSchema = getDashboardSchema(item.data);
	const properties = getDashboardSchemaProperties(item.data);
	if (Object.keys(properties).length === 0) return null;

	const schemaRequired = Array.isArray(dashboardSchema?.required)
		? dashboardSchema.required.filter(
				(field): field is string => typeof field === "string",
			)
		: [];
	const propertyRequired = Object.entries(properties)
		.filter(([, property]) => property.required === true)
		.map(([field]) => field);

	return {
		dataSchema: {
			type: "object",
			properties,
			required: [...new Set([...schemaRequired, ...propertyRequired])],
		},
	};
}

function getPackageData(item: RundownQualityItemLike): Record<string, unknown> {
	if (item.source_type === "overlay")
		return buildOverlayReplicantData(item.data);
	if (!isRecord(item.data) || !Array.isArray(item.data.elements)) return {};

	const result: Record<string, unknown> = {};
	item.data.elements.forEach((element, elementIndex) => {
		if (!isRecord(element)) return;
		const elementId =
			typeof element.id === "string" ? element.id : `element_${elementIndex}`;
		if (element.type === "text") {
			result[elementId] = element.content ?? element.text;
		}
	});
	return result;
}

function buildPackageIssues(
	item: RundownQualityItemLike,
): RundownQualityIssue[] {
	const issues: RundownQualityIssue[] = [];
	const candidateManifest = getCandidateManifest(item.data);
	let manifest: Pick<GraphicPackageManifest, "dataSchema"> | null = null;

	if (candidateManifest) {
		const parsed = parseGraphicPackageManifest(candidateManifest);
		if (parsed.ok && parsed.manifest) {
			manifest = parsed.manifest;
		} else {
			issues.push({
				id: `${item.id}:package:manifest-invalid`,
				itemId: item.id,
				severity: "error",
				category: "package",
				label: "Manifest",
				message: "그래픽 패키지 manifest를 해석할 수 없습니다.",
			});
		}
	}

	manifest ??= buildManifestFromDashboardSchema(item);
	if (!manifest?.dataSchema) return issues;

	const missingFields = findMissingManifestDataFields(
		manifest,
		getPackageData(item),
	);
	missingFields.forEach((field) => {
		issues.push({
			id: `${item.id}:package:missing:${field}`,
			itemId: item.id,
			severity: "error",
			category: "package",
			label: "데이터 누락",
			message: `"${field}" 필수 데이터가 비어 있습니다.`,
			field,
		});
	});

	return issues;
}

function parseRuntimeManifest(
	item: RundownQualityItemLike,
): GraphicPackageManifest | null {
	const candidateManifest = getCandidateManifest(item.data);
	if (!candidateManifest) return null;

	const parsed = parseGraphicPackageManifest(candidateManifest);
	return parsed.ok && parsed.manifest ? parsed.manifest : null;
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function numberConstraintFailures(
	label: string,
	actual: number,
	constraint: GraphicPackageNumberConstraint | undefined,
	tolerance = 0,
): string[] {
	if (!constraint) return [];

	const failures: string[] = [];
	if (
		typeof constraint.exact === "number" &&
		Math.abs(actual - constraint.exact) > tolerance
	) {
		failures.push(
			`${label} ${formatNumber(constraint.exact)} 필요, 현재 ${formatNumber(actual)}`,
		);
	}
	if (
		typeof constraint.min === "number" &&
		actual + tolerance < constraint.min
	) {
		failures.push(
			`${label} 최소 ${formatNumber(constraint.min)} 필요, 현재 ${formatNumber(actual)}`,
		);
	}
	if (
		typeof constraint.max === "number" &&
		actual - tolerance > constraint.max
	) {
		failures.push(
			`${label} 최대 ${formatNumber(constraint.max)} 필요, 현재 ${formatNumber(actual)}`,
		);
	}

	return failures;
}

function getResolutionConstraint(
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

function booleanConstraintFailures(
	label: string,
	actual: boolean,
	constraint: { exact?: boolean } | undefined,
): string[] {
	if (typeof constraint?.exact !== "boolean" || actual === constraint.exact) {
		return [];
	}

	return [
		`${label} ${constraint.exact ? "허용" : "차단"} 필요, 현재 ${actual ? "허용" : "차단"}`,
	];
}

function compareVersions(left: string, right: string): number {
	const leftParts = left.split(/[.-]/).map((part) => Number(part));
	const rightParts = right.split(/[.-]/).map((part) => Number(part));
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index += 1) {
		const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
		const rightPart = Number.isFinite(rightParts[index])
			? rightParts[index]
			: 0;
		if (leftPart !== rightPart) return leftPart - rightPart;
	}

	return 0;
}

function normalizeEngineName(name: string): string {
	return name.trim().toLowerCase();
}

function currentEngineLabel(capability: RundownRendererCapability): string {
	const labels = Object.entries(capability.engines).map(([name, version]) =>
		version ? `${name} ${version}` : name,
	);
	return labels.length > 0 ? labels.join(", ") : "알 수 없음";
}

function engineRequirementLabel(
	engine: NonNullable<GraphicPackageRenderRequirement["engine"]>[number],
): string {
	return engine.minVersion
		? `${engine.name} ${engine.minVersion}+`
		: engine.name;
}

function engineConstraintFailures(
	requirement: GraphicPackageRenderRequirement,
	capability: RundownRendererCapability,
): string[] {
	const engineRequirements =
		requirement.engine?.filter((engine) => engine.name.trim().length > 0) ?? [];
	if (engineRequirements.length === 0) return [];

	const capabilityByName = new Map(
		Object.entries(capability.engines).map(([name, version]) => [
			normalizeEngineName(name),
			version,
		]),
	);
	const versionFailures: string[] = [];

	for (const engine of engineRequirements) {
		const engineName = normalizeEngineName(engine.name);
		if (!capabilityByName.has(engineName)) continue;

		const currentVersion = capabilityByName.get(engineName);
		if (!engine.minVersion) return [];
		if (
			typeof currentVersion === "string" &&
			currentVersion.trim().length > 0 &&
			compareVersions(currentVersion, engine.minVersion) >= 0
		) {
			return [];
		}

		versionFailures.push(
			`${engine.name} ${engine.minVersion} 이상 필요, 현재 ${currentVersion || "버전 알 수 없음"}`,
		);
	}

	if (versionFailures.length > 0) return versionFailures;

	return [
		`필요 렌더링 엔진(${engineRequirements
			.map(engineRequirementLabel)
			.join(
				", ",
			)})을 사용할 수 없습니다. 현재 ${currentEngineLabel(capability)}`,
	];
}

function evaluateRenderRequirement(
	requirement: GraphicPackageRenderRequirement,
	capability: RundownRendererCapability,
): string[] {
	return [
		...numberConstraintFailures(
			"가로 해상도",
			capability.resolution.width,
			getResolutionConstraint(requirement, "width"),
		),
		...numberConstraintFailures(
			"세로 해상도",
			capability.resolution.height,
			getResolutionConstraint(requirement, "height"),
		),
		...numberConstraintFailures(
			"렌더 프레임레이트",
			capability.frameRate,
			requirement.frameRate,
			capability.frameRateTolerance ?? 0,
		),
		...booleanConstraintFailures(
			"공용 인터넷 접근",
			capability.accessToPublicInternet,
			requirement.accessToPublicInternet,
		),
		...engineConstraintFailures(requirement, capability),
	];
}

export function getRenderRequirementFailures(
	renderRequirements: GraphicPackageRenderRequirement[],
	capability: RundownRendererCapability = DEFAULT_RUNDOWN_RENDERER_CAPABILITY,
): string[] {
	if (renderRequirements.length === 0) return [];

	const failuresByRequirement = renderRequirements.map((requirement) =>
		evaluateRenderRequirement(requirement, capability),
	);
	if (failuresByRequirement.some((failures) => failures.length === 0)) {
		return [];
	}

	return (
		[...failuresByRequirement].sort(
			(left, right) => left.length - right.length,
		)[0] ?? []
	);
}

function buildRuntimeIssues(
	item: RundownQualityItemLike,
	capability: RundownRendererCapability,
): RundownQualityIssue[] {
	const manifest = parseRuntimeManifest(item);
	const issues: RundownQualityIssue[] = [];

	const motion = extractGraphicPackageMotion(item.data, manifest);
	getGraphicMotionCapabilityIssues(motion, capability).forEach(
		(motionIssue, index) => {
			issues.push({
				id: `${item.id}:runtime:motion:${motionIssue.driver}:${index}`,
				itemId: item.id,
				severity: motionIssue.severity,
				category: "runtime",
				label: "Motion driver",
				message: motionIssue.message,
			});
		},
	);

	if (manifest && manifest.renderRequirements.length > 0) {
		const mostRelevantFailures = getRenderRequirementFailures(
			manifest.renderRequirements,
			capability,
		);

		mostRelevantFailures.forEach((message, index) => {
			issues.push({
				id: `${item.id}:runtime:render:${index}`,
				itemId: item.id,
				severity: "error",
				category: "runtime",
				label: "렌더러",
				message,
			});
		});
	}

	return issues;
}

function buildStructureIssues(
	itemId: string,
	itemResult: PreflightItemResult | undefined,
): RundownQualityIssue[] {
	if (!itemResult || itemResult.cgResults.length === 0) return [];

	return itemResult.cgResults.flatMap((cgResult, index) => {
		const issues: RundownQualityIssue[] = [];
		if (!cgResult.slot) {
			issues.push({
				id: `${itemId}:structure:${index}:slot`,
				itemId,
				severity: "error",
				category: "structure",
				label: "슬롯",
				message: "번들 슬롯에 연결되지 않았습니다.",
			});
		} else if (!cgResult.graphicExists) {
			issues.push({
				id: `${itemId}:structure:${index}:graphic`,
				itemId,
				severity: "error",
				category: "structure",
				label: "그래픽",
				message: "번들에 연결된 그래픽을 찾을 수 없습니다.",
			});
		} else if (cgResult.mappingRatio < 1) {
			issues.push({
				id: `${itemId}:structure:${index}:mapping`,
				itemId,
				severity: "warning",
				category: "structure",
				label: "매핑",
				message: `필드 매핑이 일부 누락되었습니다. ${cgResult.mappedFieldCount}/${cgResult.totalFieldCount}`,
			});
		}

		cgResult.overflowWarnings.forEach((warning) => {
			issues.push({
				id: `${itemId}:structure:${index}:overflow:${warning.fieldKey}`,
				itemId,
				severity: warning.severity,
				category: "structure",
				label: "오버플로우",
				message: `"${warning.fieldKey}" 텍스트가 프레임을 초과할 수 있습니다.`,
				field: warning.fieldKey,
			});
		});

		return issues;
	});
}

export function buildRundownQualitySummary(params: {
	items: RundownQualityItemLike[];
	report: PreflightReport | null;
	rendererCapability?: RundownRendererCapability;
}): RundownQualitySummary {
	const {
		items,
		report,
		rendererCapability = buildRundownRendererCapabilityFromEnv(),
	} = params;
	if (items.length === 0) return EMPTY_SUMMARY;

	const reportByItemId = new Map<string, PreflightItemResult>();
	for (const itemResult of report?.items ?? []) {
		reportByItemId.set(itemResult.item.id, itemResult);
	}

	const itemResults = items.map<RundownQualityItemResult>((item) => {
		const itemReport = reportByItemId.get(item.id);
		const contentIssues =
			itemReport?.contentIssues.map((issue, index) =>
				toContentQualityIssue(item.id, issue, index),
			) ?? [];
		const issues = [
			...buildPackageIssues(item),
			...buildRuntimeIssues(item, rendererCapability),
			...buildStructureIssues(item.id, itemReport),
			...contentIssues,
		];
		const status = statusFromIssues(issues);

		return {
			itemId: item.id,
			status,
			issueCount: issues.length,
			issues,
		};
	});

	const itemStatusById: Record<string, RundownQualityStatus> = {};
	const itemIssueCountById: Record<string, number> = {};
	const issuesByItemId: Record<string, RundownQualityIssue[]> = {};

	for (const result of itemResults) {
		itemStatusById[result.itemId] = result.status;
		itemIssueCountById[result.itemId] = result.issueCount;
		issuesByItemId[result.itemId] = result.issues;
	}

	const errorCount = itemResults.filter(
		(result) => result.status === "error",
	).length;
	const warningCount = itemResults.filter(
		(result) => result.status === "warning",
	).length;
	const okCount = itemResults.length - errorCount - warningCount;
	const status = itemResults.reduce<RundownQualityStatus>(
		(current, result) => maxStatus(current, result.status),
		"ok",
	);

	return {
		status,
		totalItems: items.length,
		okCount,
		warningCount,
		errorCount,
		contentIssueCount: itemResults.reduce(
			(count, result) =>
				count +
				result.issues.filter((issue) => issue.category === "content").length,
			0,
		),
		packageIssueCount: itemResults.reduce(
			(count, result) =>
				count +
				result.issues.filter((issue) => issue.category === "package").length,
			0,
		),
		runtimeIssueCount: itemResults.reduce(
			(count, result) =>
				count +
				result.issues.filter((issue) => issue.category === "runtime").length,
			0,
		),
		itemResults,
		itemStatusById,
		itemIssueCountById,
		issuesByItemId,
	};
}

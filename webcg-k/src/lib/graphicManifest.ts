import { z } from "zod";
import {
	buildMotionManifestFromLegacyAnimationConfig,
	type GraphicMotionManifest,
	normalizeGraphicMotionManifest,
} from "./graphicMotionManifest";
import type { OverlayTemplateExtended } from "./overlayTypes";

export type GraphicPackageRuntimeKind =
	| "webcgk-vector"
	| "html-iframe"
	| "ograf-web-component";

export type GraphicPackageSourceSpec =
	| "webcgk-manifest-v1"
	| "ograf-v1"
	| "legacy-overlay-template";

export interface GraphicPackageThumbnail {
	src: string;
	label?: string;
	width?: number;
	height?: number;
}

export interface GraphicPackageCustomAction {
	id: string;
	label: string;
	description?: string;
	schema?: Record<string, unknown> | null;
}

export interface GraphicPackageNumberConstraint {
	min?: number;
	max?: number;
	exact?: number;
	ideal?: number;
}

export interface GraphicPackageBooleanConstraint {
	exact?: boolean;
	ideal?: boolean;
}

export interface GraphicPackageRenderRequirement {
	resolution?: {
		min?: { width?: number; height?: number };
		exact?: { width?: number; height?: number };
		width?: GraphicPackageNumberConstraint;
		height?: GraphicPackageNumberConstraint;
	};
	frameRate?: GraphicPackageNumberConstraint;
	engine?: Array<{
		name: string;
		minVersion?: string;
	}>;
	accessToPublicInternet?: GraphicPackageBooleanConstraint;
}

export interface GraphicPackageManifest {
	specVersion: "webcgk.manifest.v1";
	sourceSpec: GraphicPackageSourceSpec;
	id: string;
	name: string;
	description?: string;
	runtimeKind: GraphicPackageRuntimeKind;
	entrypoint?: string;
	dataSchema?: Record<string, unknown>;
	stepCount?: number;
	customActions: GraphicPackageCustomAction[];
	renderRequirements: GraphicPackageRenderRequirement[];
	thumbnails: GraphicPackageThumbnail[];
	motion?: GraphicMotionManifest | null;
	vendorExtensions: Record<string, unknown>;
	raw?: unknown;
}

export interface ManifestValidationIssue {
	path: string;
	message: string;
}

export interface ManifestParseResult {
	ok: boolean;
	manifest?: GraphicPackageManifest;
	issues: ManifestValidationIssue[];
}

const UnknownRecordSchema = z.record(z.string(), z.unknown());

const NumberConstraintSchema = z
	.object({
		min: z.number().optional(),
		max: z.number().optional(),
		exact: z.number().optional(),
		ideal: z.number().optional(),
	})
	.passthrough();

const BooleanConstraintSchema = z
	.object({
		exact: z.boolean().optional(),
		ideal: z.boolean().optional(),
	})
	.passthrough();

const ThumbnailSchema = z
	.object({
		src: z.string().min(1),
		label: z.string().optional(),
		width: z.number().optional(),
		height: z.number().optional(),
	})
	.passthrough();

const RenderRequirementSchema = z
	.object({
		resolution: z
			.object({
				min: z
					.object({
						width: z.number().optional(),
						height: z.number().optional(),
					})
					.passthrough()
					.optional(),
				exact: z
					.object({
						width: z.number().optional(),
						height: z.number().optional(),
					})
					.passthrough()
					.optional(),
				width: NumberConstraintSchema.optional(),
				height: NumberConstraintSchema.optional(),
			})
			.passthrough()
			.optional(),
		frameRate: NumberConstraintSchema.optional(),
		engine: z
			.array(
				z
					.object({
						name: z.string(),
						minVersion: z.string().optional(),
					})
					.passthrough(),
			)
			.optional(),
		accessToPublicInternet: BooleanConstraintSchema.optional(),
	})
	.passthrough();

const CustomActionSchema = z
	.object({
		id: z.string().optional(),
		name: z.string().optional(),
		label: z.string().optional(),
		description: z.string().optional(),
		schema: UnknownRecordSchema.nullable().optional(),
	})
	.passthrough();

const OGraphicsManifestSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string().optional(),
		main: z.string().min(1),
		schema: UnknownRecordSchema.optional(),
		stepCount: z.number().int().optional(),
		customActions: z.array(CustomActionSchema).optional(),
		renderRequirements: z.array(RenderRequirementSchema).optional(),
		thumbnails: z.array(ThumbnailSchema).optional(),
		v_webcgk_motion: z.unknown().optional(),
	})
	.passthrough();

const WebcgkManifestSchema = z
	.object({
		specVersion: z.literal("webcgk.manifest.v1"),
		sourceSpec: z
			.enum(["webcgk-manifest-v1", "ograf-v1", "legacy-overlay-template"])
			.default("webcgk-manifest-v1"),
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string().optional(),
		runtimeKind: z.enum([
			"webcgk-vector",
			"html-iframe",
			"ograf-web-component",
		]),
		entrypoint: z.string().optional(),
		dataSchema: UnknownRecordSchema.optional(),
		stepCount: z.number().int().optional(),
		customActions: z.array(CustomActionSchema).optional().default([]),
		renderRequirements: z.array(RenderRequirementSchema).optional().default([]),
		thumbnails: z.array(ThumbnailSchema).optional().default([]),
		motion: z.unknown().optional(),
		vendorExtensions: UnknownRecordSchema.optional().default({}),
	})
	.passthrough();

function issuesFromZod(error: z.ZodError): ManifestValidationIssue[] {
	return error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join(".") : "$",
		message: issue.message,
	}));
}

function collectVendorExtensions(
	raw: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(raw).filter(([key]) => key.startsWith("v_")),
	);
}

function normalizeCustomActions(
	actions: z.infer<typeof CustomActionSchema>[],
): GraphicPackageCustomAction[] {
	return actions
		.map((action, index) => {
			const id = action.id ?? action.name ?? `action-${index + 1}`;
			const label = action.label ?? action.name ?? action.id ?? id;
			return {
				id,
				label,
				description: action.description,
				schema: action.schema,
			};
		})
		.filter((action) => action.id.trim().length > 0);
}

export function parseOgrafManifest(raw: unknown): ManifestParseResult {
	const parsed = OGraphicsManifestSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, issues: issuesFromZod(parsed.error) };
	}

	const input = parsed.data;
	const rawRecord = raw as Record<string, unknown>;
	const manifest: GraphicPackageManifest = {
		specVersion: "webcgk.manifest.v1",
		sourceSpec: "ograf-v1",
		id: input.id,
		name: input.name,
		description: input.description,
		runtimeKind: "ograf-web-component",
		entrypoint: input.main,
		dataSchema: input.schema,
		stepCount: input.stepCount,
		customActions: normalizeCustomActions(input.customActions ?? []),
		renderRequirements: input.renderRequirements ?? [],
		thumbnails: input.thumbnails ?? [],
		motion: normalizeGraphicMotionManifest(input.v_webcgk_motion),
		vendorExtensions: collectVendorExtensions(rawRecord),
		raw,
	};

	return { ok: true, manifest, issues: [] };
}

export function parseWebcgkManifest(raw: unknown): ManifestParseResult {
	const parsed = WebcgkManifestSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, issues: issuesFromZod(parsed.error) };
	}

	const input = parsed.data;
	return {
		ok: true,
		manifest: {
			specVersion: "webcgk.manifest.v1",
			sourceSpec: input.sourceSpec,
			id: input.id,
			name: input.name,
			description: input.description,
			runtimeKind: input.runtimeKind,
			entrypoint: input.entrypoint,
			dataSchema: input.dataSchema,
			stepCount: input.stepCount,
			customActions: normalizeCustomActions(input.customActions),
			renderRequirements: input.renderRequirements,
			thumbnails: input.thumbnails,
			motion: normalizeGraphicMotionManifest(input.motion),
			vendorExtensions: input.vendorExtensions,
			raw,
		},
		issues: [],
	};
}

export function parseGraphicPackageManifest(raw: unknown): ManifestParseResult {
	const webcgk = parseWebcgkManifest(raw);
	if (webcgk.ok) return webcgk;

	const ograf = parseOgrafManifest(raw);
	if (ograf.ok) return ograf;

	return {
		ok: false,
		issues: [
			...webcgk.issues.map((issue) => ({
				...issue,
				path: `webcgk.${issue.path}`,
			})),
			...ograf.issues.map((issue) => ({
				...issue,
				path: `ograf.${issue.path}`,
			})),
		],
	};
}

export function buildManifestFromOverlayTemplate(
	template: Pick<
		OverlayTemplateExtended,
		| "id"
		| "name"
		| "description"
		| "plugin_type"
		| "source_code"
		| "dashboard_schema"
		| "animation_config"
		| "graphic_data"
		| "thumbnail"
		| "tags"
	>,
): GraphicPackageManifest {
	const hasHtmlRuntime =
		template.plugin_type === "html" && template.source_code != null;
	const customActions =
		template.animation_config?.actions?.map((action) => ({
			id: action.id,
			label: action.label,
			schema: action.config,
		})) ?? [];
	const motion = buildMotionManifestFromLegacyAnimationConfig(
		template.animation_config,
	);

	return {
		specVersion: "webcgk.manifest.v1",
		sourceSpec: "legacy-overlay-template",
		id: template.id,
		name: template.name,
		description: template.description ?? undefined,
		runtimeKind: hasHtmlRuntime ? "html-iframe" : "webcgk-vector",
		dataSchema: template.dashboard_schema ?? undefined,
		stepCount: customActions.length > 0 ? -1 : 1,
		customActions,
		renderRequirements: [
			{
				resolution: { min: { width: 1920, height: 1080 } },
				engine: [{ name: "chromium" }],
			},
		],
		thumbnails: template.thumbnail
			? [{ src: template.thumbnail, label: template.name }]
			: [],
		motion,
		vendorExtensions: {
			v_webcgk_tags: template.tags ?? [],
			v_webcgk_pluginType: template.plugin_type,
			v_webcgk_elementCount: template.graphic_data?.length ?? 0,
		},
		raw: template,
	};
}

export function getRequiredSchemaFields(
	manifest: Pick<GraphicPackageManifest, "dataSchema">,
): string[] {
	const schema = manifest.dataSchema;
	if (!schema) return [];
	const required = schema.required;
	return Array.isArray(required)
		? required.filter((field): field is string => typeof field === "string")
		: [];
}

export function findMissingManifestDataFields(
	manifest: Pick<GraphicPackageManifest, "dataSchema">,
	data: Record<string, unknown>,
): string[] {
	return getRequiredSchemaFields(manifest).filter((field) => {
		const value = data[field];
		return value == null || (typeof value === "string" && value.trim() === "");
	});
}

import { parseOgrafManifest } from "./graphicManifest";
import { isRecord } from "./rundownOverlayData";

export const OGRAF_INLINE_MODULE_SOURCE = "webcgk.ograf.inline-module.v1";
export const OGRAF_INLINE_PAYLOAD_WARNING_BYTES = 512 * 1024;

export interface OgrafPackageFile {
	name: string;
	webkitRelativePath?: string;
	text: () => Promise<string>;
}

export interface ImportedOgrafPackage {
	id: string;
	name: string;
	description?: string;
	compatibility: OgrafPackageCompatibilityReport;
	sourceData: {
		manifest: unknown;
		entrypoint: string;
		data: Record<string, unknown>;
		moduleCode: string;
		importSource: typeof OGRAF_INLINE_MODULE_SOURCE;
		packagePath?: string;
	};
	warnings: string[];
}

export interface OgrafPackageCompatibilityReport {
	importMode: "inline-data-url-snapshot";
	packageBytes: number;
	runtimeFileCount: number;
	runtimeFileBytes: number;
	moduleBytes: number;
	inlineModuleBytes: number;
	notes: string[];
}

function filePath(file: OgrafPackageFile): string {
	return file.webkitRelativePath || file.name;
}

function basename(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

function dirname(path: string): string {
	const parts = path.split("/").filter(Boolean);
	parts.pop();
	return parts.join("/");
}

function joinPath(dir: string, name: string): string {
	return dir ? `${dir}/${name}` : name;
}

function normalizePackagePath(path: string): string {
	const parts: string[] = [];
	for (const part of path.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}
		parts.push(part);
	}
	return parts.join("/");
}

function isOgrafManifestName(path: string): boolean {
	const lower = basename(path).toLowerCase();
	return lower.endsWith(".ograf.json") || lower === "manifest.json";
}

function isDocumentationFile(path: string): boolean {
	const lower = basename(path).toLowerCase();
	return (
		lower === "readme" ||
		lower.endsWith(".md") ||
		lower.endsWith(".txt") ||
		lower.endsWith(".license")
	);
}

function findManifestFile(
	files: OgrafPackageFile[],
): OgrafPackageFile | undefined {
	return files.find((file) => isOgrafManifestName(filePath(file)));
}

function findEntrypointFile(
	files: OgrafPackageFile[],
	manifestPath: string,
	entrypoint: string,
): OgrafPackageFile | undefined {
	const manifestDir = dirname(manifestPath);
	const candidates = new Set([
		entrypoint,
		joinPath(manifestDir, entrypoint),
		basename(entrypoint),
	]);

	return files.find((file) => {
		const path = filePath(file);
		return candidates.has(path) || basename(path) === basename(entrypoint);
	});
}

function defaultDataFromSchema(schema: unknown): Record<string, unknown> {
	if (!isRecord(schema) || !isRecord(schema.properties)) return {};

	return Object.fromEntries(
		Object.entries(schema.properties)
			.map(([key, property]) => {
				if (!isRecord(property) || !("default" in property)) return null;
				return [key, property.default];
			})
			.filter((entry): entry is [string, unknown] => entry != null),
	);
}

function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function mimeTypeForPath(path: string): string {
	const lower = basename(path).toLowerCase();
	if (lower.endsWith(".mjs") || lower.endsWith(".js")) {
		return "application/javascript";
	}
	if (lower.endsWith(".svg")) return "image/svg+xml";
	if (lower.endsWith(".css")) return "text/css";
	if (lower.endsWith(".json")) return "application/json";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".woff")) return "font/woff";
	if (lower.endsWith(".woff2")) return "font/woff2";
	return "text/plain";
}

function isJavaScriptFile(path: string): boolean {
	const lower = basename(path).toLowerCase();
	return lower.endsWith(".mjs") || lower.endsWith(".js");
}

function dataUrlForText(path: string, text: string): string {
	const mimeType = mimeTypeForPath(path);
	const charset =
		mimeType.startsWith("text/") || mimeType.includes("javascript");
	return `data:${mimeType}${charset ? ";charset=utf-8" : ""},${encodeURIComponent(text)}`;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}

function buildCompatibilityReport(params: {
	packageBytes: number;
	runtimeFileCount: number;
	runtimeFileBytes: number;
	moduleBytes: number;
	inlineModuleBytes: number;
	unresolvedReferences: string[];
}): OgrafPackageCompatibilityReport {
	const notes = [
		"WebCG-K inline OGraf import: OGraf package는 WebCG-K sourceData snapshot으로 저장됩니다.",
		"Rundown export는 OGraf package export가 아니라 WebCG-K rundown JSON package입니다.",
	];

	if (params.inlineModuleBytes >= OGRAF_INLINE_PAYLOAD_WARNING_BYTES) {
		notes.push(
			`Inline module payload가 ${params.inlineModuleBytes} bytes입니다. 큰 OGraf package는 운영 환경에서 registry/storage로 분리하는 편이 안전합니다.`,
		);
	}

	if (params.unresolvedReferences.length > 0) {
		notes.push(
			"일부 package-relative reference가 import 중 해석되지 않았습니다.",
		);
	}

	return {
		importMode: "inline-data-url-snapshot",
		packageBytes: params.packageBytes,
		runtimeFileCount: params.runtimeFileCount,
		runtimeFileBytes: params.runtimeFileBytes,
		moduleBytes: params.moduleBytes,
		inlineModuleBytes: params.inlineModuleBytes,
		notes,
	};
}

function resolveRelativePackagePath(
	fromPath: string,
	specifier: string,
): string | null {
	if (!isRelativeSpecifier(specifier)) return null;
	return normalizePackagePath(joinPath(dirname(fromPath), specifier));
}

interface RewritePackageModuleInput {
	entrypointPath: string;
	entrypointCode: string;
	runtimeFiles: Map<string, string>;
}

interface RewritePackageModuleResult {
	moduleCode: string;
	unresolvedReferences: string[];
}

function rewritePackageModuleCode({
	entrypointPath,
	entrypointCode,
	runtimeFiles,
}: RewritePackageModuleInput): RewritePackageModuleResult {
	const unresolvedReferences = new Set<string>();
	const moduleUrlMemo = new Map<string, string>();

	const dataUrlForPackageFile = (
		currentPath: string,
		specifier: string,
	): string | null => {
		const resolvedPath = resolveRelativePackagePath(currentPath, specifier);
		if (!resolvedPath) return null;

		const text = runtimeFiles.get(resolvedPath);
		if (text == null) {
			unresolvedReferences.add(`${currentPath} -> ${specifier}`);
			return null;
		}

		if (isJavaScriptFile(resolvedPath)) {
			return moduleDataUrl(resolvedPath, text);
		}

		return dataUrlForText(resolvedPath, text);
	};

	const rewriteCode = (path: string, code: string): string => {
		let rewritten = code.replace(
			/import\.meta\.resolve\(\s*(["'])(\.{1,2}\/[^"']+)\1\s*\)/g,
			(match, _quote: string, specifier: string) => {
				const url = dataUrlForPackageFile(path, specifier);
				return url ? JSON.stringify(url) : match;
			},
		);

		rewritten = rewritten.replace(
			/(from\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
			(match, prefix: string, quote: string, specifier: string) => {
				const url = dataUrlForPackageFile(path, specifier);
				return url ? `${prefix}${quote}${url}${quote}` : match;
			},
		);

		return rewritten.replace(
			/(import\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
			(match, prefix: string, quote: string, specifier: string) => {
				const url = dataUrlForPackageFile(path, specifier);
				return url ? `${prefix}${quote}${url}${quote}` : match;
			},
		);
	};

	function moduleDataUrl(path: string, text: string): string {
		const cached = moduleUrlMemo.get(path);
		if (cached) return cached;

		const rewritten = rewriteCode(path, text);
		const url = dataUrlForText(path, rewritten);
		moduleUrlMemo.set(path, url);
		return url;
	}

	return {
		moduleCode: rewriteCode(entrypointPath, entrypointCode),
		unresolvedReferences: [...unresolvedReferences],
	};
}

export async function importOgrafPackageFromFiles(
	fileList: ArrayLike<OgrafPackageFile>,
): Promise<ImportedOgrafPackage> {
	const files = Array.from(fileList);
	const fileTexts = new Map<OgrafPackageFile, string>();
	let packageBytes = 0;
	for (const file of files) {
		const text = await file.text();
		fileTexts.set(file, text);
		packageBytes += byteLength(text);
	}

	const manifestFile = findManifestFile(files);
	if (!manifestFile) {
		throw new Error("OGraf manifest(.ograf.json)을 찾을 수 없습니다.");
	}

	const manifestPath = filePath(manifestFile);
	let rawManifest: unknown;
	try {
		rawManifest = JSON.parse(fileTexts.get(manifestFile) ?? "");
	} catch {
		throw new Error("OGraf manifest JSON을 읽을 수 없습니다.");
	}

	const parsed = parseOgrafManifest(rawManifest);
	if (!parsed.ok || !parsed.manifest) {
		const firstIssue = parsed.issues[0];
		throw new Error(
			firstIssue
				? `OGraf manifest 오류: ${firstIssue.path} ${firstIssue.message}`
				: "OGraf manifest 형식이 아닙니다.",
		);
	}

	const entrypoint = parsed.manifest.entrypoint;
	if (!entrypoint) {
		throw new Error("OGraf entrypoint(main)가 누락되었습니다.");
	}

	const moduleFile = findEntrypointFile(files, manifestPath, entrypoint);
	if (!moduleFile) {
		throw new Error(`OGraf entrypoint 파일을 찾을 수 없습니다: ${entrypoint}`);
	}

	const runtimeFiles = new Map<string, string>();
	for (const file of files) {
		if (file === manifestFile || isDocumentationFile(filePath(file))) continue;
		runtimeFiles.set(
			normalizePackagePath(filePath(file)),
			fileTexts.get(file) ?? "",
		);
	}
	const rawModuleCode =
		runtimeFiles.get(normalizePackagePath(filePath(moduleFile))) ??
		fileTexts.get(moduleFile) ??
		"";
	const rewrittenModule = rewritePackageModuleCode({
		entrypointPath: normalizePackagePath(filePath(moduleFile)),
		entrypointCode: rawModuleCode,
		runtimeFiles,
	});

	const warnings = rewrittenModule.unresolvedReferences.map(
		(reference) => `OGraf package 상대 경로를 찾을 수 없습니다: ${reference}`,
	);
	const compatibility = buildCompatibilityReport({
		packageBytes,
		runtimeFileCount: runtimeFiles.size,
		runtimeFileBytes: [...runtimeFiles.values()].reduce(
			(total, text) => total + byteLength(text),
			0,
		),
		moduleBytes: byteLength(rawModuleCode),
		inlineModuleBytes: byteLength(rewrittenModule.moduleCode),
		unresolvedReferences: rewrittenModule.unresolvedReferences,
	});
	if (compatibility.inlineModuleBytes >= OGRAF_INLINE_PAYLOAD_WARNING_BYTES) {
		warnings.push(
			`OGraf inline payload가 큽니다: ${compatibility.inlineModuleBytes} bytes. 운영 환경에서는 package registry/storage가 필요할 수 있습니다.`,
		);
	}

	return {
		id: parsed.manifest.id,
		name: parsed.manifest.name,
		description: parsed.manifest.description,
		compatibility,
		sourceData: {
			manifest: rawManifest,
			entrypoint,
			data: defaultDataFromSchema(parsed.manifest.dataSchema),
			moduleCode: rewrittenModule.moduleCode,
			importSource: OGRAF_INLINE_MODULE_SOURCE,
			packagePath: dirname(manifestPath) || undefined,
		},
		warnings,
	};
}

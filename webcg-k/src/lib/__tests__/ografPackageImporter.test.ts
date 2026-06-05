import { describe, expect, it } from "vitest";
import {
	importOgrafPackageFromFiles,
	OGRAF_INLINE_PAYLOAD_WARNING_BYTES,
} from "../ografPackageImporter";

function file(name: string, text: string, webkitRelativePath?: string) {
	return {
		name,
		webkitRelativePath,
		text: async () => text,
	};
}

const minimalManifest = {
	$schema:
		"https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
	id: "minimal-example",
	name: "Minimal Test Graphic",
	main: "graphic.mjs",
	supportsRealTime: true,
	schema: {
		type: "object",
		properties: {
			message: {
				type: "string",
				default: "Hello World!",
			},
		},
	},
};

describe("ografPackageImporter", () => {
	it("imports an OGraf manifest and entrypoint module snapshot", async () => {
		const imported = await importOgrafPackageFromFiles([
			file(
				"minimal.ograf.json",
				JSON.stringify(minimalManifest),
				"minimal/minimal.ograf.json",
			),
			file(
				"graphic.mjs",
				"export default class Graphic extends HTMLElement {}",
				"minimal/graphic.mjs",
			),
		]);

		expect(imported).toMatchObject({
			id: "minimal-example",
			name: "Minimal Test Graphic",
			sourceData: {
				entrypoint: "graphic.mjs",
				data: { message: "Hello World!" },
				importSource: "webcgk.ograf.inline-module.v1",
				packagePath: "minimal",
			},
		});
		expect(imported.sourceData.moduleCode).toContain("export default class");
		expect(imported.compatibility).toMatchObject({
			importMode: "inline-data-url-snapshot",
			runtimeFileCount: 1,
		});
		expect(imported.compatibility.notes).toContain(
			"Rundown export는 OGraf package export가 아니라 WebCG-K rundown JSON package입니다.",
		);
	});

	it("rejects packages without the manifest entrypoint file", async () => {
		await expect(
			importOgrafPackageFromFiles([
				file("minimal.ograf.json", JSON.stringify(minimalManifest)),
			]),
		).rejects.toThrow("entrypoint 파일");
	});

	it("rewrites package-relative assets into inline data URLs", async () => {
		const imported = await importOgrafPackageFromFiles([
			file(
				"minimal.ograf.json",
				JSON.stringify(minimalManifest),
				"minimal/minimal.ograf.json",
			),
			file(
				"graphic.mjs",
				'const logo = import.meta.resolve("./lib/logo.svg"); export default class Graphic extends HTMLElement {}',
				"minimal/graphic.mjs",
			),
			file("logo.svg", "<svg />", "minimal/lib/logo.svg"),
		]);

		expect(imported.warnings).toHaveLength(0);
		expect(imported.sourceData.moduleCode).toContain("data:image/svg+xml");
		expect(imported.sourceData.moduleCode).not.toContain("import.meta.resolve");
	});

	it("warns when package-relative runtime references are missing", async () => {
		const imported = await importOgrafPackageFromFiles([
			file(
				"minimal.ograf.json",
				JSON.stringify(minimalManifest),
				"minimal/minimal.ograf.json",
			),
			file(
				"graphic.mjs",
				'const logo = import.meta.resolve("./lib/missing.svg"); export default class Graphic extends HTMLElement {}',
				"minimal/graphic.mjs",
			),
		]);

		expect(imported.warnings).toEqual([
			"OGraf package 상대 경로를 찾을 수 없습니다: minimal/graphic.mjs -> ./lib/missing.svg",
		]);
		expect(imported.compatibility.notes).toContain(
			"일부 package-relative reference가 import 중 해석되지 않았습니다.",
		);
	});

	it("warns when the rewritten inline module payload is large", async () => {
		const largeModule = `const payload = "${"x".repeat(
			OGRAF_INLINE_PAYLOAD_WARNING_BYTES,
		)}"; export default class Graphic extends HTMLElement {}`;
		const imported = await importOgrafPackageFromFiles([
			file(
				"minimal.ograf.json",
				JSON.stringify(minimalManifest),
				"minimal/minimal.ograf.json",
			),
			file("graphic.mjs", largeModule, "minimal/graphic.mjs"),
		]);

		expect(imported.compatibility.inlineModuleBytes).toBeGreaterThanOrEqual(
			OGRAF_INLINE_PAYLOAD_WARNING_BYTES,
		);
		expect(
			imported.warnings.some((warning) => warning.includes("inline payload")),
		).toBe(true);
	});
});

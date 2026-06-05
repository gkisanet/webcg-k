import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OgrafPackageFile } from "../ografPackageImporter";
import { importOgrafPackageFromFiles } from "../ografPackageImporter";

const examplesRoot = resolve(process.cwd(), "../test/ograf-examples");
const fixtureExamplesAvailable = existsSync(
	resolve(examplesRoot, "minimal/minimal.ograf.json"),
);
const describeFixtures = fixtureExamplesAvailable ? describe : describe.skip;

async function collectFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const path = resolve(dir, entry.name);
			return entry.isDirectory() ? collectFiles(path) : [path];
		}),
	);

	return nested.flat();
}

async function readFixturePackage(name: string): Promise<OgrafPackageFile[]> {
	const root = resolve(examplesRoot, name);
	const paths = await collectFiles(root);

	return paths.map((path) => {
		const fixtureRelativePath = relative(root, path).replaceAll("\\", "/");
		return {
			name: basename(path),
			webkitRelativePath: `${name}/${fixtureRelativePath}`,
			text: () => readFile(path, "utf8"),
		};
	});
}

describeFixtures("ografPackageImporter example fixtures", () => {
	it("imports test/ograf-examples/minimal as an inline module package", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("minimal"),
		);

		expect(imported).toMatchObject({
			id: "minimal-example",
			name: "Minimal Test Graphic",
			sourceData: {
				entrypoint: "graphic.mjs",
				data: { message: "Hello World!" },
				importSource: "webcgk.ograf.inline-module.v1",
				packagePath: "minimal",
			},
			warnings: [],
		});
		expect(imported.sourceData.moduleCode).toContain("export default Graphic");
	});

	it("imports test/ograf-examples/renderer-test and preserves default action data", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("renderer-test"),
		);

		expect(imported).toMatchObject({
			id: "renderer-test",
			name: "Renderer Test Graphic",
			sourceData: {
				entrypoint: "graphic.mjs",
				data: { message: "Hello" },
				importSource: "webcgk.ograf.inline-module.v1",
				packagePath: "renderer-test",
			},
			warnings: [],
		});
		expect(imported.sourceData.moduleCode).toContain("customAction(params)");
	});

	it("rewrites test/ograf-examples/ograf-logo asset references into data URLs", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("ograf-logo"),
		);

		expect(imported).toMatchObject({
			id: "minimal-logo",
			sourceData: {
				entrypoint: "graphic.mjs",
				importSource: "webcgk.ograf.inline-module.v1",
				packagePath: "ograf-logo",
			},
		});
		expect(imported.sourceData.moduleCode).toContain("data:image/svg+xml");
		expect(imported.sourceData.moduleCode).not.toContain("import.meta.resolve");
		expect(imported.warnings).toEqual([]);
	});

	it("rewrites test/ograf-examples/l3rd-name nested module dependencies", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("l3rd-name"),
		);

		expect(imported).toMatchObject({
			id: "l3rd-name",
			sourceData: {
				entrypoint: "graphic.mjs",
				data: { name: "John Doe", title: "Ograf expert" },
				importSource: "webcgk.ograf.inline-module.v1",
				packagePath: "l3rd-name",
			},
		});
		expect(imported.warnings).toEqual([
			expect.stringContaining("OGraf inline payload가 큽니다"),
		]);
		expect(imported.sourceData.moduleCode).toContain(
			"data:application/javascript",
		);
		expect(imported.sourceData.moduleCode).toContain("data:image/svg+xml");
		expect(imported.sourceData.moduleCode).not.toContain("import.meta.resolve");
	});
});

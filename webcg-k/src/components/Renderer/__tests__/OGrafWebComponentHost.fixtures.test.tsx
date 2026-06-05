import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeBroadcastSourceData } from "../../../lib/broadcastSourceData";
import type { OgrafPackageFile } from "../../../lib/ografPackageImporter";
import { importOgrafPackageFromFiles } from "../../../lib/ografPackageImporter";
import { OGrafWebComponentHost } from "../OGrafWebComponentHost";

const examplesRoot = resolve(process.cwd(), "../test/ograf-examples");
const fixtureExamplesAvailable = existsSync(
	resolve(examplesRoot, "minimal/minimal.ograf.json"),
);
const describeFixtures = fixtureExamplesAvailable ? describe : describe.skip;

class TestResizeObserver {
	observe() {
		// jsdom does not compute element boxes; host still renders at default scale.
	}
	disconnect() {}
}

class TestImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	private currentSrc = "";

	get src() {
		return this.currentSrc;
	}

	set src(value: string) {
		this.currentSrc = value;
		queueMicrotask(() => this.onload?.call(this));
	}
}

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

describeFixtures("OGrafWebComponentHost example fixtures", () => {
	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		vi.stubGlobal("Image", TestImage);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads and paints test/ograf-examples/minimal through the renderer host", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("minimal"),
		);
		const normalized = normalizeBroadcastSourceData(
			"ograf",
			imported.sourceData,
		);

		expect(normalized.kind).toBe("ograf");
		if (normalized.kind !== "ograf") return;

		render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<OGrafWebComponentHost
					payload={normalized.ograf}
					title={imported.name}
					phase="enter"
					width={1920}
					height={1080}
				/>
			</div>,
		);

		await waitFor(() => {
			expect(screen.getByText("Hello world!")).toBeInTheDocument();
		});
	});

	it("loads test/ograf-examples/ograf-logo with rewritten package assets", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("ograf-logo"),
		);
		const normalized = normalizeBroadcastSourceData(
			"ograf",
			imported.sourceData,
		);

		expect(normalized.kind).toBe("ograf");
		if (normalized.kind !== "ograf") return;

		const { container } = render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<OGrafWebComponentHost
					payload={normalized.ograf}
					title={imported.name}
					phase="enter"
					width={1920}
					height={1080}
				/>
			</div>,
		);

		await waitFor(() => {
			const logo = container.querySelector("img");
			expect(logo?.getAttribute("src")).toContain("data:image/svg+xml");
		});
		expect(imported.warnings).toEqual([]);
	});

	it("loads test/ograf-examples/l3rd-name with rewritten library modules", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("l3rd-name"),
		);
		const normalized = normalizeBroadcastSourceData(
			"ograf",
			imported.sourceData,
		);

		expect(normalized.kind).toBe("ograf");
		if (normalized.kind !== "ograf") return;

		const { container } = render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<OGrafWebComponentHost
					payload={normalized.ograf}
					title={imported.name}
					phase="idle"
					width={1920}
					height={1080}
				/>
			</div>,
		);

		await waitFor(() => {
			expect(screen.getByText("John Doe")).toBeInTheDocument();
			expect(screen.getByText("Ograf expert")).toBeInTheDocument();
			const logo = container.querySelector("img");
			expect(logo?.getAttribute("src")).toContain("data:image/svg+xml");
		});
		expect(imported.warnings).toEqual([
			expect.stringContaining("OGraf inline payload가 큽니다"),
		]);
	});
});

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OgrafPackageFile } from "../../../lib/ografPackageImporter";
import { importOgrafPackageFromFiles } from "../../../lib/ografPackageImporter";
import {
	createGraphicCommandResultPayload,
	createGraphicCustomActionCommandPayload,
	isRendererGraphicCommandResultPayload,
	toRendererGraphicCommandDispatch,
} from "../../../lib/rendererGraphicCommand";
import type { BroadcastItemPayload } from "../../../lib/types/broadcast";
import { RendererBroadcastItem } from "../RendererBroadcastItem";

const examplesRoot = resolve(process.cwd(), "../test/ograf-examples");
const fixtureExamplesAvailable = existsSync(
	resolve(examplesRoot, "minimal/minimal.ograf.json"),
);
const describeFixtures = fixtureExamplesAvailable ? describe : describe.skip;

class TestResizeObserver {
	observe() {}
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

describeFixtures("RendererBroadcastItem example fixtures", () => {
	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		vi.stubGlobal("Image", TestImage);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("routes a minimal OGraf broadcast item to the OGraf renderer host", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("minimal"),
		);
		const item: BroadcastItemPayload = {
			id: "minimal-block",
			name: imported.name,
			trackId: 10,
			sourceType: "ograf",
			sourceData: imported.sourceData,
		};

		render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<RendererBroadcastItem item={item} phase="enter" resolution="1080p" />
			</div>,
		);

		await waitFor(() => {
			expect(screen.getByText("Hello world!")).toBeInTheDocument();
		});
	});

	it("executes an OGraf custom action and exposes a command result payload", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("minimal"),
		);
		const item: BroadcastItemPayload = {
			id: "minimal-block",
			name: imported.name,
			trackId: 10,
			sourceType: "ograf",
			sourceData: imported.sourceData,
		};
		const command = toRendererGraphicCommandDispatch(
			createGraphicCustomActionCommandPayload({
				targetBlockId: item.id,
				targetTrackId: item.trackId,
				actionId: "noop",
				seqNum: 701,
			}),
		);
		const onCommandHandled = vi.fn();

		const { rerender } = render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<RendererBroadcastItem
					item={item}
					phase="enter"
					resolution="1080p"
					onCommandHandled={onCommandHandled}
				/>
			</div>,
		);

		await waitFor(() => {
			expect(screen.getByText("Hello world!")).toBeInTheDocument();
		});
		expect(onCommandHandled).not.toHaveBeenCalled();

		rerender(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<RendererBroadcastItem
					item={item}
					phase="enter"
					resolution="1080p"
					command={command}
					onCommandHandled={onCommandHandled}
				/>
			</div>,
		);

		await waitFor(() => {
			expect(onCommandHandled).toHaveBeenCalledTimes(1);
		});

		const [handledCommand, result] = onCommandHandled.mock.calls[0];
		expect(handledCommand).toMatchObject({
			seqNum: 701,
			targetBlockId: "minimal-block",
			kind: "custom-action",
			actionId: "noop",
		});
		expect(result).toEqual({ status: "handled" });

		const resultPayload = createGraphicCommandResultPayload({
			command: handledCommand,
			status: result.status,
			message: result.message,
			statusCode: result.statusCode,
			currentStep: result.currentStep,
			completedAt: 1700,
		});

		expect(resultPayload).toMatchObject({
			action: "GRAPHIC_COMMAND_RESULT",
			seqNum: 701,
			targetBlockId: "minimal-block",
			targetTrackId: 10,
			kind: "custom-action",
			status: "handled",
			completedAt: 1700,
		});
		expect(isRendererGraphicCommandResultPayload(resultPayload)).toBe(true);
	});

	it("routes l3rd-name OGraf broadcast item and handles its fixture custom action", async () => {
		const imported = await importOgrafPackageFromFiles(
			await readFixturePackage("l3rd-name"),
		);
		const item: BroadcastItemPayload = {
			id: "l3rd-name-block",
			name: imported.name,
			trackId: 11,
			sourceType: "ograf",
			sourceData: imported.sourceData,
		};
		const command = toRendererGraphicCommandDispatch(
			createGraphicCustomActionCommandPayload({
				targetBlockId: item.id,
				targetTrackId: item.trackId,
				actionId: "highlight",
				seqNum: 811,
				skipAnimation: true,
			}),
		);
		const onCommandHandled = vi.fn();

		const { container, rerender } = render(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<RendererBroadcastItem
					item={item}
					phase="idle"
					resolution="1080p"
					onCommandHandled={onCommandHandled}
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
		expect(onCommandHandled).not.toHaveBeenCalled();

		rerender(
			<div style={{ position: "relative", width: 960, height: 540 }}>
				<RendererBroadcastItem
					item={item}
					phase="idle"
					resolution="1080p"
					command={command}
					onCommandHandled={onCommandHandled}
				/>
			</div>,
		);

		await waitFor(() => {
			expect(onCommandHandled).toHaveBeenCalledTimes(1);
		});

		const [handledCommand, result] = onCommandHandled.mock.calls[0];
		expect(handledCommand).toMatchObject({
			seqNum: 811,
			targetBlockId: "l3rd-name-block",
			kind: "custom-action",
			actionId: "highlight",
		});
		expect(result).toEqual({ status: "handled" });
	});
});

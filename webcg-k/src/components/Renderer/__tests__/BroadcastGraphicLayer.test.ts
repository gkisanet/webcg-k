import { describe, expect, it } from "vitest";
import { getBroadcastLayerCompletionDelayMs } from "../BroadcastGraphicLayer";

describe("BroadcastGraphicLayer lifecycle completion", () => {
	it("waits for package enter and exit holds when container transition is disabled", () => {
		const lifecycle = {
			useContainerAnimation: false,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: true,
			enterHoldMs: 760,
			exitHoldMs: 700,
		};

		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "enter", false)).toBe(
			760,
		);
		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "exit", false)).toBe(
			700,
		);
	});

	it("lets CSS animationend own legacy fade completion", () => {
		const lifecycle = {
			useContainerAnimation: true,
			usesPackageMotion: false,
			usesPackageEnterMotion: false,
			usesPackageExitMotion: false,
			enterHoldMs: 800,
			exitHoldMs: 800,
		};

		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "enter", true)).toBe(
			null,
		);
		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "exit", true)).toBe(
			null,
		);
	});

	it("completes cut transitions immediately when no package motion exists", () => {
		const lifecycle = {
			useContainerAnimation: true,
			usesPackageMotion: false,
			usesPackageEnterMotion: false,
			usesPackageExitMotion: false,
			enterHoldMs: 800,
			exitHoldMs: 800,
		};

		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "enter", false)).toBe(
			0,
		);
		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "exit", false)).toBe(
			0,
		);
	});

	it("completes a fallback exit through CSS animation when only enter uses package motion", () => {
		const lifecycle = {
			useContainerAnimation: true,
			usesPackageMotion: true,
			usesPackageEnterMotion: true,
			usesPackageExitMotion: false,
			enterHoldMs: 760,
			exitHoldMs: 0,
		};

		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "enter", false)).toBe(
			760,
		);
		expect(getBroadcastLayerCompletionDelayMs(lifecycle, "exit", true)).toBe(
			null,
		);
	});
});

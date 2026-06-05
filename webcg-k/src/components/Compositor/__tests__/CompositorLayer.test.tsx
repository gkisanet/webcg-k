import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverlayStateItem } from "../../../hooks/useOverlayStore";
import { CompositorLayer } from "../CompositorLayer";

class TestResizeObserver {
	observe() {}
	disconnect() {}
}

function createHtmlOverlay(id = "overlay-1"): OverlayStateItem {
	const index = id.replace(/\D/g, "") || "1";
	return {
		id,
		session_id: "session-1",
		template_id: `template-${index}`,
		is_active: true,
		current_data: {},
		replicant_data: { title: "Ready" },
		pending_data: null,
		active_content_index: 0,
		animation_state: "preview",
		conflict_mode: "overlay",
		updated_at: "2026-06-04T00:00:00.000Z",
		template: {
			id: "template-1",
			name: `HTML Overlay ${index}`,
			description: null,
			layer: 1,
			graphic_data: [],
			plugin_type: "html",
			animation_config: {
				in: { type: "fade", duration: 500 },
				out: { type: "fade", duration: 500 },
			},
			source_code: {
				html: '<div id="root">Overlay</div>',
				css: "#root { color: white; }",
				js: "",
			},
			zone_bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		},
	};
}

describe("CompositorLayer", () => {
	let animateSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			cb(0);
			return 1;
		});
		animateSpy = vi.fn(() => ({ onfinish: null }));
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			writable: true,
			value: animateSpy,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		delete (
			HTMLElement.prototype as HTMLElement["__proto__"] & {
				animate?: HTMLElement["animate"];
			}
		).animate;
		vi.unstubAllGlobals();
	});

	it("waits for an HTML iframe to be ready before starting its enter animation", async () => {
		render(<CompositorLayer overlays={[createHtmlOverlay()]} />);

		const iframe = screen.getByTitle("Plugin: HTML Overlay 1");
		const layer = iframe.parentElement;

		expect(layer).not.toBeNull();
		expect(layer).toHaveStyle({ opacity: "0" });
		expect(animateSpy).not.toHaveBeenCalled();

		fireEvent.load(iframe);

		await waitFor(() => {
			expect(layer).not.toHaveStyle({ opacity: "0" });
			expect(animateSpy).toHaveBeenCalledTimes(1);
		});
	});

	it("stagger-mounts multiple entering HTML iframes", () => {
		vi.useFakeTimers();

		render(
			<CompositorLayer
				overlays={[
					createHtmlOverlay("overlay-1"),
					createHtmlOverlay("overlay-2"),
				]}
			/>,
		);

		expect(screen.getAllByTitle(/^Plugin: HTML Overlay/)).toHaveLength(1);

		act(() => {
			vi.advanceTimersByTime(48);
		});

		expect(screen.getAllByTitle(/^Plugin: HTML Overlay/)).toHaveLength(2);
	});

	it("keeps plugin action routing after equal source content is refreshed", async () => {
		const onPluginAction = vi.fn();
		const { rerender } = render(
			<CompositorLayer
				overlays={[createHtmlOverlay("overlay-1")]}
				onPluginAction={onPluginAction}
			/>,
		);

		const iframe = screen.getByTitle(
			"Plugin: HTML Overlay 1",
		) as HTMLIFrameElement;
		fireEvent.load(iframe);

		await waitFor(() => {
			expect(animateSpy).toHaveBeenCalledTimes(1);
		});

		const refreshedOverlay = createHtmlOverlay("overlay-1");
		rerender(
			<CompositorLayer
				overlays={[refreshedOverlay, createHtmlOverlay("overlay-2")]}
				onPluginAction={onPluginAction}
			/>,
		);

		window.dispatchEvent(
			new MessageEvent("message", {
				source: iframe.contentWindow,
				data: {
					source: "webcgk-plugin",
					type: "action",
					action: "START_TIMER",
				},
			}),
		);

		expect(onPluginAction).toHaveBeenCalledWith("overlay-1", {
			source: "webcgk-plugin",
			type: "action",
			action: "START_TIMER",
		});
	});

	it("skips exit playback when an overlay moved to another monitor surface", async () => {
		const { rerender } = render(
			<CompositorLayer overlays={[createHtmlOverlay("overlay-1")]} />,
		);

		const iframe = screen.getByTitle("Plugin: HTML Overlay 1");
		fireEvent.load(iframe);

		await waitFor(() => {
			expect(animateSpy).toHaveBeenCalledTimes(1);
		});

		rerender(
			<CompositorLayer
				overlays={[]}
				skipExitOverlayIds={new Set(["overlay-1"])}
			/>,
		);

		await waitFor(() => {
			expect(screen.queryByTitle("Plugin: HTML Overlay 1")).toBeNull();
		});
		expect(animateSpy).toHaveBeenCalledTimes(1);
	});
});

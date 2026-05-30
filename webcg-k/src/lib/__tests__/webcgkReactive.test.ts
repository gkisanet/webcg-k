import { describe, expect, it, vi } from "vitest";
import { WEBCGK_REACTIVE_INLINE } from "../webcgk-reactive";
import { buildPluginSrcdoc, WEBCGK_API_INLINE } from "../webcgkSrcdoc";

type WebcgkTestWindow = Window &
	typeof globalThis & {
		webcgk: { onData: (cb: () => void) => void };
	};

function runInlineRuntime(script: string) {
	// biome-ignore lint/security/noGlobalEval: jsdom tests intentionally execute the same inline iframe runtimes that srcdoc injects.
	window.eval(script);
}

function installRuntime(html: string) {
	document.body.innerHTML = html;
	runInlineRuntime(WEBCGK_API_INLINE);
	runInlineRuntime(WEBCGK_REACTIVE_INLINE);
}

function sendData(payload: Record<string, unknown>) {
	window.dispatchEvent(
		new MessageEvent("message", {
			data: { type: "INIT", payload },
		}),
	);
}

describe("webcgk declarative binding runtime", () => {
	it("applies text, safe attribute, class, and conditional display bindings before user onData callbacks", () => {
		installRuntime(`
			<span id="name" data-cg-bind="name">OLD</span>
			<img id="logo" data-cg-bind="src:logoUrl" alt="">
			<div id="status" data-cg-class="danger:isDanger live:isLive"></div>
			<div id="live" data-cg-if="isLive">LIVE</div>
		`);

		let observedText = "";
		(window as unknown as WebcgkTestWindow).webcgk.onData(() => {
			observedText = document.getElementById("name")?.textContent || "";
		});

		sendData({
			name: "Ada",
			logoUrl: "https://example.com/logo.png",
			isDanger: true,
			isLive: false,
		});

		expect(document.getElementById("name")?.textContent).toBe("Ada");
		expect(document.getElementById("logo")?.getAttribute("src")).toBe(
			"https://example.com/logo.png",
		);
		expect(
			document.getElementById("status")?.classList.contains("danger"),
		).toBe(true);
		expect(document.getElementById("status")?.classList.contains("live")).toBe(
			false,
		);
		expect((document.getElementById("live") as HTMLElement).style.display).toBe(
			"none",
		);
		expect(observedText).toBe("Ada");
	});

	it("blocks unsafe attribute bindings and javascript src values", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		installRuntime(`
			<a id="link" data-cg-bind="href:url"></a>
			<img id="bad-logo" data-cg-bind="src:logoUrl">
		`);

		sendData({
			url: "javascript:alert(1)",
			logoUrl: "javascript:alert(2)",
		});

		expect(document.getElementById("link")?.getAttribute("href")).toBeNull();
		expect(document.getElementById("link")?.textContent).toBe(
			"javascript:alert(1)",
		);
		expect(document.getElementById("bad-logo")?.getAttribute("src")).toBeNull();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("injects the reactive runtime through the shared srcdoc builder", () => {
		const srcdoc = buildPluginSrcdoc({
			html: '<span data-cg-bind="name">OLD</span>',
			css: "",
			js: "",
		});

		expect(srcdoc).toContain("data-cg-bind");
		expect(srcdoc).toContain("webcgk-reactive");
		expect(srcdoc).toContain("webcgk-motion");
		expect(srcdoc).toContain("_addPreDataHook");
	});

	it("strips plugin HTML script tags before rendering srcdoc", () => {
		const srcdoc = buildPluginSrcdoc({
			html: '<div id="overlay"></div><script src="https://cdn.example/anime.js"></script>',
			css: "",
			js: "",
		});

		expect(srcdoc).toContain('<div id="overlay"></div>');
		expect(srcdoc).not.toContain("https://cdn.example/anime.js");
	});
});

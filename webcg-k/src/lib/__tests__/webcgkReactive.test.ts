import { describe, expect, it, vi } from "vitest";
import { buildPluginSrcdoc, WEBCGK_API_INLINE } from "../webcgkSrcdoc";
import { WEBCGK_REACTIVE_INLINE } from "../webcgk-reactive";

function installRuntime(html: string) {
	document.body.innerHTML = html;
	window.eval(WEBCGK_API_INLINE);
	window.eval(WEBCGK_REACTIVE_INLINE);
}

function sendData(payload: Record<string, unknown>) {
	window.dispatchEvent(new MessageEvent("message", {
		data: { type: "INIT", payload },
	}));
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
		(window as any).webcgk.onData(() => {
			observedText = document.getElementById("name")?.textContent || "";
		});

		sendData({
			name: "Ada",
			logoUrl: "https://example.com/logo.png",
			isDanger: true,
			isLive: false,
		});

		expect(document.getElementById("name")?.textContent).toBe("Ada");
		expect(document.getElementById("logo")?.getAttribute("src")).toBe("https://example.com/logo.png");
		expect(document.getElementById("status")?.classList.contains("danger")).toBe(true);
		expect(document.getElementById("status")?.classList.contains("live")).toBe(false);
		expect((document.getElementById("live") as HTMLElement).style.display).toBe("none");
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
		expect(document.getElementById("link")?.textContent).toBe("javascript:alert(1)");
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
		expect(srcdoc).toContain("_addPreDataHook");
	});
});

import { describe, expect, it } from "vitest";
import { WEBCGK_MOTION_INLINE } from "../webcgk-motion";
import { WEBCGK_REACTIVE_INLINE } from "../webcgk-reactive";
import { WEBCGK_API_INLINE } from "../webcgkSrcdoc";

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
	runInlineRuntime(WEBCGK_MOTION_INLINE);
}

function sendMessage(type: string, payload?: Record<string, unknown>) {
	window.dispatchEvent(
		new MessageEvent("message", {
			data: { type, payload },
		}),
	);
}

describe("webcgk motion runtime", () => {
	it("prepares text reveal spans after declarative data binding and before user onData callbacks", () => {
		installRuntime(
			'<h1 id="headline" data-cg-bind="headline" data-motion-text="chars">OLD</h1>',
		);

		let observedParts = 0;
		(window as unknown as WebcgkTestWindow).webcgk.onData(() => {
			observedParts = document.querySelectorAll(
				"#headline [data-motion-part]",
			).length;
		});

		sendMessage("INIT", { headline: "뉴스" });

		const headline = document.getElementById("headline");
		const parts = Array.from(
			document.querySelectorAll("#headline [data-motion-part]"),
		);
		expect(headline?.textContent).toBe("뉴스");
		expect(parts.map((node) => node.textContent)).toEqual(["뉴", "스"]);
		expect(observedParts).toBe(2);
	});

	it("runs declared show and hide motion without external animation libraries", () => {
		const originalAnimate = Element.prototype.animate;
		Object.defineProperty(Element.prototype, "animate", {
			configurable: true,
			value: undefined,
		});

		try {
			installRuntime('<div id="lower" data-motion="lower-third"></div>');

			sendMessage("SHOW");
			const lower = document.getElementById("lower") as HTMLElement;
			expect(lower.style.opacity).toBe("1");
			expect(lower.style.transform).toBe("translate3d(0, 0, 0)");

			sendMessage("HIDE");
			expect(lower.style.opacity).toBe("0");
			expect(lower.style.transform).toBe("translate3d(-48px, 0, 0)");
		} finally {
			Object.defineProperty(Element.prototype, "animate", {
				configurable: true,
				value: originalAnimate,
			});
		}
	});
});

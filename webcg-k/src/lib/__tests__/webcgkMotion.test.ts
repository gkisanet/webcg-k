import { describe, expect, it, vi } from "vitest";
import { WEBCGK_MOTION_INLINE } from "../webcgk-motion";
import { WEBCGK_REACTIVE_INLINE } from "../webcgk-reactive";
import { buildPluginSrcdoc, WEBCGK_API_INLINE } from "../webcgkSrcdoc";

type WebcgkTestWindow = Window &
	typeof globalThis & {
		webcgk: {
			onData: (cb: () => void) => void;
			motion: {
				setTimeline: (items: unknown[]) => void;
				runTimeline: (items: unknown[], phase?: string | boolean) => void;
			};
		};
		gsap?: {
			fromTo: ReturnType<typeof vi.fn>;
		};
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

	it("supports v2 lifecycle-specific in/out presets without changing legacy data-motion", () => {
		const originalAnimate = Element.prototype.animate;
		Object.defineProperty(Element.prototype, "animate", {
			configurable: true,
			value: undefined,
		});

		try {
			installRuntime(
				'<div id="card" data-motion-in="slide-right" data-motion-out="slide-left"></div>',
			);

			sendMessage("SHOW");
			const card = document.getElementById("card") as HTMLElement;
			expect(card.style.opacity).toBe("1");
			expect(card.style.transform).toBe("translate3d(0, 0, 0)");

			sendMessage("HIDE");
			expect(card.style.opacity).toBe("0");
			expect(card.style.transform).toBe("translate3d(-48px, 0, 0)");
		} finally {
			Object.defineProperty(Element.prototype, "animate", {
				configurable: true,
				value: originalAnimate,
			});
		}
	});

	it("applies group stagger and absolute data-motion-at timing through the WAAPI driver", () => {
		const originalAnimate = Element.prototype.animate;
		const calls: Array<{ id: string; options: KeyframeAnimationOptions }> = [];
		Object.defineProperty(Element.prototype, "animate", {
			configurable: true,
			value: function (
				this: Element,
				_frames: Keyframe[] | PropertyIndexedKeyframes,
				options?: KeyframeAnimationOptions,
			) {
				calls.push({ id: this.id, options: options ?? {} });
				return { cancel: vi.fn() };
			},
		});

		try {
			installRuntime(`
				<div id="a" data-motion="fade" data-motion-group="score" data-motion-stagger="75"></div>
				<div id="b" data-motion="fade" data-motion-group="score" data-motion-stagger="75"></div>
				<div id="c" data-motion="fade" data-motion-at="240"></div>
			`);

			sendMessage("SHOW");

			expect(calls.find((call) => call.id === "a")?.options.delay).toBe(0);
			expect(calls.find((call) => call.id === "b")?.options.delay).toBe(75);
			expect(calls.find((call) => call.id === "c")?.options.delay).toBe(240);
		} finally {
			Object.defineProperty(Element.prototype, "animate", {
				configurable: true,
				value: originalAnimate,
			});
		}
	});

	it("runs object-level timelines with absolute lifecycle time", () => {
		const originalAnimate = Element.prototype.animate;
		const calls: Array<{ id: string; options: KeyframeAnimationOptions }> = [];
		Object.defineProperty(Element.prototype, "animate", {
			configurable: true,
			value: function (
				this: Element,
				_frames: Keyframe[] | PropertyIndexedKeyframes,
				options?: KeyframeAnimationOptions,
			) {
				calls.push({ id: this.id, options: options ?? {} });
				return { cancel: vi.fn() };
			},
		});

		try {
			installRuntime('<div id="score"></div>');
			(window as unknown as WebcgkTestWindow).webcgk.motion.setTimeline([
				{
					target: "#score",
					in: "pop",
					out: "fade",
					at: 180,
					duration: 320,
				},
			]);

			sendMessage("SHOW");

			expect(calls).toHaveLength(1);
			expect(calls[0]).toMatchObject({
				id: "score",
				options: { delay: 180, duration: 320 },
			});
		} finally {
			Object.defineProperty(Element.prototype, "animate", {
				configurable: true,
				value: originalAnimate,
			});
		}
	});

	it("injects manifest motion timelines into generated plugin srcdoc", () => {
		const srcdoc = buildPluginSrcdoc({
			html: '<div id="headline"></div>',
			css: "",
			js: "",
			motion: {
				schemaVersion: "webcgk.motion.v2",
				timeline: [
					{
						target: "#headline",
						in: "slide-up",
						out: "fade",
						at: 90,
					},
				],
			},
		});

		expect(srcdoc).toContain("window.webcgk.motion.setTimeline");
		expect(srcdoc).toContain('"target":"#headline"');
		expect(srcdoc.indexOf("webcgk-motion")).toBeLessThan(
			srcdoc.indexOf("setTimeline"),
		);
	});

	it("uses the optional GSAP driver only when explicitly requested and available", () => {
		const fromTo = vi.fn(() => ({ kill: vi.fn() }));
		(window as unknown as WebcgkTestWindow).gsap = { fromTo };

		try {
			installRuntime(
				'<div id="box" data-motion="pop" data-motion-driver="gsap"></div>',
			);

			sendMessage("SHOW");

			const box = document.getElementById("box");
			expect(fromTo).toHaveBeenCalledWith(
				box,
				expect.objectContaining({ opacity: "0", transform: "scale(0.94)" }),
				expect.objectContaining({
					opacity: "1",
					transform: "translate3d(0, 0, 0)",
					duration: 0.52,
					delay: 0,
				}),
			);
		} finally {
			delete (window as unknown as WebcgkTestWindow).gsap;
		}
	});
});

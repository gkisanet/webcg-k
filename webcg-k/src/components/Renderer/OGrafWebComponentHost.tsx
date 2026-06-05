import { useEffect, useRef, useState } from "react";
import type { BroadcastOgrafPayload } from "../../lib/broadcastSourceData";
import type {
	RendererGraphicCommandDispatch,
	RendererGraphicCommandResultStatus,
} from "../../lib/rendererGraphicCommand";

export type OGrafRenderPhase = "enter" | "idle" | "exit";
export interface OGrafCommandExecutionResult {
	status: RendererGraphicCommandResultStatus;
	message?: string;
	statusCode?: number;
	currentStep?: number;
}

interface OGrafWebComponentHostProps {
	payload: BroadcastOgrafPayload;
	title: string;
	phase?: OGrafRenderPhase;
	width?: number;
	height?: number;
	pointerEvents?: "auto" | "none";
	command?: RendererGraphicCommandDispatch | null;
	onCommandHandled?: (
		command: RendererGraphicCommandDispatch,
		result: OGrafCommandExecutionResult,
	) => void;
}

interface OGrafReturnPayload {
	statusCode: number;
	statusMessage?: string;
	currentStep?: number;
}

interface OGrafLoadParams {
	renderType: "realtime";
	data: unknown;
	renderCharacteristics: {
		resolution: { width: number; height: number };
		frameRate: number;
	};
}

interface OGrafGraphicElement extends HTMLElement {
	load?: (params: OGrafLoadParams) => Promise<OGrafReturnPayload | undefined>;
	dispose?: () => Promise<OGrafReturnPayload | undefined>;
	playAction?: (params: {
		delta?: number;
		goto?: number;
		skipAnimation?: boolean;
	}) => Promise<OGrafReturnPayload | undefined>;
	stopAction?: (params: {
		skipAnimation?: boolean;
	}) => Promise<OGrafReturnPayload | undefined>;
	updateAction?: (params: {
		data: unknown;
		skipAnimation?: boolean;
	}) => Promise<OGrafReturnPayload | undefined>;
	customAction?: (params: {
		id: string;
		payload: unknown;
		skipAnimation?: boolean;
	}) => Promise<OGrafReturnPayload | undefined>;
}

const LOWER_THIRD_SAMPLE_ENTRYPOINTS = new Set([
	"webcgk:ograf/lower-third",
	"webcgk://samples/ograf/lower-third.mjs",
	"lower-third.mjs",
]);
const LOWER_THIRD_TAG_NAME = "webcgk-ograf-lower-third";

function ok(currentStep?: number): OGrafReturnPayload {
	return { statusCode: 200, statusMessage: "OK", currentStep };
}

function buildOgrafLoadParams(
	data: unknown,
	width: number,
	height: number,
): OGrafLoadParams {
	return {
		renderType: "realtime",
		data,
		renderCharacteristics: {
			resolution: { width, height },
			frameRate: 59.94,
		},
	};
}

function getStringField(data: unknown, key: string, fallback = ""): string {
	if (!data || typeof data !== "object") return fallback;
	const value = (data as Record<string, unknown>)[key];
	return typeof value === "string" ? value : fallback;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function toCommandExecutionResult(
	result: OGrafReturnPayload | undefined,
): OGrafCommandExecutionResult {
	if (!result) return { status: "handled" };

	if (result.statusCode >= 200 && result.statusCode < 300) {
		return {
			status: "handled",
			message: result.statusMessage,
			statusCode: result.statusCode,
			currentStep: result.currentStep,
		};
	}

	return {
		status: result.statusCode === 404 ? "unsupported" : "error",
		message: result.statusMessage,
		statusCode: result.statusCode,
		currentStep: result.currentStep,
	};
}

function defineBuiltInLowerThirdElement(): boolean {
	if (
		typeof customElements === "undefined" ||
		typeof HTMLElement === "undefined"
	) {
		return false;
	}
	if (customElements.get(LOWER_THIRD_TAG_NAME)) return true;

	class WebcgkOgrafLowerThirdElement extends HTMLElement {
		private rootNodeRef: ShadowRoot;
		private data: Record<string, unknown> = {};
		private visible = false;

		constructor() {
			super();
			this.rootNodeRef = this.attachShadow({ mode: "open" });
		}

		async load({ data }: { data: unknown }) {
			this.data =
				data && typeof data === "object"
					? (data as Record<string, unknown>)
					: {};
			this.render();
			return ok();
		}

		async dispose() {
			this.rootNodeRef.innerHTML = "";
			return ok();
		}

		async playAction({
			skipAnimation = false,
		}: {
			skipAnimation?: boolean;
		} = {}) {
			this.visible = true;
			this.render(skipAnimation);
			return ok();
		}

		async stopAction({
			skipAnimation = false,
		}: {
			skipAnimation?: boolean;
		} = {}) {
			this.visible = false;
			this.render(skipAnimation);
			return ok();
		}

		async updateAction({
			data,
			skipAnimation = false,
		}: {
			data: unknown;
			skipAnimation?: boolean;
		}) {
			this.data = {
				...this.data,
				...(data && typeof data === "object"
					? (data as Record<string, unknown>)
					: {}),
			};
			this.render(skipAnimation);
			return ok();
		}

		async customAction({
			id,
			skipAnimation = false,
		}: {
			id: string;
			payload?: unknown;
			skipAnimation?: boolean;
		}) {
			if (id === "show") return this.playAction({ skipAnimation });
			if (id === "hide") return this.stopAction({ skipAnimation });
			return { statusCode: 404, statusMessage: `Unknown action: ${id}` };
		}

		private render(skipAnimation = false) {
			const name = getStringField(this.data, "name", "Name");
			const title = getStringField(this.data, "title", "Lower Third");
			const transition = skipAnimation
				? "none"
				: "transform 420ms cubic-bezier(.2,.8,.2,1), opacity 420ms ease";
			const transform = this.visible
				? "translate3d(0,0,0)"
				: "translate3d(-48px,24px,0)";
			const opacity = this.visible ? "1" : "0";

			this.rootNodeRef.innerHTML = `
				<style>
					:host {
						display: block;
						width: 100%;
						height: 100%;
						font-family: Pretendard, "Noto Sans KR", sans-serif;
						color: white;
					}
					.wrap {
						position: absolute;
						left: 112px;
						bottom: 104px;
						min-width: 680px;
						max-width: 1120px;
						opacity: ${opacity};
						transform: ${transform};
						transition: ${transition};
					}
					.accent {
						width: 96px;
						height: 8px;
						background: #22d3ee;
						margin-bottom: 16px;
					}
					.name {
						display: inline-block;
						background: rgba(8, 13, 23, 0.88);
						border-left: 12px solid #f97316;
						padding: 20px 28px 18px;
						font-size: 58px;
						font-weight: 850;
						line-height: 1.02;
						letter-spacing: 0;
						box-shadow: 0 18px 48px rgba(0,0,0,.32);
					}
					.title {
						display: inline-block;
						margin-top: 8px;
						background: rgba(34, 211, 238, 0.94);
						color: #06121a;
						padding: 8px 18px 7px;
						font-size: 24px;
						font-weight: 800;
						line-height: 1;
						letter-spacing: 0;
					}
				</style>
				<div class="wrap">
					<div class="accent"></div>
					<div class="name">${escapeHtml(name)}</div>
					<br />
					<div class="title">${escapeHtml(title)}</div>
				</div>
			`;
		}
	}

	customElements.define(LOWER_THIRD_TAG_NAME, WebcgkOgrafLowerThirdElement);
	return true;
}

function ensureBuiltInOgrafElement(entrypoint: string): string | null {
	if (!LOWER_THIRD_SAMPLE_ENTRYPOINTS.has(entrypoint)) return null;

	return defineBuiltInLowerThirdElement() ? LOWER_THIRD_TAG_NAME : null;
}

function hashString(value: string): string {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

function customElementSafeSegment(value: string): string {
	const segment = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return segment || "package";
}

interface OGrafTagNameResolutionInput {
	tagName?: string;
	entrypoint: string;
	manifestId: string;
	moduleCode?: string;
}

function inlineModuleTagName(input: OGrafTagNameResolutionInput): string {
	return `webcgk-ograf-${customElementSafeSegment(input.manifestId)}-${hashString(
		`${input.entrypoint}:${input.moduleCode ?? ""}`,
	)}`;
}

function isCustomElementConstructor(
	value: unknown,
): value is CustomElementConstructor {
	return typeof value === "function";
}

function createInlineModuleImportUrl(moduleCode: string): {
	url: string;
	revoke: () => void;
} {
	if (
		typeof Blob !== "undefined" &&
		typeof URL !== "undefined" &&
		typeof URL.createObjectURL === "function"
	) {
		const url = URL.createObjectURL(
			new Blob([moduleCode], { type: "text/javascript" }),
		);
		return {
			url,
			revoke: () => {
				if (typeof URL.revokeObjectURL === "function") {
					URL.revokeObjectURL(url);
				}
			},
		};
	}

	return {
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(moduleCode)}`,
		revoke: () => undefined,
	};
}

async function defineInlineOgrafElement(
	input: OGrafTagNameResolutionInput,
): Promise<string | null> {
	if (
		!input.moduleCode ||
		typeof customElements === "undefined" ||
		typeof HTMLElement === "undefined"
	) {
		return null;
	}

	const tagName = inlineModuleTagName(input);
	if (customElements.get(tagName)) return tagName;

	const moduleUrl = createInlineModuleImportUrl(input.moduleCode);

	try {
		const module = (await import(/* @vite-ignore */ moduleUrl.url)) as {
			default?: unknown;
		};
		if (!isCustomElementConstructor(module.default)) {
			throw new Error("OGraf module default export is not a custom element");
		}
		customElements.define(tagName, module.default);
		return tagName;
	} finally {
		moduleUrl.revoke();
	}
}

async function resolveTagName(
	input: OGrafTagNameResolutionInput,
): Promise<string | null> {
	if (input.tagName) return input.tagName;
	const builtInTagName = ensureBuiltInOgrafElement(input.entrypoint);
	if (builtInTagName) return builtInTagName;
	return defineInlineOgrafElement(input);
}

export function OGrafWebComponentHost({
	payload,
	title,
	phase = "enter",
	width = 1920,
	height = 1080,
	pointerEvents = "none",
	command,
	onCommandHandled,
}: OGrafWebComponentHostProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const elementRef = useRef<OGrafGraphicElement | null>(null);
	const readyRef = useRef<Promise<void>>(Promise.resolve());
	const initialDataRef = useRef(payload.data);
	const [scale, setScale] = useState(1);
	const [tagName, setTagName] = useState<string | null | undefined>(undefined);
	const [loaderError, setLoaderError] = useState<string | null>(null);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const dataJson = JSON.stringify(payload.data);
	const manifestId = payload.manifest.id;
	const explicitTagName = payload.tagName;
	const entrypoint = payload.entrypoint;
	const moduleCode = payload.moduleCode;

	useEffect(() => {
		initialDataRef.current = payload.data;
	}, [payload.data]);

	useEffect(() => {
		let cancelled = false;
		setTagName(undefined);
		setLoaderError(null);
		setRuntimeError(null);

		void resolveTagName({
			tagName: explicitTagName,
			entrypoint,
			manifestId,
			moduleCode,
		})
			.then((resolvedTagName) => {
				if (cancelled) return;
				setTagName(resolvedTagName);
			})
			.catch((error) => {
				if (cancelled) return;
				setTagName(null);
				setLoaderError(
					error instanceof Error ? error.message : "Unknown OGraf loader error",
				);
			});

		return () => {
			cancelled = true;
		};
	}, [entrypoint, explicitTagName, manifestId, moduleCode]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width: containerW, height: containerH } = entry.contentRect;
				if (containerW > 0 && containerH > 0) {
					setScale(Math.min(containerW / width, containerH / height));
				}
			}
		});

		observer.observe(el);
		return () => observer.disconnect();
	}, [width, height]);

	useEffect(() => {
		const mount = mountRef.current;
		if (!mount || !tagName) return;

		const element = document.createElement(tagName) as OGrafGraphicElement;
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.display = "block";
		element.setAttribute("aria-label", title);

		mount.replaceChildren(element);
		elementRef.current = element;

		readyRef.current = Promise.resolve(
			element.load?.(
				buildOgrafLoadParams(initialDataRef.current, width, height),
			),
		).then(() => undefined);

		void readyRef.current.catch((error) => {
			setRuntimeError(
				error instanceof Error ? error.message : "Unknown OGraf load error",
			);
		});

		return () => {
			elementRef.current = null;
			void element.dispose?.();
			element.remove();
		};
	}, [tagName, title, width, height]);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;
		void readyRef.current
			.then(() =>
				element.updateAction?.({
					data: JSON.parse(dataJson),
					skipAnimation: phase === "idle",
				}),
			)
			.catch(() => undefined);
	}, [dataJson, phase]);

	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;

		void readyRef.current
			.then(() => {
				if (phase === "exit") {
					return element.stopAction?.({ skipAnimation: false });
				}

				return element.playAction?.({
					delta: 0,
					goto: 0,
					skipAnimation: phase === "idle",
				});
			})
			.catch(() => undefined);
	}, [phase]);

	useEffect(() => {
		if (!command) return;
		const element = elementRef.current;
		if (!element) {
			onCommandHandled?.(command, {
				status: "error",
				message: "OGraf element is not mounted",
			});
			return;
		}

		let cancelled = false;
		void readyRef.current
			.then(async () => {
				if (command.kind === "custom-action") {
					if (!element.customAction) {
						return {
							status: "unsupported" as const,
							message: "customAction is not implemented",
						};
					}

					const actionResult = await element.customAction({
						id: command.actionId,
						payload: command.payload,
						skipAnimation: command.skipAnimation,
					});
					return toCommandExecutionResult(actionResult);
				}

				if (!element.playAction) {
					return {
						status: "unsupported" as const,
						message: "playAction is not implemented",
					};
				}

				const stepResult = await element.playAction({
					delta: command.delta,
					goto: command.goto,
					skipAnimation: command.skipAnimation,
				});
				return toCommandExecutionResult(stepResult);
			})
			.then((result) => {
				if (cancelled) return;
				onCommandHandled?.(command, result);
			})
			.catch((error) => {
				if (cancelled) return;
				onCommandHandled?.(command, {
					status: "error",
					message:
						error instanceof Error ? error.message : "Unknown command error",
				});
			});

		return () => {
			cancelled = true;
		};
	}, [command, onCommandHandled]);

	if (tagName === undefined) {
		return (
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "white",
					background: "rgba(0,0,0,.44)",
					fontSize: 20,
				}}
			>
				{payload.manifest.name} OGraf entrypoint loading
			</div>
		);
	}

	if (runtimeError) {
		return (
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "white",
					background: "rgba(80,0,0,.54)",
					fontSize: 20,
					padding: 24,
					textAlign: "center",
				}}
			>
				{payload.manifest.name} OGraf load failed: {runtimeError}
			</div>
		);
	}

	if (!tagName) {
		return (
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "white",
					background: "rgba(0,0,0,.44)",
					fontSize: 20,
					padding: 24,
					textAlign: "center",
				}}
			>
				{payload.manifest.name} OGraf entrypoint is not available
				{loaderError ? `: ${loaderError}` : ""}
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents,
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<div
				ref={mountRef}
				style={{
					width,
					height,
					transform: `scale(${scale})`,
					transformOrigin: "center center",
					flexShrink: 0,
				}}
			/>
		</div>
	);
}

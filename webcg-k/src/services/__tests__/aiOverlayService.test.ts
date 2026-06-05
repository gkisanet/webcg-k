import { describe, expect, it } from "vitest";
import {
	OVERLAY_SYSTEM_PROMPT,
	type OverlayCodeResult,
	parseOverlayResponse,
	validateOverlayBindings,
} from "../aiOverlayService";

function makeResult(
	overrides: Partial<OverlayCodeResult> = {},
): OverlayCodeResult {
	return {
		html: '<div id="overlay"><span data-cg-bind="homeName">HOME</span><div data-cg-class="danger:isDanger"></div><div data-cg-if="isLive"></div></div>',
		css: "",
		js: "",
		dashboard_schema: {
			properties: {
				homeName: { type: "string", title: "홈팀" },
				isDanger: { type: "boolean", title: "위험" },
				isLive: { type: "boolean", title: "라이브" },
			},
		},
		replicant_defaults: {
			homeName: "HOME",
			isDanger: false,
			isLive: true,
		},
		motion: null,
		...overrides,
	};
}

describe("AI overlay declarative binding contract", () => {
	it("documents 3-layer data utilization strategy in system prompt", () => {
		// 레이어 1: 선언형 바인딩
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-bind");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-class");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data-cg-if");
		// 레이어 2: CSS 테마 변수
		expect(OVERLAY_SYSTEM_PROMPT).toContain("레이어 2");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("setProperty");
		// 레이어 3: JS 비즈니스 로직
		expect(OVERLAY_SYSTEM_PROMPT).toContain("레이어 3");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("data.running");
		// Motion 탭이 SHOW/HIDE lifecycle 모션의 SSOT여야 함
		expect(OVERLAY_SYSTEM_PROMPT).toContain("WebCG-K Motion 탭 계약");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("Motion 탭이 소유");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("webcgk.motion.v2");
		expect(OVERLAY_SYSTEM_PROMPT).toContain('"target"');
		expect(OVERLAY_SYSTEM_PROMPT).toContain('"in"');
		expect(OVERLAY_SYSTEM_PROMPT).toContain('"out"');
		expect(OVERLAY_SYSTEM_PROMPT).toContain("slide-up");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("fade");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("외부 CDN/라이브러리");
		expect(OVERLAY_SYSTEM_PROMPT).toContain("CSS keyframes");
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("data-motion-in");
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("data-motion-driver");
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("data-motion-text");
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("animejs@4");
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("{zoneX}");
		// 이중 메시지 제거 확인: "얽매이지 말고"라는 모순 표현이 없어야 함
		expect(OVERLAY_SYSTEM_PROMPT).not.toContain("얽매이지 말고");
	});

	it("validates matching schema keys with 3-tier severity (errors/warnings/hints)", () => {
		const validation = validateOverlayBindings(makeResult());

		expect(validation.ok).toBe(true);
		expect(validation.errors).toEqual([]);
		expect(validation.warnings).toEqual([]);
		expect(validation.hints).toEqual([]);
	});

	it("classifies orphanBindings as errors (critical) and missingBindings as hints (hidden)", () => {
		// orphanBindings → errors (빨강, 빌드 차단)
		const validationWithOrphan = validateOverlayBindings(
			makeResult({
				html: '<span data-cg-bind="player_name"></span>',
				dashboard_schema: {
					properties: {
						playerName: { type: "string", title: "선수" },
					},
				},
				replicant_defaults: {},
			}),
		);

		expect(validationWithOrphan.ok).toBe(false);
		expect(validationWithOrphan.errors.length).toBe(1); // orphan: player_name
		expect(validationWithOrphan.orphanBindings).toEqual(["player_name"]);
		expect(validationWithOrphan.hints.length).toBe(1); // missing: playerName → hint (숨김)
		expect(validationWithOrphan.missingBindings).toEqual(["playerName"]);

		// missingBindings만 있는 경우 → ok: true, hints에만 기록 (경고 아님)
		const validationOnlyMissing = validateOverlayBindings(
			makeResult({
				html: '<div id="overlay"></div>',
				dashboard_schema: {
					properties: {
						homeName: { type: "string", title: "홈팀" },
					},
				},
				replicant_defaults: {
					homeName: "HOME",
				},
			}),
		);

		expect(validationOnlyMissing.ok).toBe(true);
		expect(validationOnlyMissing.errors).toEqual([]); // orphan 없음
		expect(validationOnlyMissing.hints.length).toBe(1); // missing은 hint로
		expect(validationOnlyMissing.warnings).toEqual([]); // default는 있으니 경고 없음
	});

	it("classifies missingDefaults as warnings (yellow, shown in UI)", () => {
		const validation = validateOverlayBindings(
			makeResult({
				replicant_defaults: {}, // 모든 기본값 누락
			}),
		);

		expect(validation.ok).toBe(true); // 기본값 누락은 빌드 차단 안 함
		expect(validation.warnings.length).toBe(3); // homeName, isDanger, isLive
		expect(validation.missingDefaults.length).toBe(3);
	});

	it("detects onData callback parameter names other than 'data' (d, incoming, etc.)", () => {
		// webcgk.onData(d => { d.running }) — 매개변수명이 'd'인 경우
		const validationArrow = validateOverlayBindings(
			makeResult({
				html: "<div id='overlay'></div>",
				js: "webcgk.onData(d => { if (d.running) startTimer(d.duration); });",
				dashboard_schema: {
					properties: {
						running: { type: "boolean", title: "실행 중" },
						duration: { type: "number", title: "타이머 시간" },
					},
				},
				replicant_defaults: {
					running: false,
					duration: 120,
				},
			}),
		);

		expect(validationArrow.ok).toBe(true);
		expect(validationArrow.hints).toEqual([]); // d.running, d.duration 모두 탐지
		expect(validationArrow.missingBindings).toEqual([]);

		// webcgk.onData(function(incoming) { ... }) — 매개변수명이 'incoming'인 경우
		const validationFunc = validateOverlayBindings(
			makeResult({
				html: "<div id='overlay'></div>",
				js: "webcgk.onData(function(incoming) { const { score, teamName } = incoming; render(score, teamName); });",
				dashboard_schema: {
					properties: {
						score: { type: "number", title: "점수" },
						teamName: { type: "string", title: "팀명" },
					},
				},
				replicant_defaults: {
					score: 0,
					teamName: "WebCG-K",
				},
			}),
		);

		expect(validationFunc.ok).toBe(true);
		expect(validationFunc.hints).toEqual([]);
		expect(validationFunc.missingBindings).toEqual([]);
	});

	it("accepts data-cg attributes and JS data reads (backward compatibility)", () => {
		const validationClassic = validateOverlayBindings(
			makeResult({
				html: "<span data-cg-bind='src:logoUrl'></span>",
				js: "webcgk.onData(function(data) { renderTimer(data.remainingSeconds); });",
				dashboard_schema: {
					properties: {
						logoUrl: { type: "string", title: "로고" },
						remainingSeconds: { type: "number", title: "남은 시간" },
					},
				},
				replicant_defaults: {
					logoUrl: "/logo.png",
					remainingSeconds: 60,
				},
			}),
		);

		expect(validationClassic.ok).toBe(true);
		expect(validationClassic.errors).toEqual([]);
		expect(validationClassic.hints).toEqual([]);

		// 구조 분해 할당 + 별칭
		const validationDestructure = validateOverlayBindings(
			makeResult({
				html: "<div id='overlay'></div>",
				js: "webcgk.onData(function(data) { const { timerDuration: duration, primaryColor } = data; start(duration, primaryColor); });",
				dashboard_schema: {
					properties: {
						timerDuration: { type: "number", title: "타이머 지속시간" },
						primaryColor: { type: "color", title: "주조색" },
					},
				},
				replicant_defaults: {
					timerDuration: 120,
					primaryColor: "#ff0000",
				},
			}),
		);

		expect(validationDestructure.ok).toBe(true);
		expect(validationDestructure.missingBindings).toEqual([]);
		expect(validationDestructure.hints).toEqual([]);
	});

	it("resolves CSS variables theme bindings (Layer 2)", () => {
		const validationCss = validateOverlayBindings(
			makeResult({
				html: "<div id='overlay'></div>",
				css: ":root { --primary-color: var(--primaryColor); --accent: var(--accentColor); }",
				dashboard_schema: {
					properties: {
						primaryColor: { type: "color", title: "주조색" },
						accentColor: { type: "color", title: "강조색" },
					},
				},
				replicant_defaults: {
					primaryColor: "#00ff00",
					accentColor: "#0000ff",
				},
			}),
		);

		expect(validationCss.ok).toBe(true);
		expect(validationCss.missingBindings).toEqual([]);
		expect(validationCss.hints).toEqual([]);
	});

	it("classifies script tags in HTML as errors because runtime owns motion libraries", () => {
		const validation = validateOverlayBindings(
			makeResult({
				html: '<div id="overlay"></div><script src="https://cdn.example/anime.js"></script>',
				dashboard_schema: { properties: {} },
				replicant_defaults: {},
			}),
		);

		expect(validation.ok).toBe(false);
		expect(validation.scriptTags).toEqual([
			'<script src="https://cdn.example/anime.js">',
		]);
		expect(validation.errors[0]).toContain("HTML에는 <script>를 넣지 마세요");
	});

	it("parses optional motion manifest output from AI responses", () => {
		const result = parseOverlayResponse(
			JSON.stringify({
				html: '<div id="overlay"><div class="headline">속보</div></div>',
				css: ".headline{}",
				js: "",
				dashboard_schema: { properties: {} },
				replicant_defaults: {},
				motion: {
					schemaVersion: "webcgk.motion.v2",
					timeline: [
						{
							target: ".headline",
							in: "slide-up",
							out: "fade",
							at: 120,
							duration: 420,
						},
					],
				},
			}),
		);

		expect(result.motion?.timeline).toEqual([
			expect.objectContaining({
				target: ".headline",
				in: "slide-up",
				out: "fade",
				at: 120,
				duration: 420,
			}),
		]);
	});
});

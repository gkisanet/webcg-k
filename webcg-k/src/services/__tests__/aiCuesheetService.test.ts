import { describe, expect, it } from "vitest";
import {
	AI_CUESHEET_SCHEMA_VERSION,
	buildAiCuesheetOverlayArtifacts,
	buildGraphicUserPrompt,
	buildSystemPrompt,
	parseAiCuesheetJson,
	validateAgainstSource,
	validateGraphicSlotBindings,
} from "../aiCuesheetService";
import type { SceneContent, SceneGraphicResult } from "@/lib/aiCuesheetTypes";

function makeScene(): SceneContent {
	return {
		order: 1,
		trigger: "전문가 첫 등장",
		graphic_intent: "출연자 신뢰도를 빠르게 전달한다",
		duration: 10,
		text_slots: [
			{
				id: "scene-1-slot-1",
				semantic_role: "name",
				value: "홍길동",
				importance: 5,
				zone_hint: "bottom_bar",
				style_hint: "emphasis",
			},
			{
				id: "scene-1-slot-2",
				semantic_role: "subtitle",
				value: "문화학자",
				importance: 3,
				zone_hint: "bottom_bar",
				style_hint: "normal",
			},
		],
	};
}


describe("AI cuesheet overlay plugin interface", () => {
	it("builds dashboard schema, replicant defaults, binding manifest, and onData JS from scene slots", () => {
		const scene = makeScene();
		scene.text_slots[0] = {
			...scene.text_slots[0],
			display_value: "홍길동",
			source_value: "홍길동 한국대학교 문화학 교수",
			evidence_anchor: "홍길동 한국대학교",
		};

		const artifacts = buildAiCuesheetOverlayArtifacts({
			scene,
			html: '<div id="overlay"><span data-slot-id="scene-1-slot-1">홍길동</span><span data-slot-id="scene-1-slot-2">문화학자</span></div>',
			css: ":root { --cg-primary: #fff; }",
			programTitle: "테스트 프로그램",
		});

		expect(artifacts.sourceCode.html).toContain('data-slot-id="scene-1-slot-1"');
		expect(artifacts.sourceCode.css).toContain("--cg-primary");
		expect(artifacts.sourceCode.js).toContain("webcgk.onData");
		expect(artifacts.sourceCode.js).toContain("data-slot-id");
		expect(artifacts.replicantDefaults).toEqual({
			"scene-1-slot-1": "홍길동",
			"scene-1-slot-2": "문화학자",
		});
		expect(artifacts.dashboardSchema.properties["scene-1-slot-1"]).toMatchObject({
			type: "string",
			title: "name",
			default: "홍길동",
		});
		expect(artifacts.dashboardSchema.properties["scene-1-slot-1"]?.description).toContain("홍길동 한국대학교");
			expect(artifacts.aiMetadata).toMatchObject({
				lifecycle: "scene_instance",
				source: "ai_cuesheet",
				gallery_policy: "session_draft",
				folder: "AI 큐시트 초안",
				program_title: "테스트 프로그램",
				scene_order: 1,
			});
		expect(artifacts.aiMetadata.binding_manifest).toEqual([
			{
				slot_id: "scene-1-slot-1",
				semantic_role: "name",
				field_key: "scene-1-slot-1",
				display_value: "홍길동",
				source_value: "홍길동 한국대학교 문화학 교수",
				evidence_anchor: "홍길동 한국대학교",
			},
			{
				slot_id: "scene-1-slot-2",
				semantic_role: "subtitle",
				field_key: "scene-1-slot-2",
				display_value: "문화학자",
				source_value: "문화학자",
				evidence_anchor: undefined,
			},
		]);
	});
});


describe("AI cuesheet v4.1 provenance contract", () => {
	it("documents schema version, evidence anchors, source/display split, and negative examples", () => {
		const prompt = buildSystemPrompt();

		expect(prompt).toContain(AI_CUESHEET_SCHEMA_VERSION);
		expect(prompt).toContain("schema_version");
		expect(prompt).toContain("source_value");
		expect(prompt).toContain("display_value");
		expect(prompt).toContain("evidence_anchor");
		expect(prompt).toContain("나쁜 예");
	});

	it("sets long-form scene density and the three broadcast graphics production types", () => {
		const prompt = buildSystemPrompt();

		expect(prompt).toContain("24~36개");
		expect(prompt).toContain("최대 40개");
		expect(prompt).toContain("요약정보");
		expect(prompt).toContain("부연설명");
		expect(prompt).toContain("통계 또는 그래픽 그림");
		expect(prompt).not.toContain("최대 8개의 핵심 장면");
	});

	it("preserves source/display provenance while keeping value as the display text", () => {
		const result = parseAiCuesheetJson(JSON.stringify({
			schema_version: AI_CUESHEET_SCHEMA_VERSION,
			program_title: "테스트 프로그램",
			expert: { name: "홍길동", title: "문화학자" },
			scenes: [
				{
					order: 2,
					trigger: "통계 설명",
					graphic_intent: "긴 원문 통계를 방송용으로 짧게 보여준다",
					duration: 10,
					text_slots: [
						{
							semantic_role: "stat",
							source_value: "응답자의 72%가 같은 문제를 경험했다고 답했다",
							display_value: "72%",
							evidence_anchor: "응답자의 72%가 같은 문제를 경험",
							importance: 5,
							zone_hint: "center",
							style_hint: "emphasis",
						},
					],
				},
			],
		}));

		const cuesheet = result.cuesheet;
		expect(cuesheet?.schema_version).toBe(AI_CUESHEET_SCHEMA_VERSION);
		const slot = cuesheet?.scenes[0]?.text_slots[0];
		expect(slot?.value).toBe("72%");
		expect(slot?.display_value).toBe("72%");
		expect(slot?.source_value).toBe("응답자의 72%가 같은 문제를 경험했다고 답했다");
		expect(slot?.evidence_anchor).toBe("응답자의 72%가 같은 문제를 경험");
	});

	it("validates source provenance instead of rejecting shortened display text", () => {
		const scene = makeScene();
		scene.text_slots[1] = {
			...scene.text_slots[1],
			semantic_role: "subtitle",
			value: "주요 조사 결과",
			display_value: "주요 조사 결과",
			source_value: "응답자의 72%가 같은 문제를 경험했다고 답했다",
			evidence_anchor: "응답자의 72%가 같은 문제를 경험",
		};

		const checks = validateAgainstSource([scene], "조사 결과 응답자의 72%가 같은 문제를 경험했다고 답했다.");

		expect(checks[1]).toMatchObject({
			confidence: 1,
			matchType: "exact",
			value: "주요 조사 결과",
		});
	});

	it("passes display/source/evidence contract to graphic generation while rendering display text", () => {
		const scene = makeScene();
		scene.text_slots[0] = {
			...scene.text_slots[0],
			source_value: "홍길동 한국대학교 문화학 교수",
			display_value: "홍길동",
			evidence_anchor: "홍길동 한국대학교",
		};

		const prompt = buildGraphicUserPrompt(scene, "테스트 프로그램");

		expect(prompt).toContain('display_value: "홍길동"');
		expect(prompt).toContain('source_value: "홍길동 한국대학교 문화학 교수"');
		expect(prompt).toContain('evidence_anchor: "홍길동 한국대학교"');
		expect(prompt).toContain("HTML에는 display_value만 표시");
	});
});


describe("parseAiCuesheetJson slot ids", () => {
	it("assigns stable slot ids when AI output omits them", () => {
		const result = parseAiCuesheetJson(JSON.stringify({
			program_title: "테스트 프로그램",
			expert: { name: "홍길동", title: "문화학자" },
			scenes: [
				{
					order: 7,
					trigger: "전문가 첫 등장",
					graphic_intent: "인물 정보를 전달한다",
					duration: 10,
					text_slots: [
						{
							semantic_role: "name",
							value: "홍길동",
							importance: 5,
							zone_hint: "bottom_bar",
							style_hint: "emphasis",
						},
					],
				},
			],
		}));

		expect(result.errors).toEqual([]);
		expect(result.cuesheet?.scenes[0]?.text_slots[0]?.id).toBe("scene-7-slot-1");
	});
});

describe("buildGraphicUserPrompt", () => {
	it("requires data-slot-id binding for every displayed slot", () => {
		const prompt = buildGraphicUserPrompt(makeScene(), "테스트 프로그램");

		expect(prompt).toContain("data-slot-id");
		expect(prompt).toContain("scene-1-slot-1");
		expect(prompt).toContain("scene-1-slot-2");
		expect(prompt).toContain("data-semantic-role");
	});
});

describe("validateGraphicSlotBindings", () => {
	it("passes when generated html contains every scene slot id", () => {
		const graphic: SceneGraphicResult = {
			html: '<div id="overlay"><span data-slot-id="scene-1-slot-1">홍길동</span><span data-slot-id="scene-1-slot-2">문화학자</span></div>',
			css: ":root { --cg-primary: #ffffff; }",
			design_rationale: "",
		};

		expect(validateGraphicSlotBindings(graphic, makeScene())).toEqual({
			ok: true,
			missingSlotIds: [],
		});
	});

	it("reports missing slot ids before the graphic can be saved", () => {
		const graphic: SceneGraphicResult = {
			html: '<div id="overlay"><span data-slot-id="scene-1-slot-1">홍길동</span><span>문화학자</span></div>',
			css: ":root { --cg-primary: #ffffff; }",
			design_rationale: "",
		};

		expect(validateGraphicSlotBindings(graphic, makeScene())).toEqual({
			ok: false,
			missingSlotIds: ["scene-1-slot-2"],
		});
	});
});

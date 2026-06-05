import { describe, expect, it } from "vitest";
import type { PreflightReport } from "@/services/preflightService";
import {
	buildRundownQualitySummary,
	buildRundownRendererCapabilityFromEnv,
} from "../rundownQualityGate";

const baseReport: PreflightReport = {
	totalItems: 1,
	okCount: 1,
	warningCount: 0,
	errorCount: 0,
	contentIssueCount: 0,
	checkContext: {
		programDate: "2026-05-31",
		generatedAt: null,
		checkedAt: "2026-05-31T00:00:00.000Z",
		timezone: "Asia/Seoul",
		reusePolicy: "reusable",
		originalAirDate: "2026-05-31",
		targetAirDate: "2026-05-31",
	},
	contentHash: "hash",
	validationStatus: "passed",
	items: [],
};

describe("rundownQualityGate", () => {
	it("builds renderer motion capability from environment flags", () => {
		expect(
			buildRundownRendererCapabilityFromEnv({
				VITE_WEBCGK_MOTION_GSAP_ENABLED: "true",
			}).motionDrivers?.gsap,
		).toBe(true);
		expect(
			buildRundownRendererCapabilityFromEnv({
				VITE_WEBCGK_MOTION_GSAP_ENABLED: "off",
			}).motionDrivers?.gsap,
		).toBe(false);
	});

	it("adds content issues to the selected rundown item status", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-1",
					source_type: "graphic",
					source_name: "Headline",
					data: {},
				},
			],
			report: {
				...baseReport,
				items: [
					{
						item: {
							id: "rd-1",
							cuesheet_id: "rundown-1",
							nrcs_item_id: "rd-1",
							title: "Headline",
							slug: "Headline",
							reporter: "System",
							article_type: "graphic",
							status: "mapped",
							cg_data: [],
							mapping_result: {},
							item_order: 0,
							linked_rundown_item_id: "rd-1",
							source_row_id: null,
							created_at: "",
							updated_at: "",
						},
						cgResults: [],
						status: "warning",
						contentIssues: [
							{
								type: "temporal",
								severity: "warning",
								field: "headline",
								original: "오늘",
								message: "상대시제 경고",
							},
						],
					},
				],
			},
		});

		expect(summary.status).toBe("warning");
		expect(summary.itemStatusById["rd-1"]).toBe("warning");
		expect(summary.issuesByItemId["rd-1"][0]).toMatchObject({
			category: "content",
			label: "시제",
		});
	});

	it("reports package required-field gaps from dashboard schema", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-2",
					source_type: "overlay",
					source_name: "Lower Third",
					data: {
						dashboard_schema: {
							type: "object",
							required: ["name"],
							properties: {
								name: { type: "string" },
							},
						},
						replicant_data: {},
					},
				},
			],
			report: baseReport,
		});

		expect(summary.status).toBe("error");
		expect(summary.packageIssueCount).toBe(1);
		expect(summary.issuesByItemId["rd-2"][0]).toMatchObject({
			category: "package",
			field: "name",
		});
	});

	it("does not block when one render requirement alternative is fulfilled", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-3",
					source_type: "overlay",
					source_name: "OGraf Lower Third",
					data: {
						manifest: {
							specVersion: "webcgk.manifest.v1",
							sourceSpec: "webcgk-manifest-v1",
							id: "pkg-lower-third",
							name: "Package Lower Third",
							runtimeKind: "ograf-web-component",
							customActions: [],
							renderRequirements: [
								{
									resolution: {
										width: { exact: 3840 },
										height: { exact: 2160 },
									},
								},
								{
									resolution: {
										width: { min: 1920 },
										height: { min: 1080 },
									},
									frameRate: { min: 50 },
									engine: [{ name: "chromium", minVersion: "110" }],
								},
							],
						},
					},
				},
			],
			report: baseReport,
		});

		expect(summary.status).toBe("ok");
		expect(summary.runtimeIssueCount).toBe(0);
		expect(summary.issuesByItemId["rd-3"]).toEqual([]);
	});

	it("treats 1080i5994 as a near-60fps render cadence, not 29.97fps", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-ntsc",
					source_type: "overlay",
					source_name: "NTSC Interlaced Package",
					data: {
						manifest: {
							specVersion: "webcgk.manifest.v1",
							sourceSpec: "webcgk-manifest-v1",
							id: "pkg-ntsc",
							name: "NTSC Interlaced Package",
							runtimeKind: "ograf-web-component",
							customActions: [],
							renderRequirements: [
								{
									resolution: {
										width: { exact: 1920 },
										height: { exact: 1080 },
									},
									frameRate: { exact: 60 },
								},
							],
						},
					},
				},
			],
			report: baseReport,
		});

		expect(summary.status).toBe("ok");
		expect(summary.runtimeIssueCount).toBe(0);
	});

	it("blocks when render requirements cannot be satisfied", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-4",
					source_type: "overlay",
					source_name: "4K Internet Package",
					data: {
						manifest: {
							specVersion: "webcgk.manifest.v1",
							sourceSpec: "webcgk-manifest-v1",
							id: "pkg-4k",
							name: "4K Package",
							runtimeKind: "ograf-web-component",
							customActions: [],
							renderRequirements: [
								{
									resolution: {
										width: { exact: 3840 },
										height: { exact: 2160 },
									},
									frameRate: { min: 120 },
									engine: [{ name: "chromium", minVersion: "130" }],
									accessToPublicInternet: { exact: true },
								},
							],
						},
					},
				},
			],
			report: baseReport,
		});

		expect(summary.status).toBe("error");
		expect(summary.runtimeIssueCount).toBeGreaterThan(0);
		expect(summary.issuesByItemId["rd-4"]).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					category: "runtime",
					label: "렌더러",
				}),
			]),
		);
	});

	it("passes render requirements with an explicit renderer capability", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-5",
					source_type: "overlay",
					source_name: "4K Capable Package",
					data: {
						manifest: {
							specVersion: "webcgk.manifest.v1",
							sourceSpec: "webcgk-manifest-v1",
							id: "pkg-4k-capable",
							name: "4K Capable Package",
							runtimeKind: "ograf-web-component",
							customActions: [],
							renderRequirements: [
								{
									resolution: {
										width: { exact: 3840 },
										height: { exact: 2160 },
									},
									frameRate: { min: 120 },
									engine: [{ name: "chromium", minVersion: "130" }],
									accessToPublicInternet: { exact: true },
								},
							],
						},
					},
				},
			],
			report: baseReport,
			rendererCapability: {
				resolution: { width: 3840, height: 2160 },
				frameRate: 120,
				engines: { chromium: "130" },
				accessToPublicInternet: true,
			},
		});

		expect(summary.status).toBe("ok");
		expect(summary.runtimeIssueCount).toBe(0);
	});

	it("warns when package motion requests unavailable GSAP", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-gsap",
					source_type: "overlay",
					source_name: "GSAP Motion",
					data: {
						source_code: {
							motion: {
								schemaVersion: "webcgk.motion.v2",
								timeline: [
									{
										target: "#overlay",
										in: "pop",
										out: "fade",
										driver: "gsap",
									},
								],
							},
						},
					},
				},
			],
			report: baseReport,
		});

		expect(summary.status).toBe("warning");
		expect(summary.runtimeIssueCount).toBe(1);
		expect(summary.issuesByItemId["rd-gsap"][0]).toMatchObject({
			severity: "warning",
			category: "runtime",
			label: "Motion driver",
		});
	});

	it("passes GSAP motion with an explicit renderer capability", () => {
		const summary = buildRundownQualitySummary({
			items: [
				{
					id: "rd-gsap-ok",
					source_type: "overlay",
					source_name: "GSAP Ready",
					data: {
						motion: {
							schemaVersion: "webcgk.motion.v2",
							timeline: [
								{ target: "#overlay", in: "pop", out: "fade", driver: "gsap" },
							],
						},
					},
				},
			],
			report: baseReport,
			rendererCapability: {
				resolution: { width: 1920, height: 1080 },
				frameRate: 59.94,
				engines: { chromium: "120" },
				accessToPublicInternet: false,
				motionDrivers: { waapi: true, gsap: true },
			},
		});

		expect(summary.status).toBe("ok");
		expect(summary.runtimeIssueCount).toBe(0);
	});
});

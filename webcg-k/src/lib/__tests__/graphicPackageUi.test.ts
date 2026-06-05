import { describe, expect, it } from "vitest";
import { buildGraphicPackageUiSummary } from "../graphicPackageUi";

describe("graphicPackageUi", () => {
	it("summarizes OGraf manifests as package contracts", () => {
		const summary = buildGraphicPackageUiSummary({
			id: "lower-third",
			name: "Fallback Name",
			source_type: "overlay",
			data: {
				manifest: {
					id: "ograf-lower-third",
					name: "OGraf Lower Third",
					main: "component.js",
					schema: {
						type: "object",
						required: ["headline"],
						properties: {
							headline: { type: "string" },
						},
					},
					customActions: [{ name: "pulse", label: "Pulse" }],
					v_webcgk_motion: {
						schemaVersion: "webcgk.motion.v2",
						timeline: [{ target: ".headline", in: "slide-up" }],
					},
					renderRequirements: [
						{
							resolution: {
								width: { exact: 1920 },
								height: { exact: 1080 },
							},
							frameRate: { exact: 60 },
							engine: [{ name: "chromium", minVersion: "110" }],
						},
					],
				},
			},
		});

		expect(summary.packageName).toBe("OGraf Lower Third");
		expect(summary.sourceLabel).toBe("OGraf");
		expect(summary.runtimeLabel).toBe("OGraf Component");
		expect(summary.requiredFields).toEqual(["headline"]);
		expect(summary.customActions).toEqual([{ id: "pulse", label: "Pulse" }]);
		expect(summary.motionItemCount).toBe(1);
		expect(summary.targetWarning).toBeNull();
		expect(summary.badgeLabels.map((badge) => badge.label)).toEqual([
			"OGraf",
			"Schema 1",
			"Action 1",
			"Motion 1",
			"Req 1",
		]);
	});

	it("infers legacy dashboard schema contracts without a manifest", () => {
		const summary = buildGraphicPackageUiSummary({
			id: "legacy-overlay",
			name: "Legacy Overlay",
			source_type: "overlay",
			data: {
				dashboard_schema: {
					type: "object",
					properties: {
						title: { type: "string", required: true },
						subtitle: { type: "string" },
					},
				},
				animation_config: {
					actions: [{ id: "flash", label: "Flash" }],
				},
			},
		});

		expect(summary.isManifestBacked).toBe(false);
		expect(summary.sourceLabel).toBe("Legacy");
		expect(summary.runtimeLabel).toBe("HTML iframe");
		expect(summary.requiredFields).toEqual(["title"]);
		expect(summary.customActions).toEqual([{ id: "flash", label: "Flash" }]);
		expect(summary.renderRequirementCount).toBe(0);
		expect(summary.motionItemCount).toBe(0);
	});

	it("summarizes vector element animation as package motion", () => {
		const summary = buildGraphicPackageUiSummary({
			id: "vector-l3",
			name: "Vector Lower Third",
			source_type: "graphic",
			data: {
				elements: [
					{
						id: "title",
						animation: {
							enter: { type: "slideLeft", duration: 500 },
							exit: { type: "fadeOut", duration: 300 },
						},
					},
				],
			},
		});

		expect(summary.sourceLabel).toBe("WebCG-K");
		expect(summary.runtimeLabel).toBe("Vector");
		expect(summary.motionItemCount).toBe(2);
		expect(summary.badgeLabels.map((badge) => badge.label)).toContain(
			"Motion 2",
		);
	});

	it("warns when package motion requests an unavailable GSAP driver", () => {
		const summary = buildGraphicPackageUiSummary({
			id: "gsap-l3",
			name: "GSAP Lower Third",
			source_type: "overlay",
			data: {
				source_code: {
					motion: {
						schemaVersion: "webcgk.motion.v2",
						timeline: [
							{ target: "#overlay", in: "pop", out: "fade", driver: "gsap" },
						],
					},
				},
			},
		});

		expect(summary.motionWarning).toContain("GSAP");
		expect(
			summary.badgeLabels.find((badge) => badge.label === "Motion 1"),
		).toMatchObject({ tone: "warning" });
	});

	it("passes GSAP motion when the renderer capability declares GSAP", () => {
		const summary = buildGraphicPackageUiSummary(
			{
				id: "gsap-ok",
				name: "GSAP Ready",
				source_type: "overlay",
				data: {
					motion: {
						schemaVersion: "webcgk.motion.v2",
						timeline: [
							{ target: "#overlay", in: "pop", out: "fade", driver: "gsap" },
						],
					},
				},
			},
			{
				resolution: { width: 1920, height: 1080 },
				frameRate: 59.94,
				engines: { chromium: "120" },
				accessToPublicInternet: false,
				motionDrivers: { waapi: true, gsap: true },
			},
		);

		expect(summary.motionWarning).toBeNull();
	});

	it("reports target warnings with the same render capability rules as the quality gate", () => {
		const summary = buildGraphicPackageUiSummary({
			id: "heavy",
			name: "Heavy Package",
			source_type: "overlay",
			data: {
				manifest: {
					specVersion: "webcgk.manifest.v1",
					sourceSpec: "webcgk-manifest-v1",
					id: "heavy",
					name: "Heavy Package",
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
						},
					],
				},
			},
		});

		expect(summary.targetWarning).toContain("가로 해상도 3840 필요");
		expect(
			summary.badgeLabels.find((badge) => badge.label === "Req 1"),
		).toMatchObject({ tone: "warning" });
	});
});

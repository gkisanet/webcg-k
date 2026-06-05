import { describe, expect, it } from "vitest";
import {
	filterOverlayTemplatesByFolder,
	normalizeOverlayFolderName,
} from "../overlayFolderService";

const overlays = [
	{ id: "overlay-a", folder_id: "folder-news", name: "뉴스 하단" },
	{ id: "overlay-b", folder_id: null, name: "미분류 시계" },
	{ id: "overlay-c", folder_id: "folder-ai", name: "AI 초안" },
];

describe("overlay folder helpers", () => {
	it("normalizes folder names and rejects blank names", () => {
		expect(normalizeOverlayFolderName("  AI 큐시트 초안  ")).toBe("AI 큐시트 초안");
		expect(normalizeOverlayFolderName("   ")).toBeNull();
	});

	it("filters overlays by all, unfiled, or a concrete folder id", () => {
		expect(filterOverlayTemplatesByFolder(overlays, "all").map((o) => o.id)).toEqual([
			"overlay-a",
			"overlay-b",
			"overlay-c",
		]);
		expect(filterOverlayTemplatesByFolder(overlays, "unfiled").map((o) => o.id)).toEqual([
			"overlay-b",
		]);
		expect(filterOverlayTemplatesByFolder(overlays, "folder-ai").map((o) => o.id)).toEqual([
			"overlay-c",
		]);
	});
});

import { describe, expect, it, vi } from "vitest";
import { readJsonResponseWithRawFallback } from "../aiCoreService";

describe("readJsonResponseWithRawFallback", () => {
	it("reports invalid JSON without cloning after the body has been consumed", async () => {
		const response = new Response("not-json", {
			status: 200,
			headers: { "content-type": "application/json" },
		});

		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		let error: unknown;
		try {
			await readJsonResponseWithRawFallback(response, "gemini");
		} catch (err) {
			error = err;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/gemini 응답이 유효한 JSON이 아닙니다/);
		expect((error as Error).message).toContain("not-json");
		expect((error as Error).message).not.toMatch(/Response body is already used|Body has already been consumed/);
		consoleError.mockRestore();
	});
});

import { describe, expect, it } from "vitest";
import {
	createGraphicCommandResultPayload,
	createGraphicCustomActionCommandPayload,
	createGraphicStepCommandPayload,
	isRendererGraphicCommandPayload,
	isRendererGraphicCommandResultPayload,
	RENDERER_GRAPHIC_COMMAND_PROTOCOL,
	toRendererGraphicCommandDispatch,
} from "../rendererGraphicCommand";

describe("rendererGraphicCommand", () => {
	it("builds a customAction renderer command payload", () => {
		const payload = createGraphicCustomActionCommandPayload({
			targetBlockId: "block-1",
			targetTrackId: 2,
			actionId: "show",
			payload: { speed: "fast" },
			seqNum: 101,
		});

		expect(payload).toEqual({
			action: "GRAPHIC_COMMAND",
			seqNum: 101,
			command: {
				protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
				targetBlockId: "block-1",
				targetTrackId: 2,
				kind: "custom-action",
				actionId: "show",
				payload: { speed: "fast" },
				skipAnimation: undefined,
			},
		});
		expect(isRendererGraphicCommandPayload(payload)).toBe(true);
		expect(toRendererGraphicCommandDispatch(payload)).toMatchObject({
			seqNum: 101,
			targetBlockId: "block-1",
			kind: "custom-action",
			actionId: "show",
		});
	});

	it("builds a step renderer command payload", () => {
		const payload = createGraphicStepCommandPayload({
			targetBlockId: "block-2",
			delta: 1,
			seqNum: 202,
		});

		expect(payload).toMatchObject({
			action: "GRAPHIC_COMMAND",
			seqNum: 202,
			command: {
				protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
				targetBlockId: "block-2",
				kind: "step",
				delta: 1,
			},
		});
		expect(isRendererGraphicCommandPayload(payload)).toBe(true);
	});

	it("rejects malformed command payloads", () => {
		expect(
			isRendererGraphicCommandPayload({
				action: "GRAPHIC_COMMAND",
				seqNum: 303,
				command: {
					protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
					targetBlockId: "block-3",
					kind: "custom-action",
				},
			}),
		).toBe(false);
		expect(
			isRendererGraphicCommandPayload({
				action: "GRAPHIC_COMMAND",
				seqNum: 404,
				command: {
					protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
					targetBlockId: "block-4",
					kind: "step",
				},
			}),
		).toBe(false);
	});

	it("builds and validates a renderer command result payload", () => {
		const command = toRendererGraphicCommandDispatch(
			createGraphicStepCommandPayload({
				targetBlockId: "block-5",
				targetTrackId: 4,
				goto: 2,
				seqNum: 505,
			}),
		);

		const result = createGraphicCommandResultPayload({
			command,
			status: "handled",
			statusCode: 200,
			currentStep: 2,
			completedAt: 1234,
		});

		expect(result).toEqual({
			action: "GRAPHIC_COMMAND_RESULT",
			protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
			seqNum: 505,
			targetBlockId: "block-5",
			targetTrackId: 4,
			kind: "step",
			status: "handled",
			message: undefined,
			statusCode: 200,
			currentStep: 2,
			completedAt: 1234,
		});
		expect(isRendererGraphicCommandResultPayload(result)).toBe(true);
	});

	it("rejects malformed command result payloads", () => {
		expect(
			isRendererGraphicCommandResultPayload({
				action: "GRAPHIC_COMMAND_RESULT",
				protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
				seqNum: 606,
				targetBlockId: "block-6",
				kind: "step",
				status: "received",
				completedAt: 1234,
			}),
		).toBe(false);
	});
});

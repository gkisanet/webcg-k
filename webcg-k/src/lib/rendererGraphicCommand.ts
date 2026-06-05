export const RENDERER_GRAPHIC_COMMAND_PROTOCOL =
	"webcgk.renderer-graphic-command.v1" as const;

export type RendererGraphicCommandKind = "custom-action" | "step";
export type RendererGraphicCommandResultStatus =
	| "handled"
	| "unsupported"
	| "error";

export interface RendererGraphicCommandBase {
	protocol: typeof RENDERER_GRAPHIC_COMMAND_PROTOCOL;
	targetBlockId: string;
	targetTrackId?: number;
	kind: RendererGraphicCommandKind;
	skipAnimation?: boolean;
}

export interface RendererGraphicCustomActionCommand
	extends RendererGraphicCommandBase {
	kind: "custom-action";
	actionId: string;
	payload?: unknown;
}

export interface RendererGraphicStepCommand extends RendererGraphicCommandBase {
	kind: "step";
	delta?: number;
	goto?: number;
}

export type RendererGraphicCommand =
	| RendererGraphicCustomActionCommand
	| RendererGraphicStepCommand;

export type RendererGraphicCommandDispatch = RendererGraphicCommand & {
	seqNum: number;
};

export interface RendererGraphicCommandPayload {
	action: "GRAPHIC_COMMAND";
	command: RendererGraphicCommand;
	seqNum: number;
}

export interface RendererGraphicCommandResultPayload {
	action: "GRAPHIC_COMMAND_RESULT";
	protocol: typeof RENDERER_GRAPHIC_COMMAND_PROTOCOL;
	seqNum: number;
	targetBlockId: string;
	targetTrackId?: number;
	kind: RendererGraphicCommandKind;
	status: RendererGraphicCommandResultStatus;
	message?: string;
	statusCode?: number;
	currentStep?: number;
	completedAt: number;
}

export interface CreateGraphicCustomActionCommandInput {
	targetBlockId: string;
	targetTrackId?: number;
	actionId: string;
	payload?: unknown;
	skipAnimation?: boolean;
	seqNum?: number;
}

export interface CreateGraphicStepCommandInput {
	targetBlockId: string;
	targetTrackId?: number;
	delta?: number;
	goto?: number;
	skipAnimation?: boolean;
	seqNum?: number;
}

export interface CreateGraphicCommandResultInput {
	command: RendererGraphicCommandDispatch;
	status: RendererGraphicCommandResultStatus;
	message?: string;
	statusCode?: number;
	currentStep?: number;
	completedAt?: number;
}

function makeSeqNum(seqNum?: number): number {
	return seqNum ?? Date.now();
}

export function createGraphicCustomActionCommandPayload({
	targetBlockId,
	targetTrackId,
	actionId,
	payload,
	skipAnimation,
	seqNum,
}: CreateGraphicCustomActionCommandInput): RendererGraphicCommandPayload {
	return {
		action: "GRAPHIC_COMMAND",
		seqNum: makeSeqNum(seqNum),
		command: {
			protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
			targetBlockId,
			targetTrackId,
			kind: "custom-action",
			actionId,
			payload,
			skipAnimation,
		},
	};
}

export function createGraphicStepCommandPayload({
	targetBlockId,
	targetTrackId,
	delta,
	goto,
	skipAnimation,
	seqNum,
}: CreateGraphicStepCommandInput): RendererGraphicCommandPayload {
	return {
		action: "GRAPHIC_COMMAND",
		seqNum: makeSeqNum(seqNum),
		command: {
			protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
			targetBlockId,
			targetTrackId,
			kind: "step",
			delta,
			goto,
			skipAnimation,
		},
	};
}

export function createGraphicCommandResultPayload({
	command,
	status,
	message,
	statusCode,
	currentStep,
	completedAt,
}: CreateGraphicCommandResultInput): RendererGraphicCommandResultPayload {
	return {
		action: "GRAPHIC_COMMAND_RESULT",
		protocol: RENDERER_GRAPHIC_COMMAND_PROTOCOL,
		seqNum: command.seqNum,
		targetBlockId: command.targetBlockId,
		targetTrackId: command.targetTrackId,
		kind: command.kind,
		status,
		message,
		statusCode,
		currentStep,
		completedAt: completedAt ?? Date.now(),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isRendererGraphicCommandPayload(
	value: unknown,
): value is RendererGraphicCommandPayload {
	if (!isRecord(value)) return false;
	if (value.action !== "GRAPHIC_COMMAND") return false;
	if (typeof value.seqNum !== "number") return false;
	if (!isRecord(value.command)) return false;
	if (value.command.protocol !== RENDERER_GRAPHIC_COMMAND_PROTOCOL)
		return false;
	if (typeof value.command.targetBlockId !== "string") return false;

	if (value.command.kind === "custom-action") {
		return typeof value.command.actionId === "string";
	}

	if (value.command.kind === "step") {
		return (
			typeof value.command.delta === "number" ||
			typeof value.command.goto === "number"
		);
	}

	return false;
}

export function isRendererGraphicCommandResultPayload(
	value: unknown,
): value is RendererGraphicCommandResultPayload {
	if (!isRecord(value)) return false;
	if (value.action !== "GRAPHIC_COMMAND_RESULT") return false;
	if (value.protocol !== RENDERER_GRAPHIC_COMMAND_PROTOCOL) return false;
	if (typeof value.seqNum !== "number") return false;
	if (typeof value.targetBlockId !== "string") return false;
	if (value.kind !== "custom-action" && value.kind !== "step") return false;
	if (
		value.status !== "handled" &&
		value.status !== "unsupported" &&
		value.status !== "error"
	) {
		return false;
	}
	if (typeof value.completedAt !== "number") return false;

	return true;
}

export function toRendererGraphicCommandDispatch(
	payload: RendererGraphicCommandPayload,
): RendererGraphicCommandDispatch {
	return {
		...payload.command,
		seqNum: payload.seqNum,
	};
}

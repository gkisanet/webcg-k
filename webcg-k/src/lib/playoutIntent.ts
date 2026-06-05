import type { GraphicBlock, TransitionType } from "../stores/timelineStore";
import type { RendererGraphicCommandPayload } from "./rendererGraphicCommand";

const WHITEBOARD_PROGRAM_PREFIX = "wb-pgm-";

export type PlayoutIntentProtocol = "webcgk.playout-intent.v1";
export type PlayoutIntentAction = "play-multi" | "clear";

export interface PlayoutLifecycleIntent {
	verb: "take";
	phase: "program";
	timing: "immediate";
}

export interface PlayoutIntentItem {
	id: string;
	name: string;
	trackId: number;
	color: string;
	transitionIn: TransitionType;
	transitionOut: TransitionType;
	sourceType?: GraphicBlock["sourceType"];
	sourceData?: GraphicBlock["sourceData"];
	lifecycle: PlayoutLifecycleIntent;
}

export interface MissingPlayoutTarget {
	trackId: number;
	blockId: string;
	reason: "block-not-found";
}

export interface PlayoutIntent {
	protocol: PlayoutIntentProtocol;
	action: PlayoutIntentAction;
	items: PlayoutIntentItem[];
	fadeDuration: number;
	missingTargets: MissingPlayoutTarget[];
}

export interface CompilePlayoutIntentInput {
	blocks: GraphicBlock[];
	pgmBlockIds: Map<number, string>;
	fadeDuration: number;
}

export interface RendererPlayoutItem {
	id: string;
	name: string;
	trackId: number;
	color: string;
	transitionIn: TransitionType;
	transitionOut: TransitionType;
	sourceType?: GraphicBlock["sourceType"];
	sourceData?: GraphicBlock["sourceData"];
}

export interface RendererPlayoutPayload {
	action: "PLAY_MULTI" | "CLEAR" | "STOP";
	items?: RendererPlayoutItem[];
	fadeDuration?: number;
	seqNum: number;
}

export type RendererBroadcastPayload =
	| RendererPlayoutPayload
	| RendererGraphicCommandPayload;

function makeLifecycleIntent(): PlayoutLifecycleIntent {
	return {
		verb: "take",
		phase: "program",
		timing: "immediate",
	};
}

function makeWhiteboardProgramItem(
	trackId: number,
	blockId: string,
): PlayoutIntentItem | null {
	if (!blockId.startsWith(WHITEBOARD_PROGRAM_PREFIX)) return null;

	const boardId = blockId.slice(WHITEBOARD_PROGRAM_PREFIX.length);
	if (!boardId) return null;

	return {
		id: blockId,
		name: "판서 레이어",
		trackId,
		color: "",
		transitionIn: "fade",
		transitionOut: "fade",
		sourceType: "whiteboard",
		sourceData: { whiteboardId: boardId },
		lifecycle: makeLifecycleIntent(),
	};
}

export function compilePlayoutIntent({
	blocks,
	pgmBlockIds,
	fadeDuration,
}: CompilePlayoutIntentInput): PlayoutIntent {
	const blockById = new Map(blocks.map((block) => [block.id, block]));
	const items: PlayoutIntentItem[] = [];
	const missingTargets: MissingPlayoutTarget[] = [];

	for (const [trackId, blockId] of pgmBlockIds) {
		const block = blockById.get(blockId);
		if (block) {
			items.push({
				id: block.id,
				name: block.name,
				trackId: block.trackId,
				color: block.color || "",
				transitionIn: block.transitionIn,
				transitionOut: block.transitionOut,
				sourceType: block.sourceType,
				sourceData: block.sourceData,
				lifecycle: makeLifecycleIntent(),
			});
			continue;
		}

		const whiteboardItem = makeWhiteboardProgramItem(trackId, blockId);
		if (whiteboardItem) {
			items.push(whiteboardItem);
			continue;
		}

		missingTargets.push({
			trackId,
			blockId,
			reason: "block-not-found",
		});
	}

	return {
		protocol: "webcgk.playout-intent.v1",
		action: items.length > 0 ? "play-multi" : "clear",
		items,
		fadeDuration,
		missingTargets,
	};
}

export function playoutIntentToRendererPayload(
	intent: PlayoutIntent,
	seqNum: number,
): RendererPlayoutPayload {
	if (intent.action === "clear") {
		return {
			action: "CLEAR",
			fadeDuration: intent.fadeDuration,
			seqNum,
		};
	}

	return {
		action: "PLAY_MULTI",
		items: intent.items.map((item) => ({
			id: item.id,
			name: item.name,
			trackId: item.trackId,
			color: item.color,
			transitionIn: item.transitionIn,
			transitionOut: item.transitionOut,
			sourceType: item.sourceType,
			sourceData: item.sourceData,
		})),
		fadeDuration: intent.fadeDuration,
		seqNum,
	};
}

import type { RendererGraphicCommandDispatch } from "../../lib/rendererGraphicCommand";
import type {
	BroadcastItemPayload,
	Resolution,
} from "../../lib/types/broadcast";
import {
	BroadcastGraphicLayer,
	type BroadcastGraphicLayerPhase,
} from "./BroadcastGraphicLayer";
import type { OGrafCommandExecutionResult } from "./OGrafWebComponentHost";

export type RendererBroadcastPhase = BroadcastGraphicLayerPhase;

interface RendererBroadcastItemProps {
	item: BroadcastItemPayload;
	phase?: RendererBroadcastPhase;
	resolution: Resolution;
	hideAnnotation?: boolean;
	command?: RendererGraphicCommandDispatch | null;
	onCommandHandled?: (
		command: RendererGraphicCommandDispatch,
		result: OGrafCommandExecutionResult,
	) => void;
}

export function RendererBroadcastItem({
	item,
	phase = "enter",
	resolution,
	hideAnnotation = false,
	command,
	onCommandHandled,
}: RendererBroadcastItemProps) {
	return (
		<BroadcastGraphicLayer
			item={item}
			phase={phase}
			resolution={resolution}
			hideAnnotation={hideAnnotation}
			command={command}
			onCommandHandled={onCommandHandled}
		/>
	);
}

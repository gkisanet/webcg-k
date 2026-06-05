import { isRecord } from "./rundownOverlayData";

export function needsAnimatedGraphicRenderer(elements: unknown[]): boolean {
	return elements.some((element) => {
		if (!isRecord(element)) return false;
		return element.animation != null || element.type === "html_plugin";
	});
}

import { useEffect, useState } from "react";
import { useAnnotationDocument } from "../../hooks/useAnnotationDocument";
import { AnnotationRenderer } from "../Annotation/AnnotationRenderer";

interface RendererWhiteboardProps {
	whiteboardId: string;
	phase: "enter" | "idle" | "exit";
}

export function RendererWhiteboard({
	whiteboardId,
	phase,
}: RendererWhiteboardProps) {
	const { document, remoteCursors, remoteDraftStrokes, status } =
		useAnnotationDocument(whiteboardId, { subscribeToDocumentChanges: false });
	const [opacity, setOpacity] = useState(0);

	useEffect(() => {
		if (status === "ready" && phase !== "exit") {
			setOpacity(1);
			return;
		}
		if (phase === "exit") {
			setOpacity(0);
		}
	}, [phase, status]);

	return (
		<div
			className="renderer-annotation-wrapper"
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				opacity,
				transition: "opacity 0.18s linear",
			}}
		>
			<AnnotationRenderer
				document={document}
				cursors={remoteCursors}
				draftStrokes={remoteDraftStrokes}
			/>
		</div>
	);
}

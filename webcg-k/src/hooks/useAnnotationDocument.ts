import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AnnotationCursor,
	type AnnotationDocument,
	type AnnotationPoint,
	type AnnotationStroke,
	type AnnotationTool,
	appendPointsToStroke,
	appendStroke,
	coerceAnnotationDocument,
	coerceAnnotationPoints,
	coerceAnnotationStroke,
	createAnnotationCursor,
	createEmptyAnnotationDocument,
	isAnnotationCursorVisible,
} from "../lib/annotation/annotationDocument";
import type { Json } from "../lib/database.types";
import { sendRealtimeBroadcast } from "../lib/realtimeBroadcast";
import { supabase } from "../lib/supabase";

type AnnotationStatus = "loading" | "ready" | "error";

interface UseAnnotationDocumentResult {
	document: AnnotationDocument;
	remoteCursors: AnnotationCursor[];
	remoteDraftStrokes: AnnotationStroke[];
	status: AnnotationStatus;
	error: string | null;
	appendLocalStroke: (stroke: AnnotationStroke) => Promise<void>;
	beginLocalStroke: (stroke: AnnotationStroke) => void;
	publishStrokePoints: (strokeId: string, points: AnnotationPoint[]) => void;
	finishLocalStroke: (stroke: AnnotationStroke) => Promise<void>;
	cancelLocalStroke: (strokeId: string) => void;
	publishCursor: (cursor: PublishCursorInput) => void;
	replaceDocument: (document: AnnotationDocument) => Promise<void>;
	undoLastStroke: () => Promise<void>;
	clearDocument: () => Promise<void>;
}

interface UseAnnotationDocumentOptions {
	subscribeToDocumentChanges?: boolean;
}

export interface PublishCursorInput {
	point: AnnotationPoint;
	tool: AnnotationTool;
	color: string;
	width: number;
}

const channelEvent = { event: "document-change" };
const CURSOR_TIMEOUT_MS = 1500;
const CURSOR_PRUNE_MS = 250;
const DRAFT_TIMEOUT_MS = 2500;

type AnnotationBroadcastPayload = {
	clientId?: unknown;
	kind?: unknown;
	stroke?: unknown;
	strokeId?: unknown;
	points?: unknown;
	document?: unknown;
	cursor?: unknown;
};

export function useAnnotationDocument(
	whiteboardId: string,
	options: UseAnnotationDocumentOptions = {},
): UseAnnotationDocumentResult {
	const subscribeToDocumentChanges = options.subscribeToDocumentChanges ?? true;
	const [document, setDocument] = useState<AnnotationDocument>(() =>
		createEmptyAnnotationDocument(),
	);
	const [remoteCursors, setRemoteCursors] = useState<AnnotationCursor[]>([]);
	const [remoteDraftStrokes, setRemoteDraftStrokes] = useState<
		AnnotationStroke[]
	>([]);
	const [status, setStatus] = useState<AnnotationStatus>("loading");
	const [error, setError] = useState<string | null>(null);
	const documentRef = useRef(document);
	const clientIdRef = useRef(createClientId());
	const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
	const remoteDraftsRef = useRef(new Map<string, AnnotationStroke>());
	const remoteDraftUpdatedAtRef = useRef(new Map<string, number>());

	useEffect(() => {
		documentRef.current = document;
	}, [document]);

	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setError(null);
		setRemoteCursors([]);
		remoteDraftsRef.current.clear();
		remoteDraftUpdatedAtRef.current.clear();
		setRemoteDraftStrokes([]);

		async function loadDocument() {
			const { data, error: loadError } = await supabase
				.from("whiteboards")
				.select("document_state")
				.eq("id", whiteboardId)
				.single();

			if (cancelled) return;
			if (loadError) {
				if (isMissingDocumentStateError(loadError)) {
					const fallbackDocument = createEmptyAnnotationDocument();
					documentRef.current = fallbackDocument;
					setDocument(fallbackDocument);
					setError(
						"whiteboards.document_state 컬럼이 없어 임시 판서 모드로 실행 중입니다. Supabase 마이그레이션을 적용하면 저장됩니다.",
					);
					setStatus("ready");
					return;
				}
				setError(loadError.message);
				setStatus("error");
				return;
			}

			const nextDocument = coerceAnnotationDocument(data?.document_state);
			documentRef.current = nextDocument;
			setDocument(nextDocument);
			setStatus("ready");
		}

		loadDocument();

		let channel = supabase
			.channel(`annotation:${whiteboardId}`)
			.on("broadcast", channelEvent, ({ payload }) => {
				if (!payload || typeof payload !== "object") return;
				const change = payload as AnnotationBroadcastPayload;
				const senderId =
					typeof change.clientId === "string" ? change.clientId : null;
				if (senderId === clientIdRef.current) return;
				if (change.kind === "stroke") {
					const stroke = coerceAnnotationStroke(change.stroke);
					if (!stroke) return;
					setDocument((current) => {
						const next = appendStroke(current, stroke);
						documentRef.current = next;
						return next;
					});
				}
				if (change.kind === "stroke-start") {
					const stroke = coerceAnnotationStroke(change.stroke);
					if (!stroke || !senderId) return;
					remoteDraftsRef.current.set(
						createDraftKey(senderId, stroke.id),
						stroke,
					);
					remoteDraftUpdatedAtRef.current.set(
						createDraftKey(senderId, stroke.id),
						Date.now(),
					);
					setRemoteDraftStrokes(Array.from(remoteDraftsRef.current.values()));
				}
				if (change.kind === "stroke-move") {
					const strokeId =
						typeof change.strokeId === "string" ? change.strokeId : null;
					const points = coerceAnnotationPoints(change.points);
					if (!senderId || !strokeId || points.length === 0) return;
					const draftKey = createDraftKey(senderId, strokeId);
					const currentDraft = remoteDraftsRef.current.get(draftKey);
					if (!currentDraft) return;
					remoteDraftsRef.current.set(
						draftKey,
						appendPointsToStroke(currentDraft, points),
					);
					remoteDraftUpdatedAtRef.current.set(draftKey, Date.now());
					setRemoteDraftStrokes(Array.from(remoteDraftsRef.current.values()));
				}
				if (change.kind === "stroke-end") {
					const stroke = coerceAnnotationStroke(change.stroke);
					if (!stroke) return;
					if (senderId) {
						const draftKey = createDraftKey(senderId, stroke.id);
						remoteDraftsRef.current.delete(draftKey);
						remoteDraftUpdatedAtRef.current.delete(draftKey);
						setRemoteDraftStrokes(Array.from(remoteDraftsRef.current.values()));
					}
					setDocument((current) => {
						const next = appendStroke(current, stroke);
						documentRef.current = next;
						return next;
					});
				}
				if (change.kind === "stroke-cancel") {
					const strokeId =
						typeof change.strokeId === "string" ? change.strokeId : null;
					if (!senderId || !strokeId) return;
					const draftKey = createDraftKey(senderId, strokeId);
					remoteDraftsRef.current.delete(draftKey);
					remoteDraftUpdatedAtRef.current.delete(draftKey);
					setRemoteDraftStrokes(Array.from(remoteDraftsRef.current.values()));
				}
				if (change.kind === "replace") {
					const next = coerceAnnotationDocument(change.document);
					remoteDraftsRef.current.clear();
					remoteDraftUpdatedAtRef.current.clear();
					setRemoteDraftStrokes([]);
					documentRef.current = next;
					setDocument(next);
				}
				if (change.kind === "cursor" && change.cursor) {
					const cursor = createAnnotationCursor(
						change.cursor as Parameters<typeof createAnnotationCursor>[0],
					);
					setRemoteCursors((current) => {
						const others = current.filter(
							(item) => item.clientId !== cursor.clientId,
						);
						return [...others, cursor];
					});
				}
			});

		if (subscribeToDocumentChanges) {
			channel = channel.on(
				"postgres_changes" as never,
				{
					event: "UPDATE",
					schema: "public",
					table: "whiteboards",
					filter: `id=eq.${whiteboardId}`,
				} as never,
				(payload: { new?: { document_state?: unknown } }) => {
					if (!payload.new || !payload.new.document_state) return;
					const next = coerceAnnotationDocument(payload.new.document_state);
					documentRef.current = next;
					setDocument(next);
				},
			);
		}

		channel = channel.subscribe();
		channelRef.current = channel;

		return () => {
			cancelled = true;
			channelRef.current = null;
			supabase.removeChannel(channel);
		};
	}, [subscribeToDocumentChanges, whiteboardId]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			setRemoteCursors((current) =>
				current.filter((cursor) =>
					isAnnotationCursorVisible(cursor, Date.now(), CURSOR_TIMEOUT_MS),
				),
			);
			const now = Date.now();
			let changed = false;
			for (const [draftKey, updatedAt] of remoteDraftUpdatedAtRef.current) {
				if (now - updatedAt <= DRAFT_TIMEOUT_MS) continue;
				remoteDraftUpdatedAtRef.current.delete(draftKey);
				remoteDraftsRef.current.delete(draftKey);
				changed = true;
			}
			if (changed) {
				setRemoteDraftStrokes(Array.from(remoteDraftsRef.current.values()));
			}
		}, CURSOR_PRUNE_MS);

		return () => window.clearInterval(interval);
	}, []);

	const persistDocument = useCallback(
		async (nextDocument: AnnotationDocument) => {
			const { error: saveError } = await supabase
				.from("whiteboards")
				.update({ document_state: nextDocument as unknown as Json })
				.eq("id", whiteboardId);
			if (saveError) {
				if (isMissingDocumentStateError(saveError)) {
					setError(
						"whiteboards.document_state 컬럼이 없어 현재 판서는 이 브라우저 세션에서만 유지됩니다.",
					);
					setStatus("ready");
					return;
				}
				setError(saveError.message);
				setStatus("error");
			}
		},
		[whiteboardId],
	);

	const broadcastChange = useCallback(
		async (
			payload: Record<string, unknown>,
			options: { restFallback?: boolean } = {},
		) => {
			const channel = channelRef.current;
			if (!channel) return;
			await sendRealtimeBroadcast(
				channel,
				channelEvent.event,
				{
					...payload,
					clientId: clientIdRef.current,
				},
				{ restFallback: options.restFallback },
			);
		},
		[],
	);

	const appendLocalStroke = useCallback(
		async (stroke: AnnotationStroke) => {
			const next = appendStroke(documentRef.current, stroke);
			documentRef.current = next;
			setDocument(next);
			await broadcastChange({ kind: "stroke", stroke }, { restFallback: true });
			await persistDocument(next);
		},
		[broadcastChange, persistDocument],
	);

	const beginLocalStroke = useCallback(
		(stroke: AnnotationStroke) => {
			void broadcastChange(
				{ kind: "stroke-start", stroke },
				{ restFallback: true },
			);
		},
		[broadcastChange],
	);

	const publishStrokePoints = useCallback(
		(strokeId: string, points: AnnotationPoint[]) => {
			if (points.length === 0) return;
			void broadcastChange(
				{ kind: "stroke-move", strokeId, points },
				{ restFallback: false },
			);
		},
		[broadcastChange],
	);

	const finishLocalStroke = useCallback(
		async (stroke: AnnotationStroke) => {
			const next = appendStroke(documentRef.current, stroke);
			documentRef.current = next;
			setDocument(next);
			await broadcastChange(
				{ kind: "stroke-end", stroke },
				{ restFallback: true },
			);
			await persistDocument(next);
		},
		[broadcastChange, persistDocument],
	);

	const cancelLocalStroke = useCallback(
		(strokeId: string) => {
			void broadcastChange(
				{ kind: "stroke-cancel", strokeId },
				{ restFallback: false },
			);
		},
		[broadcastChange],
	);

	const publishCursor = useCallback(
		(cursor: PublishCursorInput) => {
			void broadcastChange(
				{
					kind: "cursor",
					cursor: createAnnotationCursor({
						clientId: clientIdRef.current,
						point: cursor.point,
						tool: cursor.tool,
						color: cursor.color,
						width: cursor.width,
					}),
				},
				{ restFallback: false },
			);
		},
		[broadcastChange],
	);

	const replaceDocument = useCallback(
		async (nextDocument: AnnotationDocument) => {
			documentRef.current = nextDocument;
			setDocument(nextDocument);
			await broadcastChange(
				{ kind: "replace", document: nextDocument },
				{ restFallback: true },
			);
			await persistDocument(nextDocument);
		},
		[broadcastChange, persistDocument],
	);

	const undoLastStroke = useCallback(async () => {
		const next = {
			version: 1 as const,
			strokes: documentRef.current.strokes.slice(0, -1),
			updatedAt: new Date().toISOString(),
		};
		await replaceDocument(next);
	}, [replaceDocument]);

	const clearDocument = useCallback(async () => {
		await replaceDocument(createEmptyAnnotationDocument());
	}, [replaceDocument]);

	return useMemo(
		() => ({
			document,
			remoteCursors,
			remoteDraftStrokes,
			status,
			error,
			appendLocalStroke,
			beginLocalStroke,
			publishStrokePoints,
			finishLocalStroke,
			cancelLocalStroke,
			publishCursor,
			replaceDocument,
			undoLastStroke,
			clearDocument,
		}),
		[
			document,
			remoteCursors,
			remoteDraftStrokes,
			status,
			error,
			appendLocalStroke,
			beginLocalStroke,
			publishStrokePoints,
			finishLocalStroke,
			cancelLocalStroke,
			publishCursor,
			replaceDocument,
			undoLastStroke,
			clearDocument,
		],
	);
}

function createDraftKey(clientId: string, strokeId: string): string {
	return `${clientId}:${strokeId}`;
}

function createClientId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingDocumentStateError(error: {
	code?: string;
	message?: string;
	details?: string | null;
}): boolean {
	const text =
		`${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
	return (
		text.includes("document_state") &&
		(text.includes("column") ||
			text.includes("schema cache") ||
			text.includes("could not find") ||
			text.includes("pgrst204") ||
			text.includes("42703"))
	);
}

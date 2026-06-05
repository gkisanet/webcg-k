/**
 * 브로드캐스트 관련 공용 타입 정의
 * 여러 라우트 파일에서 중복 정의되던 타입을 통합
 */

// ─── 세션 상태 ─────────────────────────────────────────────────────
export type SessionStatus =
	| "draft"
	| "ready"
	| "rehearsal"
	| "live"
	| "ended"
	| "completed";

// ─── 브로드캐스트 세션 (슈퍼셋) ────────────────────────────────────
export interface BroadcastSession {
	id: string;
	title: string;
	description?: string | null;
	status: SessionStatus;
	created_at: string;
	updated_at: string;
	archived_at?: string | null;
	created_by?: string;
	rundown_id?: string;
	timeline_data: any[];
	playhead_state?: PlayheadState;
	/** 세션 뷰에서 추가되는 UI 전용 필드 */
	isShared?: boolean;
	/** 송출 로그 수 (broadcast.tsx에서 런타임 추가) */
	broadcastLogCount?: number;
}

export interface MainOperatorLease {
	userId: string;
	clientId: string;
	email?: string | null;
	displayName?: string | null;
	claimedAt: string;
	expiresAt: string;
}

// ─── 플레이헤드 상태 (DB 영속화용) ──────────────────────────────────
// ■ Why pgmBlockIds (Map)?
//   멀티트랙 동시 송출: 각 트랙이 독립적인 PGM 상태를 가진다.
//   Track 1(배경)은 유지하면서 Track 2(자막)만 교체하는 것이 가능.
//   DB JSON 직렬화를 위해 Record<string, string> 사용 (Map은 JSON 불가).
export interface PlayheadState {
	playheadPosition: number;
	/** @deprecated 레거시 단일 PGM — pgmBlockIds로 마이그레이션 */
	pgmBlockId?: string | null;
	/** 트랙별 활성 PGM 블록 (trackId → blockId) */
	pgmBlockIds: Record<string, string>;
	lastBroadcastPosition: number;
	completedBlockIds: string[];
	airedBlockIds: string[];
	skippedBlockIds: string[];
	logoBlocks?: SavedLogoBlock[];
	/** 판서 레이어 PVW 상태. 동적으로 만든 whiteboard block은 timeline_data에 없으므로 별도 저장한다. */
	whiteboardPreviewId?: string | null;
	/** 판서 레이어 PGM 상태. 렌더러/참여자 복원용. */
	whiteboardProgramId?: string | null;
	/** 협업 동기화용 단조 증가 버전. Realtime echo/stale snapshot 방어에 사용. */
	revision?: number;
	/** 변경을 만든 브라우저 인스턴스. 로컬 echo 판별 및 진단용. */
	originClientId?: string;
	/** 변경을 만든 사용자 ID. 감사 로그 및 주도권 UI용. */
	updatedBy?: string;
	updatedAt?: string;
	/** 메인 오퍼레이터 운영권. 다중 오퍼레이터 환경에서 write owner를 1명으로 고정한다. */
	mainOperatorLease?: MainOperatorLease | null;
}

// ─── 로고 블록 저장 타입 ─────────────────────────────────────────
export interface SavedLogoBlock {
	id: string;
	name: string;
	startPosition: number;
	width: number;
	color?: string;
	sourceId?: string;
}

// ─── 타임라인 블록 데이터 ───────────────────────────────────────
export interface TimelineBlockData {
	id: string;
	name: string;
	trackId: number;
	startPosition: number;
	width: number;
	transitionIn?: "cut" | "fade";
	transitionOut?: "cut" | "fade";
	source_type:
		| "image"
		| "graphic"
		| "template"
		| "overlay"
		| "whiteboard"
		| "ograf";
	source_id: string;
	data: any;
	// ─── 역추적 필드 (핫 수정 / NRCS 변경 알림용) ───
	cuesheet_item_id?: string;
	bundle_slot_id?: string;
	// ─── 세그먼트 소속 (Nested Sequence Tab 모델) ───
	segment_id?: string;
}

// ─── 세션 액션 로그 ──────────────────────────────────────────────
export interface SessionLog {
	id: string;
	action_type: string;
	action_detail: any;
	created_at: string;
	user_id: string;
	profiles?: { display_name: string; email: string } | null;
}

// ─── 해상도 설정 ─────────────────────────────────────────────────
export const RESOLUTIONS = {
	"1080p": { width: 1920, height: 1080 },
	"4k": { width: 3840, height: 2160 },
} as const;

export type Resolution = keyof typeof RESOLUTIONS;

// ─── Realtime 페이로드 타입 ──────────────────────────────────────
// ■ Why PLAY_MULTI?
//   멀티트랙 동시 송출에서는 여러 트랙의 아이템을 한 번에 보내야 한다.
//   렌더러는 items 배열을 받아 trackId순 Z-index로 동시 렌더링.
export interface BroadcastItemPayload {
	id: string;
	name: string;
	trackId?: number;
	color?: string;
	transitionIn?: "cut" | "fade";
	transitionOut?: "cut" | "fade";
	sourceType?:
		| "image"
		| "graphic"
		| "template"
		| "overlay"
		| "whiteboard"
		| "ograf";
	sourceData?: {
		elements?: any[];
		canvasWidth?: number;
		canvasHeight?: number;
		imageUrl?: string;
		imageName?: string;
		imageX?: number;
		imageY?: number;
		imageW?: number;
		imageH?: number;
		/** AI Cuesheet overlay — HTML+CSS for direct iframe rendering */
		html?: string;
		css?: string;
		js?: string;
		payload?: {
			html?: string;
			css?: string;
			js?: string;
		};
		source_code?: {
			html?: string;
			css?: string;
			js?: string;
		};
		whiteboardId?: string;
		manifest?: unknown;
		ografManifest?: unknown;
		data?: unknown;
		entrypoint?: string;
		tagName?: string;
		moduleCode?: string;
		importSource?: string;
		packagePath?: string;
	};
}

export interface BroadcastPayload {
	action: "PLAY" | "PLAY_MULTI" | "STOP" | "CLEAR" | "NEXT" | "GRAPHIC_COMMAND";
	/** 단일 아이템 (레거시 PLAY 호환) */
	item?: BroadcastItemPayload;
	/** 멀티트랙 아이템 배열 (PLAY_MULTI) */
	items?: BroadcastItemPayload[];
	/** 선택 방송 그래픽 instance에 전달하는 customAction/step command */
	command?: unknown;
	/** ACK 매칭용 시퀀스 번호 (컨트롤러 → 렌더러 → ACK 응답) */
	seqNum?: number;
	/** fade 애니메이션 지속 시간 (ms, 기본 800) */
	fadeDuration?: number;
}

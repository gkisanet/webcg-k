/**
 * Supabase Client Configuration
 * WebCG-K 방송 그래픽 시스템용 Supabase 클라이언트
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { sendRealtimeBroadcast } from "./realtimeBroadcast";

// 🆕 Node.js < 22 SSR (Vite / TanStack Start) 환경에서 Supabase Realtime 초기화 시
// native WebSocket 생성자가 없어 크래시가 발생하는 현상을 방지하기 위한 서버용 Mock Polyfill
if (typeof window === "undefined" && !globalThis.WebSocket) {
	globalThis.WebSocket = class {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;
		constructor() {
			// RealtimeClient.js가 초기화 시점에 WebSocket 생성자를 점검하는 것만 무사 통과시키고,
			// 실제 서버 사이드에서 소켓이 오작동으로 연결되는 것을 원천 차단하기 위해 예외 처리 설정
			throw new Error("WebSocket cannot be instantiated on the server side.");
		}
	} as any;
}

// Supabase Docker 로컬 개발 환경 설정
const supabaseUrl =
	import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321";
const supabaseAnonKey =
	import.meta.env.VITE_SUPABASE_ANON_KEY ||
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * Supabase Client 인스턴스
 * - Auth: 사용자 인증
 * - Database: PostgreSQL 쿼리
 * - Realtime: 실시간 브로드캐스트
 * - Storage: 에셋 저장
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
	},
	realtime: {
		params: {
			eventsPerSecond: 100, // 고빈도 이벤트 지원 (방송 송출용)
		},
	},
});

/**
 * Realtime 채널 생성 유틸리티
 * @param projectId 프로젝트 ID
 * @returns Supabase Realtime Channel
 */
export function createBroadcastChannel(projectId: string) {
	return supabase.channel(`broadcast:${projectId}`, {
		config: {
			broadcast: {
				self: false, // 자신에게 보낸 메시지 수신 안함
			},
		},
	});
}

/**
 * 송출 명령 타입
 */
export type BroadcastCommand = {
	action: "SHOW" | "HIDE" | "NEXT" | "PREV" | "UPDATE";
	blockId?: string;
	data?: Record<string, unknown>;
	timestamp: number;
};

/**
 * 송출 명령 전송
 */
export async function sendBroadcastCommand(
	channel: ReturnType<typeof supabase.channel>,
	command: Omit<BroadcastCommand, "timestamp">,
) {
	return sendRealtimeBroadcast(
		channel,
		"command",
		{
			...command,
			timestamp: Date.now(),
		},
		{ restFallback: true },
	);
}

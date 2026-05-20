/**
 * Supabase Client Configuration
 * WebCG-K 방송 그래픽 시스템용 Supabase 클라이언트
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { sendRealtimeBroadcast } from "./realtimeBroadcast";

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

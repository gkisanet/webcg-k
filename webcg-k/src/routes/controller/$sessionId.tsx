/**
 * Broadcast Graphics (방송 그래픽) Session-based Controller Route Configuration
 * 무거운 컴포넌트와 렌더러들은 $sessionId.lazy.tsx에서 지연 로딩(Lazy Loaded)됩니다.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/controller/$sessionId")({
	// ⚡ output 쿼리 파라미터: 모니터에 표시할 오버레이 태그 필터 검증
	validateSearch: (search: Record<string, unknown>) => ({
		output: (search.output as string) || null,
	}),
});

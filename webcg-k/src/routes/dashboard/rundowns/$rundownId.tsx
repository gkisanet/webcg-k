/**
 * Broadcast Graphics (방송 그래픽) Rundown Editor Route Configuration
 * 무거운 컴포넌트 뷰는 $rundownId.lazy.tsx에서 지연 로드(Lazy Loaded)되어 분리됩니다.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/rundowns/$rundownId")({
	// ⚡ 컴포넌트는 $rundownId.lazy.tsx에 분리되어 lazy 로드됩니다.
});

/**
 * templates — 라우트 설정 (코드 스플리팅)
 * 컴포넌트는 templates.lazy.tsx에서 lazy 로드됨
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/studio/overlays/")({
    // component는 .lazy.tsx에서 자동 연결
});

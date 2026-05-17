/**
 * fonts — 라우트 설정 (코드 스플리팅)
 * 컴포넌트는 fonts.lazy.tsx에서 lazy 로드됨
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/assets/fonts/")({
    // component는 .lazy.tsx에서 자동 연결
});

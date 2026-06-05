/**
 * Controller Layout Route
 * /controller의 자식 라우트들을 렌더링하는 레이아웃
 */

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/controller")({
	component: ControllerLayout,
});

function ControllerLayout() {
	// $sessionId가 없는 /controller 접속 시
	// Route.useParams()로 확인할 수 없으므로 Outlet으로 자식을 렌더링
	// 자식 라우트가 없으면 리다이렉트
	return <Outlet />;
}

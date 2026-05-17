import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// 404 Not Found Component
function NotFound() {
	return (
		<div style={{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			height: "100vh",
			fontFamily: "system-ui, sans-serif"
		}}>
			<h1 style={{ fontSize: "4rem", margin: 0 }}>404</h1>
			<p style={{ fontSize: "1.5rem", color: "#666" }}>페이지를 찾을 수 없습니다</p>
			<a href="/" style={{ marginTop: "2rem", color: "#0066cc", textDecoration: "none" }}>
				홈으로 돌아가기
			</a>
		</div>
	);
}

// Create a new router instance
export const getRouter = () => {
	const router = createRouter({
		routeTree,
		context: {},
		defaultNotFoundComponent: NotFound,
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
	});

	return router;
};

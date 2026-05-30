import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "../lib/auth";
import { TooltipProvider } from "../components/ui/tooltip";

// i18n 초기화 — 앱 로드 전에 실행되어야 하므로 여기서 import (side-effect)
import "../lib/i18n";

import appCss from "../styles.css?url";
import fontCss from "../fonts.css?url";

// QueryClient 인스턴스 생성
// 사내망 방송국 환경: 항상 최신 데이터 fetch, stale 캐시 사용하지 않음
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,                // 항상 stale 처리 → 매번 refetch
			gcTime: 0,                   // 캐시 즉시 GC
			refetchOnMount: true,        // 마운트 시 항상 refetch
			refetchOnWindowFocus: true,  // 창 포커스 시 refetch
			retry: 1,                    // 실패 시 1회 재시도
		},
	},
});

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "WebCG-K | 방송 그래픽 시스템",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				// 로컬 폰트 번들 — 사내망(에어갭) 환경 대응
				rel: "stylesheet",
				href: fontCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ko" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<AuthProvider>
					<TooltipProvider>{children}</TooltipProvider>
				</AuthProvider>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}

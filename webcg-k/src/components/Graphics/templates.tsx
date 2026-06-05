/**
 * Graphic Templates
 * 현실적인 방송 그래픽 템플릿 정의
 */

import React from "react";

export interface GraphicTemplate {
	id: string;
	name: string;
	category: "logo" | "subtitle" | "breaking" | "lower-third";
	defaultTrack: number;
	defaultWidth: number;
	render: (props: GraphicRenderProps) => React.ReactNode;
}

export interface GraphicRenderProps {
	width: number;
	height: number;
	scale: number;
	data?: Record<string, string>;
}

/**
 * 채널 로고 그래픽
 */
export function ChannelLogo({ scale = 1 }: { scale?: number }) {
	return (
		<div
			style={{
				position: "absolute",
				top: `${40 * scale}px`,
				right: `${40 * scale}px`,
				display: "flex",
				alignItems: "center",
				gap: `${12 * scale}px`,
				padding: `${12 * scale}px ${20 * scale}px`,
				background:
					"linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(139, 92, 246, 0.9))",
				borderRadius: `${8 * scale}px`,
				boxShadow: `0 ${4 * scale}px ${20 * scale}px rgba(0,0,0,0.3)`,
			}}
		>
			<div
				style={{
					width: `${48 * scale}px`,
					height: `${48 * scale}px`,
					background: "white",
					borderRadius: `${8 * scale}px`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: `${24 * scale}px`,
					fontWeight: "bold",
					color: "#3B82F6",
				}}
			>
				CG
			</div>
			<div>
				<div
					style={{
						fontSize: `${20 * scale}px`,
						fontWeight: "bold",
						color: "white",
						letterSpacing: `${2 * scale}px`,
					}}
				>
					WebCG-K
				</div>
				<div
					style={{
						fontSize: `${11 * scale}px`,
						color: "rgba(255,255,255,0.8)",
						letterSpacing: `${1 * scale}px`,
					}}
				>
					BROADCAST GRAPHICS
				</div>
			</div>
		</div>
	);
}

/**
 * 뉴스 자막 (Lower Third)
 */
export function NewsLowerThird({
	scale = 1,
	title = "속보",
	content = "뉴스 자막 내용이 여기에 표시됩니다",
}: {
	scale?: number;
	title?: string;
	content?: string;
}) {
	return (
		<div
			style={{
				position: "absolute",
				bottom: `${80 * scale}px`,
				left: `${60 * scale}px`,
				right: `${60 * scale}px`,
			}}
		>
			{/* 타이틀 바 */}
			<div
				style={{
					display: "inline-block",
					padding: `${8 * scale}px ${20 * scale}px`,
					background: "linear-gradient(135deg, #EF4444, #DC2626)",
					borderRadius: `${4 * scale}px ${4 * scale}px 0 0`,
					fontSize: `${14 * scale}px`,
					fontWeight: "bold",
					color: "white",
					letterSpacing: `${2 * scale}px`,
				}}
			>
				{title}
			</div>

			{/* 본문 바 */}
			<div
				style={{
					background:
						"linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.7))",
					backdropFilter: "blur(10px)",
					padding: `${16 * scale}px ${24 * scale}px`,
					borderRadius: `0 ${4 * scale}px ${4 * scale}px ${4 * scale}px`,
					borderLeft: `${4 * scale}px solid #EF4444`,
				}}
			>
				<div
					style={{
						fontSize: `${24 * scale}px`,
						fontWeight: "600",
						color: "white",
						lineHeight: 1.4,
					}}
				>
					{content}
				</div>
			</div>
		</div>
	);
}

/**
 * 속보 배너 (Breaking News)
 */
export function BreakingNewsBanner({
	scale = 1,
	text = "긴급 속보",
}: {
	scale?: number;
	text?: string;
}) {
	return (
		<div
			style={{
				position: "absolute",
				top: `${40 * scale}px`,
				left: 0,
				right: 0,
				background: "linear-gradient(90deg, #DC2626, #EF4444, #DC2626)",
				padding: `${12 * scale}px ${40 * scale}px`,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: `${16 * scale}px`,
				animation: "pulse 2s infinite",
			}}
		>
			<div
				style={{
					fontSize: `${16 * scale}px`,
					fontWeight: "bold",
					color: "white",
					letterSpacing: `${4 * scale}px`,
					textTransform: "uppercase",
				}}
			>
				⚠ 속보 ⚠
			</div>
			<div
				style={{
					fontSize: `${22 * scale}px`,
					fontWeight: "bold",
					color: "white",
				}}
			>
				{text}
			</div>

			<style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.9; }
                }
            `}</style>
		</div>
	);
}

/**
 * 뉴스 티커 (하단 스크롤)
 *
 * 🆕 속도 정규화 (2026-03-31):
 * 기존 문제: animation: "ticker 20s linear infinite" — 텍스트 길이에 관계없이 고정 20초.
 *           → 긴 텍스트는 너무 빨리, 짧은 텍스트는 너무 느리게 지나감.
 *
 * 해결: 텍스트의 실제 scrollWidth를 측정하여 duration을 역산.
 *       totalDistance(컨테이너 폭 + 텍스트 폭) / speed(px/s) = duration(s)
 *       → 글자 수에 관계없이 항상 일정한 속도로 흘러감.
 */
export function NewsTicker({
	scale = 1,
	text = "뉴스 속보: 주요 뉴스 내용이 여기에 표시됩니다. 다양한 소식을 전해드립니다.",
	speed = 120,
}: {
	scale?: number;
	text?: string;
	/** 스크롤 속도 (px/s). 방송 표준 약 100~150px/s */
	speed?: number;
}) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const scrollRef = React.useRef<HTMLDivElement>(null);
	const [duration, setDuration] = React.useState(20);
	const [startX, setStartX] = React.useState(1920);

	// 텍스트 길이에 따른 스크롤 시간 역산
	React.useEffect(() => {
		if (!containerRef.current || !scrollRef.current) return;

		// 1. 컨테이너 폭 (화면 너비) + 텍스트 실제 렌더링 폭
		const containerW = containerRef.current.offsetWidth;
		const textW = scrollRef.current.scrollWidth;

		// 2. 시작 위치 = 컨테이너 오른쪽 끝 (화면 밖에서 진입)
		setStartX(containerW);

		// 3. 총 이동 거리 = 오른쪽 끝에서 왼쪽 끝까지
		//    컨테이너 폭 + 텍스트 폭 = 완전히 벗어날 때까지의 거리
		const totalDistance = containerW + textW;

		// 4. duration = 거리 / 속도 (최소 5초 보장)
		setDuration(Math.max(totalDistance / speed, 5));
	}, [text, speed, scale]);

	return (
		<div
			ref={containerRef}
			style={{
				position: "absolute",
				bottom: 0,
				left: 0,
				right: 0,
				background:
					"linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.95))",
				padding: `${12 * scale}px 0`,
				overflow: "hidden",
			}}
		>
			<div
				ref={scrollRef}
				style={{
					display: "flex",
					alignItems: "center",
					gap: `${20 * scale}px`,
					animation: `webcgk-ticker ${duration}s linear infinite`,
					whiteSpace: "nowrap",
				}}
			>
				<span
					style={{
						fontSize: `${18 * scale}px`,
						color: "#EF4444",
						fontWeight: "bold",
						marginLeft: `${20 * scale}px`,
					}}
				>
					● LIVE
				</span>
				<span
					style={{
						fontSize: `${18 * scale}px`,
						color: "white",
					}}
				>
					{text}
				</span>
			</div>

			{/* 동적 keyframe: startX는 컨테이너 폭에서 역산된 픽셀값 */}
			<style>{`
                @keyframes webcgk-ticker {
                    0% { transform: translateX(${startX}px); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>
		</div>
	);
}


/**
 * Broadcast Button Component
 * 송출 버튼 - Supabase Realtime을 통해 렌더러에 명령 발행
 */

import { Check, Copy, ExternalLink, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { addActionLog } from "../../stores/actionLogStore";
import { useClipboard } from "../../hooks/useClipboard";

interface BroadcastButtonProps {
	sessionId?: string;
	baseUrl?: string;
	/** 컨트롤러에서 송출 시작 command를 수행한다. DB status도 부모가 소유한다. */
	onStart?: () => Promise<void> | void;
	/** 컨트롤러에서 STOP command를 수행한다. DB status도 부모가 소유한다. */
	onStop?: () => Promise<void> | void;
	/** 송출 상태 (부모가 소유) */
	isBroadcasting: boolean;
}

export function BroadcastButton({ sessionId, baseUrl = "", onStart, onStop, isBroadcasting }: BroadcastButtonProps) {
	const { user } = useAuth();
	const [showModal, setShowModal] = useState(false);
	const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);
	const { copyToClipboard } = useClipboard();
	const modalRef = useRef<HTMLDivElement>(null);

	// 송출 상태는 유저가 직접 '송출 중지'를 누를 때만 ended로 전환
	// beforeunload/언마운트 시 자동 종료하지 않음 (브라우저 재시작 후에도 live 유지)

	// 타임라인 상태 구독 — BroadcastButton은 DB 상태만 관리
	// ■ Why Realtime 발행을 제거했는가?
	//   이전에는 broadcastCurrentState()가 매 호출마다 supabase.channel()을
	//   새로 생성하여 좀비 채널이 누적 → 렌더러에 메시지 미전달.
	//   Realtime 발행은 $sessionId.tsx의 단일 채널에서 전담한다.

	// 현재 URL 기반으로 렌더 링크 생성
	const getBaseUrl = () => {
		if (baseUrl) return baseUrl;
		if (typeof window !== "undefined") {
			return `${window.location.protocol}//${window.location.host}`;
		}
		return "";
	};

	// 세션 기반 렌더러 URL
	const getSessionRendererUrl = (resolution: string) => {
		if (sessionId) {
			return `${getBaseUrl()}/render?sessionId=${sessionId}&resolution=${resolution}`;
		}
		return `${getBaseUrl()}/render?resolution=${resolution}`;
	};

	const links = [
		{
			id: "1080p",
			label: "1080p (Full HD)",
			resolution: "1920 × 1080",
			url: getSessionRendererUrl("1080p"),
		},
		{
			id: "4k",
			label: "4K (Ultra HD)",
			resolution: "3840 × 2160",
			url: getSessionRendererUrl("4k"),
		},
	];

	// 외부 클릭 시 모달 닫기
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				modalRef.current &&
				!modalRef.current.contains(event.target as Node)
			) {
				setShowModal(false);
			}
		}
		if (showModal) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showModal]);

	// 링크 복사 — useClipboard 훅 활용
	const handleCopyLink = async (url: string, id: string) => {
		await copyToClipboard(url);
		setCopiedLinkId(id);
		setTimeout(() => setCopiedLinkId(null), 2000);
	};

	// 송출 버튼 클릭
	const handleBroadcastClick = async () => {
		if (isPending) return;

		const userName = user?.email?.split("@")[0] || "User";
		const logUserId = user?.id || "unknown";

		setIsPending(true);
		try {
			if (isBroadcasting) {
				setShowModal(false);
				await onStop?.();
				addActionLog("broadcast_stop", logUserId, userName, sessionId || "세션", undefined, sessionId);
			} else {
				await onStart?.();
				setShowModal(true);
				addActionLog("broadcast_start", logUserId, userName, sessionId || "세션", undefined, sessionId);
			}
		} catch (err) {
			console.error("[BroadcastButton] Broadcast state command failed:", err);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<div style={{ position: "relative" }} ref={modalRef}>
			{/* 송출 버튼 */}
			<button
				type="button"
				onClick={handleBroadcastClick}
				disabled={isPending}
				style={{
					padding: "0.5rem 1rem",
					fontSize: "0.8rem",
					fontWeight: 600,
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
					backgroundColor: isBroadcasting
						? "rgba(234, 179, 8, 0.2)"
						: "var(--app-bg-muted)",
					border: isBroadcasting
						? "1px solid rgba(234, 179, 8, 0.5)"
						: "1px solid var(--border-default)",
					borderRadius: "8px",
					color: isBroadcasting ? "#EAB308" : "var(--text-secondary)",
					cursor: isPending ? "wait" : "pointer",
					opacity: isPending ? 0.7 : 1,
					transition: "all 0.3s ease",
				}}
			>
				<Radio
					className="w-4 h-4"
					style={{
						color: isBroadcasting ? "#EAB308" : "currentColor",
					}}
				/>

				{isBroadcasting ? (
					<>
						송출중
						{/* Glow 애니메이션 원 */}
						<span
							style={{
								width: "8px",
								height: "8px",
								borderRadius: "50%",
								backgroundColor: "#EF4444",
								boxShadow: "0 0 8px 2px rgba(239, 68, 68, 0.6)",
								animation: "pulseGlow 1.5s ease-in-out infinite",
							}}
						/>
					</>
				) : (
					"송출"
				)}
			</button>

			{/* 링크 모달 */}
			{showModal && (
				<div
					style={{
						position: "absolute",
						top: "calc(100% + 0.5rem)",
						right: 0,
						width: "320px",
						backgroundColor: "var(--app-bg-alt)",
						border: "1px solid var(--border-default)",
						borderRadius: "12px",
						padding: "1rem",
						boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
						zIndex: 9999,
					}}
				>
					{/* 헤더 */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: "1rem",
							paddingBottom: "0.75rem",
							borderBottom: "1px solid var(--border-default)",
						}}
					>
						<div
							style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
						>
							<span
								style={{
									width: "8px",
									height: "8px",
									borderRadius: "50%",
									backgroundColor: "#EF4444",
									animation: "pulseGlow 1.5s ease-in-out infinite",
								}}
							/>
							<h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
								송출 링크 {sessionId && "(세션)"}
							</h3>
						</div>
						<button
							type="button"
							onClick={() => setShowModal(false)}
							style={{
								background: "none",
								border: "none",
								color: "var(--text-tertiary)",
								cursor: "pointer",
								padding: "0.25rem",
							}}
						>
							<X className="w-4 h-4" />
						</button>
					</div>

					{/* 링크 목록 */}
					<div
						style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
					>
						{links.map((link) => (
							<div
								key={link.id}
								style={{
									backgroundColor: "var(--app-bg-muted)",
									borderRadius: "8px",
									padding: "0.75rem",
								}}
							>
								{/* 해상도 정보 */}
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: "0.5rem",
									}}
								>
									<span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
										{link.label}
									</span>
									<span
										style={{
											fontSize: "0.7rem",
											color: "var(--text-tertiary)",
											backgroundColor: "var(--app-bg-alt)",
											padding: "0.125rem 0.5rem",
											borderRadius: "4px",
										}}
									>
										{link.resolution}
									</span>
								</div>

								{/* URL 표시 */}
								<div
									style={{
										fontSize: "0.7rem",
										color: "var(--text-tertiary)",
										backgroundColor: "var(--app-bg)",
										padding: "0.5rem",
										borderRadius: "4px",
										marginBottom: "0.5rem",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
										fontFamily: "monospace",
									}}
								>
									{link.url}
								</div>

								{/* 버튼들 */}
								<div style={{ display: "flex", gap: "0.5rem" }}>
									<a
										href={link.url}
										target="_blank"
										rel="noopener noreferrer"
										style={{
											flex: 1,
											padding: "0.5rem",
											fontSize: "0.75rem",
											backgroundColor: "var(--accent-primary)",
											border: "none",
											borderRadius: "6px",
											color: "white",
											cursor: "pointer",
											textDecoration: "none",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: "0.25rem",
										}}
									>
										<ExternalLink className="w-3 h-3" />
										열기
									</a>
									<button
										type="button"
										onClick={() => handleCopyLink(link.url, link.id)}
										style={{
											flex: 1,
											padding: "0.5rem",
											fontSize: "0.75rem",
											backgroundColor:
												copiedLinkId === link.id
													? "rgba(34, 197, 94, 0.2)"
													: "var(--app-bg-alt)",
											border:
												copiedLinkId === link.id
													? "1px solid rgba(34, 197, 94, 0.5)"
													: "1px solid var(--border-default)",
											borderRadius: "6px",
											color:
												copiedLinkId === link.id
													? "#22C55E"
													: "var(--text-secondary)",
											cursor: "pointer",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: "0.25rem",
											transition: "all 0.2s ease",
										}}
									>
										{copiedLinkId === link.id ? (
											<>
												<Check className="w-3 h-3" />
												복사됨
											</>
										) : (
											<>
												<Copy className="w-3 h-3" />
												복사
											</>
										)}
									</button>
								</div>
							</div>
						))}
					</div>

					{/* 안내 문구 */}
					<div
						style={{
							marginTop: "0.75rem",
							padding: "0.5rem",
							backgroundColor: "rgba(234, 179, 8, 0.1)",
							borderRadius: "6px",
							fontSize: "0.7rem",
							color: "var(--text-tertiary)",
							textAlign: "center",
						}}
					>
						💡 OBS 브라우저 소스에 링크를 붙여넣기 하세요
					</div>
				</div>
			)}

			{/* 글로벌 애니메이션 스타일 */}
			<style>{`
                @keyframes pulseGlow {
                    0%, 100% {
                        transform: scale(1);
                        box-shadow: 0 0 4px 1px rgba(239, 68, 68, 0.4);
                    }
                    50% {
                        transform: scale(1.3);
                        box-shadow: 0 0 12px 4px rgba(239, 68, 68, 0.8);
                    }
                }
            `}</style>
		</div>
	);
}

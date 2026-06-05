/**
 * VideoInputLayer — PVW/PGM 모니터용 영상 입력 배경 레이어
 *
 * Why 별도 컴포넌트?
 * - 기존 GraphicLayer, OverlayPlayoutLayer와 독립적으로 동작
 * - z-index: 0으로 모든 CG 그래픽 아래에 배치
 * - NDI(WHEP) 모드와 UVC(getUserMedia) 모드 두 가지 지원
 *
 * 비유: TV 모니터의 "배경판" 역할
 * - CG 그래픽은 투명 배경의 오버레이 (z-index: 1+)
 * - 이 레이어가 그 뒤에 실제 카메라 영상을 깔아줌
 * - 결과적으로 운용자가 CG + 배경 영상 합성을 실시간으로 확인 가능
 */

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Camera, CameraOff, AlertCircle, Radio } from "lucide-react";
import type { VideoInputMode } from "@/lib/types/videoInput";
import { openUvcStream } from "@/services/videoInputService";

interface VideoInputLayerProps {
	/** 영상 입력 모드 */
	mode: VideoInputMode;
	/** NDI 모드: media-server 소스 ID */
	ndiSourceId?: string;
	/** UVC 모드: getUserMedia() deviceId */
	uvcDeviceId?: string;
	/** 배경 불투명도 (0~1, 기본 1.0) */
	opacity?: number;
}

type ConnectionState = "idle" | "connecting" | "connected" | "error";

/**
 * Why forwardRef?
 * MonitorActionBar에서 클린 영상(CG 미합성)을 캡쳐하려면
 * 이 컴포넌트 내부의 <video> 엘리먼트에 직접 접근해야 한다.
 * forwardRef로 video ref를 부모에게 노출하면,
 * 부모가 video.drawImage()로 CG 레이어 없는 원본 프레임만 추출 가능.
 */
export const VideoInputLayer = forwardRef<HTMLVideoElement | null, VideoInputLayerProps>(function VideoInputLayer({
	mode,
	ndiSourceId,
	uvcDeviceId,
	opacity = 1.0,
}, ref) {
	const videoRef = useRef<HTMLVideoElement>(null);

	// 부모에게 video 엘리먼트 ref 노출 (클린 영상 캡쳐용)
	useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);
	const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
	const [errorMessage, setErrorMessage] = useState<string>("");
	const streamRef = useRef<MediaStream | null>(null);

	// ─── UVC 모드: getUserMedia()로 직접 카메라/캡처 장치 열기 ─────
	const connectUvc = useCallback(async () => {
		setConnectionState("connecting");
		setErrorMessage("");

		try {
			const stream = await openUvcStream(uvcDeviceId);

			if (!stream) {
				throw new Error("카메라 접근이 거부되었거나 장치를 찾을 수 없습니다");
			}

			// 기존 스트림 정리
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((t) => t.stop());
			}

			streamRef.current = stream;

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			setConnectionState("connected");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "UVC 연결 실패";
			setErrorMessage(msg);
			setConnectionState("error");
			console.error("[VideoInputLayer] UVC 오류:", msg);
		}
	}, [uvcDeviceId]);

	// ─── NDI 모드: media-server 수신 시작 + WHEP WebRTC 연결 (v2) ────
	// Why 2단계 플로우?
	// 1단계: media-server에 NDI 수신 시작 요청 (POST /api/sources/:id/start)
	//         → 서버가 grandi로 NDI 프레임 수신 + WebRTC 브릿지 생성
	//         → WHEP URL을 응답으로 반환
	// 2단계: 브라우저가 WHEP URL로 SDP 교환 → 영상 스트리밍 수신
	const pcRef = useRef<RTCPeerConnection | null>(null);

	const connectNdi = useCallback(async () => {
		setConnectionState("connecting");
		setErrorMessage("");

		if (!ndiSourceId) {
			setErrorMessage("NDI 소스가 선택되지 않았습니다");
			setConnectionState("error");
			return;
		}

		const MEDIA_SERVER_URL =
			(typeof import.meta !== "undefined" && import.meta.env?.VITE_MEDIA_SERVER_URL)
			|| (typeof window !== "undefined" && window.location?.hostname
				? `http://${window.location.hostname}:3200`
				: "http://localhost:3200");

		try {
			// 1단계: media-server에 NDI 수신 시작 요청
			const startRes = await fetch(`${MEDIA_SERVER_URL}/api/sources/${ndiSourceId}/start`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			});

			if (!startRes.ok) {
				throw new Error(`수신 시작 실패: ${startRes.status}`);
			}

			const startData = await startRes.json();
			const whepEndpoint = startData.data?.whepUrl;

			if (!whepEndpoint || !startData.data?.whepAvailable) {
				// WHEP 사용 불가 — 소스 탐색 상태만 표시
				setConnectionState("idle");
				setErrorMessage(
					"NDI 소스가 감지되었으나 WebRTC 스트리밍이 불가합니다. " +
					"media-server에 @roamhq/wrtc가 필요합니다."
				);
				return;
			}

			// 2단계: WHEP SDP 교환
			const pc = new RTCPeerConnection({
				iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			});
			pcRef.current = pc;

			// 트랙 수신 시 <video>에 연결 — 이 영상이 클린 원본
			pc.ontrack = (event) => {
				if (videoRef.current && event.streams[0]) {
					videoRef.current.srcObject = event.streams[0];
					setConnectionState("connected");
				}
			};

			pc.onconnectionstatechange = () => {
				if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
					setConnectionState("error");
					setErrorMessage("NDI WebRTC 연결이 끊겼습니다");
				}
			};

			// 수신 전용 트랜시버 추가
			pc.addTransceiver("video", { direction: "recvonly" });
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			// WHEP POST — SDP Offer 전송
			const whepFullUrl = `${MEDIA_SERVER_URL}${whepEndpoint}`;
			const res = await fetch(whepFullUrl, {
				method: "POST",
				headers: { "Content-Type": "application/sdp" },
				body: offer.sdp,
			});

			if (!res.ok) {
				const errorText = await res.text().catch(() => "");
				throw new Error(`WHEP 서버 응답 오류: ${res.status} ${errorText}`);
			}

			const answerSdp = await res.text();
			await pc.setRemoteDescription({
				type: "answer",
				sdp: answerSdp,
			});

			console.log("[VideoInputLayer] ✅ NDI WHEP 연결 성공");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "NDI 연결 실패";
			setErrorMessage(msg);
			setConnectionState("error");
			console.error("[VideoInputLayer] NDI 오류:", msg);
		}
	}, [ndiSourceId]);

	// ─── 모드 변경 시 자동 연결/해제 ──────────────────────────────
	useEffect(() => {
		// 이전 스트림 정리
		const cleanup = () => {
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((t) => t.stop());
				streamRef.current = null;
			}
			// WebRTC PeerConnection 정리 (NDI WHEP)
			if (pcRef.current) {
				pcRef.current.close();
				pcRef.current = null;
			}
			if (videoRef.current) {
				videoRef.current.srcObject = null;
			}
			setConnectionState("idle");
			setErrorMessage("");
		};

		if (mode === "off") {
			cleanup();
			return;
		}

		if (mode === "uvc") {
			connectUvc();
		} else if (mode === "ndi") {
			connectNdi();
		}

		return cleanup;
	}, [mode, uvcDeviceId, ndiSourceId, connectUvc, connectNdi]);

	// ─── OFF 모드 → 렌더링 안 함 ─────────────────────────────────
	if (mode === "off") {
		return null;
	}

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 0,
				opacity,
				overflow: "hidden",
				borderRadius: "inherit",
			}}
		>
			{/* 비디오 엘리먼트 — 연결됨 상태에서만 표시 */}
			<video
				ref={videoRef}
				autoPlay
				muted
				playsInline
				style={{
					width: "100%",
					height: "100%",
					objectFit: "contain",
					display: connectionState === "connected" ? "block" : "none",
					backgroundColor: "#000",
				}}
			/>

			{/* 상태 표시 오버레이 (연결 전/오류 시) */}
			{connectionState !== "connected" && (
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: "0.5rem",
						backgroundColor: "rgba(0, 0, 0, 0.7)",
						color: "var(--text-secondary)",
					}}
				>
					{connectionState === "connecting" && (
						<>
							<Radio
								size={20}
								style={{ animation: "pulse 1.5s ease-in-out infinite" }}
								color="var(--accent-primary)"
							/>
							<span style={{ fontSize: "0.6875rem" }}>
								{mode === "ndi" ? "NDI" : "UVC"} 연결 중...
							</span>
						</>
					)}

					{connectionState === "error" && (
						<>
							<AlertCircle size={20} color="var(--accent-danger)" />
							<span
								style={{
									fontSize: "0.625rem",
									textAlign: "center",
									padding: "0 1rem",
									lineHeight: 1.4,
								}}
							>
								{errorMessage || "연결 실패"}
							</span>
						</>
					)}

					{connectionState === "idle" && mode === "ndi" && (
						<>
							<CameraOff size={20} color="var(--text-tertiary)" />
							<span style={{ fontSize: "0.625rem", textAlign: "center", padding: "0 0.5rem" }}>
								{errorMessage || "NDI 소스 대기 중"}
							</span>
						</>
					)}
				</div>
			)}

			{/* 연결 상태 뱃지 (항상 표시) */}
			<div
				style={{
					position: "absolute",
					top: "4px",
					right: "4px",
					display: "flex",
					alignItems: "center",
					gap: "0.25rem",
					padding: "2px 6px",
					borderRadius: "4px",
					backgroundColor: "rgba(0, 0, 0, 0.6)",
					fontSize: "0.5625rem",
					color: connectionState === "connected"
						? "var(--accent-success)"
						: connectionState === "error"
							? "var(--accent-danger)"
							: "var(--text-tertiary)",
					zIndex: 1,
				}}
			>
				<Camera size={8} />
				{mode === "ndi" ? "NDI" : "UVC"}
				{connectionState === "connected" && " ●"}
			</div>
		</div>
	);
});

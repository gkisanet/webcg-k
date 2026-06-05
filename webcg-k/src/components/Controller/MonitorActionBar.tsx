/**
 * MonitorActionBar — PVW / PGM 모니터 사이에 위치하는 액션 버튼 패널
 *
 * Why 별도 컴포넌트?
 * - 모니터 중간 영역은 운용자의 시선이 자연스럽게 머무는 곳이므로,
 *   자주 쓰는 제어 버튼(캡쳐, 전환 등)을 한 곳에 모아 UX 개선
 * - PVW/PGM 모니터와 독립적으로 확장 가능 (향후 전환 모드 선택 등)
 *
 * 비유: TV 스위처의 "트랜지션 바" — 좌측(PVW)과 우측(PGM) 사이에서
 *       운용자가 액션을 트리거하는 물리적 버튼 행에 해당
 */

import { useState, useCallback } from "react";
import { Camera, Loader2, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

interface MonitorActionBarProps {
	/** PVW 모니터 내 <video> 엘리먼트 참조 (캡쳐 소스) */
	previewVideoRef: React.RefObject<HTMLVideoElement | null>;
	/** 현재 영상 입력 모드 (off이면 캡쳐 비활성) */
	videoInputMode: "off" | "ndi" | "uvc";
}

type CaptureState = "idle" | "capturing" | "success" | "error";

export function MonitorActionBar({
	previewVideoRef,
	videoInputMode,
}: MonitorActionBarProps) {
	const { user } = useAuth();
	const [captureState, setCaptureState] = useState<CaptureState>("idle");

	/**
	 * 캡쳐 플로우:
	 * 1. <video> → <canvas> drawImage로 현재 프레임 추출
	 * 2. canvas.toBlob()으로 PNG 바이너리 생성
	 * 3. Supabase Storage "images" 버킷에 업로드
	 * 4. DB "images" 테이블에 메타데이터 삽입
	 * → 결과: /dashboard/images 페이지에서 즉시 확인 가능
	 */
	const handleCapture = useCallback(async () => {
		// 1단계: 유효성 검증
		// Why 여러 방어 조건?
		// 영상이 재생 중이 아닌 상태(paused, 0×0 해상도 등)에서
		// drawImage()를 호출하면 빈 검은 이미지가 저장되므로 사전 차단.
		const video = previewVideoRef.current;
		if (!video || !user) return;

		if (video.readyState < 2) {
			// HAVE_CURRENT_DATA 이상이어야 유효한 프레임
			console.warn("[Capture] 영상 준비 안 됨 (readyState:", video.readyState, ")");
			return;
		}

		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (vw === 0 || vh === 0) {
			console.warn("[Capture] 영상 해상도 0×0 — 캡쳐 불가");
			return;
		}

		setCaptureState("capturing");

		try {
			// 2단계: Canvas로 현재 프레임 캡쳐
			const canvas = document.createElement("canvas");
			canvas.width = vw;
			canvas.height = vh;
			const ctx = canvas.getContext("2d")!;
			ctx.drawImage(video, 0, 0, vw, vh);

			// 3단계: PNG Blob 생성
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error("toBlob 실패"))),
					"image/png",
				);
			});

			// 4단계: Supabase Storage 업로드
			const timestamp = Date.now();
			const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
			const fileName = `capture_${dateStr}_${timestamp}.png`;
			const storagePath = `${user.id}/2k/${fileName}`;

			const { error: uploadError } = await supabase.storage
				.from("images")
				.upload(storagePath, blob, {
					cacheControl: "3600",
					upsert: false,
					contentType: "image/png",
				});

			if (uploadError) {
				throw new Error(`Storage 업로드 실패: ${uploadError.message}`);
			}

			// 5단계: DB 메타데이터 저장
			// Why category = "캡쳐"?
			// 기존 카테고리(로고, 배경, 아이콘, 기타)와 별도로 캡쳐 이미지를
			// 필터링할 수 있도록 전용 카테고리 부여.
			const { error: dbError } = await supabase.from("images").insert({
				owner_id: user.id,
				name: `NDI 캡쳐 ${dateStr} ${new Date().toLocaleTimeString("ko-KR")}`,
				description: `${videoInputMode.toUpperCase()} 영상 캡쳐 (${vw}×${vh})`,
				category: "캡쳐",
				storage_path: storagePath,
				storage_path_2k: storagePath,
				file_size: blob.size,
				mime_type: "image/png",
			});

			if (dbError) {
				// DB 실패 시 Storage 정리
				await supabase.storage.from("images").remove([storagePath]);
				throw new Error(`DB 저장 실패: ${dbError.message}`);
			}

			setCaptureState("success");
			console.log(`[Capture] ✅ 캡쳐 저장 완료: ${fileName} (${vw}×${vh})`);

			// 2초 후 상태 초기화
			setTimeout(() => setCaptureState("idle"), 2000);
		} catch (err) {
			console.error("[Capture] ❌ 캡쳐 실패:", err);
			setCaptureState("error");
			setTimeout(() => setCaptureState("idle"), 2000);
		}
	}, [previewVideoRef, user, videoInputMode]);

	const isVideoActive = videoInputMode !== "off";
	const isCapturing = captureState === "capturing";
	const isSuccess = captureState === "success";

	return (
		<div className="monitor-action-bar">
			{/* 캡쳐 버튼 */}
			<button
				type="button"
				className={`monitor-action-btn ${isSuccess ? "success" : ""}`}
				onClick={handleCapture}
				disabled={!isVideoActive || isCapturing}
				title={
					!isVideoActive
						? "영상 입력이 꺼져있습니다"
						: isCapturing
							? "캡쳐 중..."
							: "PVW 영상 캡쳐 → 이미지 탭 저장"
				}
			>
				{isCapturing ? (
					<Loader2 size={16} className="animate-spin" />
				) : isSuccess ? (
					<Check size={16} />
				) : (
					<Camera size={16} />
				)}
			</button>
		</div>
	);
}

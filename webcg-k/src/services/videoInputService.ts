/**
 * Video Input Service
 * NDI 소스 목록 조회 + UVC 장치 열거 + 설정 관리
 *
 * Why 서비스 계층 분리?
 * - media-server REST API 호출과 브라우저 WebRTC/getUserMedia API를
 *   단일 인터페이스로 추상화하여 컴포넌트의 복잡성 감소
 * - 설정 상태를 localStorage에 영속화하여 세션 간 유지
 */

import type {
	NdiSource,
	UvcDevice,
	VideoInputConfig,
	MediaServerStatus,
} from "../lib/types/videoInput";

// ■ Why 자동 추론?
//   브라우저가 172.30.64.201:3000(WSL IP)으로 접속했다면,
//   media-server도 같은 호스트(172.30.64.201:3200)에서 돌고 있을 가능성이 높음.
//   localhost:3200은 Windows 브라우저에서 WSL의 media-server에 도달 불가.
//   → 현재 hostname을 기반으로 자동 추론하되, 환경변수로 오버라이드 가능.
const MEDIA_SERVER_URL = (() => {
	// 1순위: 환경변수 명시
	if (typeof import.meta !== "undefined" && import.meta.env?.VITE_MEDIA_SERVER_URL) {
		return import.meta.env.VITE_MEDIA_SERVER_URL;
	}
	// 2순위: 브라우저 hostname 기반 자동 추론 (같은 호스트, 포트 3100)
	if (typeof window !== "undefined" && window.location?.hostname) {
		return `http://${window.location.hostname}:3200`;
	}
	// 3순위: SSR / 테스트 환경 fallback
	return "http://localhost:3200";
})();

const STORAGE_KEY = "webcg-k-video-input-config";

// ─── 설정 관리 (localStorage 영속화) ────────────────────────────────

/** 영상 입력 설정 불러오기 */
export function loadVideoInputConfig(): VideoInputConfig {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch {
		// localStorage 접근 실패 (SSR 등) — 기본값 반환
	}
	return { mode: "off", opacity: 1.0 };
}

/** 영상 입력 설정 저장 */
export function saveVideoInputConfig(config: VideoInputConfig): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// 무시
	}
}

// ─── media-server 상태 확인 ─────────────────────────────────────────

/** media-server 연결 상태 확인 */
export async function checkMediaServerHealth(): Promise<MediaServerStatus> {
	try {
		const res = await fetch(`${MEDIA_SERVER_URL}/api/health`, {
			signal: AbortSignal.timeout(2000),
		});

		if (!res.ok) {
			return { connected: false, ndiAvailable: false };
		}

		const data = await res.json();
		return {
			connected: true,
			ndiAvailable: data.ndiAvailable ?? false,
			ndiVersion: data.ndiVersion,
			uptime: data.uptime,
		};
	} catch {
		return { connected: false, ndiAvailable: false };
	}
}

// ─── NDI 소스 관리 ──────────────────────────────────────────────────

/** NDI 소스 목록 조회 (media-server 경유) */
export async function fetchNdiSources(): Promise<NdiSource[]> {
	try {
		const res = await fetch(`${MEDIA_SERVER_URL}/api/sources`, {
			signal: AbortSignal.timeout(3000),
		});

		if (!res.ok) return [];

		const data = await res.json();
		return data.data?.sources ?? [];
	} catch {
		return [];
	}
}

/** NDI 소스 재탐색 요청 */
export async function refreshNdiSources(): Promise<NdiSource[]> {
	try {
		const res = await fetch(`${MEDIA_SERVER_URL}/api/sources/refresh`, {
			method: "POST",
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) return [];

		const data = await res.json();
		return data.data?.sources ?? [];
	} catch {
		return [];
	}
}

/** NDI 소스 수신 시작 */
export async function startNdiReceiver(sourceId: string): Promise<boolean> {
	try {
		const res = await fetch(`${MEDIA_SERVER_URL}/api/sources/${sourceId}/start`, {
			method: "POST",
		});
		const data = await res.json();
		return data.success;
	} catch {
		return false;
	}
}

/** NDI 소스 수신 중단 */
export async function stopNdiReceiver(sourceId: string): Promise<void> {
	try {
		await fetch(`${MEDIA_SERVER_URL}/api/sources/${sourceId}/stop`, {
			method: "POST",
		});
	} catch {
		// 무시
	}
}

// ─── UVC 장치 열거 ──────────────────────────────────────────────────

/** UVC(웹캠/캡처 카드) 장치 목록 조회 */
export async function listUvcDevices(): Promise<UvcDevice[]> {
	try {
		// Why 먼저 getUserMedia를 호출?
		// 브라우저 정책상 enumerateDevices()는 카메라 권한 획득 후에만
		// 정확한 label을 반환합니다. 권한 없으면 빈 label이 됨.
		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		// 즉시 트랙 해제 (목록 조회용이므로 카메라 점유 불필요)
		stream.getTracks().forEach((t) => t.stop());

		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === "videoinput")
			.map((d) => ({
				deviceId: d.deviceId,
				label: d.label || `카메라 ${d.deviceId.slice(0, 6)}`,
			}));
	} catch (err) {
		console.warn("[VideoInput] UVC 장치 열거 실패:", err);
		return [];
	}
}

/**
 * UVC 장치로부터 MediaStream 획득
 * @param deviceId 특정 장치 ID (없으면 기본 카메라)
 */
export async function openUvcStream(deviceId?: string): Promise<MediaStream | null> {
	try {
		const constraints: MediaStreamConstraints = {
			video: deviceId
				? { deviceId: { exact: deviceId } }
				: true,
			audio: false,
		};
		return await navigator.mediaDevices.getUserMedia(constraints);
	} catch (err) {
		console.error("[VideoInput] UVC 스트림 열기 실패:", err);
		return null;
	}
}

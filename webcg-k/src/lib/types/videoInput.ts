/**
 * 영상 입력 타입 정의
 * PVW/PGM 모니터의 SDI/NDI/UVC 배경 영상 레이어 관련
 */

/** 영상 입력 모드 */
export type VideoInputMode = "off" | "ndi" | "uvc";

/** NDI 네트워크 소스 정보 */
export interface NdiSource {
	/** URL 기반 고유 ID */
	id: string;
	/** 소스 이름 (e.g. "CAMERA-1 (Studio A)") */
	name: string;
	/** NDI URL 주소 (e.g. "192.168.1.100:5961") */
	urlAddress: string;
	/** 소스 타입 */
	type: "ndi";
}

/** UVC(USB Video Class) 장치 정보 */
export interface UvcDevice {
	/** MediaDeviceInfo.deviceId */
	deviceId: string;
	/** 장치 이름 */
	label: string;
}

/** 영상 입력 설정 (전역 상태) */
export interface VideoInputConfig {
	/** 영상 입력 모드: off / ndi / uvc */
	mode: VideoInputMode;
	/** NDI 모드: 선택된 소스 ID */
	ndiSourceId?: string;
	/** NDI 모드: 선택된 소스 이름 (UI 표시용) */
	ndiSourceName?: string;
	/** UVC 모드: 선택된 장치 ID */
	uvcDeviceId?: string;
	/** UVC 모드: 선택된 장치 이름 */
	uvcDeviceLabel?: string;
	/** 배경 불투명도 (0~1) */
	opacity: number;
}

/** media-server 연결 상태 */
export interface MediaServerStatus {
	connected: boolean;
	ndiAvailable: boolean;
	ndiVersion?: string;
	uptime?: number;
}

/** 기본 영상 입력 설정 */
export const DEFAULT_VIDEO_INPUT_CONFIG: VideoInputConfig = {
	mode: "off",
	opacity: 1.0,
};

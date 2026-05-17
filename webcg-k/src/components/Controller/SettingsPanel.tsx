/**
 * Settings Panel Component
 * Fade duration + 영상 입력(SDI/NDI/UVC) 설정 — 헤더 버튼 + 드롭다운 방식
 *
 * Why 영상 입력 설정을 여기에?
 * - 기존 설정 패널(Fade 시간)과 함께 한 곳에서 방송 매개변수를 일괄 관리
 * - 운용자가 송출 중에도 빠르게 영상 입력을 ON/OFF 전환 가능
 */

import { useStore } from "@tanstack/react-store";
import { Settings, X, Camera, CameraOff, RefreshCw, Monitor } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { setFadeDuration, timelineStore } from "../../stores/timelineStore";
import type { VideoInputConfig, VideoInputMode, NdiSource, UvcDevice } from "../../lib/types/videoInput";
import {
	loadVideoInputConfig,
	saveVideoInputConfig,
	fetchNdiSources,
	refreshNdiSources,
	checkMediaServerHealth,
	listUvcDevices,
} from "../../services/videoInputService";

export function SettingsButton() {
	const [isOpen, setIsOpen] = useState(false);
	const fadeDuration = useStore(timelineStore, (state) => state.fadeDuration);
	const panelRef = useRef<HTMLDivElement>(null);

	// ─── 영상 입력 상태 ──────────────────────────────────────────
	const [videoInput, setVideoInput] = useState<VideoInputConfig>(() => loadVideoInputConfig());
	const [ndiSources, setNdiSources] = useState<NdiSource[]>([]);
	const [uvcDevices, setUvcDevices] = useState<UvcDevice[]>([]);
	const [mediaServerConnected, setMediaServerConnected] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const handleDurationChange = (value: number) => {
		setFadeDuration(value);
	};

	// 영상 입력 설정 변경 시 저장 + 이벤트 발행
	const updateVideoInput = useCallback((updates: Partial<VideoInputConfig>) => {
		setVideoInput((prev) => {
			const updated = { ...prev, ...updates };
			saveVideoInputConfig(updated);
			// 같은 탭 내 모니터 컴포넌트에 변경 알림
			window.dispatchEvent(new Event("videoInputConfigChanged"));
			return updated;
		});
	}, []);

	// 패널 열릴 때 초기 데이터 로드
	useEffect(() => {
		if (!isOpen) return;

		// media-server 상태 확인
		checkMediaServerHealth().then((status) => {
			setMediaServerConnected(status.connected);
			if (status.connected && status.ndiAvailable) {
				fetchNdiSources().then(setNdiSources);
			}
		});
	}, [isOpen]);

	// NDI 소스 새로고침
	const handleRefreshNdi = async () => {
		setIsRefreshing(true);
		try {
			const sources = await refreshNdiSources();
			setNdiSources(sources);
		} finally {
			setIsRefreshing(false);
		}
	};

	// UVC 장치 목록 로드
	const handleLoadUvcDevices = async () => {
		const devices = await listUvcDevices();
		setUvcDevices(devices);
	};

	// 외부 클릭 시 패널 닫기
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				panelRef.current &&
				!panelRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		}
		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	return (
		<div style={{ position: "relative" }} ref={panelRef}>
			<Button
				variant="secondary"
				onClick={() => setIsOpen(!isOpen)}
				style={{
					padding: "0.375rem 0.75rem",
					fontSize: "0.75rem",
					display: "flex",
					alignItems: "center",
					gap: "0.25rem",
				}}
			>
				<Settings className="w-4 h-4" />
				설정
			</Button>

			{isOpen && (
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
						boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
						zIndex: 9999,
						maxHeight: "80vh",
						overflowY: "auto",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: "1rem",
						}}
					>
						<h3 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
							⚙️ 설정
						</h3>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setIsOpen(false)}
						>
							<X className="w-4 h-4" />
						</Button>
					</div>

					{/* Fade Duration */}
					<div style={{ marginBottom: "1rem" }}>
						<label
							style={{
								display: "block",
								fontSize: "0.75rem",
								marginBottom: "0.5rem",
								color: "var(--text-secondary)",
							}}
						>
							Fade 애니메이션 시간
						</label>
						<div
							style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
						>
							<Slider
								min={100}
								max={2000}
								step={50}
								value={[fadeDuration]}
								onValueChange={(v) => handleDurationChange(v[0])}
								className="flex-1"
							/>
							<span
								style={{
									minWidth: "60px",
									textAlign: "right",
									fontSize: "0.875rem",
									fontVariantNumeric: "tabular-nums",
								}}
							>
								{fadeDuration}ms
							</span>
						</div>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: "0.625rem",
								color: "var(--text-tertiary)",
								marginTop: "0.25rem",
							}}
						>
							<span>빠름 (100ms)</span>
							<span>느림 (2000ms)</span>
						</div>
					</div>

					{/* Quick Presets */}
					<div style={{ marginBottom: "1.25rem" }}>
						<label
							style={{
								display: "block",
								fontSize: "0.75rem",
								marginBottom: "0.5rem",
								color: "var(--text-secondary)",
							}}
						>
							프리셋
						</label>
						<div style={{ display: "flex", gap: "0.5rem" }}>
							{[
								{ label: "빠름", value: 200 },
								{ label: "보통", value: 500 },
								{ label: "느림", value: 800 },
								{ label: "매우 느림", value: 1500 },
							].map((preset) => (
								<Button
									key={preset.value}
									variant={fadeDuration === preset.value ? "default" : "secondary"}
									size="sm"
									className="flex-1 text-[0.625rem]"
									onClick={() => handleDurationChange(preset.value)}
								>
									{preset.label}
								</Button>
							))}
						</div>
					</div>

					{/* ─── 📹 영상 입력 설정 ─────────────────────────── */}
					<div
						style={{
							borderTop: "1px solid var(--border-default)",
							paddingTop: "1rem",
						}}
					>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: "0.375rem",
								fontSize: "0.75rem",
								marginBottom: "0.75rem",
								color: "var(--text-secondary)",
								fontWeight: 600,
							}}
						>
							<Camera size={14} />
							영상 입력
						</label>

						{/* 모드 선택 */}
						<div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.75rem" }}>
							{([
								{ mode: "off" as VideoInputMode, label: "OFF", icon: <CameraOff size={12} /> },
								{ mode: "ndi" as VideoInputMode, label: "NDI", icon: <Monitor size={12} /> },
								{ mode: "uvc" as VideoInputMode, label: "UVC", icon: <Camera size={12} /> },
							]).map(({ mode, label, icon }) => (
								<Button
									key={mode}
									variant={videoInput.mode === mode ? "default" : "secondary"}
									size="sm"
									className="flex-1"
									style={{
										fontSize: "0.6875rem",
										display: "flex",
										alignItems: "center",
										gap: "0.25rem",
									}}
									onClick={() => {
										updateVideoInput({ mode });
										if (mode === "uvc") handleLoadUvcDevices();
									}}
								>
									{icon}
									{label}
								</Button>
							))}
						</div>

						{/* NDI 모드 설정 */}
						{videoInput.mode === "ndi" && (
							<div style={{ marginBottom: "0.75rem" }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
										marginBottom: "0.375rem",
									}}
								>
									<select
										value={videoInput.ndiSourceId || ""}
										onChange={(e) => {
											const source = ndiSources.find((s) => s.id === e.target.value);
											updateVideoInput({
												ndiSourceId: e.target.value || undefined,
												ndiSourceName: source?.name,
											});
										}}
										style={{
											flex: 1,
											padding: "0.375rem 0.5rem",
											fontSize: "0.6875rem",
											borderRadius: "6px",
											border: "1px solid var(--border-default)",
											backgroundColor: "var(--app-bg-muted)",
											color: "var(--text-primary)",
										}}
									>
										<option value="">NDI 소스 선택...</option>
										{ndiSources.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
											</option>
										))}
									</select>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={handleRefreshNdi}
										disabled={isRefreshing}
										title="NDI 소스 새로고침"
									>
										<RefreshCw
											size={12}
											style={{
												animation: isRefreshing ? "spin 1s linear infinite" : "none",
											}}
										/>
									</Button>
								</div>

								{/* media-server 연결 상태 */}
								<div
									style={{
										fontSize: "0.5625rem",
										color: mediaServerConnected
											? "var(--accent-success)"
											: "var(--text-tertiary)",
										display: "flex",
										alignItems: "center",
										gap: "0.25rem",
									}}
								>
									<span
										style={{
											width: "6px",
											height: "6px",
											borderRadius: "50%",
											backgroundColor: mediaServerConnected
												? "var(--accent-success)"
												: "var(--text-tertiary)",
											display: "inline-block",
										}}
									/>
									{mediaServerConnected
										? "media-server 연결됨"
										: "media-server 미연결 (localhost:3200)"}
								</div>
							</div>
						)}

						{/* UVC 모드 설정 */}
						{videoInput.mode === "uvc" && (
							<div style={{ marginBottom: "0.75rem" }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
									}}
								>
									<select
										value={videoInput.uvcDeviceId || ""}
										onChange={(e) => {
											const device = uvcDevices.find((d) => d.deviceId === e.target.value);
											updateVideoInput({
												uvcDeviceId: e.target.value || undefined,
												uvcDeviceLabel: device?.label,
											});
										}}
										style={{
											flex: 1,
											padding: "0.375rem 0.5rem",
											fontSize: "0.6875rem",
											borderRadius: "6px",
											border: "1px solid var(--border-default)",
											backgroundColor: "var(--app-bg-muted)",
											color: "var(--text-primary)",
										}}
									>
										<option value="">카메라/캡처 장치 선택...</option>
										{uvcDevices.map((d) => (
											<option key={d.deviceId} value={d.deviceId}>
												{d.label}
											</option>
										))}
									</select>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={handleLoadUvcDevices}
										title="장치 새로고침"
									>
										<RefreshCw size={12} />
									</Button>
								</div>
								{uvcDevices.length === 0 && (
									<div style={{ fontSize: "0.5625rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
										장치를 선택하면 카메라 권한을 요청합니다
									</div>
								)}
							</div>
						)}

						{/* 배경 불투명도 */}
						{videoInput.mode !== "off" && (
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.6875rem",
										marginBottom: "0.375rem",
										color: "var(--text-tertiary)",
									}}
								>
									배경 불투명도
								</label>
								<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
									<Slider
										min={0}
										max={100}
										step={5}
										value={[Math.round(videoInput.opacity * 100)]}
										onValueChange={(v) =>
											updateVideoInput({ opacity: v[0] / 100 })
										}
										className="flex-1"
									/>
									<span
										style={{
											minWidth: "35px",
											textAlign: "right",
											fontSize: "0.75rem",
											fontVariantNumeric: "tabular-nums",
											color: "var(--text-secondary)",
										}}
									>
										{Math.round(videoInput.opacity * 100)}%
									</span>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// 기존 export 유지 (호환성)
export { SettingsButton as SettingsPanel };


/**
 * 오버레이 플러그인 에디터 라우트 (풀 페이지)
 *
 * URL: /dashboard/overlays/editor/$pluginId
 * - new: 새 플러그인 생성
 * - UUID: 기존 플러그인 편집
 *
 * ■ 아키텍처:
 *   이 페이지는 NodeCG Bundle의 "개발자 워크벤치" 역할.
 *   Monaco 코드 에디터 + iframe 프리뷰 + 대시보드 패널을
 *   통합하여 플러그인을 개발/테스트/저장한다.
 *
 * ■ Why 풀 페이지?
 *   코드 에디터는 화면 공간이 최대한 필요.
 *   사이드바가 있으면 Monaco + 프리뷰가 비좁아진다.
 *   대시보드 레이아웃 안에 있지만 사이드바를 숨기는 방식.
 *
 * ■ Why 글로벌 설정을 커맨드 팔레트로?
 *   비유: VS Code의 Ctrl+Shift+P 커맨드 팔레트.
 *   제목, 레이어, 애니메이션 등 "코딩 중에 가끔 바꾸는 설정"을
 *   별도 모달/탭 없이 인라인 커맨드 팔레트로 빠르게 변경.
 *   코딩 흐름을 끊지 않으면서 메타데이터에 접근 가능.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ArrowLeft,
	ChevronDown,
	Command,
	Layers,
	Loader2,
	Settings,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth";
import { PluginEditor } from "../../../../components/Overlay/PluginEditor";
import type {
	PluginSourceCode,
	DashboardSchema,
} from "../../../../lib/overlayTypes";

import "./pluginEditor.css";

export const Route = createFileRoute("/dashboard/studio/overlays/editor/$pluginId")({
	component: PluginEditorPage,
});

// ─── 애니메이션 타입 상수 ────────────────────────────────────────
const ANIMATION_TYPES = ["fade", "slide", "scale", "none"] as const;

function PluginEditorPage() {
	const { pluginId } = Route.useParams();
	const navigate = useNavigate();
	const { user } = useAuth();

	const isNew = pluginId === "new";
	const [loading, setLoading] = useState(!isNew);
	const [saving, setSaving] = useState(false);
	const [saveFlash, setSaveFlash] = useState(false);

	// ─── 플러그인 메타데이터 ───
	const [pluginName, setPluginName] = useState(isNew ? "새 플러그인" : "");
	const [description, setDescription] = useState("");
	const [layer, setLayer] = useState(2);
	const [isPublic, setIsPublic] = useState(false);
	const [animConfig, setAnimConfig] = useState({
		in_type: "fade",
		in_duration: 500,
		out_type: "fade",
		out_duration: 300,
	});

	// ─── 코드 에디터 데이터 ───
	const [initialCode, setInitialCode] = useState<PluginSourceCode | undefined>();
	const [initialSchema, setInitialSchema] = useState<DashboardSchema | null>(null);
	const [initialDefaults, setInitialDefaults] = useState<Record<string, unknown> | null>(null);

	// ─── 커맨드 팔레트 (글로벌 설정) ───
	// ■ Why 커맨드 팔레트?
	//   VS Code의 Ctrl+Shift+P처럼, 코딩 중 설정을 빠르게 변경.
	//   별도 페이지/모달 없이 오버레이로 설정 접근.
	const [showPalette, setShowPalette] = useState(false);
	const paletteRef = useRef<HTMLDivElement>(null);

	// ─── 사이드바 숨기기 (풀 페이지) ───
	// ■ Why?
	//   dashboard.tsx 레이아웃은 Sidebar + Outlet.
	//   에디터 진입 시 Sidebar를 CSS로 숨겨서 풀 화면 확보.
	//   에디터 퇴장 시 복원.
	useEffect(() => {
		const sidebar = document.querySelector(".sidebar") as HTMLElement;
		const content = document.querySelector(".dashboard-content") as HTMLElement;
		if (sidebar) sidebar.style.display = "none";
		if (content) {
			content.style.marginLeft = "0";
			content.style.width = "100%";
		}
		return () => {
			if (sidebar) sidebar.style.display = "";
			if (content) {
				content.style.marginLeft = "";
				content.style.width = "";
			}
		};
	}, []);

	// 기존 플러그인 로드
	useEffect(() => {
		if (isNew) return;

		const loadPlugin = async () => {
			try {
				const { data, error } = await supabase
					.from("overlay_templates" as any)
					.select("*")
					.eq("id", pluginId)
					.single();

				if (error) throw error;
				const row = data as any;
				if (row) {
					setPluginName(row.name || "");
					setDescription(row.description || "");
					setLayer(row.layer || 2);
					setIsPublic(row.is_public || false);
					setInitialCode(row.source_code || undefined);
					setInitialSchema(row.dashboard_schema || null);
					setInitialDefaults(row.replicant_defaults || null);
					if (row.animation_config) {
						setAnimConfig({
							in_type: row.animation_config.in?.type || "fade",
							in_duration: row.animation_config.in?.duration || 500,
							out_type: row.animation_config.out?.type || "fade",
							out_duration: row.animation_config.out?.duration || 300,
						});
					}
				}
			} catch (err) {
				console.error("플러그인 로드 실패:", err);
			} finally {
				setLoading(false);
			}
		};

		loadPlugin();
	}, [pluginId, isNew]);

	// 커맨드 팔레트 외부 클릭 닫기
	useEffect(() => {
		if (!showPalette) return;
		const handler = (e: MouseEvent) => {
			if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
				setShowPalette(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showPalette]);

	// Ctrl+Shift+P 커맨드 팔레트 단축키
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
				e.preventDefault();
				setShowPalette((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	// 저장 핸들러
	const handleSave = useCallback(
		async (
			code: PluginSourceCode,
			schema: DashboardSchema | null,
			defaults: Record<string, unknown>,
			isSaveAs?: boolean
		) => {
			if (!user) return;
			setSaving(true);

			try {
				const finalName = isSaveAs ? `${pluginName || "새 플러그인"} (복사본)` : (pluginName || "새 플러그인");
				
				const payload: Record<string, unknown> = {
					name: finalName,
					description: description || null,
					plugin_type: "html",
					source_code: code,
					dashboard_schema: schema,
					replicant_defaults: defaults,
					graphic_data: [],
					layer,
					is_public: isPublic,
					animation_config: {
						in: { type: animConfig.in_type, duration: animConfig.in_duration },
						out: { type: animConfig.out_type, duration: animConfig.out_duration },
					},
					updated_at: new Date().toISOString(),
				};

				if (isNew || isSaveAs) {
					payload.owner_id = user.id;
					payload.source_type = "manual";

					const { data, error } = await supabase
						.from("overlay_templates" as any)
						.insert(payload as any)
						.select("id")
						.single();

					if (error) throw error;

					const row = data as any;
					if (row?.id) {
						if (isSaveAs) setPluginName(finalName);
						navigate({
							to: "/dashboard/studio/overlays/editor/$pluginId" as any,
							params: { pluginId: row.id } as any,
							replace: true,
						});
					}
				} else {
					const { error } = await supabase
						.from("overlay_templates" as any)
						.update(payload as any)
						.eq("id", pluginId);

					if (error) throw error;
				}

				// 저장 성공 플래시
				setSaveFlash(true);
				setTimeout(() => setSaveFlash(false), 1500);
				console.log("[PluginEditor] 저장 완료");
			} catch (err) {
				console.error("플러그인 저장 실패:", err);
				alert("저장에 실패했습니다.");
			} finally {
				setSaving(false);
			}
		},
		[pluginId, pluginName, description, layer, isPublic, animConfig, isNew, user, navigate],
	);

	if (loading) {
		return (
			<div className="pe-loading">
				<Loader2 size={24} className="animate-spin" />
			</div>
		);
	}

	return (
		<div className="pe-fullpage">
			{/* ─── 상단 바 (글래스모피즘) ─── */}
			<header className="pe-header">
				<div className="pe-header-left">
					<Button
						variant="ghost"
						size="sm"
						className="pe-back-btn"
						onClick={() =>
							navigate({ to: "/dashboard/studio/overlays" as any })
						}
					>
						<ArrowLeft size={14} />
					</Button>

					{/* 인라인 제목 편집 */}
					<div className="pe-title-group">
						<input
							type="text"
							className="pe-title-input"
							value={pluginName}
							onChange={(e) => setPluginName(e.target.value)}
							placeholder="플러그인 이름"
						/>
						<span className="pe-plugin-badge">HTML Plugin</span>
					</div>
				</div>

				<div className="pe-header-right">
					{/* 저장 상태 */}
					{saving && (
						<Loader2
							size={14}
							className="animate-spin"
							style={{ color: "var(--text-tertiary)" }}
						/>
					)}
					{saveFlash && (
						<span className="pe-save-flash">✓ 저장됨</span>
					)}

					{/* 커맨드 팔레트 트리거 */}
					{/* ■ Why 이 버튼?
					     제목/레이어/애니메이션 등 글로벌 설정을
					     별도 페이지 없이 커맨드 팔레트로 빠르게 변경.
					     VS Code의 설정 기어 아이콘과 같은 역할. */}
					<button
						className="pe-settings-btn"
						onClick={() => setShowPalette(!showPalette)}
						title="설정 (Ctrl+Shift+P)"
					>
						<Settings size={14} />
						설정
						<ChevronDown size={12} />
					</button>

					<span className="pe-shortcut-hint">
						<Command size={10} />
						Ctrl+S 저장
					</span>
				</div>
			</header>

			{/* ─── 커맨드 팔레트 (글로벌 설정 오버레이) ─── */}
			{/* ■ Why 커맨드 팔레트?
			     비유: VS Code의 Ctrl+Shift+P.
			     제목, 설명, 레이어, 공개 여부, 애니메이션 설정을
			     코딩 흐름을 끊지 않고 인라인으로 변경.
			     모달보다 가볍고, 별도 탭보다 접근성이 좋다. */}
			{showPalette && (
				<div className="pe-palette-backdrop" onClick={() => setShowPalette(false)}>
					<div
						ref={paletteRef}
						className="pe-palette"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="pe-palette-header">
							<Settings size={14} />
							<span>플러그인 설정</span>
							<button
								className="pe-palette-close"
								onClick={() => setShowPalette(false)}
							>
								<X size={14} />
							</button>
						</div>
						<div className="pe-palette-body">
							{/* 이름 */}
							<div className="pe-palette-field">
								<label>이름</label>
								<input
									type="text"
									value={pluginName}
									onChange={(e) => setPluginName(e.target.value)}
									placeholder="플러그인 이름"
								/>
							</div>
							{/* 설명 */}
							<div className="pe-palette-field">
								<label>설명</label>
								<input
									type="text"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="선택사항"
								/>
							</div>
							{/* 레이어 + 공개 */}
							<div className="pe-palette-row">
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>레이어</label>
									<input
										type="number"
										value={layer}
										onChange={(e) => setLayer(parseInt(e.target.value, 10) || 2)}
										min={1}
										max={10}
									/>
								</div>
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>공개</label>
									<button
										className={`pe-toggle ${isPublic ? "on" : ""}`}
										onClick={() => setIsPublic(!isPublic)}
									>
										{isPublic ? "ON" : "OFF"}
									</button>
								</div>
							</div>
							{/* 애니메이션 */}
							<div className="pe-palette-divider" />
							<div className="pe-palette-section-title">
								<Layers size={12} /> 애니메이션
							</div>
							<div className="pe-palette-row">
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>IN 타입</label>
									<select
										value={animConfig.in_type}
										onChange={(e) =>
											setAnimConfig((p) => ({ ...p, in_type: e.target.value }))
										}
									>
										{ANIMATION_TYPES.map((t) => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
								</div>
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>IN 시간(ms)</label>
									<input
										type="number"
										value={animConfig.in_duration}
										onChange={(e) =>
											setAnimConfig((p) => ({
												...p,
												in_duration: parseInt(e.target.value, 10) || 500,
											}))
										}
									/>
								</div>
							</div>
							<div className="pe-palette-row">
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>OUT 타입</label>
									<select
										value={animConfig.out_type}
										onChange={(e) =>
											setAnimConfig((p) => ({ ...p, out_type: e.target.value }))
										}
									>
										{ANIMATION_TYPES.map((t) => (
											<option key={t} value={t}>
												{t}
											</option>
										))}
									</select>
								</div>
								<div className="pe-palette-field" style={{ flex: 1 }}>
									<label>OUT 시간(ms)</label>
									<input
										type="number"
										value={animConfig.out_duration}
										onChange={(e) =>
											setAnimConfig((p) => ({
												...p,
												out_duration: parseInt(e.target.value, 10) || 300,
											}))
										}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ─── 에디터 본문 ─── */}
			<div className="pe-body">
				<PluginEditor
					initialCode={initialCode}
					initialSchema={initialSchema}
					initialDefaults={initialDefaults}
					onSave={handleSave}
				/>
			</div>
		</div>
	);
}

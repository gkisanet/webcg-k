/**
 * @deprecated CompositorLayer로 통합됨.
 * 이 파일은 더 이상 사용되지 않으며, 안정화 후 삭제 예정.
 *
 * PluginOverlayLayer — HTML 플러그인을 iframe으로 렌더링하는 레이어
 *
 * ■ 역할:
 *   plugin_type === "html"인 오버레이를 sandboxed iframe에서 실행.
 *   Supabase Realtime으로 replicant_data 변경을 감지하여
 *   postMessage로 플러그인 코드에 데이터를 전달한다.
 *
 * ■ 아키텍처:
 *   overlay_state (DB)
 *     ↓ Realtime postgres_changes
 *   PluginOverlayLayer (이 컴포넌트)
 *     ↓ postMessage
 *   iframe (webcgk-api.js → onData callback)
 *     ↓ DOM 업데이트
 *   사용자에게 보이는 그래픽
 *
 * ■ Why iframe?
 *   플러그인 코드는 사용자가 작성한 임의의 HTML/CSS/JS.
 *   React 컴포넌트 트리와 격리해야 안전하고,
 *   CSS 충돌도 방지할 수 있다.
 *
 * ■ PVW/PGM 워크플로우 (2026-05-01):
 *   mode="preview" → animation_state="preview" OR is_active=true인 것 표시 (PVW 모니터)
 *   mode="program" → is_active=true인 것만 표시 (렌더러/OBS)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

// ─── 타입 ─────────────────────────────────────────────────────
interface PluginOverlay {
	id: string;
	template_id: string;
	is_active: boolean;
	animation_state: string;
	replicant_data: Record<string, unknown> | null;
	template: {
		id: string;
		name: string;
		layer: number;
		plugin_type: string;
		source_code: { html: string; css: string; js: string } | null;
		animation_config: any;
		zone_bounds?: { x: number; y: number; width: number; height: number };
	} | null;
}

interface PluginOverlayLayerProps {
	sessionId: string;
	/** ■ PVW/PGM 분리:
	 *   "preview" → PVW 모니터 (animation_state="preview" 또는 is_active=true)
	 *   "program" → 렌더러/OBS (is_active=true만)
	 *   기본값 "program" (기존 동작 유지) */
	mode?: "preview" | "program";
}

// ─── webcgk-api 인라인 코드 ───────────────────────────────────
// iframe sandbox에서는 외부 스크립트를 로드할 수 없으므로
// API 코드를 문자열로 직접 주입한다.
const WEBCGK_API_INLINE = `
(function() {
  var _data = {}, _listeners = { data: [], show: [], hide: [], ready: [] }, _isVisible = false;
  window.webcgk = {
    onData: function(cb) { if (typeof cb === "function") { _listeners.data.push(cb); if (Object.keys(_data).length > 0) cb(_data); } },
    onShow: function(cb) { if (typeof cb === "function") _listeners.show.push(cb); },
    onHide: function(cb) { if (typeof cb === "function") _listeners.hide.push(cb); },
    onReady: function(cb) { if (typeof cb === "function") _listeners.ready.push(cb); },
    getData: function() { return _data; },
    isVisible: function() { return _isVisible; },
    sendToParent: function(type, payload) { try { window.parent.postMessage({ source: "webcgk-plugin", type: type, payload: payload }, "*"); } catch(e) {} }
  };
  window.addEventListener("message", function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "REPLICANT_UPDATE") {
      _data = msg.payload || {};
      _listeners.data.forEach(function(cb) { try { cb(_data); } catch(e) { console.error("[webcgk]", e); } });
    } else if (msg.type === "SHOW") {
      _isVisible = true;
      _listeners.show.forEach(function(cb) { try { cb(); } catch(e) {} });
    } else if (msg.type === "HIDE") {
      _isVisible = false;
      _listeners.hide.forEach(function(cb) { try { cb(); } catch(e) {} });
    } else if (msg.type === "INIT") {
      if (msg.payload) { _data = msg.payload; _listeners.data.forEach(function(cb) { try { cb(_data); } catch(e) {} }); }
      _listeners.ready.forEach(function(cb) { try { cb(); } catch(e) {} });
    }
  });
  try { window.parent.postMessage({ source: "webcgk-plugin", type: "PLUGIN_READY" }, "*"); } catch(e) {}
})();
`;

// ─── 컴포넌트 ─────────────────────────────────────────────────
export function PluginOverlayLayer({ sessionId, mode = "program" }: PluginOverlayLayerProps) {
	const [overlays, setOverlays] = useState<PluginOverlay[]>([]);

	// plugin_type=html인 오버레이만 로드
	const loadPluginOverlays = useCallback(async () => {
		try {
			const { data, error } = (await supabase
				.from("overlay_state" as any)
				.select("*, template:overlay_templates(*)")
				.eq("session_id", sessionId)) as any;

			if (error) throw error;

			// plugin_type === "html"인 것만 필터링
			const htmlPlugins = (data || []).filter(
				(item: any) => item.template?.plugin_type === "html",
			);
			setOverlays(htmlPlugins);
		} catch (err) {
			console.error("[PluginOverlayLayer] 로드 실패:", err);
		}
	}, [sessionId]);

	// 초기 로드
	useEffect(() => {
		loadPluginOverlays();
	}, [loadPluginOverlays]);

	// Realtime 구독 — overlay_state 변경 감지
	// ■ Why 채널명에 mode + Math.random()?
	//   PVW/PGM/render에서 동시에 PluginOverlayLayer를 마운트.
	//   같은 채널명이면 한 곳에서 unsubscribe 시 다른 곳도 끊김.
	//   각 인스턴스별 고유 채널명으로 독립 구독.
	useEffect(() => {
		const channelId = `plugin-overlay-${mode}:${sessionId}:${Math.random().toString(36).slice(2, 8)}`;
		const channel = supabase
			.channel(channelId)
			.on(
				"postgres_changes" as any,
				{
					event: "*",
					schema: "public",
					table: "overlay_state",
					filter: `session_id=eq.${sessionId}`,
				},
				() => {
					loadPluginOverlays();
				},
			)
			.subscribe();

		return () => {
			channel.unsubscribe();
		};
	}, [sessionId, loadPluginOverlays]);

	// ■ PVW/PGM 모드별 필터링
	// preview: animation_state="preview"(PVW 전용) 또는 is_active=true(PGM 상태)인 것 모두 표시
	// program: is_active=true인 것만 표시 (실제 OBS 송출)
	const visibleOverlays = overlays.filter((o) => {
		if (mode === "preview") {
			return o.animation_state === "preview" || o.is_active;
		}
		return o.is_active;
	});

	if (visibleOverlays.length === 0) return null;

	return (
		<>
			{visibleOverlays.map((overlay) => (
				<PluginIframeLayer key={overlay.id} overlay={overlay} />
			))}
		</>
	);
}

// ─── 개별 플러그인 iframe 레이어 ─────────────────────────────────
const BASE_W = 1920;
const BASE_H = 1080;

function PluginIframeLayer({ overlay }: { overlay: PluginOverlay }) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [phase, setPhase] = useState<"entering" | "stable" | "leaving">(
		"entering",
	);
	// ■ ResizeObserver로 컨테이너 크기 대비 scale 계산
	const [scale, setScale] = useState(1);

	const tpl = overlay.template;
	if (!tpl?.source_code) return null;

	const { html, css, js } = tpl.source_code;
	const animConfig = tpl.animation_config ?? {};
	const inDuration = animConfig.in?.duration ?? 500;

	// ■ iframe srcdoc 빌드
	// Why body width=1920px, height=1080px 고정?
	//   에디터(HtmlPluginThumbnail)와 동일한 방식.
	//   플러그인 CSS는 1920x1080 해상도를 기준으로 작성되었으므로
	//   iframe 내부를 고정 크기로 설정하고, 외부 컨테이너에서 CSS transform: scale()로 축소.
	//   이렇게 하면 PVW든 PGM이든 에디터든 모두 동일한 비율을 보장.
	const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent !important; }
body { width: ${BASE_W}px; height: ${BASE_H}px; overflow: hidden; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}
${css}
</style>
</head>
<body>
${html}
<script>
${WEBCGK_API_INLINE}
</script>
<script>
${js}
</script>
</body>
</html>`;

	// ■ replicant_data를 JSON 문자열로 직렬화하여 deep comparison
	// Why?
	//   Supabase Realtime은 매번 새 객체를 반환하지만 내용이 동일할 수 있고,
	//   반대로 내용이 바뀌어도 React의 얕은 비교에서는 같은 참조로 판단될 수 있다.
	//   JSON.stringify로 값 기반 비교를 보장한다.
	const replicantJson = JSON.stringify(overlay.replicant_data || {});

	// Replicant 데이터 변경 시 iframe에 postMessage
	useEffect(() => {
		if (!iframeRef.current?.contentWindow) {
			console.warn("[PluginIframeLayer] contentWindow 없음 — postMessage 불가");
			return;
		}

		const data = JSON.parse(replicantJson);
		console.log("[PluginIframeLayer] REPLICANT_UPDATE 전송:", data);
		iframeRef.current.contentWindow.postMessage(
			{ type: "REPLICANT_UPDATE", payload: data },
			"*",
		);
	}, [replicantJson]);

	// SHOW 메시지 전달 (활성화 시)
	useEffect(() => {
		if (!iframeRef.current?.contentWindow) return;

		// iframe 로드 후 INIT + SHOW 전달
		const handleLoad = () => {
			setTimeout(() => {
				if (!iframeRef.current?.contentWindow) return;
				const data = JSON.parse(replicantJson);
				iframeRef.current.contentWindow.postMessage(
					{
						type: "INIT",
						payload: data,
					},
					"*",
				);
				iframeRef.current.contentWindow.postMessage(
					{ type: "SHOW" },
					"*",
				);
			}, 100);
		};

		const iframe = iframeRef.current;
		iframe.addEventListener("load", handleLoad);

		return () => {
			iframe.removeEventListener("load", handleLoad);
		};
	}, [replicantJson]);

	// entering → stable 전환
	useEffect(() => {
		if (phase !== "entering") return;
		const timer = setTimeout(() => setPhase("stable"), inDuration);
		return () => clearTimeout(timer);
	}, [phase, inDuration]);

	// ■ ResizeObserver: 컨테이너 크기 변경 시 scale 재계산
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					setScale(Math.min(width / BASE_W, height / BASE_H));
				}
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// zone_bounds 기반 위치 계산
	const zb = tpl.zone_bounds;
	const posStyle: React.CSSProperties = zb
		? {
				position: "absolute",
				left: `${(zb.x / BASE_W) * 100}%`,
				top: `${(zb.y / BASE_H) * 100}%`,
				width: `${(zb.width / BASE_W) * 100}%`,
				height: `${(zb.height / BASE_H) * 100}%`,
			}
		: {
				position: "absolute",
				inset: 0,
			};

	return (
		<div
			ref={containerRef}
			style={{
				...posStyle,
				zIndex: 100 + (tpl.layer ?? 0),
				pointerEvents: "none",
				opacity: phase === "entering" ? 0 : 1,
				transition: `opacity ${inDuration}ms ease-out`,
				overflow: "hidden",
			}}
		>
			{/* ■ 1920×1080 고정 iframe + CSS transform scale
			    에디터 썸네일(HtmlPluginThumbnail)과 동일한 패턴.
			    iframe 내부는 항상 1920×1080 기준으로 렌더링되고,
			    컨테이너 크기에 맞춰 scale()로 축소/확대된다. */}
			<iframe
				ref={iframeRef}
				sandbox="allow-scripts allow-same-origin"
				srcDoc={srcdoc}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: `${BASE_W}px`,
					height: `${BASE_H}px`,
					border: "none",
					background: "transparent",
					colorScheme: "normal",
					transformOrigin: "top left",
					transform: `scale(${scale})`,
				}}
				title={`Plugin: ${tpl.name}`}
			/>
		</div>
	);
}


/**
 * webcgk srcdoc 생성 유틸 — 단일 원본 (Single Source of Truth)
 *
 * ■ Why 이 모듈이 필요한가?
 *   기존에는 webcgk API 코드와 srcdoc 생성 로직이 4곳에서 독립적으로 구현되어 있었다:
 *     1. GraphicPreviewRenderer.tsx (에디터 미리보기 SVG용)
 *     2. Canvas.tsx (에디터 캔버스 오버레이용)
 *     3. CompositorLayer.tsx (PVW/PGM/Renderer 송출용)
 *     4. AnimatedGraphicRenderer.tsx (DOM 애니메이션 렌더러용)
 *
 *   각 구현의 webcgk API가 미묘하게 달라 (sendToParent 유무, INIT 핸들링, sandbox 설정 등)
 *   "에디터에서 동작하는 플러그인이 송출 시 다르게 동작" 하는 불일치 위험이 있었다.
 *
 *   이 모듈로 단일 원본화하면:
 *   - API 변경 시 한 곳만 수정
 *   - 모든 렌더링 경로에서 동일한 플러그인 동작 보장
 *   - 테스트/디버깅 용이
 *
 * ■ 비유: "같은 레시피(API 스펙)로 요리해야 같은 맛(동작)이 나온다"
 */

// ─── webcgk API 인라인 코드 (모든 렌더러 공통) ─────────────────
/**
 * iframe sandbox 내부에서 실행되는 webcgk 런타임 API.
 * window.webcgk 객체를 생성하고, postMessage 기반 통신을 처리한다.
 *
 * ■ 지원 메시지 타입:
 *   - REPLICANT_UPDATE: 외부에서 데이터 갱신 → onData 콜백 호출
 *   - SHOW:            표시 트리거 → onShow 콜백 호출
 *   - HIDE:            숨김 트리거 → onHide 콜백 호출
 *   - INIT:            초기 데이터 + 준비 완료 → onData + onReady 호출
 *
 * ■ Plugin → Parent 통신:
 *   - PLUGIN_READY: iframe 로드 완료 알림
 *   - sendToParent(type, payload): 커스텀 메시지 발행
 */
export const WEBCGK_API_INLINE = `
(function() {
  var _data = {}, _listeners = { data: [], show: [], hide: [], ready: [] }, _isVisible = false;
  window.webcgk = {
    onData: function(cb) { if (typeof cb === "function") { _listeners.data.push(cb); if (Object.keys(_data).length > 0) cb(_data); } },
    onShow: function(cb) { if (typeof cb === "function") _listeners.show.push(cb); },
    onHide: function(cb) { if (typeof cb === "function") _listeners.hide.push(cb); },
    onReady: function(cb) { if (typeof cb === "function") _listeners.ready.push(cb); },
    getData: function() { return _data; },
    isVisible: function() { return _isVisible; },
    sendToParent: function(type, payload) {
      try { window.parent.postMessage({ source: "webcgk-plugin", type: type, payload: payload }, "*"); } catch(e) {}
    },
    /** 타이머 replicant 데이터로 현재 remaining(초) 계산. startedAt이 서버 보정값이므로 iframe 내부에서도 정확. */
    computeTimerRemaining: function(data) {
      if (!data || typeof data !== "object") return 0;
      if (!data.running || !data.startedAt) return data.remaining || data.duration || 0;
      var elapsed = (Date.now() - data.startedAt) / 1000;
      var base = data.remaining || data.duration || 0;
      return Math.max(0, base - elapsed);
    }
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

// ─── PluginAction: iframe → 부모 메시지 타입 ──────────────────

/**
 * iframe이 sendToParent()로 보내는 액션 메시지.
 * 절대값이 아닌 의도(Action)만 전달하여 Race Condition 방지.
 *
 * ■ 설계 원칙 (외부 구동):
 *   iframe은 순수 View — 상태 변경 의도만 발생시키고,
 *   실제 상태 연산과 DB 반영은 부모(Controller/Renderer)가 수행.
 */
export type PluginAction =
	| { type: "action"; action: "START_TIMER" }
	| { type: "action"; action: "STOP_TIMER" }
	| { type: "action"; action: "RESET_TIMER" }
	| { type: "action"; action: "INCREMENT_SCORE"; payload: { delta?: number } }
	| { type: "action"; action: "DECREMENT_SCORE"; payload: { delta?: number } }
	| { type: "action"; action: "SET_VALUE"; payload: { key: string; value: unknown } };

/** iframe → 부모 postMessage 원본 형식 (sendToParent가 생성) */
export interface PluginMessage {
	source: "webcgk-plugin";
	type: string;
	payload?: unknown;
}

/** 부모 → iframe 메시지 (기존 REPLICANT_UPDATE 외) */
export type ParentMessage =
	| { type: "REPLICANT_UPDATE"; payload: Record<string, unknown> }
	| { type: "INIT"; payload?: Record<string, unknown> }
	| { type: "SHOW" }
	| { type: "HIDE" };

// ─── srcdoc HTML 생성 ──────────────────────────────────────────

export interface SrcdocOptions {
	/** 플러그인 HTML 본문 */
	html: string;
	/** 플러그인 CSS 스타일 */
	css: string;
	/** 플러그인 JS 코드 */
	js: string;
	/** iframe body 크기 (px). 기본 1920 */
	width?: number;
	/** iframe body 크기 (px). 기본 1080 */
	height?: number;
	/**
	 * true이면 로드 직후 자동으로 SHOW 메시지를 자체 발행.
	 * 에디터 미리보기처럼 외부에서 SHOW를 보내지 않는 환경에서 사용.
	 * 송출용(CompositorLayer)에서는 false — 외부에서 명시적 SHOW 발행.
	 */
	autoShow?: boolean;
}

/**
 * 플러그인 iframe용 srcdoc HTML 문자열을 생성한다.
 *
 * ■ Why srcdoc?
 *   src 대신 srcdoc을 사용하면 별도 서버 없이 인라인으로 HTML/CSS/JS를 주입할 수 있다.
 *   sandbox 속성과 결합하면 보안 격리도 자동으로 적용된다.
 *
 * @example
 * ```tsx
 * <iframe
 *   srcDoc={buildPluginSrcdoc({ html, css, js, width: 1920, height: 1080 })}
 *   sandbox="allow-scripts allow-same-origin"
 * />
 * ```
 */
export function buildPluginSrcdoc({
	html,
	css,
	js,
	width = 1920,
	height = 1080,
	autoShow = false,
}: SrcdocOptions): string {
	// ■ Step 1: 전역 리셋 + body 크기 고정
	// ■ Step 2: 공통 애니메이션 키프레임 (플러그인 코드에서 자유롭게 사용)
	// ■ Step 3: 플러그인 커스텀 CSS
	// ■ Step 4: 플러그인 HTML 본문
	// ■ Step 5: webcgk API 주입
	// ■ Step 6: 플러그인 커스텀 JS (try-catch로 에러 격리)
	// ■ Step 7: (선택) 자동 SHOW 트리거

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html { background: transparent !important; color-scheme: normal; }
body { width: ${width}px; height: ${height}px; overflow: hidden; background: transparent !important; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeOutDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }
${css}
</style>
</head>
<body>
${html}
<script>${WEBCGK_API_INLINE}</script>
<script>try { ${js} } catch(e) { console.error("[webcgk-plugin]", e); }</script>${autoShow ? `
<script>
// 에디터 프리뷰용: 외부 SHOW 메시지가 없으므로 자체 발행
setTimeout(function() { window.postMessage({ type: "SHOW" }, "*"); }, 50);
</script>` : ""}
</body>
</html>`;
}

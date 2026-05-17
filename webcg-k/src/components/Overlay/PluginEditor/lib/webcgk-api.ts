/**
 * webcgk-api 인라인 코드 — iframe 내부 주입용
 *
 * Why 인라인? iframe sandbox에서는 외부 <script src="...">를 로드할 수 없다.
 * API 코드를 문자열로 직접 주입해야 한다.
 */
export function getWebcgkApiInline(): string {
  return `
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
}

/**
 * WebCG-K Plugin Runtime API
 * 
 * ■ 역할: 플러그인 코드(iframe 내부)에서 사용하는 경량 API.
 *   부모 윈도우(컨트롤러/렌더러)와 postMessage로 통신하여
 *   Replicant 데이터를 수신하고 SHOW/HIDE 이벤트를 처리한다.
 * 
 * ■ Why postMessage?
 *   iframe은 부모 window와 DOM이 격리되어 있으므로,
 *   데이터 전달은 postMessage API로만 가능하다.
 *   이 런타임이 복잡한 postMessage를 추상화하여
 *   플러그인 개발자는 webcgk.onData()만 호출하면 됨.
 * 
 * 사용법 (플러그인 JS 코드 내부):
 *   webcgk.onData((data) => {
 *       document.getElementById("score").textContent = data.homeScore;
 *   });
 *   webcgk.onShow(() => { // IN 애니메이션 });
 *   webcgk.onHide(() => { // OUT 애니메이션 });
 */

(function() {
    "use strict";

    // ─── 내부 상태 ───
    var _data = {};
    var _listeners = {
        data: [],
        show: [],
        hide: [],
        ready: []
    };
    var _isVisible = false;

    // ─── 공개 API ───
    window.webcgk = {
        /**
         * Replicant 데이터 변경 시 호출되는 콜백 등록
         * @param {function(data: object)} callback
         */
        onData: function(callback) {
            if (typeof callback === "function") {
                _listeners.data.push(callback);
                // 이미 데이터가 있으면 즉시 호출 (late binding 지원)
                if (Object.keys(_data).length > 0) {
                    callback(_data);
                }
            }
        },

        /**
         * 오버레이 표시(ON) 시 호출되는 콜백 등록
         * 플러그인에서 IN 애니메이션을 구현할 때 사용
         * @param {function()} callback
         */
        onShow: function(callback) {
            if (typeof callback === "function") {
                _listeners.show.push(callback);
            }
        },

        /**
         * 오버레이 숨김(OFF) 시 호출되는 콜백 등록
         * 플러그인에서 OUT 애니메이션을 구현할 때 사용
         * @param {function()} callback
         */
        onHide: function(callback) {
            if (typeof callback === "function") {
                _listeners.hide.push(callback);
            }
        },

        /**
         * API 준비 완료 시 호출되는 콜백 등록
         * @param {function()} callback
         */
        onReady: function(callback) {
            if (typeof callback === "function") {
                _listeners.ready.push(callback);
            }
        },

        /**
         * 현재 Replicant 데이터 직접 접근
         * @returns {object}
         */
        getData: function() {
            return _data;
        },

        /**
         * 현재 표시 상태
         * @returns {boolean}
         */
        isVisible: function() {
            return _isVisible;
        },

        /**
         * 부모에게 메시지 전송 (고급 사용)
         * @param {string} type
         * @param {*} payload
         */
        sendToParent: function(type, payload) {
            try {
                window.parent.postMessage({ source: "webcgk-plugin", type: type, payload: payload }, "*");
            } catch(e) {
                console.warn("[webcgk] sendToParent failed:", e);
            }
        }
    };

    // ─── 내부: 부모로부터 메시지 수신 ───
    window.addEventListener("message", function(event) {
        var msg = event.data;
        if (!msg || typeof msg !== "object") return;

        switch (msg.type) {
            case "REPLICANT_UPDATE":
                // Step 1: 데이터 저장
                _data = msg.payload || {};
                // Step 2: 등록된 모든 data 리스너에 전파
                _listeners.data.forEach(function(cb) {
                    try { cb(_data); } catch(e) { console.error("[webcgk] onData error:", e); }
                });
                break;

            case "SHOW":
                _isVisible = true;
                _listeners.show.forEach(function(cb) {
                    try { cb(); } catch(e) { console.error("[webcgk] onShow error:", e); }
                });
                break;

            case "HIDE":
                _isVisible = false;
                _listeners.hide.forEach(function(cb) {
                    try { cb(); } catch(e) { console.error("[webcgk] onHide error:", e); }
                });
                break;

            case "INIT":
                // 초기화 데이터 + ready 이벤트
                if (msg.payload) {
                    _data = msg.payload;
                    _listeners.data.forEach(function(cb) {
                        try { cb(_data); } catch(e) { console.error("[webcgk] onData error:", e); }
                    });
                }
                _listeners.ready.forEach(function(cb) {
                    try { cb(); } catch(e) { console.error("[webcgk] onReady error:", e); }
                });
                break;
        }
    });

    // 부모에게 준비 완료 알림
    try {
        window.parent.postMessage({ source: "webcgk-plugin", type: "PLUGIN_READY" }, "*");
    } catch(e) { /* iframe 외부에서 로드된 경우 무시 */ }

    console.log("[webcgk] Plugin Runtime API v1.0 loaded");
})();

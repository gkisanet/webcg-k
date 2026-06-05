/**
 * Visual Edit Bridge — iframe 낸부에 주입되는 시각 편집 스크립트
 *
 * ■ Why 문자열 인라인?
 *   iframe sandbox에서는 외부 <script src> 로드 불가.
 *   PluginEditor의 srcdoc 생성 시 <script> 태그로 직접 주입한다.
 *
 * ■ 지원 메시지 (Parent → iframe):
 *   - ENABLE_VISUAL_EDIT  : 시각 편집 모드 ON
 *   - DISABLE_VISUAL_EDIT : 시각 편집 모드 OFF
 *   - SELECT_ELEMENT      : { selector } 해당 요소 선택
 *   - SET_PROPERTY        : { selector, property, value } 인라인 스타일 즉시 적용
 *
 * ■ 발생 메시지 (iframe → Parent):
 *   - ELEMENT_SELECTED    : { selector, tagName, className, id, computedStyles }
 *   - STYLE_CHANGED       : { selector, styles: { left, top, width, height, ... } }
 */

export function getVisualEditBridgeInline(): string {
	return /* js */ `
(function() {
  var _enabled = false;
  var _selectedEl = null;
  var _overlay = null;
  var _startX = 0, _startY = 0;
  var _startLeft = 0, _startTop = 0, _startWidth = 0, _startHeight = 0;
  var _startFontSize = 0;
  var _isDragging = false, _isResizing = false;
  var _resizeDir = '';
  var _rafId = null;

  function init() {
    window.addEventListener('message', onMessage);
  }

  function onMessage(e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ENABLE_VISUAL_EDIT') { enable(); }
    else if (msg.type === 'DISABLE_VISUAL_EDIT') { disable(); }
    else if (msg.type === 'SELECT_ELEMENT') { selectBySelector(msg.selector); }
    else if (msg.type === 'SET_PROPERTY') {
      try {
        var el = document.querySelector(msg.selector);
        if (el) {
          el.style[msg.property] = msg.value;
          if (_selectedEl === el) updateOverlay();
        }
      } catch(err) {}
    }
  }

  function enable() {
    if (_enabled) return;
    _enabled = true;
    document.addEventListener('click', onBodyClick, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
  }

  function disable() {
    _enabled = false;
    deselect();
    document.removeEventListener('click', onBodyClick, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
  }

  function onBodyClick(e) {
    if (!_enabled) return;
    if (e.target.closest && e.target.closest('[data-viz-handle]')) return;
    var el = e.target.closest('#overlay') ? e.target : (e.target.closest ? e.target.closest('body > *') : e.target);
    if (!el || el === document.body || el === document.documentElement) {
      deselect();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    select(el);
  }

  function select(el) {
    deselect();
    _selectedEl = el;
    el.setAttribute('data-viz-selected', 'true');
    createOverlay();
    updateOverlay();
    var computed = window.getComputedStyle(el);
    send('ELEMENT_SELECTED', {
      selector: getUniqueSelector(el),
      tagName: el.tagName,
      className: el.className || '',
      id: el.id || '',
      computedStyles: {
        left: computed.left,
        top: computed.top,
        width: computed.width,
        height: computed.height,
        position: computed.position,
        fontSize: computed.fontSize,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        margin: computed.margin,
        padding: computed.padding,
        borderRadius: computed.borderRadius,
        gap: computed.gap,
        opacity: computed.opacity,
        zIndex: computed.zIndex,
        textShadow: computed.textShadow,
      }
    });
  }

  function selectBySelector(selector) {
    try {
      var el = document.querySelector(selector);
      if (el) select(el);
    } catch(e) {}
  }

  function deselect() {
    if (_selectedEl) {
      _selectedEl.removeAttribute('data-viz-selected');
      _selectedEl = null;
    }
    if (_overlay) {
      _overlay.remove();
      _overlay = null;
    }
  }

  /** 고유 선택자 생성 — class 우선 (AI CSS와 매칭) */
  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    // class-only selector: AI 생성 CSS는 class 기반 (.score, .team-name)
    if (el.className) {
      var classes = el.className.trim().split(/\\s+/).filter(function(c){ return c; });
      if (classes.length) return '.' + classes[classes.length - 1];
    }
    // Fallback: full path selector
    var path = [];
    var rootEl = document.getElementById('overlay') || document.body;
    while (el && el !== rootEl && el !== document.body) {
      var sel = el.tagName.toLowerCase();
      if (el.className) {
        var cs = el.className.trim().split(/\\s+/).filter(function(c){ return c; });
        if (cs.length) sel += '.' + cs.join('.');
      }
      if (el.parentElement) {
        var siblings = Array.from(el.parentElement.children).filter(function(c) {
          return c.tagName === el.tagName;
        });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(el) + 1;
          sel += ':nth-of-type(' + idx + ')';
        }
      }
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function createOverlay() {
    _overlay = document.createElement('div');
    _overlay.setAttribute('data-viz-handle', 'true');
    _overlay.style.position = 'absolute';
    _overlay.style.zIndex = '99999';
    _overlay.style.pointerEvents = 'none';
    _overlay.style.boxSizing = 'border-box';
    document.body.appendChild(_overlay);

    var dirs = ['nw','n','ne','e','se','s','sw','w'];
    dirs.forEach(function(dir) {
      var h = document.createElement('div');
      h.setAttribute('data-viz-handle', 'true');
      h.setAttribute('data-dir', dir);
      h.style.position = 'absolute';
      h.style.width = (dir === 'n' || dir === 's') ? '100%' : '12px';
      h.style.height = (dir === 'e' || dir === 'w') ? '100%' : '12px';
      h.style.cursor = dir + '-resize';
      h.style.pointerEvents = 'auto';
      h.style.background = 'rgba(0,212,255,0.4)';
      h.style.border = '1px solid rgba(0,212,255,0.8)';
      h.style.borderRadius = (dir.length === 2) ? '50%' : '0';
      if (dir.indexOf('n') !== -1) h.style.top = '-6px';
      if (dir.indexOf('s') !== -1) h.style.bottom = '-6px';
      if (dir.indexOf('w') !== -1) h.style.left = '-6px';
      if (dir.indexOf('e') !== -1) h.style.right = '-6px';
      if (dir === 'n' || dir === 's') { h.style.left = '50%'; h.style.transform = 'translateX(-50%)'; }
      if (dir === 'e' || dir === 'w') { h.style.top = '50%'; h.style.transform = 'translateY(-50%)'; }
      _overlay.appendChild(h);
    });
  }

  function updateOverlay() {
    if (!_selectedEl || !_overlay) return;
    var rect = _selectedEl.getBoundingClientRect();
    _overlay.style.left = rect.left + 'px';
    _overlay.style.top = rect.top + 'px';
    _overlay.style.width = rect.width + 'px';
    _overlay.style.height = rect.height + 'px';
    _overlay.style.border = '2px solid #00d4ff';
  }

  function onMouseDown(e) {
    if (!_enabled) return;
    var handle = e.target.closest ? e.target.closest('[data-viz-handle]') : null;
    if (handle) {
      _isResizing = true;
      _resizeDir = handle.getAttribute('data-dir') || '';
      e.preventDefault();
      e.stopPropagation();
    } else if (_selectedEl && (e.target === _selectedEl || _selectedEl.contains(e.target))) {
      _isDragging = true;
      e.preventDefault();
      e.stopPropagation();
    } else {
      return;
    }
    _startX = e.clientX;
    _startY = e.clientY;
    var s = window.getComputedStyle(_selectedEl);
    _startLeft = parseFloat(s.left) || _selectedEl.offsetLeft || 0;
    _startTop = parseFloat(s.top) || _selectedEl.offsetTop || 0;
    _startWidth = parseFloat(s.width) || _selectedEl.offsetWidth;
    _startHeight = parseFloat(s.height) || _selectedEl.offsetHeight;
    _startFontSize = parseFloat(s.fontSize) || 16;
  }

  function onMouseMove(e) {
    if (!_selectedEl || (!_isDragging && !_isResizing)) return;
    var dx = e.clientX - _startX;
    var dy = e.clientY - _startY;

    if (_isDragging) {
      _selectedEl.style.left = Math.round(_startLeft + dx) + 'px';
      _selectedEl.style.top = Math.round(_startTop + dy) + 'px';
      if (window.getComputedStyle(_selectedEl).position === 'static') {
        _selectedEl.style.position = 'relative';
      }
      if (_rafId) cancelAnimationFrame(_rafId);
      _rafId = requestAnimationFrame(updateOverlay);
    } else if (_isResizing) {
      var dir = _resizeDir;
      if (dir.indexOf('e') !== -1) _selectedEl.style.width = Math.max(1, Math.round(_startWidth + dx)) + 'px';
      if (dir.indexOf('w') !== -1) {
        var newW = Math.max(1, Math.round(_startWidth - dx));
        _selectedEl.style.width = newW + 'px';
        _selectedEl.style.left = Math.round(_startLeft + (_startWidth - newW)) + 'px';
      }
      if (dir.indexOf('s') !== -1) _selectedEl.style.height = Math.max(1, Math.round(_startHeight + dy)) + 'px';
      if (dir.indexOf('n') !== -1) {
        var newH = Math.max(1, Math.round(_startHeight - dy));
        _selectedEl.style.height = newH + 'px';
        _selectedEl.style.top = Math.round(_startTop + (_startHeight - newH)) + 'px';
      }
      if (window.getComputedStyle(_selectedEl).position === 'static') {
        _selectedEl.style.position = 'relative';
      }
      if (_rafId) cancelAnimationFrame(_rafId);
      _rafId = requestAnimationFrame(updateOverlay);
    }
  }

  function onMouseUp(e) {
    if ((_isDragging || _isResizing) && _selectedEl) {
      var s = window.getComputedStyle(_selectedEl);
      var payload = {
        selector: getUniqueSelector(_selectedEl),
        styles: {}
      };
      if (_isDragging) {
        payload.styles.left = s.left;
        payload.styles.top = s.top;
        payload.styles.position = s.position === 'static' ? 'relative' : s.position;
      }
      if (_isResizing) {
        payload.styles.width = s.width;
        payload.styles.height = s.height;
        payload.styles.position = s.position === 'static' ? 'relative' : s.position;
      }
      send('STYLE_CHANGED', payload);
      // 인스펙터 동기화를 위해 현재 computed styles도 다시 전송
      send('ELEMENT_SELECTED', {
        selector: payload.selector,
        tagName: _selectedEl.tagName,
        className: _selectedEl.className || '',
        id: _selectedEl.id || '',
        computedStyles: {
          left: s.left,
          top: s.top,
          width: s.width,
          height: s.height,
          position: s.position,
          fontSize: s.fontSize,
          color: s.color,
          backgroundColor: s.backgroundColor,
          margin: s.margin,
          padding: s.padding,
          borderRadius: s.borderRadius,
          gap: s.gap,
          opacity: s.opacity,
          zIndex: s.zIndex,
          textShadow: s.textShadow,
        }
      });
    }
    _isDragging = false;
    _isResizing = false;
    _resizeDir = '';
  }

  function send(type, payload) {
    try {
      window.parent.postMessage({ source: 'webcgk-visual-edit', type: type, payload: payload }, '*');
    } catch(e) {}
  }

  init();
})();
`;
}

/**
 * WebCG-K Motion Runtime.
 *
 * A tiny broadcast graphics motion layer injected into sandboxed iframes.
 * AI-generated overlays declare intent with data-motion/data-motion-text;
 * this runtime owns the actual animation implementation.
 */
export const WEBCGK_MOTION_INLINE = `
(function() {
  /* webcgk-motion */
  var _activeAnimations = [];

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function applyFrame(el, frame) {
    if (!el || !frame) return;
    for (var key in frame) {
      if (!Object.prototype.hasOwnProperty.call(frame, key) || key === 'offset') continue;
      try { el.style[key] = frame[key]; } catch(e) {}
    }
  }

  function animate(el, frames, options) {
    if (!el || !frames || !frames.length) return null;
    try {
      if (typeof el.animate === 'function') {
        var animation = el.animate(frames, options || {});
        _activeAnimations.push(animation);
        return animation;
      }
    } catch(e) {}
    applyFrame(el, frames[frames.length - 1]);
    return null;
  }

  function stopAnimations() {
    for (var i = 0; i < _activeAnimations.length; i += 1) {
      try { _activeAnimations[i].cancel(); } catch(e) {}
    }
    _activeAnimations = [];
  }

  function motionFrames(kind, entering) {
    var from = { opacity: '0', transform: 'translate3d(0, 18px, 0)', filter: 'blur(6px)' };
    var to = { opacity: '1', transform: 'translate3d(0, 0, 0)', filter: 'blur(0px)' };
    if (kind === 'lower-third' || kind === 'slide-left') {
      from.transform = 'translate3d(-48px, 0, 0)';
    } else if (kind === 'slide-right') {
      from.transform = 'translate3d(48px, 0, 0)';
    } else if (kind === 'slide-up' || kind === 'headline') {
      from.transform = 'translate3d(0, 34px, 0)';
    } else if (kind === 'slide-down' || kind === 'scoreboard') {
      from.transform = 'translate3d(0, -28px, 0)';
    } else if (kind === 'stat' || kind === 'pop') {
      from.transform = 'scale(0.94)';
    } else if (kind === 'fade') {
      from.transform = 'translate3d(0, 0, 0)';
      from.filter = 'blur(0px)';
    }
    return entering ? [from, to] : [to, from];
  }

  function readMotionOptions(el, index) {
    return {
      duration: toNumber(el.getAttribute('data-motion-duration'), 520),
      delay: toNumber(el.getAttribute('data-motion-delay'), 0) + index * toNumber(el.getAttribute('data-motion-stagger'), 48),
      easing: el.getAttribute('data-motion-ease') || 'cubic-bezier(.2,.8,.2,1)',
      fill: 'forwards'
    };
  }

  function splitGraphemes(text) {
    try {
      if (window.Intl && Intl.Segmenter) {
        var segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text), function(part) { return part.segment; });
      }
    } catch(e) {}
    return Array.from(text);
  }

  function prepareText(el) {
    if (!el) return [];
    var mode = el.getAttribute('data-motion-text');
    if (!mode || mode === 'none') return [];
    var text = el.textContent || '';
    var source = el.getAttribute('data-motion-source');
    if (el.getAttribute('data-motion-prepared') === 'true' && source === text) {
      return Array.from(el.querySelectorAll('[data-motion-part]'));
    }

    el.setAttribute('data-motion-source', text);
    el.setAttribute('data-motion-prepared', 'true');
    el.setAttribute('aria-label', el.getAttribute('aria-label') || text);
    el.textContent = '';

    if (mode === 'wipe') {
      return [el];
    }

    var parts = mode === 'words' ? text.split(/(\\s+)/) : splitGraphemes(text);
    var spans = [];
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i];
      if (!part) continue;
      if (/^\\s+$/.test(part)) {
        el.appendChild(document.createTextNode(part));
        continue;
      }
      var span = document.createElement('span');
      span.setAttribute('data-motion-part', '');
      span.style.display = 'inline-block';
      span.style.willChange = 'transform, opacity, filter';
      span.textContent = part;
      el.appendChild(span);
      spans.push(span);
    }
    return spans;
  }

  function refreshText(animateNow) {
    var nodes = document.querySelectorAll('[data-motion-text]');
    for (var i = 0; i < nodes.length; i += 1) {
      var parts = prepareText(nodes[i]);
      if (animateNow) animateTextParts(nodes[i], parts, true);
    }
  }

  function animateTextParts(el, parts, entering) {
    if (!parts || !parts.length) return;
    var duration = toNumber(el.getAttribute('data-motion-duration'), 460);
    var delay = toNumber(el.getAttribute('data-motion-delay'), 80);
    var stagger = toNumber(el.getAttribute('data-motion-stagger'), 24);
    for (var i = 0; i < parts.length; i += 1) {
      var frames = motionFrames('headline', entering);
      animate(parts[i], frames, {
        duration: duration,
        delay: delay + i * stagger,
        easing: el.getAttribute('data-motion-ease') || 'cubic-bezier(.2,.8,.2,1)',
        fill: 'forwards'
      });
    }
  }

  function run(entering) {
    stopAnimations();
    refreshText(false);

    var motionNodes = document.querySelectorAll('[data-motion]');
    for (var i = 0; i < motionNodes.length; i += 1) {
      var el = motionNodes[i];
      var kind = el.getAttribute('data-motion') || 'fade';
      if (kind === 'none') continue;
      animate(el, motionFrames(kind, entering), readMotionOptions(el, i));
    }

    var textNodes = document.querySelectorAll('[data-motion-text]');
    for (var j = 0; j < textNodes.length; j += 1) {
      animateTextParts(textNodes[j], prepareText(textNodes[j]), entering);
    }
  }

  if (window.webcgk) {
    window.webcgk.motion = {
      animate: animate,
      refreshText: function() { refreshText(!!window.webcgk.isVisible()); },
      show: function() { run(true); },
      hide: function() { run(false); }
    };
    if (window.webcgk._addPreDataHook) {
      window.webcgk._addPreDataHook(function() {
        refreshText(!!window.webcgk.isVisible());
      });
    }
    window.webcgk.onShow(function() { run(true); });
    window.webcgk.onHide(function() { run(false); });
  }
})();
`;

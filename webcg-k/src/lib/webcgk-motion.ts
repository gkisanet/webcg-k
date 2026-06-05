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
  var _timeline = [];
  var _defaultDriver = 'waapi';

  function toNumber(value, fallback) {
    if (value == null || value === '') return fallback;
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

  function hasGsap() {
    return !!(window.gsap && typeof window.gsap.fromTo === 'function');
  }

  function resolveDriver(el, options) {
    var requested = (options && options.driver) ||
      (el && el.getAttribute && el.getAttribute('data-motion-driver')) ||
      document.documentElement.getAttribute('data-motion-driver') ||
      _defaultDriver ||
      'waapi';
    if (requested === 'gsap' && hasGsap()) return 'gsap';
    return 'waapi';
  }

  function frameToGsapVars(frame) {
    var vars = {};
    if (!frame) return vars;
    for (var key in frame) {
      if (!Object.prototype.hasOwnProperty.call(frame, key) || key === 'offset') continue;
      vars[key] = frame[key];
    }
    return vars;
  }

  function animateWithGsap(el, frames, options) {
    if (!hasGsap()) return null;
    var fromVars = frameToGsapVars(frames[0]);
    var toVars = frameToGsapVars(frames[frames.length - 1]);
    toVars.duration = toNumber(options && options.duration, 520) / 1000;
    toVars.delay = toNumber(options && options.delay, 0) / 1000;
    toVars.ease = (options && (options.ease || options.easing)) || 'power2.out';
    try {
      var tween = window.gsap.fromTo(el, fromVars, toVars);
      _activeAnimations.push(tween);
      return tween;
    } catch(e) {
      return null;
    }
  }

  function animate(el, frames, options) {
    if (!el || !frames || !frames.length) return null;
    var driver = resolveDriver(el, options || {});
    if (driver === 'gsap') {
      var tween = animateWithGsap(el, frames, options || {});
      if (tween) return tween;
    }
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
      try {
        if (_activeAnimations[i] && typeof _activeAnimations[i].cancel === 'function') {
          _activeAnimations[i].cancel();
        } else if (_activeAnimations[i] && typeof _activeAnimations[i].kill === 'function') {
          _activeAnimations[i].kill();
        }
      } catch(e) {}
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
    var at = el.getAttribute('data-motion-at');
    var delay = at != null
      ? toNumber(at, 0)
      : toNumber(el.getAttribute('data-motion-delay'), 0) + index * toNumber(el.getAttribute('data-motion-stagger'), 48);
    return {
      duration: toNumber(el.getAttribute('data-motion-duration'), 520),
      delay: delay,
      easing: el.getAttribute('data-motion-ease') || 'cubic-bezier(.2,.8,.2,1)',
      driver: el.getAttribute('data-motion-driver') || undefined,
      fill: 'forwards'
    };
  }

  function readMotionKind(el, entering) {
    var kind = entering
      ? (el.getAttribute('data-motion-in') || el.getAttribute('data-motion'))
      : (el.getAttribute('data-motion-out') || el.getAttribute('data-motion'));
    return kind || 'fade';
  }

  function motionIndexFor(el, groupIndexes, fallbackIndex) {
    var group = el.getAttribute('data-motion-group');
    if (!group) return fallbackIndex;
    var next = groupIndexes[group] || 0;
    groupIndexes[group] = next + 1;
    return next;
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

    var motionNodes = document.querySelectorAll('[data-motion], [data-motion-in], [data-motion-out]');
    var groupIndexes = {};
    var ungroupedIndex = 0;
    for (var i = 0; i < motionNodes.length; i += 1) {
      var el = motionNodes[i];
      var kind = readMotionKind(el, entering);
      if (kind === 'none') continue;
      var motionIndex = motionIndexFor(el, groupIndexes, ungroupedIndex);
      if (!el.getAttribute('data-motion-group')) ungroupedIndex += 1;
      animate(el, motionFrames(kind, entering), readMotionOptions(el, motionIndex));
    }

    runTimelineItems(_timeline, entering);

    var textNodes = document.querySelectorAll('[data-motion-text]');
    for (var j = 0; j < textNodes.length; j += 1) {
      animateTextParts(textNodes[j], prepareText(textNodes[j]), entering);
    }
  }

  function resolveTargets(target) {
    if (!target) return [];
    if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
    if (target.nodeType === 1) return [target];
    if (Array.isArray(target)) return target;
    if (typeof target.length === 'number') return Array.from(target);
    return [];
  }

  function readTimelineOptions(item, index) {
    var hasAt = item && item.at != null;
    return {
      duration: toNumber(item && item.duration, 520),
      delay: hasAt ? toNumber(item.at, 0) : toNumber(item && item.delay, 0) + index * toNumber(item && item.stagger, 0),
      easing: (item && (item.ease || item.easing)) || 'cubic-bezier(.2,.8,.2,1)',
      driver: item && item.driver,
      fill: 'forwards'
    };
  }

  function timelineMotionKind(item, entering) {
    if (!item) return 'fade';
    return entering
      ? (item.in || item.motion || item.kind || 'fade')
      : (item.out || item.motion || item.kind || 'fade');
  }

  function runTimelineItems(items, entering) {
    if (!Array.isArray(items)) return;
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var kind = timelineMotionKind(item, entering);
      if (kind === 'none') continue;
      var targets = resolveTargets(item && (item.target || item.targets));
      for (var j = 0; j < targets.length; j += 1) {
        animate(targets[j], motionFrames(kind, entering), readTimelineOptions(item, j));
      }
    }
  }

  if (window.webcgk) {
    window.webcgk.motion = {
      version: '2.0.0',
      animate: animate,
      runTimeline: function(items, phase) { runTimelineItems(items, phase !== 'hide' && phase !== false); },
      setTimeline: function(items) { _timeline = Array.isArray(items) ? items : []; },
      setDriver: function(driver) { _defaultDriver = driver === 'gsap' ? 'gsap' : 'waapi'; },
      getDriver: function() { return _defaultDriver === 'gsap' && hasGsap() ? 'gsap' : 'waapi'; },
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

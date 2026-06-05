/**
 * webcgk Declarative Binding Engine.
 *
 * This runtime is injected into sandboxed broadcast graphics iframes.
 * It keeps data binding declarative while preserving optional custom JS
 * for timers, animation state machines, and advanced interactions.
 */
export const WEBCGK_REACTIVE_INLINE = `
(function() {
  var _bindMap = {};
  var _classMap = {};
  var _ifMap = {};
  var _compiled = false;
  var SAFE_ATTRS = { src: 1, alt: 1, title: 1, placeholder: 1, value: 1 };

  function addEntry(map, field, entry) {
    if (!field) return;
    if (!map[field]) map[field] = [];
    map[field].push(entry);
  }

  function parseRules(value, fallbackMode) {
    var rules = [];
    var chunks = String(value || '').split(/\\s+/);
    for (var i = 0; i < chunks.length; i += 1) {
      var chunk = chunks[i];
      if (!chunk) continue;
      var idx = chunk.indexOf(':');
      if (idx > 0) {
        rules.push({ left: chunk.slice(0, idx), field: chunk.slice(idx + 1) });
      } else if (fallbackMode === 'field') {
        rules.push({ left: null, field: chunk });
      }
    }
    return rules;
  }

  function compile() {
    _bindMap = {};
    _classMap = {};
    _ifMap = {};

    var bindNodes = document.querySelectorAll('[data-cg-bind]');
    for (var i = 0; i < bindNodes.length; i += 1) {
      var node = bindNodes[i];
      var rules = parseRules(node.getAttribute('data-cg-bind'), 'field');
      for (var r = 0; r < rules.length; r += 1) {
        var attr = rules[r].left;
        if (attr && !SAFE_ATTRS[attr]) {
          console.warn('[webcgk-reactive] blocked unsafe attribute binding: ' + attr);
          attr = null;
        }
        addEntry(_bindMap, rules[r].field, { node: node, attr: attr });
      }
    }

    var classNodes = document.querySelectorAll('[data-cg-class]');
    for (var j = 0; j < classNodes.length; j += 1) {
      var classNode = classNodes[j];
      var classRules = parseRules(classNode.getAttribute('data-cg-class'));
      for (var c = 0; c < classRules.length; c += 1) {
        addEntry(_classMap, classRules[c].field, {
          node: classNode,
          className: classRules[c].left
        });
      }
    }

    var ifNodes = document.querySelectorAll('[data-cg-if]');
    for (var k = 0; k < ifNodes.length; k += 1) {
      var ifNode = ifNodes[k];
      addEntry(_ifMap, ifNode.getAttribute('data-cg-if'), {
        node: ifNode,
        origDisplay: ifNode.style.display || ''
      });
    }

    _compiled = true;
  }

  function applyBindings(data) {
    if (!_compiled) compile();
    if (!data || typeof data !== 'object') return;

    for (var field in _bindMap) {
      if (!Object.prototype.hasOwnProperty.call(_bindMap, field)) continue;
      if (data[field] === undefined) continue;
      var value = data[field];
      var entries = _bindMap[field];
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        if (entry.attr) {
          var strVal = value == null ? '' : String(value);
          if (entry.attr === 'src' && /^\\s*javascript:/i.test(strVal)) {
            console.warn('[webcgk-reactive] blocked javascript: src');
            continue;
          }
          entry.node.setAttribute(entry.attr, strVal);
        } else {
          entry.node.textContent = value == null ? '' : String(value);
        }
      }
    }

    for (var cField in _classMap) {
      if (!Object.prototype.hasOwnProperty.call(_classMap, cField)) continue;
      var cEntries = _classMap[cField];
      for (var j = 0; j < cEntries.length; j += 1) {
        cEntries[j].node.classList.toggle(cEntries[j].className, !!data[cField]);
      }
    }

    for (var iField in _ifMap) {
      if (!Object.prototype.hasOwnProperty.call(_ifMap, iField)) continue;
      var iEntries = _ifMap[iField];
      for (var k = 0; k < iEntries.length; k += 1) {
        iEntries[k].node.style.display = data[iField] ? (iEntries[k].origDisplay || '') : 'none';
      }
    }
  }

  if (typeof MutationObserver !== 'undefined' && document.body) {
    var _recompileTimer = null;
    new MutationObserver(function() {
      if (_recompileTimer) clearTimeout(_recompileTimer);
      _recompileTimer = setTimeout(function() { _compiled = false; }, 100);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (window.webcgk && window.webcgk._addPreDataHook) {
    window.webcgk._addPreDataHook(applyBindings);
    try {
      var data = window.webcgk.getData && window.webcgk.getData();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) applyBindings(data);
    } catch(e) {}
  }
})();
`;

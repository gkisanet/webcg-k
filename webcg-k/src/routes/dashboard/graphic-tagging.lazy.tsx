/**
 * Broadcast Graphics Workbench — AI 생성 HTML/CSS 방송 그래픽의 요소에 data-semantic 바인딩
 *
 * AI 큐시트 Step 3에서 "Send to Workbench"로 전달된
 * HTML+CSS 방송 그래픽을 iframe에 렌더링하고, 요소 클릭 → semantic role 바인딩.
 *
 * sessionStorage key: graphic-tagging:scene
 */

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Tag, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEMANTIC_ROLE_DEFS } from "@/lib/semanticRoleDefs";
import type { SceneContent, SemanticRole } from "@/lib/aiCuesheetTypes";

export const Route = createLazyFileRoute("/dashboard/graphic-tagging")({
  component: GraphicTaggingPage,
});

// ─── sessionStorage data shape ────────────────────────────────────

interface TaggingSceneData {
  html: string;
  css: string;
  programTitle: string;
  scene: SceneContent;
}

const STORAGE_KEY = "graphic-tagging:scene";

function loadSceneData(): TaggingSceneData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.html || !data.scene) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSceneData(data: TaggingSceneData): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── Semantic Role definitions ───────────────────────────────────

const SEMANTIC_ROLES = SEMANTIC_ROLE_DEFS;

// ─── Page ───────────────────────────────────────────────────────

function GraphicTaggingPage() {
  const navigate = useNavigate();
  const [sceneData, setSceneData] = useState<TaggingSceneData | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [currentTag, setCurrentTag] = useState<SemanticRole | null>(null);
  const [tagMap, setTagMap] = useState<Record<string, SemanticRole>>({});
  const [previewMode, setPreviewMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load data on mount
  useEffect(() => {
    const data = loadSceneData();
    if (data) {
      setSceneData(data);
      // Restore existing data-semantic tags from HTML
      const existing: Record<string, SemanticRole> = {};
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.html, "text/html");
      doc.querySelectorAll("[data-semantic]").forEach((el) => {
        const role = el.getAttribute("data-semantic") as SemanticRole;
        const path = buildSelectorPath(el as HTMLElement, doc.body);
        if (role) existing[path] = role;
      });
      if (Object.keys(existing).length > 0) {
        setTagMap(existing);
      }
    }
  }, []);

  // ─── Handle element selection from iframe ──────────────────

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "element-click" && typeof e.data.path === "string") {
        setSelectedPath(e.data.path);
        setCurrentTag(tagMap[e.data.path] ?? null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [tagMap]);

  // ─── Apply tag ────────────────────────────────────────────

  const handleTag = useCallback((role: SemanticRole) => {
    if (!selectedPath) return;
    const newMap = { ...tagMap, [selectedPath]: role };
    setTagMap(newMap);
    setCurrentTag(role);

    // Update iframe: add data-semantic attribute to selected element
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: "apply-tag",
        path: selectedPath,
        role,
      }, "*");
    }
  }, [selectedPath, tagMap]);

  // ─── Clear tag ────────────────────────────────────────────

  const handleClearTag = useCallback(() => {
    if (!selectedPath) return;
    const newMap = { ...tagMap };
    delete newMap[selectedPath];
    setTagMap(newMap);
    setCurrentTag(null);

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: "clear-tag",
        path: selectedPath,
      }, "*");
    }
  }, [selectedPath, tagMap]);

  // ─── Toggle preview ───────────────────────────────────────

  const handleTogglePreview = useCallback(() => {
    setPreviewMode((p) => !p);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: "toggle-preview",
        preview: !previewMode,
        textSlots: sceneData?.scene.text_slots ?? [],
        tagMap,
      }, "*");
    }
  }, [previewMode, sceneData, tagMap]);

  // ─── Save ─────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!sceneData || !iframeRef.current?.contentWindow) return;

    // Get the updated HTML from iframe with data-semantic attributes
    iframeRef.current.contentWindow.postMessage({ type: "get-html" }, "*");

    const saveHandler = (e: MessageEvent) => {
      if (e.data?.type === "html-response" && typeof e.data.html === "string") {
        window.removeEventListener("message", saveHandler);
        sceneData.html = e.data.html;
        saveSceneData(sceneData);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };
    window.addEventListener("message", saveHandler);
  }, [sceneData]);

  // ─── Build iframe srcdoc ──────────────────────────────────

  const iframeSrcDoc = useMemo(() => {
    if (!sceneData) {
      return `<html><body style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;color:#888;font-family:sans-serif;font-size:14px;">No graphic data loaded.<br/>Send a graphic from AI Cuesheet first.</body></html>`;
    }

    const { html, css } = sceneData;

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 1920px; height: 1080px;
  overflow: hidden;
  font-family: 'Noto Sans KR', sans-serif;
  cursor: crosshair;
}
${css}

/* Selection highlight styles injected by parent */
[data-semantic] {
  outline: 2px dashed rgba(96, 165, 250, 0.5) !important;
  outline-offset: 2px !important;
}
[data-semantic]:hover {
  outline-color: rgba(96, 165, 250, 0.8) !important;
}
.gt-selected {
  outline: 3px solid rgba(250, 204, 21, 0.9) !important;
  outline-offset: 3px !important;
  animation: gt-pulse 1.2s ease-in-out infinite;
}
@keyframes gt-pulse {
  0%, 100% { outline-color: rgba(250, 204, 21, 0.9); }
  50% { outline-color: rgba(250, 204, 21, 0.3); }
}

/* Preview mode: hide outlines */
.gt-preview-mode [data-semantic] {
  outline: none !important;
}
.gt-preview-mode .gt-selected {
  outline: none !important;
  animation: none;
}
</style>
</head>
<body>
${html}

<script>
(function() {
  var selectedEl = null;
  var previewMode = false;

  function buildPath(el) {
    if (!el || el === document.body) return 'body';
    var path = [];
    var current = el;
    while (current && current !== document.body) {
      var tag = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift(tag + '#' + current.id);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        var cls = current.className.trim().split(/\\\s+/).slice(0,2).join('.');
        if (cls) tag += '.' + cls;
      }
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) {
          return c.tagName === current.tagName;
        });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          tag += ':nth-of-type(' + idx + ')';
        }
      }
      path.unshift(tag);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  // Intercept clicks for element selection
  document.addEventListener('click', function(e) {
    if (previewMode) return;
    e.preventDefault();
    e.stopPropagation();

    // Clear previous selection
    if (selectedEl) {
      selectedEl.classList.remove('gt-selected');
    }

    selectedEl = e.target;
    selectedEl.classList.add('gt-selected');

    var path = buildPath(selectedEl);
    var currentRole = selectedEl.getAttribute('data-semantic') || null;

    window.parent.postMessage({
      type: 'element-click',
      path: path,
      currentRole: currentRole
    }, '*');
  }, true);

  // Handle messages from parent
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'apply-tag':
        var el = document.querySelector(msg.path);
        if (!el) {
          // Fallback: find by traversing
          var parts = msg.path.split(' > ');
          el = document.body;
          for (var i = 1; i < parts.length && el; i++) {
            try { el = el.querySelector(parts.slice(i).join(' > ')); } catch(_) { el = null; }
          }
        }
        if (el && msg.role) {
          el.setAttribute('data-semantic', msg.role);
        }
        break;

      case 'clear-tag':
        var el2 = document.querySelector(msg.path);
        if (el2) {
          el2.removeAttribute('data-semantic');
        }
        break;

      case 'toggle-preview':
        previewMode = msg.preview;
        if (msg.preview) {
          document.body.classList.add('gt-preview-mode');
          // Inject text values into tagged elements
          var slots = msg.textSlots || [];
          var tagMap = msg.tagMap || {};
          // Build reverse map: role → text value
          var roleValues = {};
          slots.forEach(function(s) {
            roleValues[s.semantic_role] = s.value;
          });

          // Apply text to tagged elements
          document.querySelectorAll('[data-semantic]').forEach(function(el) {
            var role = el.getAttribute('data-semantic');
            if (role && roleValues[role]) {
              el.textContent = roleValues[role];
            }
          });
        } else {
          document.body.classList.remove('gt-preview-mode');
          // Reload original text (from non-semantic backup)
          // For simplicity, reload the iframe
          location.reload();
        }
        break;

      case 'get-html':
        // Return the current HTML with data-semantic attributes
        window.parent.postMessage({
          type: 'html-response',
          html: document.body.innerHTML
        }, '*');
        break;
    }
  });
})();
<\/script>
</body>
</html>`;
  }, [sceneData]);

  // ─── Empty state ──────────────────────────────────────────

  if (!sceneData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <Tag size={48} className="text-[var(--text-muted)]" />
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)] mb-2">Broadcast Graphics Workbench</h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            AI 큐시트에서 생성된 HTML 방송 그래픽에 <code className="px-1 py-0.5 rounded bg-[var(--app-bg)] text-[11px]">data-semantic</code> 바인딩을 적용합니다.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[var(--app-bg)] border border-[var(--border-primary)] text-xs text-[var(--text-muted)] max-w-sm text-left space-y-2">
          <p className="font-semibold text-[var(--text-secondary)]">사용 방법</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>AI 큐시트 → Step 3에서 방송 그래픽 생성</li>
            <li>"Send to Workbench" 버튼 클릭</li>
            <li>이 페이지에서 요소를 클릭하여 semantic role 바인딩</li>
            <li>Preview 모드로 실제 텍스트 확인</li>
            <li>저장 후 Workbench에서 다시 열기</li>
          </ol>
        </div>
      </div>
    );
  }

  // ─── Scene info ───────────────────────────────────────────

  const { scene, programTitle } = sceneData;
  const taggedCount = Object.keys(tagMap).length;
  const slotCount = scene.text_slots.length;

  return (
    <div className="flex flex-col h-full p-6 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/dashboard/ai-cuesheet" })}
            className="p-1 hover:bg-[var(--app-bg)] rounded"
          >
            <ArrowLeft size={18} className="text-[var(--text-secondary)]" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-[var(--text-primary)]">
              Broadcast Graphics Workbench
            </h1>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {programTitle} — Scene {scene.order}: {scene.trigger}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Preview toggle */}
          <Button
            size="sm"
            variant={previewMode ? "default" : "ghost"}
            onClick={handleTogglePreview}
            className="text-xs gap-1"
          >
            {previewMode ? <EyeOff size={13} /> : <Eye size={13} />}
            {previewMode ? "Edit" : "Preview"}
          </Button>

          {/* Save */}
          <Button size="sm" onClick={handleSave} className="text-xs gap-1">
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: iframe */}
        <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-[var(--border-primary)] bg-black relative">
          <div
            className="absolute inset-0"
            style={{
              aspectRatio: "16/9",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={iframeSrcDoc}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="Broadcast Graphics Workbench Canvas"
            />
          </div>
        </div>

        {/* Right: Inspector Panel */}
        <div className="w-64 shrink-0 flex flex-col gap-3">
          {/* Selection Info */}
          <div className="p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--border-primary)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Inspector
            </div>

            {selectedPath ? (
              <>
                <div className="text-[11px] text-[var(--text-secondary)] mb-1">
                  Selected:
                </div>
                <code className="block text-[10px] text-amber-400 bg-black/30 p-1.5 rounded mb-2 break-all leading-relaxed">
                  {selectedPath}
                </code>

                <div className="text-[11px] text-[var(--text-secondary)] mb-1">
                  Current tag:
                </div>
                {currentTag ? (
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border",
                    SEMANTIC_ROLES.find((r) => r.role === currentTag)?.color,
                  )}>
                    <Tag size={9} />
                    {currentTag}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)] italic">None</span>
                )}
              </>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Click an element in the graphic to select it, then assign a semantic role.
              </p>
            )}
          </div>

          {/* Tag Assignment */}
          <div className="p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--border-primary)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Tag as
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SEMANTIC_ROLES.map(({ role, label, color }) => (
                <button
                  key={role}
                  onClick={() => handleTag(role)}
                  disabled={!selectedPath}
                  className={cn(
                    "px-2.5 py-1 rounded text-[10px] border transition-all",
                    color,
                    currentTag === role
                      ? "ring-2 ring-white/30"
                      : "opacity-70 hover:opacity-100",
                    !selectedPath && "opacity-30 cursor-not-allowed",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {currentTag && selectedPath && (
              <button
                onClick={handleClearTag}
                className="flex items-center gap-1 mt-2 text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                <X size={10} /> Clear Tag
              </button>
            )}
          </div>

          {/* Text Slots from AI Cuesheet */}
          <div className="p-3 rounded-xl bg-[var(--app-bg)] border border-[var(--border-primary)] flex-1 overflow-y-auto">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Text Values ({taggedCount}/{slotCount} tagged)
            </div>
            <div className="space-y-1.5">
              {scene.text_slots.map((slot, i) => {
                const isTagged = Object.values(tagMap).includes(slot.semantic_role);
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 p-1.5 rounded text-[10px] transition-colors",
                      isTagged
                        ? "bg-green-500/5 border border-green-500/20"
                        : "bg-transparent border border-transparent",
                    )}
                  >
                    <span className={cn(
                      "px-1 py-0.5 rounded font-medium shrink-0",
                      SEMANTIC_ROLES.find((r) => r.role === slot.semantic_role)?.color ?? "bg-gray-500/10 text-gray-400",
                    )}>
                      {slot.semantic_role}
                    </span>
                    <span className="text-[var(--text-primary)] font-medium truncate">
                      {slot.value}
                    </span>
                    {isTagged && <Check size={9} className="text-green-400 shrink-0 ml-auto" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Connection Status */}
          <div className="text-[10px] text-[var(--text-muted)] text-center">
            {taggedCount === slotCount && slotCount > 0
              ? "All text slots have tagged elements."
              : `${slotCount - taggedCount} slots still need tags.`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper: build selector path from element ──────────────────

function buildSelectorPath(el: HTMLElement, root: HTMLElement): string {
  if (!el || el === root) return "body";
  const path: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== root) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === "string") {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (cls) selector += `.${cls}`;
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(" > ");
}

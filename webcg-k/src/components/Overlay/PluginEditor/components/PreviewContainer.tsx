import { useEffect, useRef, useState } from "react";
import { GridZoneOverlay } from "./GridZoneOverlay";

export function PreviewContainer({
  iframeRef,
  srcdoc,
  zones,
  selectedZoneIds,
  onSelectZone,
  showGridOverlay,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  srcdoc: string;
  zones?: any[];
  selectedZoneIds?: string[];
  onSelectZone?: (ids: string[]) => void;
  showGridOverlay?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const scaleX = width / 1920;
        const scaleY = height / 1080;
        setScale(Math.min(scaleX, scaleY));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scaledWidth = 1920 * scale;
  const scaledHeight = 1080 * scale;

  return (
    <div ref={containerRef} style={{
      flex: 1, minHeight: "200px",
      background: "#666",
      backgroundImage: "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)",
      backgroundSize: "16px 16px",
      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
      position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        position: "relative",
        width: `${scaledWidth}px`, height: `${scaledHeight}px`,
        flexShrink: 0, overflow: "hidden",
      }}>
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          style={{
            position: "absolute", top: 0, left: 0,
            width: "1920px", height: "1080px",
            border: "none", background: "transparent",
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
          title="Plugin Preview"
        />
        {showGridOverlay && zones && zones.length > 0 && onSelectZone && selectedZoneIds && (
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "1920px", height: "1080px", position: "absolute", top: 0, left: 0 }}>
            <GridZoneOverlay
              zones={zones}
              selectedZoneIds={selectedZoneIds}
              onSelectZone={onSelectZone}
            />
          </div>
        )}
      </div>
      <div style={{
        position: "absolute", bottom: 6, right: 8,
        fontSize: "9px", color: "rgba(255,255,255,0.3)",
        fontFamily: "monospace", letterSpacing: "0.5px",
      }}>
        1920×1080 · {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

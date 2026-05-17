import { useCallback, useRef, useState } from "react";

export function useResizer() {
  const [editorWidthPercent, setEditorWidthPercent] = useState(55);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [previewHeightPercent, setPreviewHeightPercent] = useState(60);
  const [isVDragging, setIsVDragging] = useState(false);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      setEditorWidthPercent(Math.min(80, Math.max(25, percent)));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleVResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsVDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!rightPaneRef.current) return;
      const rect = rightPaneRef.current.getBoundingClientRect();
      const y = moveEvent.clientY - rect.top;
      const percent = (y / rect.height) * 100;
      setPreviewHeightPercent(Math.min(85, Math.max(25, percent)));
    };

    const onMouseUp = () => {
      setIsVDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  return {
    editorWidthPercent,
    isDragging,
    containerRef,
    previewHeightPercent,
    isVDragging,
    rightPaneRef,
    handleResizeStart,
    handleVResizeStart,
  };
}

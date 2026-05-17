/**
 * Graphics Editor - 메인 컴포넌트
 * Penpot 스타일 3-Pane 레이아웃
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Canvas } from "./Canvas/Canvas";
import { ToolbarPanel } from "./Panels/ToolbarPanel";
import { LayersPanel } from "./Panels/LayersPanel";
import { PropertiesPanel } from "./Panels/PropertiesPanel";
import { X, Image as ImageIcon, Layers, Loader2 } from "lucide-react";
import { fetchOverlayTemplates } from "@/services/dashboardService";
import { registerAction } from "@/lib/actions/actionRegistry";
import "./GraphicsEditor.css";

interface GraphicsEditorProps {
    elements: GraphicElement[];
    onElementsChange: (elements: GraphicElement[]) => void;
    gridTemplateId: string | null;
    onGridTemplateChange: (id: string | null) => void;
    canvasWidth: number;
    canvasHeight: number;
}

export function GraphicsEditor({
    elements,
    onElementsChange,
    gridTemplateId,
    onGridTemplateChange,
    canvasWidth: baseCanvasWidth,
    canvasHeight: baseCanvasHeight,
}: GraphicsEditorProps) {
    const { user } = useAuth();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeTool, setActiveTool] = useState<"select" | "rect" | "ellipse" | "text" | "image" | "html_plugin">("select");
    const centerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [fitZoom, setFitZoom] = useState(1);

    // 이미지 선택 모달 상태
    const [showImagePicker, setShowImagePicker] = useState(false);
    const [imageList, setImageList] = useState<{ id: string; name: string; url: string }[]>([]);
    const [imageLoading, setImageLoading] = useState(false);

    // 오버레이 선택 모달 상태
    const [showOverlayPicker, setShowOverlayPicker] = useState(false);
    const [overlayList, setOverlayList] = useState<{ id: string; name: string; source_code: { html: string; css: string; js: string }; zone_bounds?: { x: number; y: number; width: number; height: number } }[]>([]);
    const [overlayLoading, setOverlayLoading] = useState(false);

    // 자동 줌 계산 (스크롤 없이 화면에 맞춤)
    useEffect(() => {
        if (!centerRef.current) return;

        const calculateFitZoom = () => {
            if (!centerRef.current) return;
            const rect = centerRef.current.getBoundingClientRect();
            const padding = 48;
            const availableWidth = rect.width - padding;
            const availableHeight = rect.height - padding;

            // 캔버스가 가용 공간에 맞는 줌 레벨 계산
            const zoomX = availableWidth / baseCanvasWidth;
            const zoomY = availableHeight / baseCanvasHeight;
            const newFitZoom = Math.min(zoomX, zoomY, 1); // 최대 100%

            setFitZoom(newFitZoom);
            setZoom(newFitZoom); // 초기 줌을 fit으로 설정
        };

        calculateFitZoom();
        window.addEventListener("resize", calculateFitZoom);
        return () => window.removeEventListener("resize", calculateFitZoom);
    }, [baseCanvasWidth, baseCanvasHeight]);

    // 줌 조절 함수
    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.2));
    const handleFitToView = () => setZoom(fitZoom);
    const handleZoom100 = () => setZoom(1);

    // 선택된 요소들
    const selectedElements = elements.filter((el) => selectedIds.includes(el.id));

    // 요소 추가
    const addElement = useCallback((type: GraphicElement["type"]) => {
        // 타입별 번호 계산
        const typeNames: Record<string, string> = {
            rect: "사각형",
            ellipse: "원",
            text: "텍스트",
            image: "이미지",
            group: "그룹",
            html_plugin: "오버레이",
        };
        const baseName = typeNames[type] || "요소";
        const existingCount = elements.filter((el) => el.type === type).length;
        const newName = `${baseName} ${existingCount + 1}`;

        const newElement: GraphicElement = {
            id: `el-${Date.now()}`,
            type,
            name: newName,
            x: 100,
            y: 100,
            width: type === "text" ? 200 : type === "ellipse" ? 120 : 150,
            height: type === "text" ? 40 : type === "ellipse" ? 120 : 100,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: elements.length,
            parentId: null,
            // 기본 스타일
            fill: { type: "solid", color: type === "text" ? "#ffffff" : "#3b82f6" },
            stroke: { color: type === "text" ? "#000000" : "#1e40af", width: type === "text" ? 0 : 2, style: "solid" },
            borderRadius: 0,
            // 텍스트 기본값 (라벨과 동일한 이름으로 설정)
            content: type === "text" ? newName : undefined,
            fontFamily: "Noto Sans KR",
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 0,
            textAlign: "left",
            verticalAlign: "top",
            textCase: "none",
            textDecoration: "none",
        };

        onElementsChange([...elements, newElement]);
        setSelectedIds([newElement.id]);
        setActiveTool("select");
    }, [elements, onElementsChange]);

    // 이미지 라이브러리 불러오기
    const loadImageLibrary = useCallback(async () => {
        if (!user) return;
        setImageLoading(true);
        try {
            const { data: images, error } = await supabase
                .from("images")
                .select("id, name, storage_path")
                .eq("owner_id", user.id)
                .order("created_at", { ascending: false })
                .limit(50);

            if (!error && images) {
                const imagesWithUrls = images.map((img: any) => ({
                    id: img.id,
                    name: img.name,
                    url: supabase.storage.from("images").getPublicUrl(img.storage_path).data.publicUrl,
                }));
                setImageList(imagesWithUrls);
            }
        } catch (error) {
            console.error("Error loading images:", error);
        } finally {
            setImageLoading(false);
        }
    }, [user]);

    // 이미지 선택 핸들러
    const handleImageSelect = useCallback((image: { id: string; name: string; url: string }) => {
        const newElement: GraphicElement = {
            id: `el-${Date.now()}`,
            type: "image",
            name: image.name,
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: elements.length,
            parentId: null,
            src: image.url,
            objectFit: "contain",
        };

        onElementsChange([...elements, newElement]);
        setSelectedIds([newElement.id]);
        setShowImagePicker(false);
        setActiveTool("select");
    }, [elements, onElementsChange]);

    // 이미지/오버레이 도구 클릭 시 모달 열기
    const handleAddElementOrOpenPicker = useCallback((type: GraphicElement["type"]) => {
        if (type === "image") {
            setShowImagePicker(true);
            loadImageLibrary();
        } else if (type === "html_plugin") {
            setShowOverlayPicker(true);
            loadOverlayLibrary();
        } else {
            addElement(type);
        }
    }, [addElement, loadImageLibrary]);

    // 오버레이 라이브러리 불러오기
    const loadOverlayLibrary = useCallback(async () => {
        setOverlayLoading(true);
        try {
            // ■ Why fetchOverlayTemplates를 재사용하는가?
            //   dashboardService에 이미 정의된 함수를 그대로 활용하여 코드 중복 방지.
            //   plugin_type === "html" 이고 source_code가 있는 것만 필터링.
            const all = await fetchOverlayTemplates<any>();
            const htmlPlugins = all.filter(
                (t: any) => t.plugin_type === "html" && t.source_code
            );
            setOverlayList(htmlPlugins.map((t: any) => ({
                id: t.id,
                name: t.name,
                source_code: t.source_code,
                zone_bounds: t.zone_bounds ?? undefined,
            })));
        } catch (error) {
            console.error("Error loading overlays:", error);
        } finally {
            setOverlayLoading(false);
        }
    }, []);

    // 오버레이 선택 핸들러
    const handleOverlaySelect = useCallback((overlay: { id: string; name: string; source_code: { html: string; css: string; js: string }; zone_bounds?: { x: number; y: number; width: number; height: number } }) => {
        // ■ Why zone_bounds 사용?
        //   AI로 오버레이 생성 시 그리드 영역(zone_bounds)을 지정하여 생성하므로,
        //   그 크기를 그대로 그래픽 에디터에도 적용해야 WYSIWYG 파리티 유지.
        const zb = overlay.zone_bounds;
        const newElement: GraphicElement = {
            id: `el-${Date.now()}`,
            type: "html_plugin",
            name: `오버레이: ${overlay.name}`,
            x: zb?.x ?? 0,
            y: zb?.y ?? 0,
            width: zb?.width ?? 1920,
            height: zb?.height ?? 1080,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: elements.length,
            parentId: null,
            // 플러그인 전용 속성
            pluginTemplateId: overlay.id,
            pluginTemplateName: overlay.name,
            pluginSourceCode: overlay.source_code,
        };

        onElementsChange([...elements, newElement]);
        setSelectedIds([newElement.id]);
        setShowOverlayPicker(false);
        setActiveTool("select");
    }, [elements, onElementsChange]);

    // 요소 업데이트 (그룹 이동 시 자식들도 함께 이동)
    const updateElement = useCallback((id: string, updates: Partial<GraphicElement>) => {
        const element = elements.find((el) => el.id === id);
        if (!element) return;

        // 그룹 요소인 경우 자식들도 이동
        if (element.type === "group" && element.children && (updates.x !== undefined || updates.y !== undefined)) {
            const dx = (updates.x !== undefined ? updates.x - element.x : 0);
            const dy = (updates.y !== undefined ? updates.y - element.y : 0);

            onElementsChange(
                elements.map((el) => {
                    if (el.id === id) {
                        return { ...el, ...updates };
                    }
                    // 자식 요소도 이동
                    if (element.children!.includes(el.id)) {
                        return { ...el, x: el.x + dx, y: el.y + dy };
                    }
                    return el;
                })
            );
        } else {
            onElementsChange(
                elements.map((el) => (el.id === id ? { ...el, ...updates } : el))
            );
        }
    }, [elements, onElementsChange]);

    // 요소 삭제 (그룹 삭제 시 자식 요소는 독립 요소로 복원)
    const deleteElements = useCallback((ids: string[]) => {
        // 삭제할 그룹 찾기
        const groupsToDelete = elements.filter((el) => ids.includes(el.id) && el.type === "group");

        // 자식 요소들의 parentId를 null로 설정
        const childIdsToFree = new Set<string>();
        for (const group of groupsToDelete) {
            if (group.children) {
                group.children.forEach((childId) => childIdsToFree.add(childId));
            }
        }

        const newElements = elements
            .filter((el) => !ids.includes(el.id)) // 선택된 요소 삭제
            .map((el) => {
                // 자식 요소는 독립 요소로 복원
                if (childIdsToFree.has(el.id)) {
                    return { ...el, parentId: null };
                }
                return el;
            });

        onElementsChange(newElements);
        setSelectedIds([]);
    }, [elements, onElementsChange]);

    // 레이어 순서 변경 (드래그앤드롭 - zIndex 기준)
    const reorderElements = useCallback((fromIndex: number, toIndex: number) => {
        // zIndex 기준 정렬된 배열 생성 (높은 zIndex = 상단)
        const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);

        // 드래그한 요소 추출
        const [movedElement] = sortedElements.splice(fromIndex, 1);
        // 새 위치에 삽입
        sortedElements.splice(toIndex, 0, movedElement);

        // 새 zIndex 할당 (역순으로 - 상단이 높은 zIndex)
        const updatedElements = elements.map((el) => {
            const newIndex = sortedElements.findIndex((se) => se.id === el.id);
            if (newIndex !== -1) {
                return { ...el, zIndex: sortedElements.length - 1 - newIndex };
            }
            return el;
        });

        onElementsChange(updatedElements);
    }, [elements, onElementsChange]);

    // 그룹화 (Ctrl+G) - 요소들을 그룹으로 묶기
    const groupElements = useCallback(() => {
        if (selectedIds.length < 2) return;

        const selectedElems = elements.filter((el) => selectedIds.includes(el.id));
        if (selectedElems.length < 2) return;

        // 바운딩 박스 계산
        const minX = Math.min(...selectedElems.map((el) => el.x));
        const minY = Math.min(...selectedElems.map((el) => el.y));
        const maxX = Math.max(...selectedElems.map((el) => el.x + el.width));
        const maxY = Math.max(...selectedElems.map((el) => el.y + el.height));

        // 그룹 요소 생성
        const groupId = `group-${Date.now()}`;
        const groupElement: GraphicElement = {
            id: groupId,
            type: "group",
            name: "그룹",
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: Math.max(...elements.map((el) => el.zIndex)) + 1,
            parentId: null,
            children: selectedIds,
        };

        // 자식 요소의 parentId만 업데이트 (좌표는 그대로 유지)
        const updatedElements = elements.map((el) => {
            if (selectedIds.includes(el.id)) {
                return {
                    ...el,
                    parentId: groupId,
                };
            }
            return el;
        });

        onElementsChange([...updatedElements, groupElement]);
        setSelectedIds([groupId]);
    }, [elements, selectedIds, onElementsChange]);

    // 그룹 해제 (Ctrl+Shift+G) - 좌표는 그대로 유지
    const ungroupElements = useCallback(() => {
        const selectedElems = elements.filter((el) => selectedIds.includes(el.id) && el.type === "group");
        if (selectedElems.length === 0) return;

        let newElements = [...elements];
        const newSelection: string[] = [];

        for (const group of selectedElems) {
            if (!group.children) continue;

            // 자식 요소의 parentId만 해제 (좌표는 그대로 유지)
            newElements = newElements.map((el) => {
                if (group.children!.includes(el.id)) {
                    newSelection.push(el.id);
                    return {
                        ...el,
                        parentId: null,
                    };
                }
                return el;
            });

            // 그룹 요소 제거
            newElements = newElements.filter((el) => el.id !== group.id);
        }

        onElementsChange(newElements);
        setSelectedIds(newSelection);
    }, [elements, selectedIds, onElementsChange]);

    // 🆕 정렬 기능 (상/중/하, 좌/중/우)
    const alignElements = useCallback((alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') => {
        if (selectedIds.length === 0) return;
        
        const selectedElems = elements.filter(el => selectedIds.includes(el.id));
        
        // 단일 선택 시: 캔버스 기준 정렬
        let minX, minY, maxX, maxY;
        if (selectedElems.length === 1) {
            minX = 0;
            minY = 0;
            maxX = baseCanvasWidth;
            maxY = baseCanvasHeight;
        } else {
            // 다중 선택 시: 선택된 요소들의 Bounding Box 기준
            minX = Math.min(...selectedElems.map(el => el.x));
            minY = Math.min(...selectedElems.map(el => el.y));
            maxX = Math.max(...selectedElems.map(el => el.x + el.width));
            maxY = Math.max(...selectedElems.map(el => el.y + el.height));
        }

        const newElements = elements.map(el => {
            if (!selectedIds.includes(el.id)) return el;
            let { x, y } = el;
            switch (alignment) {
                case 'top': y = minY; break;
                case 'middle': y = minY + (maxY - minY) / 2 - el.height / 2; break;
                case 'bottom': y = maxY - el.height; break;
                case 'left': x = minX; break;
                case 'center': x = minX + (maxX - minX) / 2 - el.width / 2; break;
                case 'right': x = maxX - el.width; break;
            }
            return { ...el, x, y };
        });
        onElementsChange(newElements);
    }, [elements, selectedIds, onElementsChange, baseCanvasWidth, baseCanvasHeight]);

    // 🆕 균등 분배 기능 (수평/수직)
    const distributeElements = useCallback((type: 'horizontal' | 'vertical') => {
        if (selectedIds.length < 3) return; // 3개 이상일 때만 의미 있음
        
        const selectedElems = elements.filter(el => selectedIds.includes(el.id));
        
        // 좌표 기준으로 오름차순 정렬
        const sortedElems = [...selectedElems].sort((a, b) => 
            type === 'horizontal' ? a.x - b.x : a.y - b.y
        );

        const first = sortedElems[0];
        const last = sortedElems[sortedElems.length - 1];
        const newPositions = new Map<string, number>();
        
        if (type === 'horizontal') {
            const totalWidth = sortedElems.reduce((sum, el) => sum + el.width, 0);
            const totalDistance = (last.x + last.width) - first.x;
            const gap = (totalDistance - totalWidth) / (sortedElems.length - 1);
            
            let currentX = first.x;
            sortedElems.forEach((el) => {
                newPositions.set(el.id, currentX);
                currentX += el.width + gap;
            });
            
            onElementsChange(elements.map(el => 
                newPositions.has(el.id) ? { ...el, x: newPositions.get(el.id)! } : el
            ));
        } else {
            const totalHeight = sortedElems.reduce((sum, el) => sum + el.height, 0);
            const totalDistance = (last.y + last.height) - first.y;
            const gap = (totalDistance - totalHeight) / (sortedElems.length - 1);
            
            let currentY = first.y;
            sortedElems.forEach((el) => {
                newPositions.set(el.id, currentY);
                currentY += el.height + gap;
            });
            
            onElementsChange(elements.map(el => 
                newPositions.has(el.id) ? { ...el, y: newPositions.get(el.id)! } : el
            ));
        }
    }, [elements, selectedIds, onElementsChange]);

    // 🆕 도형 복제 기능 (Ctrl+D)
    const duplicateElements = useCallback(() => {
        if (selectedIds.length === 0) return;

        // 하위 요소(자식)까지 포함하여 복제 대상 ID 추출
        const getDescendantIds = (parentId: string): string[] => {
            const children = elements.filter(e => e.parentId === parentId);
            let ids: string[] = [];
            children.forEach(c => {
                ids.push(c.id);
                ids = ids.concat(getDescendantIds(c.id));
            });
            return ids;
        };

        const idsToDuplicate = new Set<string>();
        selectedIds.forEach(id => {
            idsToDuplicate.add(id);
            getDescendantIds(id).forEach(childId => idsToDuplicate.add(childId));
        });

        const toDuplicate = elements.filter(el => idsToDuplicate.has(el.id));
        if (toDuplicate.length === 0) return;

        // 유니크 ID 발급 맵 (원본 ID -> 새 ID)
        const idMap = new Map<string, string>();
        toDuplicate.forEach(el => {
            idMap.set(el.id, `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        });

        const newElements = toDuplicate.map(el => {
            const newParentId = el.parentId && idMap.has(el.parentId) ? idMap.get(el.parentId) : el.parentId;
            
            // 최상위 요소(루트 또는 부모가 함께 복제되지 않은 요소)만 20px 오프셋 이동
            const isTopLevelInSelection = !el.parentId || !idMap.has(el.parentId);
            
            return {
                ...el,
                id: idMap.get(el.id)!,
                parentId: newParentId ?? null,
                x: isTopLevelInSelection ? el.x + 20 : el.x,
                y: isTopLevelInSelection ? el.y + 20 : el.y,
            };
        });

        onElementsChange([...elements, ...newElements]);
        
        // 원본 선택 목록과 매핑되는 새로운 ID들만 선택 상태로 변경
        const newSelectedIds = selectedIds.map(id => idMap.get(id)).filter(Boolean) as string[];
        setSelectedIds(newSelectedIds);
    }, [elements, selectedIds, onElementsChange]);

    // Action 시스템 — 선언적 단축키 등록 (디스패처는 상위 $graphicId.tsx에서 활성화)
    useEffect(() => {
        const unregDelete = registerAction({
            id: "deleteSelected",
            label: "선택 요소 삭제",
            shortcut: "Delete",
            context: "editor",
            predicate: () => selectedIds.length > 0,
            execute: () => deleteElements(selectedIds),
        });
        const unregDuplicate = registerAction({
            id: "duplicateElements",
            label: "요소 복제",
            shortcut: "Ctrl+D",
            context: "editor",
            predicate: () => selectedIds.length > 0,
            execute: () => duplicateElements(),
        });
        const unregGroup = registerAction({
            id: "groupElements",
            label: "그룹화",
            shortcut: "Ctrl+G",
            context: "editor",
            predicate: () => selectedIds.length >= 2,
            execute: () => groupElements(),
        });
        const unregUngroup = registerAction({
            id: "ungroupElements",
            label: "그룹 해제",
            shortcut: "Ctrl+Shift+G",
            context: "editor",
            predicate: () => selectedIds.length > 0,
            execute: () => ungroupElements(),
        });

        return () => {
            unregDelete();
            unregDuplicate();
            unregGroup();
            unregUngroup();
        };
    }, [selectedIds, deleteElements, duplicateElements, groupElements, ungroupElements]);

    return (
        <div className="graphics-editor">
            {/* 좌측: 툴바 + 레이어 */}
            <div className="graphics-editor-left">
                <ToolbarPanel
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onAddElement={handleAddElementOrOpenPicker}
                    selectedCount={selectedIds.length}
                    onAlign={alignElements}
                    onDistribute={distributeElements}
                />
                <LayersPanel
                    elements={elements}
                    selectedIds={selectedIds}
                    onSelect={setSelectedIds}
                    onUpdate={updateElement}
                    onReorder={reorderElements}
                    onDelete={deleteElements}
                />
            </div>

            {/* 중앙: 캔버스 */}
            <div className="graphics-editor-center" ref={centerRef}>
                {/* 스크롤 가능한 캔버스 영역 */}
                <div className="canvas-scroll-area">
                    <Canvas
                        elements={elements}
                        selectedIds={selectedIds}
                        onSelect={setSelectedIds}
                        onUpdate={updateElement}
                        gridTemplateId={gridTemplateId}
                        onGridTemplateChange={onGridTemplateChange}
                        canvasWidth={baseCanvasWidth}
                        canvasHeight={baseCanvasHeight}
                        zoom={zoom}
                        activeTool={activeTool}
                        onAddElement={addElement}
                    />
                </div>
                {/* 줌 컨트롤 — 스크롤 영역 밖에서 하단 고정 */}
                <div className="zoom-controls">
                    <button type="button" onClick={handleZoomOut} title="축소">−</button>
                    <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={handleZoomIn} title="확대">+</button>
                    <button type="button" onClick={handleFitToView} title="화면에 맞춤">⊡</button>
                    <button type="button" onClick={handleZoom100} title="100%">1:1</button>
                </div>
            </div>

            {/* 우측: 속성 패널 */}
            <div className="graphics-editor-right">
                <PropertiesPanel
                    selectedElements={selectedElements}
                    onUpdate={updateElement}
                    gridTemplateId={gridTemplateId}
                    onGridTemplateChange={onGridTemplateChange}
                />
            </div>

            {/* 이미지 선택 모달 */}
            {showImagePicker && (
                <div className="image-picker-overlay" onClick={() => setShowImagePicker(false)}>
                    <div className="image-picker-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="image-picker-header">
                            <h3>이미지 선택</h3>
                            <button type="button" onClick={() => setShowImagePicker(false)} className="image-picker-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="image-picker-content">
                            {imageLoading ? (
                                <div className="image-picker-loading">
                                    <Loader2 className="animate-spin" size={32} />
                                </div>
                            ) : imageList.length === 0 ? (
                                <div className="image-picker-empty">
                                    <ImageIcon size={48} />
                                    <p>이미지 라이브러리가 비어있습니다.</p>
                                    <p className="text-secondary">대시보드 ⇒ 이미지에서 업로드하세요.</p>
                                </div>
                            ) : (
                                <div className="image-picker-grid">
                                    {imageList.map((image) => (
                                        <div
                                            key={image.id}
                                            className="image-picker-item"
                                            onClick={() => handleImageSelect(image)}
                                        >
                                            <img src={image.url} alt={image.name} />
                                            <span className="image-picker-item-name">{image.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 오버레이 선택 모달 */}
            {showOverlayPicker && (
                <div className="image-picker-overlay" onClick={() => setShowOverlayPicker(false)}>
                    <div className="image-picker-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="image-picker-header">
                            <h3><Layers size={18} style={{ marginRight: 6 }} /> 오버레이 선택</h3>
                            <button type="button" onClick={() => setShowOverlayPicker(false)} className="image-picker-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="image-picker-content">
                            {overlayLoading ? (
                                <div className="image-picker-loading">
                                    <Loader2 className="animate-spin" size={32} />
                                </div>
                            ) : overlayList.length === 0 ? (
                                <div className="image-picker-empty">
                                    <Layers size={48} />
                                    <p>HTML 오버레이가 없습니다.</p>
                                    <p className="text-secondary">대시보드 ⇒ 오버레이에서 먼저 만들어주세요.</p>
                                </div>
                            ) : (
                                <div className="image-picker-grid">
                                    {overlayList.map((overlay) => (
                                        <div
                                            key={overlay.id}
                                            className="image-picker-item"
                                            onClick={() => handleOverlaySelect(overlay)}
                                            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
                                        >
                                            <Layers size={28} style={{ color: "#818cf8", marginBottom: 4 }} />
                                            <span className="image-picker-item-name">{overlay.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

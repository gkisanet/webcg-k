/**
 * Grid Split Editor
 * FancyZones 스타일 클릭 기반 영역 분할 편집기
 */

import { useState, useRef, useCallback, useEffect, useMemo, MouseEvent } from "react";
import { Scissors, Ruler } from "lucide-react";

// 분할선 타입
export interface SplitLine {
    id: string;
    orientation: "horizontal" | "vertical";
    position: number; // 0~100 퍼센트
    start: number; // 시작점 (0~100)
    end: number; // 끝점 (0~100)
    parentId: string | null; // 부모 영역 ID
}


// 영역 타입 (분할선으로 정의된 구역)
export interface Zone {
    id: string;
    x: number; // 0~100
    y: number; // 0~100
    width: number; // 0~100
    height: number; // 0~100
}

interface GridSplitEditorProps {
    splits: SplitLine[];
    onSplitsChange: (splits: SplitLine[]) => void;
    onZonesChange?: (zones: Zone[]) => void;
    canvasWidth?: number;
    canvasHeight?: number;
    /** 배경 참고 이미지 URL — 그리드 분할 시 가이드로 사용 */
    backgroundImage?: string | null;
    /** 배경 이미지 투명도 (0~1, 기본 0.35) */
    backgroundOpacity?: number;
}

// 분할선으로부터 영역 계산 (start/end 범위 고려)
function calculateZones(splits: SplitLine[]): Zone[] {
    if (splits.length === 0) {
        return [{ id: "root", x: 0, y: 0, width: 100, height: 100 }];
    }

    // 재귀적으로 영역 분할
    const zones: Zone[] = [];

    function splitZone(zone: Zone, remainingSplits: SplitLine[]): void {
        // 이 영역에 적용 가능한 분할선 필터링
        // 선의 position이 영역 내에 있고, start/end 범위가 영역과 겹쳐야 함
        const applicableSplits = remainingSplits.filter((s) => {
            if (s.orientation === "vertical") {
                // 세로선: position이 x 범위 내, start/end가 y 범위와 겹침
                const inXRange = s.position > zone.x && s.position < zone.x + zone.width;
                const overlapsY = s.start < zone.y + zone.height && s.end > zone.y;
                return inXRange && overlapsY;
            } else {
                // 가로선: position이 y 범위 내, start/end가 x 범위와 겹침
                const inYRange = s.position > zone.y && s.position < zone.y + zone.height;
                const overlapsX = s.start < zone.x + zone.width && s.end > zone.x;
                return inYRange && overlapsX;
            }
        });

        if (applicableSplits.length === 0) {
            zones.push(zone);
            return;
        }

        const split = applicableSplits[0];
        const rest = remainingSplits.filter((s) => s.id !== split.id);

        if (split.orientation === "vertical") {
            // 세로선이 영역 전체를 커버하는지 확인
            const coversFullHeight = split.start <= zone.y && split.end >= zone.y + zone.height;

            if (coversFullHeight) {
                // 전체 커버 시 양분
                const leftZone: Zone = {
                    id: `${zone.id}-L`,
                    x: zone.x,
                    y: zone.y,
                    width: split.position - zone.x,
                    height: zone.height,
                };
                const rightZone: Zone = {
                    id: `${zone.id}-R`,
                    x: split.position,
                    y: zone.y,
                    width: zone.x + zone.width - split.position,
                    height: zone.height,
                };
                splitZone(leftZone, rest);
                splitZone(rightZone, rest);
            } else {
                // 부분 커버 시 3등분 (위/중간/아래)
                const splitStart = Math.max(split.start, zone.y);
                const splitEnd = Math.min(split.end, zone.y + zone.height);

                // 위쪽 영역 (분할선 위)
                if (splitStart > zone.y) {
                    splitZone({ id: `${zone.id}-T`, x: zone.x, y: zone.y, width: zone.width, height: splitStart - zone.y }, rest);
                }
                // 중간 영역 (분할선이 있는 부분) - 양분
                const midLeft: Zone = { id: `${zone.id}-ML`, x: zone.x, y: splitStart, width: split.position - zone.x, height: splitEnd - splitStart };
                const midRight: Zone = { id: `${zone.id}-MR`, x: split.position, y: splitStart, width: zone.x + zone.width - split.position, height: splitEnd - splitStart };
                splitZone(midLeft, rest);
                splitZone(midRight, rest);
                // 아래쪽 영역 (분할선 아래)
                if (splitEnd < zone.y + zone.height) {
                    splitZone({ id: `${zone.id}-B`, x: zone.x, y: splitEnd, width: zone.width, height: zone.y + zone.height - splitEnd }, rest);
                }
            }
        } else {
            // 가로선 처리
            const coversFullWidth = split.start <= zone.x && split.end >= zone.x + zone.width;

            if (coversFullWidth) {
                const topZone: Zone = {
                    id: `${zone.id}-T`,
                    x: zone.x,
                    y: zone.y,
                    width: zone.width,
                    height: split.position - zone.y,
                };
                const bottomZone: Zone = {
                    id: `${zone.id}-B`,
                    x: zone.x,
                    y: split.position,
                    width: zone.width,
                    height: zone.y + zone.height - split.position,
                };
                splitZone(topZone, rest);
                splitZone(bottomZone, rest);
            } else {
                const splitStart = Math.max(split.start, zone.x);
                const splitEnd = Math.min(split.end, zone.x + zone.width);

                // 왼쪽 영역
                if (splitStart > zone.x) {
                    splitZone({ id: `${zone.id}-L`, x: zone.x, y: zone.y, width: splitStart - zone.x, height: zone.height }, rest);
                }
                // 중간 영역 - 양분
                const midTop: Zone = { id: `${zone.id}-MT`, x: splitStart, y: zone.y, width: splitEnd - splitStart, height: split.position - zone.y };
                const midBottom: Zone = { id: `${zone.id}-MB`, x: splitStart, y: split.position, width: splitEnd - splitStart, height: zone.y + zone.height - split.position };
                splitZone(midTop, rest);
                splitZone(midBottom, rest);
                // 오른쪽 영역
                if (splitEnd < zone.x + zone.width) {
                    splitZone({ id: `${zone.id}-R`, x: splitEnd, y: zone.y, width: zone.x + zone.width - splitEnd, height: zone.height }, rest);
                }
            }
        }
    }

    splitZone({ id: "root", x: 0, y: 0, width: 100, height: 100 }, splits);
    return zones;
}

export function GridSplitEditor({
    splits,
    onSplitsChange,
    onZonesChange,
    canvasWidth = 1920,
    canvasHeight = 1080,
    backgroundImage = null,
    backgroundOpacity = 0.35,
}: GridSplitEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const guideBtnRef = useRef<HTMLDivElement>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    // 툴 모드: "split" = 구분선 나누기, "select" = 영역 선택 (사이즈 확인)
    const [toolMode, setToolMode] = useState<"split" | "select">("split");
    const [draggingSplit, setDraggingSplit] = useState<{
        id: string;
        startPos: number;
        startMousePos: number;
    } | null>(null);

    // 🆕 로컬 분할선 상태 관리 (마우스 드래그 중 고주파 리렌더가 부모로 실시간 전파되어 CPU가 100% 임계를 침범하는 현상 방지)
    const [localSplits, setLocalSplits] = useState<SplitLine[]>(splits);

    // 🆕 부모 splits와 로컬 동기화 (단, 드래그 중에는 부모의 laggy한 Prop에 덮어씌워지지 않도록 배제)
    useEffect(() => {
        if (!draggingSplit) {
            setLocalSplits(splits);
        }
    }, [splits, draggingSplit]);

    // 🆕 그리드 가이드 상태 (예: "2x4")
    const [gridGuide, setGridGuide] = useState<string>("");
    // 🎨 그리드 가이드 선택기 팝오버 상태
    const [showGridSelector, setShowGridSelector] = useState(false);
    const [hoverGuide, setHoverGuide] = useState<{cols: number; rows: number} | null>(null);
    const [guidePopoverStyle, setGuidePopoverStyle] = useState<{top: number; left: number}>({ top: 0, left: 0 });

    // 가이드 파싱
    const guideMatch = gridGuide.trim().match(/^(\d+)[xX](\d+)$/);
    const guideCols = guideMatch ? Math.max(1, parseInt(guideMatch[1])) : 1;
    const guideRows = guideMatch ? Math.max(1, parseInt(guideMatch[2])) : 1;

    // 🆕 동적 그리드 가이드 스냅 헬퍼 (스냅 범위: 4%)
    const snapToGuideline = useCallback((value: number, orientation: "vertical" | "horizontal"): number => {
        const snapThreshold = 4; // 자석 효과 강화 (3 -> 4)
        const divisions = orientation === "vertical" ? guideCols : guideRows;
        
        if (divisions <= 1) {
            // 기본 50% 스냅
            if (Math.abs(value - 50) < snapThreshold) return 50;
            return value;
        }

        const step = 100 / divisions;
        // 가장 가까운 스냅 포인트 찾기
        const closestStepIndex = Math.round(value / step);
        const closestSnapValue = closestStepIndex * step;

        if (Math.abs(value - closestSnapValue) < snapThreshold) {
            return closestSnapValue;
        }
        return value;
    }, [guideCols, guideRows]);

    // Undo/Redo 히스토리 (localSplits 기반)
    const [history, setHistory] = useState<SplitLine[][]>([splits]);
    const [historyIndex, setHistoryIndex] = useState(0);

    // 히스토리에 상태 추가 (변경 시 호출)
    const pushHistory = useCallback((newSplits: SplitLine[]) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(newSplits);
            // 최대 50개 히스토리 유지
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
    }, [historyIndex]);

    // 분할선 변경 시 히스토리 추가 및 로컬/부모 상태 동기화
    const handleSplitsChange = useCallback((newSplits: SplitLine[]) => {
        setLocalSplits(newSplits);
        pushHistory(newSplits);
        onSplitsChange(newSplits);
    }, [pushHistory, onSplitsChange]);

    // Undo
    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const targetSplits = history[newIndex];
            setLocalSplits(targetSplits);
            onSplitsChange(targetSplits);
        }
    }, [historyIndex, history, onSplitsChange]);

    // Redo
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const targetSplits = history[newIndex];
            setLocalSplits(targetSplits);
            onSplitsChange(targetSplits);
        }
    }, [historyIndex, history, onSplitsChange]);

    // 키보드 이벤트
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setIsShiftPressed(true);

            // Undo: Ctrl+Z
            if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
            // Redo: Ctrl+Shift+Z
            if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
                e.preventDefault();
                redo();
            }

            if (e.key === "Delete" && selectedSplitId) {
                handleSplitsChange(localSplits.filter((s) => s.id !== selectedSplitId));
                setSelectedSplitId(null);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") setIsShiftPressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [selectedSplitId, localSplits, handleSplitsChange, undo, redo]);

    // 가이드 팝오버 위치 계산 — .grid-split-info의 overflow-x:auto가
    // CSS spec에 따라 overflow-y:auto로 계산되어 팝오버를 클리핑하므로,
    // 팝오버를 .grid-split-editor 레벨로 탈출시켜 위치시킨다.
    useEffect(() => {
        if (!showGridSelector || !guideBtnRef.current) return;
        const updatePos = () => {
            const btn = guideBtnRef.current;
            if (!btn) return;
            const btnRect = btn.getBoundingClientRect();
            const editor = btn.closest('.grid-split-editor');
            if (!editor) return;
            const editorRect = editor.getBoundingClientRect();
            setGuidePopoverStyle({
                top: btnRect.bottom - editorRect.top + 4,
                left: btnRect.left - editorRect.left + 12, // 0.75rem offset matches original paddingLeft
            });
        };
        updatePos();
        window.addEventListener('resize', updatePos);
        return () => window.removeEventListener('resize', updatePos);
    }, [showGridSelector]);

    // 마우스 위치를 퍼센트로 변환
    // ■ Why 가장자리 스냅?
    //   마우스 커서가 요소 내부에서 도달 가능한 최대 좌표는 ~(W - 0.5)px이다.
    //   이를 그대로 퍼센트로 환산하면 99.94% 정도가 최대값이 되어,
    //   논리 좌표가 1919까지만 표시되고 1920에 도달하지 못한다.
    //   가장자리 1 CSS 픽셀 이내에서 0% 또는 100%로 스냅하여
    //   커서가 캔버스 끝에서 정확히 (1920, 1080)을 표시하도록 보정한다.
    const getMousePercent = useCallback(
        (e: MouseEvent) => {
            if (!containerRef.current) return null;
            const rect = containerRef.current.getBoundingClientRect();
            const rawX = ((e.clientX - rect.left) / rect.width) * 100;
            const rawY = ((e.clientY - rect.top) / rect.height) * 100;

            // 2 CSS 픽셀에 해당하는 퍼센트 (가장자리 스냅 임계값)
            // ■ Why 2px? 브라우저의 서브픽셀 렌더링, 고DPI 디스플레이,
            //   onMouseLeave 직전의 마지막 이벤트 보고 타이밍 등으로 인해
            //   커서가 경계에서 1px 이상 안쪽에서 마지막 이벤트를 발생시킬 수 있다.
            const snapX = (200 / rect.width);
            const snapY = (200 / rect.height);

            const x = rawX <= snapX ? 0 : rawX >= 100 - snapX ? 100 : rawX;
            const y = rawY <= snapY ? 0 : rawY >= 100 - snapY ? 100 : rawY;

            return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
        },
        [],
    );

    // 마우스 이동
    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            const pos = getMousePercent(e);
            setMousePos(pos);

            // 드래그 중인 분할선 이동
            if (draggingSplit && pos) {
                const split = localSplits.find((s) => s.id === draggingSplit.id);
                if (split) {
                    const delta =
                        split.orientation === "vertical"
                            ? pos.x - draggingSplit.startMousePos
                            : pos.y - draggingSplit.startMousePos;
                    const rawPos = Math.max(5, Math.min(95, draggingSplit.startPos + delta));
                    
                    // 스냅 적용 (현재 선의 방향 기준)
                    const newPos = snapToGuideline(rawPos, split.orientation);
                    const oldPos = split.position;

                    // 이 선과 교차하는 다른 선들의 start/end 업데이트
                    const updatedSplits = localSplits.map((s) => {
                        if (s.id === draggingSplit.id) {
                            return { ...s, position: newPos };
                        }
                        // 교차하는 선: 반대 방향이고 start 또는 end가 oldPos와 같거나 가까우면 업데이트
                        if (s.orientation !== split.orientation) {
                            const tolerance = 0.5; // 0.5% 오차 허용
                            let updatedStart = s.start;
                            let updatedEnd = s.end;

                            if (Math.abs(s.start - oldPos) < tolerance) {
                                updatedStart = newPos;
                            }
                            if (Math.abs(s.end - oldPos) < tolerance) {
                                updatedEnd = newPos;
                            }

                            if (updatedStart !== s.start || updatedEnd !== s.end) {
                                return { ...s, start: updatedStart, end: updatedEnd };
                            }
                        }
                        return s;
                    });

                    // 마우스 무브당 parent를 갱신하지 않고 오직 localSplits만 고빈도로 갱신
                    setLocalSplits(updatedSplits);
                }
            }
        },
        [getMousePercent, draggingSplit, localSplits, setLocalSplits, snapToGuideline],
    );

    // 캔버스 클릭 - 새 분할선 생성 (split 모드에서만)
    const handleCanvasClick = useCallback(
        (e: MouseEvent) => {
            if (draggingSplit) return; // 드래그 중이면 무시
            if ((e.target as HTMLElement).closest(".split-line")) return; // 분할선 클릭은 무시

            // select 모드에서는 영역 선택 해제만
            if (toolMode === "select") {
                setSelectedZoneId(null);
                return;
            }

            const pos = getMousePercent(e);
            if (!pos) return;

            const orientation = isShiftPressed ? "horizontal" : "vertical";
            const rawPosition = orientation === "vertical" ? pos.x : pos.y;
            const snappedPosition = snapToGuideline(rawPosition, orientation);

            const newSplit: SplitLine = {
                id: `split-${Date.now()}`,
                orientation,
                position: snappedPosition,
                start: 0,
                end: 100,
                parentId: null,
            };

            handleSplitsChange([...localSplits, newSplit]);
            setSelectedSplitId(null);
        },
        [getMousePercent, isShiftPressed, localSplits, handleSplitsChange, draggingSplit, toolMode, snapToGuideline],
    );

    // 분할선 드래그 시작
    const handleSplitMouseDown = useCallback(
        (e: MouseEvent, split: SplitLine) => {
            e.stopPropagation();
            const pos = getMousePercent(e);
            if (!pos) return;

            setSelectedSplitId(split.id);
            setDraggingSplit({
                id: split.id,
                startPos: split.position,
                startMousePos: split.orientation === "vertical" ? pos.x : pos.y,
            });
        },
        [getMousePercent],
    );

    // 마우스 업 - 드래그 완료 시 히스토리 기록 및 부모 상태로 최종 1회 동기화
    const handleMouseUp = useCallback(() => {
        if (draggingSplit) {
            pushHistory(localSplits);
            onSplitsChange(localSplits);
        }
        setDraggingSplit(null);
    }, [draggingSplit, localSplits, pushHistory, onSplitsChange]);

    // 🆕 영역 계산을 useMemo로 캐싱하여 무의미한 중복 재귀 탐색 연산 배제 (localSplits 기반)
    const zones = useMemo(() => calculateZones(localSplits), [localSplits]);

    // 🆕 zones 변경 시 부모에게 알림
    // mousemove 고주파 드래그 중(draggingSplit !== null)에는 부모 상태인 setZones 호출을 보류(Hold)하여
    // 리액트 전체 렌더 트리가 매 픽셀마다 동반 리렌더링되는 재앙을 방지하고 60fps를 수호함.
    // 드래그 종료(mouseUp) 시점에 딱 1회만 최종 계산된 zones를 부모 상태에 반영.
    useEffect(() => {
        if (draggingSplit) return;
        onZonesChange?.(zones);
    }, [zones, onZonesChange, draggingSplit]);

    // 선택된 Zone 찾기
    const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : null;

    // 픽셀 좌표 계산 (표시용)
    const pixelX = mousePos ? Math.round((mousePos.x / 100) * canvasWidth) : 0;
    const pixelY = mousePos ? Math.round((mousePos.y / 100) * canvasHeight) : 0;

    // 선택된 Zone의 픽셀 크기 계산
    const selectedZonePixelWidth = selectedZone ? Math.round((selectedZone.width / 100) * canvasWidth) : 0;
    const selectedZonePixelHeight = selectedZone ? Math.round((selectedZone.height / 100) * canvasHeight) : 0;

    // Zone 클릭 핸들러 (select 모드에서만 영역 선택)
    const handleZoneClick = useCallback((e: MouseEvent, zone: Zone) => {
        // split 모드에서는 이벤트 전파를 막지 않아 캔버스 클릭으로 구분선 생성
        if (toolMode === "split") {
            // stopPropagation 없이 return하면 캔버스 onClick이 발생
            return;
        }
        e.stopPropagation();
        // 같은 zone 클릭 시 토글 (선택 해제)
        if (selectedZoneId === zone.id) {
            setSelectedZoneId(null);
        } else {
            setSelectedZoneId(zone.id);
        }
        setSelectedSplitId(null); // 분할선 선택 해제
    }, [toolMode, selectedZoneId]);

    return (
        <div className="grid-split-editor">
            {/* 상단 정보 바 */}
            <div className="grid-split-info">
                {/* 툴 모드 선택 버튼 */}
                <div className="tool-mode-buttons">
                    <button
                        className={`tool-btn ${toolMode === "split" ? "active" : ""}`}
                        onClick={() => setToolMode("split")}
                        title="구분선 나누기 (클릭하여 선 추가)"
                    >
                        <Scissors size={14} /> 나누기
                    </button>
                    <button
                        className={`tool-btn ${toolMode === "select" ? "active" : ""}`}
                        onClick={() => { setToolMode("select"); setSelectedSplitId(null); }}
                        title="영역 선택 (사이즈 확인)"
                    >
                        <Ruler size={14} /> 사이즈
                    </button>
                </div>
                <span className="info-item">
                    {canvasWidth} × {canvasHeight}px
                </span>
                {/* 🎨 창의적 그리드 가이드 선택기 (팝오버 형태) */}
                <div ref={guideBtnRef} style={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '0.75rem', marginLeft: '0.25rem' }}>
                    <button
                        type="button"
                        onClick={() => setShowGridSelector(!showGridSelector)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: showGridSelector ? 'var(--app-bg-muted)' : 'transparent',
                            border: '1px solid ' + (showGridSelector ? 'var(--border-default)' : 'transparent'),
                            padding: '0.375rem 0.5rem', borderRadius: '4px', cursor: 'pointer',
                            color: guideCols > 1 || guideRows > 1 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.15s ease'
                        }}
                        title="가이드라인 설정 (클릭하여 8x8 그리드 메뉴 열기)"
                    >
                        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                            가이드: {guideCols > 1 || guideRows > 1 ? `${guideCols} × ${guideRows}` : "없음"}
                        </span>
                        <span style={{ fontSize: '0.6rem' }}>{showGridSelector ? '▲' : '▼'}</span>
                    </button>
                </div>
                {mousePos && (
                    <span className="info-item highlight">
                        커서: {pixelX}, {pixelY}
                    </span>
                )}
                {toolMode === "split" && (
                    <span className="info-item">
                        {isShiftPressed ? "가로선 모드 (Shift)" : "세로선 모드"}
                    </span>
                )}
                <span className="info-item">
                    영역: {zones.length}개
                </span>
                {selectedSplitId && (
                    <span className="info-item warning">
                        Delete 키로 선택된 선 삭제
                    </span>
                )}
                {selectedZoneId && selectedZone && (
                    <span className="info-item highlight">
                        선택 영역: {selectedZonePixelWidth} × {selectedZonePixelHeight}px
                    </span>
                )}
                <span className="info-item" style={{ marginLeft: "auto" }}>
                    Ctrl+Z: 실행취소 | Ctrl+Shift+Z: 다시실행 ({historyIndex}/{history.length - 1})
                </span>
            </div>

            {/* 가이드 선택기 팝오버 — .grid-split-info 바깥(grid-split-editor 직속)에 렌더링하여
                overflow-x:auto의 CSS spec 부작용(overflow-y:auto 강제)을 회피한다. */}
            {showGridSelector && (
                <div
                    style={{
                        position: 'absolute',
                        top: guidePopoverStyle.top,
                        left: guidePopoverStyle.left,
                        background: 'var(--app-bg-alt)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        zIndex: 100,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {hoverGuide ? `${hoverGuide.cols} × ${hoverGuide.rows}` : (guideCols > 1 || guideRows > 1 ? `${guideCols} × ${guideRows}` : "가이드 없음")}
                        </span>
                        <button
                            type="button"
                            onClick={() => { setGridGuide(""); setShowGridSelector(false); }}
                            style={{ fontSize: '0.65rem', background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '0 0.25rem' }}
                        >
                            초기화
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} onMouseLeave={() => setHoverGuide(null)}>
                        {Array.from({ length: 8 }).map((_, rIndex) => {
                            const r = rIndex + 1;
                            return (
                                <div key={r} style={{ display: 'flex', gap: '2px' }}>
                                    {Array.from({ length: 8 }).map((_, cIndex) => {
                                        const c = cIndex + 1;
                                        const isHighlighted = hoverGuide
                                            ? (c <= hoverGuide.cols && r <= hoverGuide.rows)
                                            : (c <= guideCols && r <= guideRows && (guideCols > 1 || guideRows > 1));

                                        return (
                                            <div
                                                key={`${r}-${c}`}
                                                onMouseEnter={() => setHoverGuide({ cols: c, rows: r })}
                                                onClick={() => {
                                                    setGridGuide(c === 1 && r === 1 ? "" : `${c}x${r}`);
                                                    setShowGridSelector(false);
                                                }}
                                                style={{
                                                    width: '18px', height: '18px', borderRadius: '3px',
                                                    background: isHighlighted ? 'var(--accent-primary)' : 'var(--app-bg)',
                                                    border: isHighlighted ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border-default)',
                                                    cursor: 'pointer', transition: 'background 0.05s, transform 0.05s',
                                                    transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                                                    zIndex: isHighlighted ? 2 : 1
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 캔버스 컨테이너 */}
            <div
                ref={containerRef}
                className="grid-split-canvas"
                onClick={handleCanvasClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                    aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                    cursor: toolMode === "select" ? "pointer" : (isShiftPressed ? "row-resize" : "col-resize"),
                }}
            >
                {/* 🆕 동적 사분선 가이드라인 */}
                {guideCols > 1 ? (
                    Array.from({ length: guideCols - 1 }).map((_, i) => (
                        <div key={`v-guide-${i}`} className="guideline vertical" style={{ left: `${(i + 1) * (100 / guideCols)}%` }} />
                    ))
                ) : (
                    <div className="guideline vertical" style={{ left: "50%" }} />
                )}
                
                {guideRows > 1 ? (
                    Array.from({ length: guideRows - 1 }).map((_, i) => (
                        <div key={`h-guide-${i}`} className="guideline horizontal" style={{ top: `${(i + 1) * (100 / guideRows)}%` }} />
                    ))
                ) : (
                    <div className="guideline horizontal" style={{ top: "50%" }} />
                )}

                {/* 배경 참고 이미지 레이어
                 * ■ Why 별도 레이어?
                 *   z-index 0에서 렌더링하여 영역/분할선 아래에 표시.
                 *   object-fit: cover로 캔버스 비율에 맞게 스케일링.
                 *   사용자가 CG 디자인 스크린샷을 올리고 그 위에서
                 *   영역 경계를 따라 분할선을 긋는 용도.
                 */}
                {backgroundImage && (
                    <img
                        src={backgroundImage}
                        alt="참고 배경"
                        className="grid-split-bg-image"
                        style={{ opacity: backgroundOpacity }}
                        draggable={false}
                    />
                )}

                {/* 영역들 */}
                {zones.map((zone, index) => {
                    const isZoneSelected = selectedZoneId === zone.id;
                    const zonePixelWidth = Math.round((zone.width / 100) * canvasWidth);
                    const zonePixelHeight = Math.round((zone.height / 100) * canvasHeight);

                    return (
                        <div
                            key={zone.id}
                            className={`grid-zone ${isZoneSelected ? "selected" : ""}`}
                            style={{
                                left: `${zone.x}%`,
                                top: `${zone.y}%`,
                                width: `${zone.width}%`,
                                height: `${zone.height}%`,
                            }}
                            onClick={(e) => handleZoneClick(e, zone)}
                        >
                            <span className="zone-label">{index + 1}</span>
                            {/* 선택된 Zone에 크기 표시 */}
                            {isZoneSelected && (
                                <div className="zone-size-overlay">
                                    <span className="zone-size-text">
                                        {zonePixelWidth} × {zonePixelHeight}px
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 분할선들 */}
                {localSplits.map((split) => {
                    // 선택된 선일 경우 교차점 계산
                    const isSelected = selectedSplitId === split.id;
                    let segments: { start: number; end: number }[] = [];

                    if (isSelected) {
                        // 교차하는 선들의 위치 찾기
                        const crossingPositions = localSplits
                            .filter(s => {
                                if (s.id === split.id || s.orientation === split.orientation) return false;
                                // 교차하는 선(s)이 현재 선(split)의 범위를 실제로(물리적으로) 관통하는지 확인
                                // 교차선의 start~end 범위 안에 내 선의 position 좌표가 포함되어야 함
                                return split.position >= s.start && split.position <= s.end;
                            })
                            .map(s => s.position)
                            .sort((a, b) => a - b);

                        // 구간 계산 (0 ~ 교차점1 ~ 교차점2 ~ ... ~ 100)
                        const allPositions = [split.start, ...crossingPositions.filter(p => p > split.start && p < split.end), split.end];
                        for (let i = 0; i < allPositions.length - 1; i++) {
                            segments.push({ start: allPositions[i], end: allPositions[i + 1] });
                        }
                    }

                    return (
                        <div
                            key={split.id}
                            className={`split-line ${split.orientation} ${isSelected ? "selected" : ""}`}
                            style={
                                split.orientation === "vertical"
                                    ? { left: `${split.position}%`, top: `${split.start}%`, height: `${split.end - split.start}%` }
                                    : { top: `${split.position}%`, left: `${split.start}%`, width: `${split.end - split.start}%` }
                            }
                            onMouseDown={(e) => handleSplitMouseDown(e, split)}
                        >
                            <div className="split-handle" />

                            {/* 선택 시 구간별 Trim 삭제 버튼 */}
                            {isSelected && segments.length > 1 && segments.map((seg, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    className="trim-delete-btn"
                                    style={
                                        split.orientation === "vertical"
                                            ? { top: `${((seg.start + seg.end) / 2 - split.start) / (split.end - split.start) * 100}%` }
                                            : { left: `${((seg.start + seg.end) / 2 - split.start) / (split.end - split.start) * 100}%` }
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // 해당 구간 제거 (선 분할)
                                        if (segments.length === 2) {
                                            // 2구간이면 해당 구간만 삭제 후 남은 구간으로 대체
                                            const remaining = segments[idx === 0 ? 1 : 0];
                                            handleSplitsChange(localSplits.map(s =>
                                                s.id === split.id
                                                    ? { ...s, start: remaining.start, end: remaining.end }
                                                    : s
                                            ));
                                        } else {
                                            // 3구간 이상이면 선 분할
                                            const newSplits = localSplits.filter(s => s.id !== split.id);
                                            segments.forEach((s, i) => {
                                                if (i !== idx) {
                                                    newSplits.push({
                                                        ...split,
                                                        id: `${split.id}-${i}`,
                                                        start: s.start,
                                                        end: s.end,
                                                    });
                                                }
                                            });
                                            handleSplitsChange(newSplits);
                                        }
                                        setSelectedSplitId(null);
                                    }}
                                    title={`구간 삭제 (${Math.round(seg.start)}% ~ ${Math.round(seg.end)}%)`}
                                >
                                    ×
                                </button>
                            ))}
                        </div>
                    );
                })}

                {/* 마우스 미리보기 선 */}
                {mousePos && !draggingSplit && toolMode === "split" && (
                    <div
                        className={`preview-line ${isShiftPressed ? "horizontal" : "vertical"}`}
                        style={
                            isShiftPressed
                                ? { top: `${snapToGuideline(mousePos.y, "horizontal")}%`, left: 0, width: "100%", transition: "top 0.05s ease-out" }
                                : { left: `${snapToGuideline(mousePos.x, "vertical")}%`, top: 0, height: "100%", transition: "left 0.05s ease-out" }
                        }
                    />
                )}
            </div>
        </div>
    );
}

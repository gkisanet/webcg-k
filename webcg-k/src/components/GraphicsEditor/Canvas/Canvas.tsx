/**
 * Canvas - SVG 기반 그래픽 캔버스
 */

import { useQuery } from "@tanstack/react-query";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { registerAction } from "@/lib/actions/actionRegistry";
import {
	collectSnapLines,
	screenToSceneCoords,
	snapBoundingBox,
} from "@/lib/element/sceneMath";
import {
	renderSvgBooleanGroup,
	renderSvgCompositionGroup,
} from "@/lib/element/svgCompositionRenderer";
import { supabase } from "@/lib/supabase";
import {
	type BindingTextLayoutResult,
	resolveBindingTextLayout,
} from "@/lib/textFitPolicy";
import { estimateWrappedTextHeight } from "@/lib/textMeasure";
import { buildPluginSrcdoc } from "@/lib/webcgkSrcdoc";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";
import { GridOverlay } from "./GridOverlay";
import { InteractionLayer } from "./InteractionLayer";

// CSS 문자열을 React style 객체로 변환
const parseCssToStyle = (css: string | undefined): React.CSSProperties => {
	if (!css) return {};
	const style: Record<string, string> = {};

	// 주석 제거
	const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");

	// 각 속성 파싱
	const declarations = cleaned.split(";").filter((d) => d.trim());
	for (const decl of declarations) {
		const colonIndex = decl.indexOf(":");
		if (colonIndex === -1) continue;

		const property = decl.slice(0, colonIndex).trim();
		const value = decl.slice(colonIndex + 1).trim();

		// CSS 속성명을 camelCase로 변환 (예: background-color -> backgroundColor)
		const camelCase = property.replace(/-([a-z])/g, (_, letter) =>
			letter.toUpperCase(),
		);
		style[camelCase] = value;
	}

	return style as React.CSSProperties;
};

interface CanvasProps {
	elements: GraphicElement[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
	onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
	gridTemplateId: string | null;
	onGridTemplateChange: (id: string | null) => void;
	canvasWidth: number;
	canvasHeight: number;
	zoom?: number;
	activeTool: string;
	onAddElement: (type: GraphicElement["type"]) => void;
}

// 그리드 템플릿 데이터 타입
interface GridTemplateData {
	zones?: Array<{
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
}

export function Canvas({
	elements,
	selectedIds,
	onSelect,
	onUpdate,
	gridTemplateId,
	canvasWidth,
	canvasHeight,
	zoom = 1,
}: CanvasProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [dragging, setDragging] = useState<{
		id: string;
		startX: number;
		startY: number;
		elStartX: number;
		elStartY: number;
	} | null>(null);

	// 리사이즈 상태
	const [resizing, setResizing] = useState<{
		id: string;
		handle: string;
		startX: number;
		startY: number;
		elStartX: number;
		elStartY: number;
		elStartWidth: number;
		elStartHeight: number;
	} | null>(null);

	// 🆕 Text Frame 리사이즈 상태
	// Shape 내부 Text Frame 영역을 마우스로 직접 드래그하여 크기 조정
	// Why: 사이드바 X/Y/W/H 숫자 입력보다 직관적, 파워포인트 UX와 일치
	const [frameResizing, setFrameResizing] = useState<{
		elementId: string;
		slotId: string;
		handle: string; // 방향: "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w"
		startX: number;
		startY: number;
		frameStartX: number;
		frameStartY: number;
		frameStartW: number;
		frameStartH: number;
		shapeW: number; // Shape 폭 (클램핑 기준)
		shapeH: number; // Shape 높이 (클램핑 기준)
	} | null>(null);

	// 스냅 가이드라인 상태 (리사이즈 경로에서 사용, 드래그는 DOM 직접 조작)
	const [_snapGuides, setSnapGuides] = useState<{
		vertical: number[]; // x 좌표 배열
		horizontal: number[]; // y 좌표 배열
	}>({ vertical: [], horizontal: [] });

	// 실시간 드래그용 Throttling 레퍼런스 + 가이드라인 Ref
	const rafRef = useRef<number | null>(null);
	const nextUpdateRef = useRef<{ id: string; x: number; y: number } | null>(
		null,
	);
	const isUpdatingRef = useRef<boolean>(false);
	const snapVLinesRef = useRef<HTMLDivElement>(null);
	const snapHLinesRef = useRef<HTMLDivElement>(null);

	// 🆕 고주파 mousemove 스냅 가이드라인 O(1) 조회를 위한 mouseDown 1회 캐싱 Ref
	const snapLinesRef = useRef<{ vertical: number[]; horizontal: number[] }>({
		vertical: [],
		horizontal: [],
	});

	// 🆕 Text Frame 인라인 편집 상태
	// Shape 더블클릭 시 진입: 해당 슬롯의 텍스트를 직접 편집
	const [editingSlot, setEditingSlot] = useState<{
		elementId: string;
		slotId: string;
	} | null>(null);

	// Escape 키로 편집 모드 종료 — Action 시스템
	useEffect(() => {
		if (!editingSlot) return;
		const unreg = registerAction({
			id: "exitEditingMode",
			label: "편집 모드 종료",
			shortcut: "Escape",
			context: "editor",
			execute: () => {
				setEditingSlot(null);
				setFrameResizing(null);
			},
		});
		return unreg;
	}, [editingSlot]);

	// 그리드 템플릿 로드
	const { data: gridTemplate } = useQuery({
		queryKey: ["gridTemplate", gridTemplateId],
		queryFn: async () => {
			if (!gridTemplateId) return null;
			const { data, error } = await supabase
				.from("grid_templates")
				.select("*")
				.eq("id", gridTemplateId)
				.single();
			if (error) throw error;
			return data as { template_data: GridTemplateData };
		},
		enabled: !!gridTemplateId,
	});

	// 캔버스 스케일 (zoom prop 사용)
	const scale = zoom;
	const displayWidth = canvasWidth * scale;
	const displayHeight = canvasHeight * scale;

	// zones 데이터
	const zones = (gridTemplate?.template_data as GridTemplateData)?.zones || [];

	// 마우스 좌표를 캔버스 좌표로 변환
	const getCanvasCoords = useCallback(
		(e: MouseEvent) => {
			if (!svgRef.current) return { x: 0, y: 0 };
			const rect = svgRef.current.getBoundingClientRect();
			return screenToSceneCoords(
				{ x: e.clientX, y: e.clientY },
				{ left: rect.left, top: rect.top },
				scale,
			);
		},
		[scale],
	);

	// 드래그 시작
	const handleMouseDown = useCallback(
		(e: MouseEvent, elementId: string) => {
			const element = elements.find((el) => el.id === elementId);
			if (!element || element.locked) return;

			e.stopPropagation();
			e.preventDefault();
			const coords = getCanvasCoords(e);

			// 선택
			if (!selectedIds.includes(elementId)) {
				if (e.ctrlKey || e.metaKey) {
					onSelect([...selectedIds, elementId]);
				} else {
					onSelect([elementId]);
				}
			}

			// 🆕 드래그 시작 시점에 스냅 대상 라인 풀을 1회 선캐싱하여 mousemove 내 O(N) 순회 병목 제거
			snapLinesRef.current = collectSnapLines(
				elements,
				elementId,
				zones,
				canvasWidth,
				canvasHeight,
			);

			setDragging({
				id: elementId,
				startX: coords.x,
				startY: coords.y,
				elStartX: element.x,
				elStartY: element.y,
			});
		},
		[
			elements,
			selectedIds,
			onSelect,
			getCanvasCoords,
			zones,
			canvasWidth,
			canvasHeight,
		],
	);

	// 드래그/리사이즈 중
	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			const coords = getCanvasCoords(e);

			// 🆕 Text Frame 리사이즈 처리
			// Why: Shape 리사이즈와 독립된 상태를 유지하여 Text Frame만 변경하고 Shape에는 영향 없음
			if (frameResizing) {
				const element = elements.find(
					(el) => el.id === frameResizing.elementId,
				);
				if (!element?.bindingContainer) return;
				const slot = element.bindingContainer.slots.find(
					(s) => s.id === frameResizing.slotId,
				);
				if (!slot) return;

				const dx = coords.x - frameResizing.startX;
				const dy = coords.y - frameResizing.startY;

				let newFX = frameResizing.frameStartX;
				let newFY = frameResizing.frameStartY;
				let newFW = frameResizing.frameStartW;
				let newFH = frameResizing.frameStartH;

				const h = frameResizing.handle;
				// 서쪽(w): x와 폭 동시 변경
				if (h.includes("w")) {
					newFX = frameResizing.frameStartX + dx;
					newFW = frameResizing.frameStartW - dx;
				}
				// 동쪽(e): 폭만 변경
				if (h.includes("e")) {
					newFW = frameResizing.frameStartW + dx;
				}
				// 북쪽(n): y와 높이 동시 변경
				if (h.includes("n")) {
					newFY = frameResizing.frameStartY + dy;
					newFH = frameResizing.frameStartH - dy;
				}
				// 남쪽(s): 높이만 변경
				if (h.includes("s")) {
					newFH = frameResizing.frameStartH + dy;
				}

				// 최소 크기 보장 (w ≥ 40px, h ≥ 20px)
				if (newFW < 40) {
					if (h.includes("w"))
						newFX = frameResizing.frameStartX + frameResizing.frameStartW - 40;
					newFW = 40;
				}
				if (newFH < 20) {
					if (h.includes("n"))
						newFY = frameResizing.frameStartY + frameResizing.frameStartH - 20;
					newFH = 20;
				}

				// Shape 바운더리 클램핑 (Text Frame이 Shape 박으로 나가지 않도록)
				newFX = Math.max(0, newFX);
				newFY = Math.max(0, newFY);
				newFW = Math.min(newFW, frameResizing.shapeW - newFX);
				newFH = Math.min(newFH, frameResizing.shapeH - newFY);

				const bc = element.bindingContainer;
				const newSlots = bc.slots.map((s) =>
					s.id === frameResizing.slotId
						? {
								...s,
								frameX: Math.round(newFX),
								frameY: Math.round(newFY),
								frameWidth: Math.round(newFW),
								frameHeight: Math.round(newFH),
							}
						: s,
				);
				onUpdate(frameResizing.elementId, {
					bindingContainer: { ...bc, slots: newSlots },
				});
				return;
			}

			// 리사이즈 처리
			if (resizing) {
				const element = elements.find((el) => el.id === resizing.id);
				if (!element) return;

				// handle 방향 정규화 — "nw-resize" / "top-left" 양쪽 모두 지원
				const handleDir = (() => {
					const map: Record<
						string,
						{ w: boolean; e: boolean; n: boolean; s: boolean }
					> = {
						"nw-resize": { w: true, e: false, n: true, s: false },
						"n-resize": { w: false, e: false, n: true, s: false },
						"ne-resize": { w: false, e: true, n: true, s: false },
						"e-resize": { w: false, e: true, n: false, s: false },
						"se-resize": { w: false, e: true, n: false, s: true },
						"s-resize": { w: false, e: false, n: false, s: true },
						"sw-resize": { w: true, e: false, n: false, s: true },
						"w-resize": { w: true, e: false, n: false, s: false },
						"top-left": { w: true, e: false, n: true, s: false },
						"top-right": { w: false, e: true, n: true, s: false },
						"bottom-left": { w: true, e: false, n: false, s: true },
						"bottom-right": { w: false, e: true, n: false, s: true },
					};
					return (
						map[resizing.handle] || { w: false, e: false, n: false, s: false }
					);
				})();
				const isWest = handleDir.w;
				const isEast = handleDir.e;
				const isNorth = handleDir.n;
				const isSouth = handleDir.s;

				const dx = coords.x - resizing.startX;
				const dy = coords.y - resizing.startY;

				let newX = resizing.elStartX;
				let newY = resizing.elStartY;
				let newWidth = resizing.elStartWidth;
				let newHeight = resizing.elStartHeight;

				if (isWest) {
					newX = resizing.elStartX + dx;
					newWidth = resizing.elStartWidth - dx;
				}
				if (isEast) {
					newWidth = resizing.elStartWidth + dx;
				}
				if (isNorth) {
					newY = resizing.elStartY + dy;
					newHeight = resizing.elStartHeight - dy;
				}
				if (isSouth) {
					newHeight = resizing.elStartHeight + dy;
				}

				// 🆕 Shift 비례 리사이즈 연산 (원 비율 고정 및 기타 쉐이프 비율 유지)
				if (e.shiftKey) {
					const ratio =
						element.type === "ellipse"
							? 1
							: resizing.elStartWidth / resizing.elStartHeight;

					// 가로 길이를 기준 크기로 설정하여 세로 길이 동기화
					newHeight = newWidth / ratio;

					// 기준 축이 변경됨에 따라, 리사이즈 중인 핸들 방향별로 위치 좌표(X, Y) 보정
					if (isNorth) {
						newY = resizing.elStartY + (resizing.elStartHeight - newHeight);
					}
					if (isWest) {
						newX = resizing.elStartX + (resizing.elStartWidth - newWidth);
					}

					// Shift 리사이즈 동작 중에는 자석 스냅선 억제
					setSnapGuides({ vertical: [], horizontal: [] });
				} else {
					// 리사이즈 스냅 — 캐싱된 snapLinesRef 참조를 활용한 O(1) 상수 시간 스냅 정렬
					const SNAP_THRESHOLD = 8;
					const activeVerticalGuides: number[] = [];
					const activeHorizontalGuides: number[] = [];

					const snapLines = snapLinesRef.current;

					for (const v of snapLines.vertical) {
						if (isWest) {
							if (Math.abs(newX - v) < SNAP_THRESHOLD) {
								newWidth += newX - v;
								newX = v;
								activeVerticalGuides.push(v);
							}
						}
						if (isEast) {
							if (Math.abs(newX + newWidth - v) < SNAP_THRESHOLD) {
								newWidth = v - newX;
								activeVerticalGuides.push(v);
							}
						}
					}
					for (const hItem of snapLines.horizontal) {
						if (isNorth) {
							if (Math.abs(newY - hItem) < SNAP_THRESHOLD) {
								newHeight += newY - hItem;
								newY = hItem;
								activeHorizontalGuides.push(hItem);
							}
						}
						if (isSouth) {
							if (Math.abs(newY + newHeight - hItem) < SNAP_THRESHOLD) {
								newHeight = hItem - newY;
								activeHorizontalGuides.push(hItem);
							}
						}
					}

					setSnapGuides({
						vertical: [...new Set(activeVerticalGuides)],
						horizontal: [...new Set(activeHorizontalGuides)],
					});
				}

				// 최소 크기 보장
				if (newWidth < 10) {
					if (isWest) {
						newX = resizing.elStartX + resizing.elStartWidth - 10;
					}
					newWidth = 10;
				}
				if (newHeight < 10) {
					if (isNorth) {
						newY = resizing.elStartY + resizing.elStartHeight - 10;
					}
					newHeight = 10;
				}

				onUpdate(resizing.id, {
					x: Math.round(newX),
					y: Math.round(newY),
					width: Math.round(newWidth),
					height: Math.round(newHeight),
				});
				return;
			}

			// 드래그 처리 — requestAnimationFrame 스케줄링을 활용한 실시간 위치 갱신
			if (!dragging) return;

			const dx = coords.x - dragging.startX;
			const dy = coords.y - dragging.startY;

			let newX = dragging.elStartX + dx;
			let newY = dragging.elStartY + dy;

			const element = elements.find((el) => el.id === dragging.id);
			if (!element) return;

			// 🆕 mousemove 프레임마다 O(N) 순회하는 대신 드래그 시작 시 선캐싱된 Ref 값 사용 (O(1) 격하)
			const snapLines = snapLinesRef.current;

			const snap = snapBoundingBox(
				{ x: newX, y: newY, width: element.width, height: element.height },
				snapLines,
			);

			if (snap.snappedX !== undefined) newX = snap.snappedX;
			if (snap.snappedY !== undefined) newY = snap.snappedY;

			// 스냅 가이드라인 DOM 직접 조작 (React 우회하여 성능 확보)
			if (snapVLinesRef.current) {
				snapVLinesRef.current.innerHTML = snap.activeVertical
					.map(
						(x, i) =>
							`<div style="position:absolute;left:${x * scale}px;top:0;bottom:0;width:1px;background:#FF00FF;z-index:10" data-snap-v="${i}"></div>`,
					)
					.join("");
			}
			if (snapHLinesRef.current) {
				snapHLinesRef.current.innerHTML = snap.activeHorizontal
					.map(
						(y, i) =>
							`<div style="position:absolute;top:${y * scale}px;left:0;right:0;height:1px;background:#FF00FF;z-index:10" data-snap-h="${i}"></div>`,
					)
					.join("");
			}

			// requestAnimationFrame을 이용한 실시간 프레임 단위 쓰로틀링 업데이트 (Debounce 오작동 제거)
			const targetX = Math.round(newX);
			const targetY = Math.round(newY);

			nextUpdateRef.current = { id: dragging.id, x: targetX, y: targetY };

			if (!isUpdatingRef.current) {
				isUpdatingRef.current = true;
				rafRef.current = requestAnimationFrame(() => {
					if (nextUpdateRef.current) {
						onUpdate(nextUpdateRef.current.id, {
							x: nextUpdateRef.current.x,
							y: nextUpdateRef.current.y,
						});
						nextUpdateRef.current = null;
					}
					isUpdatingRef.current = false;
				});
			}
		},
		[
			dragging,
			resizing,
			frameResizing,
			getCanvasCoords,
			zones,
			canvasWidth,
			canvasHeight,
			elements,
			scale,
		],
	);

	// 드래그/리사이즈 종료
	const handleMouseUp = useCallback(() => {
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}

		// 마지막 대기 좌표가 있다면 최종 커밋하여 데이터 정합성 보장
		if (nextUpdateRef.current) {
			onUpdate(nextUpdateRef.current.id, {
				x: nextUpdateRef.current.x,
				y: nextUpdateRef.current.y,
			});
			nextUpdateRef.current = null;
		}
		isUpdatingRef.current = false;

		// 스냅 가이드라인 DOM 정리
		if (snapVLinesRef.current) snapVLinesRef.current.innerHTML = "";
		if (snapHLinesRef.current) snapHLinesRef.current.innerHTML = "";

		setDragging(null);
		setResizing(null);
		setFrameResizing(null);
		setSnapGuides({ vertical: [], horizontal: [] });
	}, [onUpdate]);

	// 최신 드래그 핸들러를 참조하기 위한 Ref 동기화 (매 프레임 window 리스너 재등록 방지)
	const handleMouseMoveRef = useRef(handleMouseMove);
	const handleMouseUpRef = useRef(handleMouseUp);

	useEffect(() => {
		handleMouseMoveRef.current = handleMouseMove;
	}, [handleMouseMove]);

	useEffect(() => {
		handleMouseUpRef.current = handleMouseUp;
	}, [handleMouseUp]);

	// window 레벨 이벤트 리스너 — 리사이즈 핸들(HTML div)에서 시작된 드래그가
	// SVG onMouseMove에 도달하지 못하거나 마우스를 빠르게 움직여 캔버스를 벗어나는 이탈 문제 해결
	useEffect(() => {
		const isActive = !!(dragging || resizing || frameResizing);
		if (!isActive) return;

		const onMouseMove = (e: globalThis.MouseEvent) => {
			handleMouseMoveRef.current(e as unknown as MouseEvent);
		};
		const onMouseUp = () => {
			handleMouseUpRef.current();
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [dragging, resizing, frameResizing]);

	// 빈 영역 클릭 시 선택 해제 + 편집 모드 종료
	const handleCanvasClick = useCallback(
		(e: MouseEvent) => {
			if (e.target === svgRef.current) {
				onSelect([]);
				setEditingSlot(null);
			}
		},
		[onSelect],
	);

	// 부모 그룹의 visible/locked 상태 체크
	const isElementVisible = (el: GraphicElement): boolean => {
		if (!el.visible) return false;
		if (el.parentId) {
			const parent = elements.find((p) => p.id === el.parentId);
			if (parent && !isElementVisible(parent)) return false;
		}
		return true;
	};

	const isElementLocked = (el: GraphicElement): boolean => {
		if (el.locked) return true;
		if (el.parentId) {
			const parent = elements.find((p) => p.id === el.parentId);
			if (parent && isElementLocked(parent)) return true;
		}
		return false;
	};

	// fill 스타일 반환 (단색, 그라데이션, 투명)
	const getFillStyle = (element: GraphicElement): string => {
		const fill = element.fill;
		if (!fill || fill.type === "none") return "transparent";
		if (fill.type === "solid") return fill.color || "#3b82f6";
		// 그라데이션은 url(#gradient-{id})
		// 🆕 고정 프리픽스 'editor' 반영으로 마스크/합성 Defs 매핑 일치화
		return `url(#gradient-editor-${element.id})`;
	};

	// fill 투명도 반환
	const getFillOpacity = (element: GraphicElement): number => {
		return element.fill?.opacity ?? 1;
	};

	// 그라데이션 defs 렌더링
	const renderGradientDefs = () => {
		const gradientElements = elements.filter(
			(el) => el.fill?.type === "linear" || el.fill?.type === "radial",
		);

		return (
			<defs>
				{gradientElements.map((el) => {
					const stops = el.fill?.gradientStops || [
						{ offset: 0, color: "#3b82f6" },
						{ offset: 100, color: "#8b5cf6" },
					];
					const angle = el.fill?.gradientAngle || 0;
					const radians = (angle - 90) * (Math.PI / 180);
					const x1 = 50 + 50 * Math.cos(radians + Math.PI);
					const y1 = 50 + 50 * Math.sin(radians + Math.PI);
					const x2 = 50 + 50 * Math.cos(radians);
					const y2 = 50 + 50 * Math.sin(radians);

					if (el.fill?.type === "linear") {
						return (
							<linearGradient
								key={el.id}
								id={`gradient-editor-${el.id}`}
								x1={`${x1}%`}
								y1={`${y1}%`}
								x2={`${x2}%`}
								y2={`${y2}%`}
							>
								{stops.map((stop, i) => (
									<stop
										key={i}
										offset={`${stop.offset}%`}
										stopColor={stop.color}
										stopOpacity={stop.opacity ?? 1}
									/>
								))}
							</linearGradient>
						);
					} else {
						return (
							<radialGradient
								key={el.id}
								id={`gradient-editor-${el.id}`}
								cx="50%"
								cy="50%"
								r="50%"
							>
								{stops.map((stop, i) => (
									<stop
										key={i}
										offset={`${stop.offset}%`}
										stopColor={stop.color}
										stopOpacity={stop.opacity ?? 1}
									/>
								))}
							</radialGradient>
						);
					}
				})}
			</defs>
		);
	};

	// 🆕 최상위 기즈모/오버레이 라벨 렌더러
	// Why: 마스킹이나 클리핑 렌더링에 의해 요소 라벨이 잘리는 현상을 완벽하게 방지하기 위해
	//      개별 요소 렌더러에서 라벨 렌더링을 걷어내고 최상위 평탄 레이어에서 별도 출력합니다.
	const renderElementLabel = (element: GraphicElement) => {
		if (!isElementVisible(element)) return null;

		const labelText = element.name;
		const paddingX = 6;
		const paddingY = 3;
		const labelFontSize = 12;
		
		// ■ Why 문자 유형별 정밀 가중치 너비 계산인가?
		//   단순히 글자 수나 거친 반각/전각 구분만으로는 'W' 같은 넓은 영문 대문자나
		//   다양한 한글 폰트 렌더링에 따른 물리적 너비 오차를 감당하지 못해 오버플로우가 발생합니다.
		//   따라서 한글(13.5px), 대문자(9.5px), 소문자/숫자(8.0px), 기호(6.0px)로 가중치를 정밀화하여
		//   렌더링 안전 마진을 완벽하게 확보합니다.
		const charWidth = Array.from(labelText).reduce((sum, char) => {
			if (/[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f\u4e00-\u9fff]/u.test(char)) {
				return sum + 13.5; // 한글/한자 전각
			}
			if (/[A-Z]/.test(char)) {
				return sum + 9.5;  // 영문 대문자
			}
			if (/[a-z0-9]/.test(char)) {
				return sum + 8.0;  // 영문 소문자 및 숫자
			}
			return sum + 6.0;      // 공백 및 기타 기호
		}, 0);
		const textWidth = Math.ceil(charWidth) + paddingX * 2;
		const labelHeight = labelFontSize + paddingY * 2;
		const GAP = 8; // 요소 위 간격

		// 라벨이 캔버스 밖(음수 영역)으로 나가는지 판단
		const labelSpaceNeeded = labelHeight + GAP;
		const placeInside = element.y < labelSpaceNeeded;

		// 외부 배치: 요소 위 / 내부 배치: 요소 안 상단
		const labelX = element.x;
		const rectY = placeInside
			? element.y + 4 // 내부 상단에 4px 여백
			: element.y - GAP - labelHeight; // 외부 위쪽
		const textY = rectY + labelFontSize + paddingY - 2;

		return (
			<g key={`label-${element.id}`} className="element-label" pointerEvents="none">
				<rect
					x={labelX}
					y={rectY}
					width={textWidth}
					height={labelHeight}
					fill={placeInside ? "rgba(0,0,0,0.6)" : "white"}
					stroke="var(--accent-primary)"
					strokeWidth={1}
					strokeDasharray="3,2"
					rx={3}
				/>
				<text
					x={labelX + paddingX}
					y={textY}
					fill={placeInside ? "#ffffff" : "var(--accent-primary)"}
					fontSize={labelFontSize}
					fontFamily="sans-serif"
					fontWeight={500}
				>
					{labelText}
				</text>
			</g>
		);
	};

	// 🆕 최상위 평탄 오버레이 라벨 레이어
	const renderLabelsOverlay = () => {
		return (
			<g className="gizmo-labels-overlay-layer" pointerEvents="none">
				{sortedElements.map(renderElementLabel)}
			</g>
		);
	};

	// 요소 렌더링
	const renderElement = (element: GraphicElement) => {
		if (!isElementVisible(element)) return null;

		const isSelected = selectedIds.includes(element.id);
		const isLocked = isElementLocked(element);

		// customCSS 파싱
		const customStyles = parseCssToStyle(element.customCSS);

		const commonProps = {
			className: `element-wrapper ${isSelected ? "selected" : ""} ${isLocked ? "locked" : ""}`,
			onMouseDown: isLocked
				? undefined
				: (e: MouseEvent<SVGGElement>) => handleMouseDown(e, element.id),
			style: {
				opacity: element.opacity,
				transform: `rotate(${element.rotation}deg)`,
				transformOrigin: `${element.x + element.width / 2}px ${element.y + element.height / 2}px`,
				cursor: isLocked ? "not-allowed" : undefined,
				// 🆕 Blend Mode — SVG <g> style에서 네이티브로 동작
				mixBlendMode:
					element.blendMode && element.blendMode !== "normal"
						? (element.blendMode as React.CSSProperties["mixBlendMode"])
						: undefined,
				...customStyles, // customCSS 적용
			},
		};

		// 🆕 Visual Effects SVG 필터 헬퍼 (Shadow, Glow, Inner Shadow)
		// Why: 모든 도형에 다중 시각 효과(Glow, Inner Shadow 등)를 중첩 적용하기 위한 필터 체인 구성
		const effectsFilterId = `effects-${element.id}`;

		const hasShadow = element.shadowEnabled;
		const hasGlow = element.glowEnabled;
		const hasInnerShadow =
			element.innerShadowEnabled &&
			(element.type === "rect" || element.type === "ellipse");

		const hasEffects = hasShadow || hasGlow || hasInnerShadow;
		const effectsFilterUrl = hasEffects
			? `url(#${effectsFilterId})`
			: undefined;

		const renderVisualEffectsDefs = () => {
			if (!hasEffects) return null;
			return (
				<defs>
					<filter
						id={effectsFilterId}
						x="-50%"
						y="-50%"
						width="200%"
						height="200%"
					>
						{/* 1. Inner Shadow (내곽선 그림자) */}
						{hasInnerShadow && (
							<>
								<feOffset
									in="SourceAlpha"
									dx={element.innerShadowOffsetX ?? 2}
									dy={element.innerShadowOffsetY ?? 2}
									result="is-offset"
								/>
								<feGaussianBlur
									in="is-offset"
									stdDeviation={element.innerShadowBlur ?? 4}
									result="is-blur"
								/>
								<feComposite
									operator="out"
									in="SourceAlpha"
									in2="is-blur"
									result="is-inverse"
								/>
								<feFlood
									floodColor={element.innerShadowColor || "#000000"}
									floodOpacity={0.8}
									result="is-color"
								/>
								<feComposite
									operator="in"
									in="is-color"
									in2="is-inverse"
									result="is-shadow"
								/>
								<feComposite
									operator="over"
									in="is-shadow"
									in2="SourceGraphic"
									result="inner-out"
								/>
							</>
						)}

						{/* 2. Glow (외부 발광) */}
						{hasGlow && (
							<feDropShadow
								in={hasInnerShadow ? "inner-out" : "SourceGraphic"}
								dx="0"
								dy="0"
								stdDeviation={element.glowBlur ?? 10}
								floodColor={element.glowColor || "#00e5ff"}
								floodOpacity={0.8}
								result="glow-out"
							/>
						)}

						{/* 3. Drop Shadow (외부 그림자) */}
						{hasShadow && (
							<feDropShadow
								in={
									hasGlow
										? "glow-out"
										: hasInnerShadow
											? "inner-out"
											: "SourceGraphic"
								}
								dx={element.shadowOffsetX ?? 2}
								dy={element.shadowOffsetY ?? 2}
								stdDeviation={element.shadowBlur ?? 4}
								floodColor={element.shadowColor || "#000000"}
								floodOpacity={0.5}
							/>
						)}
					</filter>
				</defs>
			);
		};

		// 🆕 Stroke 스타일 → SVG strokeDasharray 변환
		// Why: Stroke.style 필드가 "dashed" | "dotted" | "solid"로 정의되어 있으나
		//      Canvas 렌더링에는 연결되지 않았음.
		const getStrokeDasharray = (): string | undefined => {
			const style = element.stroke?.style;
			if (style === "dashed") return "8 4";
			if (style === "dotted") return "2 2";
			return undefined; // solid
		};
		const strokeDasharray = getStrokeDasharray();
		const strokeOpacity = element.stroke?.opacity ?? 1;

		switch (element.type) {
			case "rect": {
				const bindingSlots = element.bindingContainer?.enabled
					? element.bindingContainer.slots
					: [];
				const slotLayouts = new Map<string, BindingTextLayoutResult>(
					bindingSlots.map((slot): [string, BindingTextLayoutResult] => [
						slot.id,
						resolveBindingTextLayout({
							content: slot.content,
							autoFit: element.bindingContainer?.autoFit,
							shape: {
								x: element.x,
								width: element.width,
								height: element.height,
							},
							slot,
							constraints: { canvasWidth },
						}),
					]),
				);
				const renderShapeWidth =
					bindingSlots.length > 0
						? Math.max(
								element.width,
								...Array.from(
									slotLayouts.values(),
									(layout) => layout.renderShapeWidth,
								),
							)
						: element.width;
				// 개별 코너 radius 계산
				const unit = element.borderRadiusUnit || "px";
				const baseRadius = element.borderRadius || 0;
				const maxRadius =
					unit === "%"
						? Math.min(renderShapeWidth, element.height) / 2
						: 999999;

				const getRadius = (value: number | undefined) => {
					const r = value ?? baseRadius;
					if (unit === "%") {
						return Math.min(
							((r / 100) * Math.min(renderShapeWidth, element.height)) / 2,
							maxRadius,
						);
					}
					return Math.min(r, renderShapeWidth / 2, element.height / 2);
				};

				const tl = getRadius(element.borderRadiusTL);
				const tr = getRadius(element.borderRadiusTR);
				const br = getRadius(element.borderRadiusBR);
				const bl = getRadius(element.borderRadiusBL);

				// 모든 코너가 같으면 단순 rect 사용
				const allSame =
					element.borderRadiusLinked !== false ||
					(tl === tr && tr === br && br === bl);

				return (
					<g
						key={element.id}
						{...commonProps}
						onDoubleClick={() => {
							// Shape 더블클릭 → 첫 번째 슬롯 인라인 편집 진입
							if (
								element.bindingContainer?.enabled &&
								element.bindingContainer.slots.length > 0
							) {
								setEditingSlot({
									elementId: element.id,
									slotId: element.bindingContainer.slots[0].id,
								});
							}
						}}
					>
						{renderVisualEffectsDefs()}
						{allSame ? (
							<rect
								x={element.x}
								y={element.y}
								width={renderShapeWidth}
								height={element.height}
								fill={getFillStyle(element)}
								fillOpacity={getFillOpacity(element)}
								stroke={element.stroke?.color || "#1e40af"}
								strokeWidth={element.stroke?.width ?? 2}
								strokeDasharray={strokeDasharray}
								strokeOpacity={strokeOpacity}
								rx={tl}
								filter={effectsFilterUrl}
							/>
						) : (
							<path
								d={`
                                    M ${element.x + tl} ${element.y}
                                    L ${element.x + renderShapeWidth - tr} ${element.y}
                                    Q ${element.x + renderShapeWidth} ${element.y} ${element.x + renderShapeWidth} ${element.y + tr}
                                    L ${element.x + renderShapeWidth} ${element.y + element.height - br}
                                    Q ${element.x + renderShapeWidth} ${element.y + element.height} ${element.x + renderShapeWidth - br} ${element.y + element.height}
                                    L ${element.x + bl} ${element.y + element.height}
                                    Q ${element.x} ${element.y + element.height} ${element.x} ${element.y + element.height - bl}
                                    L ${element.x} ${element.y + tl}
                                    Q ${element.x} ${element.y} ${element.x + tl} ${element.y}
                                    Z
                                `}
								fill={getFillStyle(element)}
								fillOpacity={getFillOpacity(element)}
								stroke={element.stroke?.color || "#1e40af"}
								strokeWidth={element.stroke?.width ?? 2}
								strokeDasharray={strokeDasharray}
								strokeOpacity={strokeOpacity}
								filter={effectsFilterUrl}
							/>
						)}
						{/* 🆕 Binding Container — Text Frame 기반 텍스트 편집 */}
						{element.bindingContainer?.enabled &&
							element.bindingContainer.slots.map((slot) => {
								const layout = slotLayouts.get(slot.id);
								if (!layout) return null;
								// Text Frame 절대 좌표 계산 (Shape 원점 + 오프셋)
								const frameAbsX = element.x + slot.frameX;
								const frameAbsY = element.y + slot.frameY;
								const frameW = layout.renderFrameWidth;
								const frameH = layout.renderFrameHeight;
								const authorFrameW = slot.frameWidth;
								const authorFrameH = slot.frameHeight;
								const isEditingThis =
									editingSlot?.elementId === element.id &&
									editingSlot?.slotId === slot.id;
								const isResizingThisFrame =
									frameResizing?.elementId === element.id &&
									frameResizing.slotId === slot.id;
								const autoFitMode = element.bindingContainer!.autoFit;

								return (
									<g key={slot.id}>
										{/* Text Frame 바운더리 (편집 중 또는 선택 시: 점선 표시) */}
										{(isEditingThis || isSelected) && (
											<rect
												x={frameAbsX}
												y={frameAbsY}
												width={authorFrameW}
												height={authorFrameH}
												fill={
													isResizingThisFrame
														? "rgba(245,158,11,0.08)"
														: "transparent"
												}
												stroke={
													isResizingThisFrame
														? "#f59e0b"
														: isEditingThis
															? "#60a5fa"
															: "rgba(96,165,250,0.45)"
												}
												strokeWidth={
													isResizingThisFrame || isEditingThis ? 1.5 : 1
												}
												strokeDasharray={
													isResizingThisFrame || isEditingThis ? "none" : "4 4"
												}
												pointerEvents="none"
											/>
										)}

										{isEditingThis ? (
											/* 편집 모드: foreignObject + contentEditable */
											<foreignObject
												x={frameAbsX}
												y={frameAbsY}
												width={authorFrameW}
												height={authorFrameH}
											>
												<div
													contentEditable
													suppressContentEditableWarning
													style={{
														width: "100%",
														height: "100%",
														fontSize: slot.fontSize,
														fontFamily: slot.fontFamily,
														fontWeight: slot.fontWeight,
														color: slot.color,
														textAlign: slot.textAlign,
														outline: "none",
														border: "none",
														background: "transparent",
														overflow: "hidden",
														display: "flex",
														alignItems: "center",
														justifyContent:
															slot.textAlign === "center"
																? "center"
																: slot.textAlign === "right"
																	? "flex-end"
																	: "flex-start",
														wordWrap:
															autoFitMode === "wrap" ? "break-word" : "normal",
														whiteSpace:
															autoFitMode === "wrap" ? "pre-wrap" : "nowrap",
														lineHeight: 1.2,
														padding: 0,
														margin: 0,
														cursor: "text",
													}}
													onBlur={(e) => {
														// 편집 종료 시 content 업데이트 + wrap 모드 auto-expand
														const newContent = (e.target as HTMLDivElement)
															.innerText;
														const bc = element.bindingContainer!;
														// 편집된 특정 슬롯만 업데이트 (나머지는 원본 유지)
														let updatedSlot: typeof slot = {
															...slot,
															content: newContent,
														};

														// 🆕 wrap 모드: 텍스트량에 따라 frameHeight 자동 확장
														// Why: 고정 높이에서 텍스트가 잘리면 오퍼레이터가 인지하기 어렵다.
														//      blur 시점에 쫙 높이를 계산하여 Shape 높이 내에서 자동 확장한다.
														if (autoFitMode === "wrap" && newContent) {
															const estH = estimateWrappedTextHeight(
																newContent,
																slot.fontSize,
																slot.fontFamily,
																slot.fontWeight,
																authorFrameW,
															);
															if (estH > slot.frameHeight) {
																// Shape 안에서 frameY만큼 이미 사용했으므로 남은 공간까지만 확장
																const maxH = element.height - slot.frameY;
																updatedSlot = {
																	...updatedSlot,
																	frameHeight: Math.min(Math.ceil(estH), maxH),
																};
															}
														}

														const hasChange =
															newContent !== slot.content ||
															updatedSlot.frameHeight !== slot.frameHeight;
														if (hasChange) {
															const newSlots = bc.slots.map((s) =>
																s.id === slot.id ? updatedSlot : s,
															);
															onUpdate(element.id, {
																bindingContainer: { ...bc, slots: newSlots },
															});
														}
														setEditingSlot(null);
													}}
													ref={(el) => {
														// 자동 포커스 + 텍스트 전체 선택
														if (el) {
															el.focus();
															const range = document.createRange();
															range.selectNodeContents(el);
															const sel = window.getSelection();
															sel?.removeAllRanges();
															sel?.addRange(range);
														}
													}}
												>
													{slot.content || slot.label || slot.bindingKey}
												</div>
											</foreignObject>
										) : /* 표시 모드: wrap이면 foreignObject, 아니면 SVG text */
										autoFitMode === "wrap" ? (
											<foreignObject
												x={frameAbsX}
												y={frameAbsY}
												width={frameW}
												height={frameH}
												pointerEvents="none"
											>
												<div
													style={{
														width: "100%",
														height: "100%",
														fontSize: slot.fontSize,
														fontFamily: slot.fontFamily,
														fontWeight: slot.fontWeight,
														color: slot.color,
														textAlign: slot.textAlign,
														overflow: "hidden",
														wordWrap: "break-word",
														whiteSpace: "pre-wrap",
														lineHeight: 1.2,
														display: "flex",
														alignItems: "center",
													}}
												>
													{slot.content || slot.label || slot.bindingKey}
												</div>
											</foreignObject>
										) : (
											<text
												x={
													slot.textAlign === "center"
														? frameAbsX + frameW / 2
														: slot.textAlign === "right"
															? frameAbsX + frameW
															: frameAbsX
												}
												y={frameAbsY + frameH / 2}
												fill={slot.color}
												fontSize={slot.fontSize}
												fontFamily={slot.fontFamily}
												fontWeight={slot.fontWeight}
												textAnchor={
													slot.textAlign === "center"
														? "middle"
														: slot.textAlign === "right"
															? "end"
															: "start"
												}
												dominantBaseline="central"
												pointerEvents="none"
												textLength={
													layout.textScaleX < 1 && layout.textWidth > 0
														? Math.max(1, layout.textWidth * layout.textScaleX)
														: undefined
												}
												lengthAdjust={
													layout.textScaleX < 1 && layout.textWidth > 0
														? "spacingAndGlyphs"
														: undefined
												}
											>
												{slot.content || slot.label || slot.bindingKey}
											</text>
										)}
									</g>
								);
							})}
						{/* 바인딩 컨테이너 표시 아이콘 */}
						{element.bindingContainer?.enabled && (
							<text
								x={element.x + renderShapeWidth - 16}
								y={element.y + 14}
								fontSize={12}
								fill="#60a5fa"
								pointerEvents="none"
							>
								🔗
							</text>
						)}
						{/* 선택 테두리 (라벨 포함 안함) */}
						{/* 🆕 Text Frame 리사이즈 핸들 (선택 + 바인딩 활성 시) */}
						{isSelected && renderTextFrameHandles(element)}
					</g>
				);
			}

			case "ellipse":
				return (
					<g key={element.id} {...commonProps}>
						{renderVisualEffectsDefs()}
						<ellipse
							cx={element.x + element.width / 2}
							cy={element.y + element.height / 2}
							rx={element.width / 2}
							ry={element.height / 2}
							fill={getFillStyle(element)}
							fillOpacity={getFillOpacity(element)}
							stroke={element.stroke?.color || "#1e40af"}
							strokeWidth={element.stroke?.width ?? 2}
							strokeDasharray={strokeDasharray}
							strokeOpacity={strokeOpacity}
							filter={effectsFilterUrl}
						/>
					</g>
				);

			case "text": {
				// 그림자 필터 — 도형과 공용 renderVisualEffectsDefs 사용

				return (
					<g key={element.id} {...commonProps}>
						{renderVisualEffectsDefs()}
						{(() => {
							// 수직 정렬 계산
							const vAlign = (element as any).verticalAlign || "top";
							const fs = element.fontSize || 24;
							let textY: number;
							let dominantBaseline: "auto" | "central" | "text-after-edge";
							if (vAlign === "middle") {
								textY = element.y + element.height / 2;
								dominantBaseline = "central";
							} else if (vAlign === "bottom") {
								textY = element.y + element.height;
								dominantBaseline = "text-after-edge";
							} else {
								// top (기본)
								textY = element.y + fs;
								dominantBaseline = "auto";
							}

							return (
								<text
									x={
										element.x +
										(element.textAlign === "center"
											? element.width / 2
											: element.textAlign === "right"
												? element.width
												: 0)
									}
									y={textY}
									fill={element.fill?.color || "#ffffff"}
									stroke={
										element.textStrokeEnabled
											? element.stroke?.color || "#000000"
											: undefined
									}
									strokeWidth={
										element.textStrokeEnabled
											? element.stroke?.width || 2
											: undefined
									}
									fontFamily={element.fontFamily || "Noto Sans KR"}
									fontSize={fs}
									fontWeight={element.fontWeight || 400}
									textAnchor={
										element.textAlign === "center"
											? "middle"
											: element.textAlign === "right"
												? "end"
												: "start"
									}
									dominantBaseline={dominantBaseline}
									filter={effectsFilterUrl}
									style={{
										letterSpacing: element.letterSpacing
											? `${element.letterSpacing}px`
											: undefined,
										textTransform:
											element.textCase === "none"
												? undefined
												: element.textCase,
										textDecoration:
											element.textDecoration === "none"
												? undefined
												: element.textDecoration,
										paintOrder: "stroke fill",
										// 🆕 고정폭 숫자: 데이터 숫자가 변할 때 텍스트 떨림(Jitter) 방지
										fontVariantNumeric: element.tabularNums
											? "tabular-nums"
											: undefined,
									}}
								>
									{element.content || "텍스트"}
								</text>
							);
						})()}
					</g>
				);
			}

			case "image": {
				// 이미지 요소 렌더링 (일반 이미지 + AI SVG 포함)
				// ■ Why 별도 case가 필요한가?
				//   이미지는 SVG <image> 태그로 렌더링되며, objectFit에 따라
				//   preserveAspectRatio 속성이 달라진다.
				//   rect/text와 다른 렌더링 로직이므로 독립된 분기가 필수.
				const imgSrc = element.src || "";
				return (
					<g key={element.id} {...commonProps}>
						{renderVisualEffectsDefs()}
						{/* 이미지가 없을 때 플레이스홀더 표시 */}
						{!imgSrc ? (
							<>
								<rect
									x={element.x}
									y={element.y}
									width={element.width}
									height={element.height}
									fill="var(--app-bg-elevated, #1a1a2e)"
									stroke="var(--border-default, #333)"
									strokeWidth={1}
									strokeDasharray="6 3"
									rx={4}
								/>
								<text
									x={element.x + element.width / 2}
									y={element.y + element.height / 2}
									fill="var(--text-tertiary, #666)"
									fontSize={14}
									fontFamily="sans-serif"
									textAnchor="middle"
									dominantBaseline="central"
									pointerEvents="none"
								>
									🖼️ 이미지 없음
								</text>
							</>
						) : (
							<image
								x={element.x}
								y={element.y}
								width={element.width}
								height={element.height}
								href={imgSrc}
								preserveAspectRatio={
									element.objectFit === "cover"
										? "xMidYMid slice"
										: element.objectFit === "fill"
											? "none"
											: "xMidYMid meet" // contain (기본값)
								}
								filter={effectsFilterUrl}
							/>
						)}
					</g>
				);
			}

			case "html_plugin": {
				// ■ Why foreignObject + iframe?
				//   SVG 캔버스 내부에서 HTML/JS 플러그인을 라이브로 렌더링하기 위해
				//   foreignObject로 HTML 영역을 확보한 뒤 iframe(srcdoc)으로 실행.
				//   iframe은 pointerEvents:none으로 설정하여 드래그/리사이즈는
				//   외부 SVG 핸들을 통해 처리되도록 함.
				if (!element.pluginSourceCode) {
					// 소스 코드가 없으면 플레이스홀더 표시
					return (
						<g key={element.id} {...commonProps}>
							<rect
								x={element.x}
								y={element.y}
								width={element.width}
								height={element.height}
								fill="rgba(99,102,241,0.1)"
								stroke="#818cf8"
								strokeWidth={1}
								strokeDasharray="6 3"
								rx={4}
							/>
							<text
								x={element.x + element.width / 2}
								y={element.y + element.height / 2}
								fill="#818cf8"
								fontSize={14}
								fontFamily="sans-serif"
								textAnchor="middle"
								dominantBaseline="central"
								pointerEvents="none"
							>
								🔌 오버레이 연결 없음
							</text>
						</g>
					);
				}

				const pluginSrc = element.pluginSourceCode;
				// ■ Why SVG 내부에는 플레이스홀더만?
				//   SVG foreignObject 내부의 iframe은 브라우저 렌더링 엔진 제약으로
				//   투명 배경이 불가능 (항상 하얀 배경 렌더링).
				//   실제 iframe은 SVG 밖 HTML 오버레이로 렌더링 (아래 return문 참조).
				//   여기서는 드래그/리사이즈용 투명 영역 + 선택 핸들만 표시.
				void pluginSrc; // lint: 변수는 아래 HTML 오버레이에서 사용
				return (
					<g key={element.id} {...commonProps}>
						{/* 드래그 대상 투명 영역 + 점선 테두리 */}
						<rect
							x={element.x}
							y={element.y}
							width={element.width}
							height={element.height}
							fill="transparent"
							stroke="#818cf8"
							strokeWidth={1}
							strokeDasharray="4 2"
							strokeOpacity={0.4}
							rx={2}
						/>
					</g>
				);
			}

			case "boolean_group": {
				return renderSvgBooleanGroup({
					element,
					elements,
					groupProps: commonProps,
					idPrefix: "editor",
					emptyNode: (
						<g key={element.id} {...commonProps} />
					),
					renderBooleanFill: (base, group) => (
						<rect
							x={group.x}
							y={group.y}
							width={group.width}
							height={group.height}
							fill={getFillStyle(base)}
							fillOpacity={getFillOpacity(base)}
						/>
					),
				});
			}

			case "group": {
				return renderSvgCompositionGroup({
					element,
					elements,
					renderElement,
					groupProps: commonProps,
					idPrefix: "editor",
					maskTextFallback: "텍스트",
					maskFontFamily: "Noto Sans KR",
					backgroundNode: (
						<rect
							x={element.x}
							y={element.y}
							width={element.width}
							height={element.height}
							fill="transparent"
							stroke="transparent"
							strokeWidth={0}
						/>
					),
				});
			}

			default:
				return null;
		}
	};

	// 🆕 Text Frame 리사이즈 핸들 렌더링
	// Shape 핸들과 같은 좌표에 겹치지 않도록 Text Frame 안쪽에 작게 배치한다.
	// Shape가 선택되고 bindingContainer가 활성화된 경우에만 표시
	const renderTextFrameHandles = (element: GraphicElement) => {
		if (
			!element.bindingContainer?.enabled ||
			element.bindingContainer.slots.length === 0
		)
			return null;
		const slot = element.bindingContainer.slots[0];
		const frameAbsX = element.x + slot.frameX;
		const frameAbsY = element.y + slot.frameY;
		const fw = slot.frameWidth;
		const fh = slot.frameHeight;
		const visualRadius = 4;
		const hitRadius = 9;
		const handleInsetX = Math.min(10, Math.max(0, fw / 2 - visualRadius));
		const handleInsetY = Math.min(10, Math.max(0, fh / 2 - visualRadius));
		const left = frameAbsX + handleInsetX;
		const right = frameAbsX + fw - handleInsetX;
		const top = frameAbsY + handleInsetY;
		const bottom = frameAbsY + fh - handleInsetY;
		const activeHandle =
			frameResizing?.elementId === element.id &&
			frameResizing.slotId === slot.id
				? frameResizing.handle
				: null;

		const handles = [
			{ handle: "nw", cx: left, cy: top, cursor: "nwse-resize" },
			{ handle: "n", cx: frameAbsX + fw / 2, cy: top, cursor: "ns-resize" },
			{ handle: "ne", cx: right, cy: top, cursor: "nesw-resize" },
			{ handle: "e", cx: right, cy: frameAbsY + fh / 2, cursor: "ew-resize" },
			{ handle: "se", cx: right, cy: bottom, cursor: "nwse-resize" },
			{ handle: "s", cx: frameAbsX + fw / 2, cy: bottom, cursor: "ns-resize" },
			{ handle: "sw", cx: left, cy: bottom, cursor: "nesw-resize" },
			{ handle: "w", cx: left, cy: frameAbsY + fh / 2, cursor: "ew-resize" },
		];

		return (
			<g key={`tf-handles-${slot.id}`}>
				{handles.map((h) => {
					const isActive = activeHandle === h.handle;
					return (
						<g
							key={h.handle}
							style={{ cursor: h.cursor }}
							onMouseDown={(e) => {
								e.stopPropagation();
								e.preventDefault();
								const coords = getCanvasCoords(e as unknown as MouseEvent);
								setFrameResizing({
									elementId: element.id,
									slotId: slot.id,
									handle: h.handle,
									startX: coords.x,
									startY: coords.y,
									frameStartX: slot.frameX,
									frameStartY: slot.frameY,
									frameStartW: slot.frameWidth,
									frameStartH: slot.frameHeight,
									shapeW: element.width,
									shapeH: element.height,
								});
							}}
						>
							<circle cx={h.cx} cy={h.cy} r={hitRadius} fill="transparent" />
							<circle
								cx={h.cx}
								cy={h.cy}
								r={visualRadius}
								fill={isActive ? "#f59e0b" : "#38bdf8"}
								stroke={isActive ? "#7c2d12" : "#0f172a"}
								strokeWidth={1.25}
								style={{
									filter: isActive
										? "drop-shadow(0 0 4px rgba(245,158,11,0.75))"
										: undefined,
								}}
							/>
						</g>
					);
				})}
			</g>
		);
	};

	// 리사이즈 핸들 렌더링
	// zIndex 순으로 정렬
	const sortedElements = elements
		.filter((el) => !el.parentId)
		.sort((a, b) => a.zIndex - b.zIndex);

	const getNearestClipParent = (
		element: GraphicElement,
	): GraphicElement | null => {
		let current = element.parentId
			? elements.find((el) => el.id === element.parentId)
			: null;
		while (current) {
			if (current.clipContent) return current;
			const nextParentId = current.parentId;
			current = nextParentId
				? elements.find((el) => el.id === nextParentId)
				: null;
		}
		return null;
	};

	return (
		<div
			className="canvas-container"
			style={{ width: displayWidth, height: displayHeight }}
		>
			<svg
				ref={svgRef}
				className="canvas-svg"
				width={displayWidth}
				height={displayHeight}
				viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
				onClick={handleCanvasClick}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onDragStart={(e) => e.preventDefault()}
				style={{
					userSelect: "none",
					WebkitUserSelect: "none",
				}}
			>
				{/* 배경 - 클릭 시 선택 해제 */}
				<rect
					x={0}
					y={0}
					width={canvasWidth}
					height={canvasHeight}
					fill="#1a1a1a"
					onClick={() => onSelect([])}
					style={{ cursor: "default" }}
				/>

				{/* 그라데이션 정의 */}
				{renderGradientDefs()}

				{/* 그리드 오버레이 */}
				<GridOverlay
					zones={zones}
					canvasWidth={canvasWidth}
					canvasHeight={canvasHeight}
				/>

				{/* 중심선 가이드 */}
				<line
					x1={canvasWidth / 2}
					y1={0}
					x2={canvasWidth / 2}
					y2={canvasHeight}
					stroke="rgba(255,255,255,0.1)"
					strokeWidth={1}
					strokeDasharray="8 8"
				/>
				<line
					x1={0}
					y1={canvasHeight / 2}
					x2={canvasWidth}
					y2={canvasHeight / 2}
					stroke="rgba(255,255,255,0.1)"
					strokeWidth={1}
					strokeDasharray="8 8"
				/>

				{/* 요소들 */}
				{sortedElements.map(renderElement)}

				{/* 🆕 최상위 평탄 오버레이 라벨 레이어 */}
				{renderLabelsOverlay()}
			</svg>

			{/* Layer 2: 상호작용 전용 HTML 레이어 (선택 박스, 리사이즈 핸들) */}
			<InteractionLayer
				elements={elements}
				selectedIds={selectedIds}
				zoom={scale}
				canvasWidth={canvasWidth}
				canvasHeight={canvasHeight}
				snapVLinesRef={snapVLinesRef}
				snapHLinesRef={snapHLinesRef}
				activeResize={
					resizing ? { id: resizing.id, handle: resizing.handle } : null
				}
				onResizeStart={(e, id, handle) => {
					const coords = getCanvasCoords(e as unknown as MouseEvent);
					const element = elements.find((el) => el.id === id);
					if (element) {
						// 🆕 리사이즈 시작 시점에 스냅 대상 라인 풀을 1회 선캐싱하여 mousemove 내 O(N) 순회 병목 제거
						snapLinesRef.current = collectSnapLines(
							elements,
							id,
							zones,
							canvasWidth,
							canvasHeight,
						);

						setResizing({
							id,
							handle,
							startX: coords.x,
							startY: coords.y,
							elStartX: element.x,
							elStartY: element.y,
							elStartWidth: element.width,
							elStartHeight: element.height,
						});
					}
				}}
			/>

			{/* ■ HTML 플러그인 오버레이 레이어
                 SVG foreignObject 내부에서는 iframe 투명 배경이 불가능하므로,
                 SVG 밖에 absolute div로 iframe을 렌더링하고 SVG 좌표계와 동기화.
                 viewBox 비율(displayWidth/canvasWidth)로 SVG→CSS 좌표 변환. */}
			{elements
				.filter(
					(el) =>
						el.type === "html_plugin" &&
						isElementVisible(el) &&
						el.pluginSourceCode,
				)
				.map((el) => {
					const src = el.pluginSourceCode!;
					const scaleRatio = displayWidth / canvasWidth;
					const clipParent = getNearestClipParent(el);
					// 공통 모듈로 srcdoc 생성 — autoShow=true (에디터 내 프리뷰)
					const srcdoc = buildPluginSrcdoc({
						html: src.html,
						css: src.css,
						js: src.js,
						width: el.width,
						height: el.height,
						autoShow: true,
					});

					const iframeLayer = (
						<div
							style={{
								position: "absolute",
								left: (clipParent ? el.x - clipParent.x : 0) * scaleRatio,
								top: (clipParent ? el.y - clipParent.y : 0) * scaleRatio,
								width: el.width * scaleRatio,
								height: el.height * scaleRatio,
								overflow: "hidden",
								pointerEvents: "none",
								opacity: el.opacity,
								transform: `rotate(${el.rotation}deg)`,
								transformOrigin: "top left",
							}}
						>
							<iframe
								srcDoc={srcdoc}
								sandbox="allow-scripts allow-same-origin"
								data-plugin-id={el.pluginTemplateId}
								// @ts-expect-error — allowTransparency is deprecated but needed for iframe bg transparency
								allowTransparency="true"
								style={{
									width: `${el.width}px`,
									height: `${el.height}px`,
									border: "none",
									background: "transparent",
									colorScheme: "normal",
									transformOrigin: "top left",
									transform: `scale(${scaleRatio})`,
									pointerEvents: "none",
								}}
								title={el.name}
							/>
						</div>
					);

					return (
						<div
							key={`plugin-overlay-${el.id}`}
							style={{
								position: "absolute",
								left: (clipParent ? clipParent.x : el.x) * scaleRatio,
								top: (clipParent ? clipParent.y : el.y) * scaleRatio,
								width: (clipParent ? clipParent.width : el.width) * scaleRatio,
								height:
									(clipParent ? clipParent.height : el.height) * scaleRatio,
								overflow: "hidden",
								pointerEvents: "none",
								transformOrigin: "top left",
							}}
						>
							{iframeLayer}
						</div>
					);
				})}
		</div>
	);
}

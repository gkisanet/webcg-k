/**
 * Grid Overlay - 그리드 템플릿 영역 표시
 */

interface Zone {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface GridOverlayProps {
    zones: Zone[];
    canvasWidth: number;
    canvasHeight: number;
}

export function GridOverlay({ zones, canvasWidth, canvasHeight }: GridOverlayProps) {
    if (zones.length === 0) return null;

    return (
        <g className="grid-overlay">
            {zones.map((zone, index) => {
                // 퍼센트를 픽셀로 변환하고 정수형(Math.round)으로 맞추어 서브픽셀 렌더링 오차 방지
                const x = Math.round((zone.x / 100) * canvasWidth);
                const y = Math.round((zone.y / 100) * canvasHeight);
                const right = Math.round(((zone.x + zone.width) / 100) * canvasWidth);
                const bottom = Math.round(((zone.y + zone.height) / 100) * canvasHeight);
                const width = right - x;
                const height = bottom - y;

                return (
                    <g key={zone.id || index}>
                        <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            className="grid-zone"
                        />
                        <text
                            x={x + 8}
                            y={y + 20}
                            className="grid-zone-label"
                        >
                            {index + 1}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

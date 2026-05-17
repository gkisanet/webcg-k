/**
 * Segment Types — 세그먼트 기반 타임라인 그룹핑
 *
 * ■ Why Segment?
 *   NLE(Premiere) 타임라인의 블록은 "절대좌표(px)"로 위치를 결정한다.
 *   방송 큐시트는 "상대순서(item_order)"로 아이템 순서를 관리한다.
 *   이 두 패러다임의 갭을 메우는 중간 계층이 "Segment"이다.
 *
 *   세그먼트 = 뉴스 아이템 1개에 대응.
 *   하나의 세그먼트에 여러 트랙에 걸친 CG 블록들이 소속된다.
 *   NRCS 순서 변경 → 세그먼트 순서 재배치 → 탭 순서 자동 갱신.
 *
 * ■ Why Tab (Premiere Nested Sequence 패턴)?
 *   Dual-Panel(안 C)은 화면을 좌/우로 분할하여 공간 낭비가 크다.
 *   Premiere의 "시퀀스 탭" 패턴은 30px 탭 바만 추가하면서
 *   각 세그먼트를 독립 뷰로 전환할 수 있어 공간 효율이 극대화된다.
 *   NRCS 미연동 시 탭 바가 숨겨져 기존 UX와 100% 동일하게 동작.
 */

/** ■ 세그먼트 진행 상태 */
export type SegmentStatus = "idle" | "onair" | "done";

/**
 * 세그먼트 — 뉴스 아이템 1개에 대응하는 CG 그룹
 *
 * 비유: 책의 "장(Chapter)" — 전체 런다운이 책이라면,
 * 각 세그먼트는 하나의 장. 장 안에 여러 페이지(CG 블록)가 있다.
 */
export interface Segment {
	/** 고유 ID */
	id: string;

	/** NRCS 큐시트 아이템 ID (null이면 수동 생성된 세그먼트) */
	cuesheetItemId?: string;

	/** 세그먼트 표시명 (뉴스 아이템 제목/Slug) */
	label: string;

	/** 기자명 (NRCS에서 가져옴) */
	reporter?: string;

	/** 세그먼트 순서 (NRCS item_order와 동기) */
	order: number;

	/** 세그먼트 배경색 (타임라인 "전체" 뷰에서 밴드로 표시) */
	color: string;

	/** NRCS Slug (원본) */
	slug?: string;
}

/** DB 영속화용 세그먼트 데이터 (broadcast_sessions.segments JSON) */
export interface SegmentData {
	id: string;
	cuesheetItemId?: string;
	label: string;
	reporter?: string;
	order: number;
	color: string;
	slug?: string;
}

/**
 * 세그먼트 배경 밴드 — "전체" 탭에서 렌더링할 시각적 범위
 * 런타임 계산용 (DB 저장 안 함)
 */
export interface SegmentBand {
	id: string;
	label: string;
	color: string;
	order: number;
	/** 밴드 시작 픽셀 (소속 블록 중 가장 왼쪽) */
	startPx: number;
	/** 밴드 끝 픽셀 (소속 블록 중 가장 오른쪽 끝) */
	endPx: number;
	/** 소속 CG 블록 수 */
	blockCount: number;
}

/**
 * 세그먼트별 팔레트 — 시각적 구분을 위한 색상 순환
 *
 * ■ Why 이 색상들?
 *   방송 UI의 Dark Void 배경(#0d0d0d) 위에서
 *   과하지 않으면서도 구분이 명확한 저채도-저명도 색상을 선택.
 *   알파 0.12 ~ 0.15로 블록 색상을 가리지 않으면서 영역만 구분.
 */
export const SEGMENT_COLORS = [
	"rgba(59, 130, 246, 0.12)",   // 파랑
	"rgba(16, 185, 129, 0.12)",   // 초록
	"rgba(245, 158, 11, 0.12)",   // 앰버
	"rgba(139, 92, 246, 0.12)",   // 보라
	"rgba(236, 72, 153, 0.12)",   // 핑크
	"rgba(14, 165, 233, 0.12)",   // 스카이
	"rgba(249, 115, 22, 0.12)",   // 오렌지
	"rgba(34, 197, 94, 0.12)",    // 에메랄드
] as const;

/** 순환 색상 할당 유틸리티 */
export function getSegmentColor(index: number): string {
	return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

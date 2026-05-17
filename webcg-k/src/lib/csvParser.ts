/**
 * CSV Parser — 네이티브 CSV 파싱 유틸리티
 *
 * ■ 비유: 엑셀 파일을 받아서 각 칸을 읽는 안경 같은 것.
 *   CSV(쉼표로 구분된 값)를 2D 배열 또는 객체 배열로 변환한다.
 *
 * ■ Why 외부 라이브러리(Papa Parse) 없이 네이티브?
 *   방송 CG 큐시트 CSV는 단순 구조(10~50행, 5~10열).
 *   RFC 4180 기본 규격(따옴표 이스케이프, 줄바꿈 처리)만 지원하면 충분.
 *   번들 크기 절약(Papa Parse ≈ 15KB gzip).
 */

// ─── 타입 정의 ────────────────────────────────────────────────────

/** CSV 파싱 결과 */
export interface CsvParseResult {
	/** 헤더 행 (첫 번째 줄) */
	headers: string[];
	/** 데이터 행 (2D 배열, 각 행은 string[]) */
	rows: string[][];
	/** 총 행 수 (헤더 제외) */
	totalRows: number;
	/** 탐지된 구분자 */
	delimiter: string;
}

/** CSV 파싱 옵션 */
export interface CsvParseOptions {
	/** 구분자 (기본: 자동 탐지) */
	delimiter?: string;
	/** 첫 번째 줄을 헤더로 사용 (기본: true) */
	hasHeader?: boolean;
	/** 최대 파싱할 행 수 (미리보기용, 0 = 전체) */
	maxRows?: number;
}

// ─── 핵심 파서 ────────────────────────────────────────────────────

/**
 * CSV 문자열을 파싱하여 구조화된 데이터로 변환한다.
 *
 * ■ 알고리즘 (RFC 4180 준수):
 *   1단계: 구분자 자동 탐지 (,  ;  \t 중 가장 많이 등장하는 것)
 *   2단계: 따옴표 이스케이프 처리 ("필드 내 ""따옴표""")
 *   3단계: 줄 단위 분리 → 필드 분리 → 2D 배열 구성
 *
 * @param csvText - CSV 원본 문자열
 * @param options - 파싱 옵션
 * @returns 파싱 결과
 */
export function parseCsv(csvText: string, options: CsvParseOptions = {}): CsvParseResult {
	const { hasHeader = true, maxRows = 0 } = options;

	// 1단계: 구분자 자동 탐지
	const delimiter = options.delimiter || detectDelimiter(csvText);

	// 2단계: 행+필드 분리 (따옴표 이스케이프 처리)
	const allRows = splitCsvRows(csvText, delimiter);

	// 3단계: 헤더/데이터 분리
	if (allRows.length === 0) {
		return { headers: [], rows: [], totalRows: 0, delimiter };
	}

	const headers = hasHeader ? allRows[0].map((h) => h.trim()) : allRows[0].map((_, i) => `Column ${i + 1}`);
	const dataStart = hasHeader ? 1 : 0;
	let rows = allRows.slice(dataStart);

	// 빈 행 제거 (모든 필드가 빈 문자열인 행)
	rows = rows.filter((row) => row.some((cell) => cell.trim() !== ""));

	// maxRows 제한 (미리보기용)
	if (maxRows > 0 && rows.length > maxRows) {
		rows = rows.slice(0, maxRows);
	}

	return { headers, rows, totalRows: rows.length, delimiter };
}

/**
 * 구분자 자동 탐지
 * 첫 5줄에서 콤마, 세미콜론, 탭의 등장 횟수를 비교한다.
 */
function detectDelimiter(text: string): string {
	const sample = text.split("\n").slice(0, 5).join("\n");
	const counts: Record<string, number> = {
		",": (sample.match(/,/g) || []).length,
		";": (sample.match(/;/g) || []).length,
		"\t": (sample.match(/\t/g) || []).length,
	};

	let best = ",";
	let max = 0;
	for (const [delim, count] of Object.entries(counts)) {
		if (count > max) {
			max = count;
			best = delim;
		}
	}
	return best;
}

/**
 * CSV 텍스트를 행+필드로 분리 (RFC 4180 따옴표 처리)
 *
 * ■ 핵심: 따옴표 안의 줄바꿈과 구분자는 필드의 일부이므로
 *   단순 split("\n").split(",")로는 안 된다.
 *   문자 하나씩 순회하는 State Machine 방식 사용.
 */
function splitCsvRows(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentField = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const nextChar = text[i + 1];

		if (inQuotes) {
			// 따옴표 안에서 ""는 이스케이프된 따옴표
			if (char === '"' && nextChar === '"') {
				currentField += '"';
				i++; // 다음 " 건너뛰기
			} else if (char === '"') {
				// 따옴표 닫기
				inQuotes = false;
			} else {
				currentField += char;
			}
		} else {
			if (char === '"') {
				// 따옴표 열기
				inQuotes = true;
			} else if (char === delimiter) {
				// 필드 구분
				currentRow.push(currentField);
				currentField = "";
			} else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
				// 행 끝
				currentRow.push(currentField);
				currentField = "";
				rows.push(currentRow);
				currentRow = [];
				if (char === "\r") i++; // \r\n 처리
			} else if (char === "\r") {
				// 단독 \r (구 Mac 형식)
				currentRow.push(currentField);
				currentField = "";
				rows.push(currentRow);
				currentRow = [];
			} else {
				currentField += char;
			}
		}
	}

	// 마지막 행 처리 (파일 끝에 줄바꿈 없는 경우)
	if (currentField || currentRow.length > 0) {
		currentRow.push(currentField);
		rows.push(currentRow);
	}

	return rows;
}

// ─── 유틸리티 ─────────────────────────────────────────────────────

/**
 * 파싱된 CSV 행을 객체 배열로 변환 (헤더를 키로 사용)
 */
export function csvRowsToObjects(
	headers: string[],
	rows: string[][],
): Record<string, string>[] {
	return rows.map((row) => {
		const obj: Record<string, string> = {};
		headers.forEach((h, i) => {
			obj[h] = row[i]?.trim() ?? "";
		});
		return obj;
	});
}

/**
 * File 객체에서 CSV 텍스트를 읽어 파싱한다.
 */
export function parseCsvFile(
	file: File,
	options: CsvParseOptions = {},
): Promise<CsvParseResult> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			if (!text) {
				reject(new Error("파일을 읽을 수 없습니다"));
				return;
			}
			resolve(parseCsv(text, options));
		};
		reader.onerror = () => reject(new Error("파일 읽기 실패"));
		// UTF-8 기본, EUC-KR 한글 엑셀 CSV 대응은 향후 확장
		reader.readAsText(file, "utf-8");
	});
}

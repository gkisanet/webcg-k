/**
 * Data Providers — 외부 데이터 소스 연동
 * Open-Meteo (날씨), USGS (지진), Mock (산불/공공데이터)
 * 모두 무료, 인증 불필요
 */

import type { WeatherData, EarthquakeData, WildfireData, CustomDataSource } from "../lib/overlayTypes";

// ─── 상수 ────────────────────────────────────────────────────────

/** WMO 날씨 코드 → 한글 설명 & 아이콘 매핑 */
const WEATHER_CODE_MAP: Record<number, { description: string; icon: string }> = {
	0: { description: "맑음", icon: "☀️" },
	1: { description: "대체로 맑음", icon: "🌤" },
	2: { description: "부분 흐림", icon: "⛅" },
	3: { description: "흐림", icon: "☁️" },
	45: { description: "안개", icon: "🌫" },
	48: { description: "짙은 안개", icon: "🌫" },
	51: { description: "약한 이슬비", icon: "🌦" },
	53: { description: "이슬비", icon: "🌦" },
	55: { description: "강한 이슬비", icon: "🌧" },
	61: { description: "약한 비", icon: "🌧" },
	63: { description: "비", icon: "🌧" },
	65: { description: "강한 비", icon: "🌧" },
	66: { description: "약한 진눈깨비", icon: "🌨" },
	67: { description: "진눈깨비", icon: "🌨" },
	71: { description: "약한 눈", icon: "🌨" },
	73: { description: "눈", icon: "❄️" },
	75: { description: "강한 눈", icon: "❄️" },
	77: { description: "눈 입자", icon: "❄️" },
	80: { description: "약한 소나기", icon: "🌦" },
	81: { description: "소나기", icon: "🌧" },
	82: { description: "강한 소나기", icon: "⛈" },
	85: { description: "약한 눈소나기", icon: "🌨" },
	86: { description: "눈소나기", icon: "🌨" },
	95: { description: "뇌우", icon: "⛈" },
	96: { description: "뇌우 + 약한 우박", icon: "⛈" },
	99: { description: "뇌우 + 강한 우박", icon: "⛈" },
};

/** 주요 한국 도시 좌표 */
const KOREA_CITIES: Record<string, { lat: number; lon: number }> = {
	서울: { lat: 37.5665, lon: 126.978 },
	부산: { lat: 35.1796, lon: 129.0756 },
	대구: { lat: 35.8714, lon: 128.6014 },
	인천: { lat: 37.4563, lon: 126.7052 },
	광주: { lat: 35.1595, lon: 126.8526 },
	대전: { lat: 36.3504, lon: 127.3845 },
	제주: { lat: 33.4996, lon: 126.5312 },
};

// ─── 날씨 (Open‑Meteo) ──────────────────────────────────────────

/**
 * Open-Meteo API에서 현재 날씨 조회
 * @param city 한국 도시명 (기본: "서울")
 */
export async function fetchWeatherData(city = "서울"): Promise<WeatherData> {
	const coords = KOREA_CITIES[city] ?? KOREA_CITIES["서울"];
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(coords.lat));
	url.searchParams.set("longitude", String(coords.lon));
	url.searchParams.set("current", "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m");
	url.searchParams.set("timezone", "Asia/Seoul");

	const res = await fetch(url.toString());
	if (!res.ok) throw new Error(`Open-Meteo API 에러: ${res.status}`);

	const json = await res.json();
	const current = json.current;
	const code = current.weather_code ?? 0;
	const mapped = WEATHER_CODE_MAP[code] ?? { description: "알 수 없음", icon: "❓" };

	return {
		temperature: current.temperature_2m,
		weatherCode: code,
		weatherDescription: mapped.description,
		icon: mapped.icon,
		city,
		humidity: current.relative_humidity_2m,
		windSpeed: current.wind_speed_10m,
	};
}

// ─── 지진 (USGS) ────────────────────────────────────────────────

/**
 * USGS API에서 최근 24시간 M2.5+ 지진 목록 조회
 * 한국 근처(동아시아) 필터 적용
 */
export async function fetchEarthquakeData(): Promise<EarthquakeData[]> {
	const url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";
	const res = await fetch(url);
	if (!res.ok) throw new Error(`USGS API 에러: ${res.status}`);

	const json = await res.json();
	// 동아시아 영역 필터 (lat 25~45, lon 120~135)
	const EAST_ASIA_BOUNDS = { minLat: 25, maxLat: 45, minLon: 120, maxLon: 135 };

	return json.features
		.filter((f: any) => {
			const [lon, lat] = f.geometry.coordinates;
			return (
				lat >= EAST_ASIA_BOUNDS.minLat &&
				lat <= EAST_ASIA_BOUNDS.maxLat &&
				lon >= EAST_ASIA_BOUNDS.minLon &&
				lon <= EAST_ASIA_BOUNDS.maxLon
			);
		})
		.slice(0, 10)
		.map((f: any) => ({
			magnitude: f.properties.mag,
			location: f.properties.place,
			depth: f.geometry.coordinates[2],
			time: new Date(f.properties.time).toISOString(),
			coordinates: {
				lat: f.geometry.coordinates[1],
				lon: f.geometry.coordinates[0],
			},
		}));
}

// ─── 산불 (Hardcoded Mock) ──────────────────────────────────────

/** 한국 산불 데이터 Mock (공공포털 인증 필요하므로 하드코딩) */
export async function fetchWildfireData(): Promise<WildfireData[]> {
	// 실제 서비스에서는 data.go.kr API 연동
	return [
		{
			level: "심각",
			location: "강원도 양양군 현남면",
			areaHa: 185,
			status: "진화 중",
			startDate: "2026-02-09T03:20:00+09:00",
		},
		{
			level: "주의",
			location: "경상북도 울진군 근남면",
			areaHa: 42,
			status: "진화 완료",
			startDate: "2026-02-08T14:10:00+09:00",
		},
		{
			level: "경계",
			location: "전라남도 해남군 송지면",
			areaHa: 78,
			status: "진화 중",
			startDate: "2026-02-10T06:45:00+09:00",
		},
	];
}

// ─── 범용 Mock (JSONPlaceholder 기반) ───────────────────────────

/** JSONPlaceholder에서 최근 게시물 조회 (뉴스/SNS 시뮬레이션) */
export async function fetchMockPublicData(): Promise<
	Array<{ id: number; title: string; body: string }>
> {
	const res = await fetch("https://jsonplaceholder.typicode.com/posts?_limit=5");
	if (!res.ok) throw new Error(`JSONPlaceholder API 에러: ${res.status}`);
	return res.json();
}

// ─── 커스텀 API 소스 ─────────────────────────────────────────────

/**
 * 커스텀 데이터 소스 설정 기반 HTTP 호출
 * 사용자가 등록한 endpoint/method/headers/query_params로 실제 요청 수행
 */
export async function fetchCustomSource(
	source: CustomDataSource,
): Promise<Record<string, unknown>> {
	// URL 조립 — 쿼리 파라미터 추가
	const url = new URL(source.endpoint);
	if (source.query_params) {
		for (const [key, value] of Object.entries(source.query_params)) {
			url.searchParams.set(key, value);
		}
	}

	// 헤더 조립
	const headers: Record<string, string> = {
		"Accept": "application/json",
		...source.headers,
	};

	// fetch 옵션
	const fetchOpts: RequestInit = {
		method: source.method,
		headers,
	};

	// POST body
	if (source.method === "POST" && source.body_template) {
		headers["Content-Type"] = "application/json";
		fetchOpts.body = JSON.stringify(source.body_template);
	}

	const res = await fetch(url.toString(), fetchOpts);
	if (!res.ok) {
		throw new Error(`커스텀 API 에러 (${res.status}): ${source.name}`);
	}

	const json = await res.json();

	// 응답 매핑 — 단순 최상위 키 추출 (response_mapping이 비어있으면 전체 반환)
	if (source.response_mapping && Object.keys(source.response_mapping).length > 0) {
		const mapped: Record<string, unknown> = {};
		for (const [alias, path] of Object.entries(source.response_mapping)) {
			// 단순 점(.) 경로 파싱: "response.body.items" → json.response.body.items
			mapped[alias] = resolvePath(json, path);
		}
		return { source: source.name, data: mapped };
	}

	return { source: source.name, data: json };
}

/**
 * 단순 점(.) 경로 기반 JSON 값 추출 헬퍼
 * "response.body.items" → obj.response.body.items
 */
function resolvePath(obj: unknown, path: string): unknown {
	const keys = path.split(".");
	let current: unknown = obj;
	for (const key of keys) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

// ─── 통합 데이터 페처 ────────────────────────────────────────────

/**
 * 데이터 소스 타입에 따라 외부 데이터를 가져오는 통합 함수
 * AI 프롬프트에 컨텍스트로 주입됨
 */
export async function fetchDataByType(
	type: string,
	params?: Record<string, string>,
	customSource?: CustomDataSource,
): Promise<Record<string, unknown>> {
	switch (type) {
		case "weather": {
			const city = params?.city ?? "서울";
			const data = await fetchWeatherData(city);
			return { weather: data };
		}
		case "earthquake": {
			const data = await fetchEarthquakeData();
			return { earthquakes: data, count: data.length };
		}
		case "wildfire": {
			const data = await fetchWildfireData();
			return { wildfires: data, count: data.length };
		}
		case "public_data": {
			const data = await fetchMockPublicData();
			return { posts: data, count: data.length };
		}
		case "custom_api": {
			if (!customSource) throw new Error("커스텀 소스 설정이 필요합니다.");
			return fetchCustomSource(customSource);
		}
		default:
			return {};
	}
}

// ─── API 테스트 (Data Source 관리 페이지용) ─────────────────────

/** API 테스트 결과 */
export interface DataSourceTestResult {
	status: number;
	latencyMs: number;
	data: unknown;
	error?: string;
	timestamp: string;
}

/**
 * 데이터 소스 API 테스트 — 응답 시간, 상태, 결과를 종합 반환
 * 데이터 소스 관리 페이지의 '테스트' 버튼에서 호출됨
 */
export async function testDataSource(
	type: string,
	params?: Record<string, string>,
): Promise<DataSourceTestResult> {
	const start = performance.now();
	const timestamp = new Date().toISOString();

	try {
		const data = await fetchDataByType(type, params);
		const latencyMs = Math.round(performance.now() - start);
		return { status: 200, latencyMs, data, timestamp };
	} catch (err: unknown) {
		const latencyMs = Math.round(performance.now() - start);
		const message = err instanceof Error ? err.message : "알 수 없는 에러";
		// HTTP 상태코드 추출 시도
		const statusMatch = message.match(/(\d{3})/);
		const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
		return { status, latencyMs, data: null, error: message, timestamp };
	}
}

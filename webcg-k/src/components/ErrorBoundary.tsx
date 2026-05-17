import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "../lib/logger";

const log = createLogger("[ErrorBoundary]");

/**
 * 🛡️ React Error Boundary
 *
 * Why: 방송 중 한 컴포넌트의 런타임 에러가 전체 앱을 크래시시키는 것을 방지.
 * 특히 렌더러에서 오버레이 하나의 에러가 전체 송출을 중단시키면 안 된다.
 *
 * 🎓 비유: 건물의 방화벽처럼, 하나의 방에서 불이 나도 다른 방까지
 *          타들어가지 않게 막는 구조적 방어 장치.
 *
 * 사용법:
 * <ErrorBoundary fallback={<div>오류 발생</div>}>
 *   <OverlayPlayoutLayer />
 * </ErrorBoundary>
 *
 * 또는 onError 콜백으로 에러 로깅:
 * <ErrorBoundary onError={(err) => logToServer(err)}>
 *   <Timeline />
 * </ErrorBoundary>
 */

interface ErrorBoundaryProps {
	children: ReactNode;
	/** 에러 발생 시 표시할 대체 UI */
	fallback?: ReactNode;
	/** 에러 발생 시 호출되는 콜백 — 서버 로깅 등에 활용 */
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	/** 에러 UI에 표시할 컴포넌트 이름 */
	componentName?: string;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// 1. 콘솔에 에러 기록 (개발 모드에서 디버깅용)
		log.error(
			`${this.props.componentName || "Component"} 크래시 발생:`,
			error.message,
			errorInfo.componentStack,
		);

		// 2. 외부 콜백 호출 (서버 로깅, Sentry 등 확장 포인트)
		this.props.onError?.(error, errorInfo);
	}

	// 에러 복구 시도
	private handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// 사용자 제공 fallback이 있으면 그것을 사용
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// 기본 에러 UI — 방송 시스템답게 최소한의 정보만 표시
			return (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						padding: "2rem",
						background: "rgba(239, 68, 68, 0.08)",
						border: "1px solid rgba(239, 68, 68, 0.2)",
						borderRadius: "8px",
						color: "#ef4444",
						fontSize: "0.875rem",
						gap: "0.75rem",
						minHeight: "100px",
					}}
				>
					<div style={{ fontWeight: 600 }}>
						⚠️ {this.props.componentName || "컴포넌트"} 오류
					</div>
					<div style={{ color: "#a3a3a3", fontSize: "0.75rem", maxWidth: "300px", textAlign: "center" }}>
						{this.state.error?.message || "알 수 없는 오류가 발생했습니다."}
					</div>
					<button
						onClick={this.handleRetry}
						type="button"
						style={{
							padding: "0.375rem 1rem",
							background: "rgba(239, 68, 68, 0.15)",
							border: "1px solid rgba(239, 68, 68, 0.3)",
							borderRadius: "6px",
							color: "#ef4444",
							cursor: "pointer",
							fontSize: "0.75rem",
							fontWeight: 500,
						}}
					>
						다시 시도
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}

/**
 * 🎬 렌더러 전용 투명 에러 바운더리
 *
 * OBS 브라우저 소스에서 사용할 때 에러 UI가 보이면 안 되므로,
 * 에러 발생 시 아무것도 렌더링하지 않고 로그만 남긴다.
 */
export class SilentErrorBoundary extends Component<
	{ children: ReactNode; componentName?: string },
	{ hasError: boolean }
> {
	constructor(props: { children: ReactNode; componentName?: string }) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): { hasError: boolean } {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		log.error(
			`[Silent] ${this.props.componentName || "Component"} 크래시:`,
			error.message,
			errorInfo.componentStack,
		);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			// 투명하게 — OBS 송출에 영향 없음
			return null;
		}
		return this.props.children;
	}
}

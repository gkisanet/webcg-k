/**
 * Login Page
 * ID/Password 기반 로그인 및 회원가입
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const [isLogin, setIsLogin] = useState(true);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const { signIn, signUp } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const { error } = isLogin
				? await signIn(email, password)
				: await signUp(email, password);

			if (error) {
				setError(error.message);
			} else {
				navigate({ to: "/dashboard" });
			}
		} catch (err) {
			setError("An unexpected error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				{/* Logo & Title */}
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">WebCG-K</h1>
					<p className="text-secondary">차세대 웹 방송 그래픽 시스템</p>
				</div>

				{/* Login Card */}
				<div
					className="p-8 rounded-xl"
					style={{
						backgroundColor: "var(--app-bg-alt)",
						border: "1px solid var(--border-default)",
					}}
				>
					{/* Tabs */}
					<div
						className="flex mb-6 rounded-lg overflow-hidden"
						style={{ backgroundColor: "var(--app-bg-muted)" }}
					>
						<button
							type="button"
							onClick={() => setIsLogin(true)}
							className={`flex-1 py-2.5 px-4 text-sm font-medium transition-colors ${isLogin ? "text-white" : "text-secondary hover:text-white"
								}`}
							style={{
								backgroundColor: isLogin
									? "var(--accent-primary)"
									: "transparent",
							}}
						>
							<LogIn className="w-4 h-4 inline-block mr-2" />
							로그인
						</button>
						<button
							type="button"
							onClick={() => setIsLogin(false)}
							className={`flex-1 py-2.5 px-4 text-sm font-medium transition-colors ${!isLogin ? "text-white" : "text-secondary hover:text-white"
								}`}
							style={{
								backgroundColor: !isLogin
									? "var(--accent-primary)"
									: "transparent",
							}}
						>
							<UserPlus className="w-4 h-4 inline-block mr-2" />
							회원가입
						</button>
					</div>

					{/* Error Message */}
					{error && (
						<div
							className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm"
							style={{
								backgroundColor: "rgba(239, 68, 68, 0.1)",
								border: "1px solid var(--accent-danger)",
								color: "var(--accent-danger)",
							}}
						>
							<AlertCircle className="w-4 h-4 flex-shrink-0" />
							{error}
						</div>
					)}

					{/* Form */}
					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label
								htmlFor="email"
								className="block text-sm font-medium mb-1.5"
								style={{ color: "var(--text-secondary)" }}
							>
								이메일
							</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="example@email.com"
								required
								className="input"
								style={{
									width: "100%",
									padding: "0.625rem 0.875rem",
									backgroundColor: "var(--app-bg-muted)",
									border: "1px solid var(--border-default)",
									borderRadius: "6px",
									color: "var(--text-primary)",
									fontSize: "0.875rem",
								}}
							/>
						</div>

						<div>
							<label
								htmlFor="password"
								className="block text-sm font-medium mb-1.5"
								style={{ color: "var(--text-secondary)" }}
							>
								비밀번호
							</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								required
								minLength={6}
								className="input"
								style={{
									width: "100%",
									padding: "0.625rem 0.875rem",
									backgroundColor: "var(--app-bg-muted)",
									border: "1px solid var(--border-default)",
									borderRadius: "6px",
									color: "var(--text-primary)",
									fontSize: "0.875rem",
								}}
							/>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
							style={{
								backgroundColor: "var(--accent-primary)",
								color: "var(--app-bg)",
								opacity: loading ? 0.7 : 1,
							}}
						>
							{loading ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									처리 중...
								</>
							) : isLogin ? (
								<>
									<LogIn className="w-4 h-4" />
									로그인
								</>
							) : (
								<>
									<UserPlus className="w-4 h-4" />
									회원가입
								</>
							)}
						</button>
					</form>

					{/* Divider */}
					<div className="my-6 flex items-center gap-3">
						<div
							className="flex-1 h-px"
							style={{ backgroundColor: "var(--border-default)" }}
						/>
						<span className="text-xs" style={{ color: "var(--text-muted)" }}>
							또는
						</span>
						<div
							className="flex-1 h-px"
							style={{ backgroundColor: "var(--border-default)" }}
						/>
					</div>

					{/* Demo Mode */}
					<p
						className="text-center text-sm"
						style={{ color: "var(--text-tertiary)" }}
					>
						테스트 환경에서는 Supabase Docker를 실행해주세요.
						<br />
						<code
							className="px-2 py-0.5 rounded mt-1 inline-block"
							style={{
								backgroundColor: "var(--app-bg-muted)",
								color: "var(--accent-primary)",
							}}
						>
							cd supabase && docker compose up -d
						</code>
					</p>
				</div>
			</div>
		</div>
	);
}

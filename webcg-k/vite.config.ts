import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { fileURLToPath, URL } from "url";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	// lucide-react barrel import 사전 번들링 — 콜드 스타트 200~800ms 절약
	optimizeDeps: {
		include: ["lucide-react"],
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					// ⚡ 에디터 무거운 의존성 패키지를 별도 청크로 추출 격리하여 OBS 렌더러(/render) 성능 보존
					if (id.includes("node_modules")) {
						if (
							id.includes("monaco-editor") || 
							id.includes("@monaco-editor")
						) {
							return "monaco";
						}
						if (id.includes("@dnd-kit")) {
							return "dnd-kit";
						}
						if (id.includes("lucide-react")) {
							return "lucide-icons";
						}
						if (
							id.includes("prosemirror") || 
							id.includes("tiptap")
						) {
							return "rich-editor";
						}
					}
				},
			},
		},
	},
	plugins: [
		nitro(),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig((configEnv) => ({
    plugins: [react()],
    build: {
        outDir: "../dist/web/webview",
        rollupOptions: {
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: `assets/[name].[ext]`,
            },
        },
        emptyOutDir: true,
        minify: configEnv.mode !== "development",
        sourcemap: configEnv.mode === "development"
    }
}));

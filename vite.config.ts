import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const emptyModule = resolve(projectRoot, "src/empty.ts");

export default defineConfig({
    root: projectRoot,
    plugins: [react()],
    base: "./",
    resolve: {
        alias: {
            fs: emptyModule,
            url: emptyModule,
            path: emptyModule,
            crypto: emptyModule,
            module: emptyModule
        }
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: resolve(projectRoot, "index.html")
        }
    },
    server: {
        port: 5173,
        fs: {
            strict: true,
            allow: [projectRoot],
            deny: [
                ".env", ".env.*", "*.{crt,pem}", "**/.git/**",
                // Flattening the app must not expose workspace caches or logs.
                ...[".tmp", ".audio_toolkit", ".standalone-data", ".standalone-logs", "local"].map(folder => `${normalizePath(projectRoot)}${folder}/**`)
            ]
        }
    }
});

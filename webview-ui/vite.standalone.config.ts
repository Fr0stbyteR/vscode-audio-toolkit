import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "./",
    resolve: {
        alias: {
            fs: "./src/empty.ts",
            url: "./src/empty.ts",
            path: "./src/empty.ts",
            crypto: "./src/empty.ts",
            module: "./src/empty.ts"
        }
    },
    build: {
        outDir: "../dist/standalone-web",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: resolve(__dirname, "standalone.html")
        }
    },
    server: {
        port: 5173
    }
});

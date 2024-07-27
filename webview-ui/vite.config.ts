import * as fs from "fs";
import * as path from "path";
import { defineConfig, LibraryOptions } from "vite";
import react from "@vitejs/plugin-react";

const lib: LibraryOptions = {
    entry: {
        "index": "./src/index.tsx"
    },
    formats: ["es"]
};
const modulesJson: Record<string, string> = {};
fs.readdirSync("./src/modules/").forEach((moduleId) => {
    lib.entry[`modules/${moduleId}`] = path.join("./src/modules/", moduleId, "index.ts");
    modulesJson[moduleId] = `./modules/${moduleId}.js`;
});
fs.writeFileSync("public/modules.json", JSON.stringify(modulesJson), "utf-8");

// https://vitejs.dev/config/
export default defineConfig((configEnv) => ({
    plugins: [react()],
    base: '',
    define: { 'process.env': process.env },
    build: {
        lib,
        outDir: "../dist/web/webview",
        rollupOptions: {
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: `assets/[name].[ext]`
            }
        },
        emptyOutDir: true,
        minify: configEnv.mode !== "development",
        sourcemap: configEnv.mode === "development" ? "inline" as const : false
    }
}));

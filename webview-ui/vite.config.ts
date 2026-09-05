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
const modulesJson: string[] = [];
fs.readdirSync("./src/modules/").forEach((dir) => {
    const entry = path.join("./src/modules/", dir, "index.ts");
    if (!fs.existsSync(entry)) return;
    lib.entry[`modules/${dir}`] = entry;
    modulesJson.push(`./modules/${dir}.js`);
});
fs.writeFileSync("public/modules.json", JSON.stringify(modulesJson), "utf-8");

// https://vitejs.dev/config/
export default defineConfig((configEnv) => ({
    plugins: [react()],
    base: "",
    define: { "process.env": process.env },
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

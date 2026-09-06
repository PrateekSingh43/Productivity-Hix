import { defineConfig, type Options } from "tsup";
import * as fs from "node:fs";
import * as path from "node:path";

export default defineConfig((options: Options) => ({
  entry: {
    background: "src/background/main.ts",
    popup: "src/popup/main.tsx",
  },
  clean: true,
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  dts: false,
  noExternal: [
    "@repo/telemetry",
    "@repo/validation",
    "@repo/types",
    "react",
    "react-dom",
    "@tanstack/react-query",
    "lucide-react",
  ],
  async onSuccess() {
    // Copy manifest.json and popup.html into dist/ for unpacked extension loading
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist", { recursive: true });
    }
    if (fs.existsSync("manifest.json")) {
      fs.copyFileSync("manifest.json", path.join("dist", "manifest.json"));
    }
    if (fs.existsSync("popup.html")) {
      fs.copyFileSync("popup.html", path.join("dist", "popup.html"));
    }
    const iconFiles = ["icon.png", "icon-128.png", "icon-48.png", "icon-16.png"];
    for (const icon of iconFiles) {
      if (fs.existsSync(icon)) {
        fs.copyFileSync(icon, path.join("dist", icon));
      }
    }
  },
  ...options,
}));

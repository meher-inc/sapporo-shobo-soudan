import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { Resvg } from "@resvg/resvg-js";
import { SERVICE } from "./src/config/service";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Everything service-specific in the static files comes from src/config/service.ts. */
function serviceFiles(): Plugin {
  const { theme } = SERVICE;
  const icon = readFileSync("src/assets/icon.svg", "utf8").replaceAll("%ACCENT%", theme.accent).replaceAll("%ACCENT2%", theme.accent2);
  const inner = icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // Full-bleed white background with the mark inside the maskable safe zone (and no transparent corners for iOS).
  const padded = (scale: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff"/><g transform="translate(${(64 - 64 * scale) / 2} ${(64 - 64 * scale) / 2}) scale(${scale})">${inner}</g></svg>`;
  const png = (svg: string, size: number) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  const manifest = {
    name: SERVICE.name,
    short_name: SERVICE.shortName,
    description: SERVICE.description,
    lang: "ja",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  const files: Record<string, string | Uint8Array> = {
    "icon.svg": icon,
    "icon-192.png": png(icon, 192),
    "icon-512.png": png(icon, 512),
    "icon-maskable-512.png": png(padded(0.72), 512),
    "apple-touch-icon.png": png(padded(0.86), 180),
    "manifest.webmanifest": JSON.stringify(manifest, null, 2),
    "offline.html": readFileSync("src/assets/offline.html", "utf8").replaceAll("%NAME%", esc(SERVICE.name)),
  };
  return {
    name: "service-files",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const vars = `:root{--accent:${theme.accent};--accent-2:${theme.accent2};--amb-1:${theme.ambient[0]};--amb-2:${theme.ambient[1]};--amb-3:${theme.ambient[2]}}`;
        return html
        .replaceAll("%TITLE%", esc(SERVICE.title))
        .replaceAll("%DESCRIPTION%", esc(SERVICE.description))
        .replaceAll("%SHORT_NAME%", esc(SERVICE.shortName))
        .replace("<!--THEME-->", `<style>${vars}</style>`);
      },
    },
    // Dev server (vite dev is not used by wrangler dev, but keeps `vite preview` complete).
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[(req.url ?? "").split("?")[0].slice(1)];
        if (!file) return next();
        res.end(file);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source });
    },
  };
}

export default defineConfig({
  plugins: [preact(), serviceFiles()],
  build: {
    outDir: "dist",
    target: "es2022",
    cssMinify: true,
  },
});

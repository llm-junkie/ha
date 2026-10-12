import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { APP_VERSION } from "../app/version.ts";

const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

export const pwaManifest = (base: string) => ({
  id: base,
  name: "Human Atlas +",
  short_name: "Human Atlas +",
  description: "Explore human anatomy in 3D, online or offline.",
  lang: "en",
  start_url: base,
  scope: base,
  display: "standalone",
  background_color: "#f3f4f4",
  theme_color: "#f3f4f4",
  icons: [
    { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: `${base}icons/icon-maskable-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
});

export function atlasPwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "human-atlas-pwa",
    enforce: "post",
    configResolved(value) {
      config = value;
    },
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { name: "application-version", content: APP_VERSION },
          injectTo: "head",
        },
      ];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== `${config.base}manifest.webmanifest`) return next();
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(JSON.stringify(pwaManifest(config.base)));
      });
    },
    async writeBundle(_options, bundle) {
      const base = config.base;
      if (!base.startsWith("/") || !base.endsWith("/") || base.includes("//"))
        throw new Error("The PWA needs an absolute base path ending in /, such as /ha/.");
      const output = resolve(config.root, config.build.outDir);
      const manifest = pwaManifest(base);
      await writeFile(resolve(output, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));
      // Hash every model representation, including servers that decode a .gz response.
      const chunks = [];
      const catalogues = [];
      for (const filename of ["atlas.json", "atlas-female.json"]) {
        const catalogue = await readFile(resolve(config.publicDir, `models/${filename}`));
        catalogues.push({ url: `${base}models/${filename}`, hashes: [digest(catalogue)] });
        const atlas = JSON.parse(catalogue.toString()) as {
          chunks: { url: string; gzip?: string }[];
        };
        for (const chunk of atlas.chunks) {
          const rawHash = digest(await readFile(resolve(config.publicDir, chunk.url.slice(1))));
          const raw = { url: `${base}${chunk.url.slice(1)}`, hashes: [rawHash] };
          const gzip = chunk.gzip
            ? {
                url: `${base}${chunk.gzip.slice(1)}`,
                hashes: [
                  digest(await readFile(resolve(config.publicDir, chunk.gzip.slice(1)))),
                  rawHash,
                ],
              }
            : null;
          chunks.push({ raw, gzip });
        }
      }
      const modelVersion = digest(JSON.stringify({ catalogues, chunks })).slice(0, 16);
      const files = [
        ...new Set([
          ...Object.keys(bundle),
          "favicon.svg",
          "manifest.webmanifest",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/icon-maskable-512.png",
          "icons/apple-touch-icon.png",
          "ATTRIBUTION.md",
        ]),
      ]
        .filter((file) => !file.endsWith(".map"))
        .sort();
      const shell = [];
      for (const file of files)
        shell.push({
          url: `${base}${file}`,
          hashes: [digest(await readFile(resolve(output, file)))],
        });
      const source = await readFile(resolve(config.root, "../app/service-worker.js"), "utf8");
      const appVersion = digest(JSON.stringify(shell) + modelVersion + source).slice(0, 16);
      const settings = {
        base,
        releaseVersion: APP_VERSION,
        appVersion,
        modelVersion,
        shell,
        catalogue: catalogues[0],
        catalogues,
        chunks,
      };
      await writeFile(
        resolve(output, "sw.js"),
        `const CONFIG = ${JSON.stringify(settings)};\n${source}`,
      );
    },
  };
}

import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/**
 * Serve `runtime/` em `/runtime/` (dev) e copia para `dist/runtime/` (build), sem `test/`.
 * A prévia (src/previa) carrega o motor real daqui; o pacote exportado usa a mesma pasta.
 */
function runtimePlugin(): Plugin {
  const raiz = fileURLToPath(new URL("./runtime", import.meta.url));
  const TIPOS: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  };
  const excluido = (rel: string) => rel === "test" || rel.startsWith("test" + sep) || rel.startsWith("test/");
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const abs = join(dir, nome);
      if (nome.startsWith(".")) return [];
      if (excluido(relative(raiz, abs))) return [];
      return statSync(abs).isDirectory() ? arquivos(abs) : [abs];
    });
  }
  return {
    name: "cev-runtime",
    configureServer(server) {
      server.middlewares.use("/runtime", (req, res, next) => {
        // Com query (?raw, ?import…) é import de módulo do próprio app: deixa para o Vite.
        if ((req.url ?? "").includes("?")) return next();
        const caminho = decodeURIComponent(req.url ?? "/");
        const abs = resolve(raiz, "." + caminho);
        const rel = relative(raiz, abs);
        if (abs.startsWith(raiz + sep) && excluido(rel)) {
          res.statusCode = 404;
          return res.end();
        }
        if (!abs.startsWith(raiz + sep) || !existsSync(abs) || !statSync(abs).isFile()) return next();
        res.setHeader("Content-Type", TIPOS[extname(abs)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(abs));
      });
    },
    generateBundle() {
      for (const abs of arquivos(raiz)) {
        const fileName = "runtime/" + relative(raiz, abs).split(sep).join("/");
        this.emitFile({ type: "asset", fileName, source: readFileSync(abs) });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), runtimePlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**", "**/.claude/**"],
    },
  },
  // Worktrees de agentes (.claude/worktrees) têm cópias antigas dos testes.
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
}));

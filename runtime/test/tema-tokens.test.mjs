// Guarda dos tokens do tema (M13): todo valor de aparência do tema.css fica em :root.
// Roda no `npm test` (vitest). Não vai para o pacote (a pasta test/ é excluída).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../css/tema.css"), "utf8");
const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const ini = semComentarios.indexOf(":root {");
const fim = semComentarios.indexOf("}", ini) + 1;
const ROOT = semComentarios.slice(ini, fim);
const FORA = semComentarios.slice(0, ini) + semComentarios.slice(fim);

// Tema CEV aprovado: o modelo Tema do editor (derivarTokens) parte destes valores.
const TOKENS_CEV = {
  "--navy": "#1b1f4b", "--navy-2": "#12163a", "--navy-3": "#2c3280", "--navy-tinta": "#eceefa", "--navy-tinta-hover": "#dfe2f6",
  "--verde": "#19653e", "--verde-tinta": "#e3f1e9", "--verde-tinta-hover": "#cfe6d9",
  "--vermelho": "#a91d22", "--vermelho-tinta": "#fbe9ea",
  "--amarelo": "#fcb913", "--amarelo-tinta": "#fff6dc", "--amarelo-tinta-hover": "#ffefb8", "--amarelo-texto": "#6b4a00",
  "--tinta": "#231f20", "--tinta-suave": "#5b5d73", "--linha": "#dcdde8", "--fundo": "#f6f6fa", "--branco": "#ffffff",
  "--sobre-cor": "#fff", "--campo-travado": "#f2f2f7",
  "--barra-trilho": "rgba(255,255,255,.22)", "--veu": "rgba(18,22,58,.55)", "--foco-halo": "rgba(27,31,75,.35)",
  "--sombra": "0 6px 18px rgba(27,31,75,.18)", "--sombra-forte": "0 6px 18px rgba(27,31,75,.22)",
  "--fonte-texto": '"Poppins", Montserrat, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  "--fonte-titulos": '"Krona One", "Poppins", Montserrat, sans-serif',
  "--titulos": "var(--fonte-titulos)",
  "--peso-titulos": "400", "--texto-base": "16px",
  "--raio": "10px", "--raio-controle": "8px", "--raio-pilula": "99px",
  "--raio-modal": "14px", "--raio-aviso": "6px", "--raio-aba": "4px",
  "--alvo": "44px",
};

function tokens() {
  const m = {};
  for (const [, nome, valor] of ROOT.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m[nome] = valor.trim();
  return m;
}

describe("runtime/css/tema.css", () => {
  it(":root tem exatamente os tokens do tema CEV", () => {
    expect(tokens()).toEqual(TOKENS_CEV);
  });

  it("nenhuma cor fixa fora do :root", () => {
    // O SVG da alça do .drag-card usa %23 (url-encoded), não '#', e fica fora desta regra (ver ORIGEM.md).
    expect(FORA.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(FORA.match(/\b(rgba?|hsla?)\(/g)).toBeNull();
  });

  it("cantos, fontes, sombras e peso dos títulos vêm de tokens", () => {
    const radius = [...FORA.matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const r of radius) expect(r, r).toMatch(/^(var\(--raio[a-z-]*\)( var\(--raio[a-z-]*\)| 0)*|50%)$/);
    const familias = [...FORA.replace(/@font-face\s*\{[^}]*\}/g, "").matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const f of familias) expect(f, f).toMatch(/^var\(--fonte-(texto|titulos)\)$/);
    const sombras = [...FORA.matchAll(/box-shadow:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const s of sombras) expect(s, s).not.toMatch(/\d+px \d+px \d+px [^v]/);
  });

  it("sem CSS moderno que o Moodle antigo não entenda", () => {
    expect(CSS).not.toMatch(/color-mix\(|light-dark\(|oklch\(|@layer|@property/);
    // var() sem fallback
    expect(CSS.match(/var\(--[a-z0-9-]+\s*,/g)).toBeNull();
  });
});

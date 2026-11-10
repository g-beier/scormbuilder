// Descartável (não vai para o pacote): testa Motor.imprimir (M7) com as fixtures do M6 e,
// se existirem, com os 18 LEITURA2 convertidos por montar.mjs. Gera um PDF A4 de cada um
// (page.pdf) e confere: cabeçalho vindo da capa, campos Nome/Data, sem tela de fim, sem
// controles interativos, versões para preencher dos blocos dinâmicos, sem gabarito.
// Uso: node runtime/test/impressao.mjs <saida> [<pasta do montar.mjs>]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const SAIDA = process.argv[2] && path.resolve(process.argv[2], "impressao");
const M0 = process.argv[3] && (fs.existsSync(path.resolve(process.argv[3], "v2")) ? path.resolve(process.argv[3], "v2") : path.resolve(process.argv[3]));
if (!SAIDA) { console.error("uso: node impressao.mjs <saida> [<pasta do montar.mjs>]"); process.exit(1); }

fs.rmSync(SAIDA, { recursive: true, force: true });
for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(SAIDA, d), { recursive: true });
const PAGINA = (dataJs) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="css/tema.css"></head><body><div id="doc"></div>
<script src="js/motor.js"></script><script src="${dataJs}"></script>
<script>window.OK = Motor.imprimir(window.CONTEUDO, document.getElementById("doc"));</script></body></html>`;

const casos = [];
for (const f of ["kit-v2", "categorizar-v2", "ramificado-v2"]) {
  fs.copyFileSync(path.join(AQUI, "fixtures", f + ".data.js"), path.join(SAIDA, "js", f + ".js"));
  fs.writeFileSync(path.join(SAIDA, f + ".html"), PAGINA("js/" + f + ".js"));
  casos.push(f);
}
if (M0 && fs.existsSync(M0)) {
  for (const d of fs.readdirSync(M0).filter((x) => x.endsWith("_LEITURA2")).sort()) {
    const dj = path.join(M0, d, "js", "data.js");
    if (!fs.existsSync(dj)) continue;
    fs.copyFileSync(dj, path.join(SAIDA, "js", d + ".js"));
    fs.writeFileSync(path.join(SAIDA, d + ".html"), PAGINA("js/" + d + ".js"));
    casos.push(d);
  }
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2" };
const srv = http.createServer((req, res) => {
  const p = path.join(SAIDA, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(SAIDA) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + srv.address().port;

const browser = await chromium.launch();
const falhas = [];
let nChecks = 0;
const ok = (c, m) => { nChecks++; if (!c) { falhas.push(m); console.log("  FALHA:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

for (const caso of casos) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto(`${BASE}/${caso}.html`);
  await page.waitForFunction(() => document.fonts.status === "loaded");
  const r = await page.evaluate(() => {
    const C = window.CONTEUDO;
    const doc = document.querySelector(".imp-doc");
    const capa = C.slides.find((s) => s.tipo === "capa");
    const conteudo = C.slides.filter((s) => s.tipo === "conteudo");
    const fim = C.slides.find((s) => s.tipo === "fim");
    const txt = doc ? doc.textContent : "";
    return {
      ok: window.OK,
      h1: doc && doc.querySelector(".imp-cab h1") ? doc.querySelector(".imp-cab h1").textContent : null,
      capaTit: capa ? (() => { const d = document.createElement("div"); d.innerHTML = capa.titulo; return d.textContent; })() : null,
      campos: [...document.querySelectorAll(".imp-registro p")].map((p) => p.firstChild.textContent),
      telas: document.querySelectorAll(".imp-tela:not(.imp-anexo)").length,
      conteudo: conteudo.length,
      fimNoDoc: fim ? txt.includes((() => { const d = document.createElement("div"); d.innerHTML = fim.texto; return d.textContent.trim(); })()) : false,
      interativos: document.querySelectorAll(".imp-doc button, .imp-doc input, .imp-doc textarea, .imp-doc select, .imp-doc details").length,
      semVersao: [...document.querySelectorAll(".imp-doc .nota")].filter((n) => /sem versão para impressão|não pôde ser impresso/.test(n.textContent)).length,
      caixas: document.querySelectorAll(".imp-caixa").length,
      numerar: document.querySelectorAll(".imp-num").length,
      linhas: document.querySelectorAll(".imp-linhas div").length,
      tabelas: document.querySelectorAll(".imp-tabela").length,
      destinos: [...document.querySelectorAll(".imp-destino")].map((e) => e.textContent),
      confira: document.querySelectorAll(".imp-confira").length,
      conferirRefs: document.querySelectorAll(".imp-confira-ref").length,
      conferirNoAnexo: document.querySelectorAll(".imp-anexo .imp-confira").length,
      confiraFonte: conteudo.reduce((n, s) => n + (s.blocos || []).filter((b) => b.tipo === "confira").length, 0),
      // gabarito não pode vazar: explicações do quiz, retornos, comentários e "porquê"
      vazou: (() => {
        const segredos = [];
        conteudo.forEach((s) => (s.blocos || []).forEach((b) => {
          if (b.tipo === "quiz") (b.perguntas || []).forEach((q) => q.explica && segredos.push(q.explica));
          if (b.tipo === "multipla") (b.opcoes || []).forEach((o) => o.fb && segredos.push(o.fb));
          if (b.tipo === "escolha") (b.opcoes || []).forEach((o) => o.retorno && segredos.push(o.retorno));
          if (b.tipo === "categorizar") (b.itens || []).forEach((o) => o.fb && segredos.push(o.fb));
          if (b.tipo === "ramificado") (b.perguntas || []).forEach((p) => (p.alternativas || []).forEach((a) => a.retorno && segredos.push(a.retorno)));
        }));
        return segredos.filter((t) => t.length > 8 && txt.includes(t));
      })(),
      hs: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  ok(r.ok === true, `${caso}: Motor.imprimir devolveu true`);
  if (r.capaTit) eq(r.h1, r.capaTit, `${caso}: cabeçalho = título da capa`);
  eq(r.campos, ["Nome:", "Data:"], `${caso}: campos de registro`);
  eq(r.telas, r.conteudo, `${caso}: uma seção por tela de conteúdo`);
  ok(!r.fimNoDoc, `${caso}: tela de fim fora do PDF`);
  eq(r.interativos, 0, `${caso}: sem controles interativos`);
  eq(r.semVersao, 0, `${caso}: todo bloco tem versão para impressão`);
  eq(r.vazou, [], `${caso}: sem gabarito/retornos`);
  ok(!r.hs, `${caso}: sem rolagem horizontal`);
  eq([r.conferirRefs, r.conferirNoAnexo], [r.confiraFonte, r.confiraFonte], `${caso}: Confira no anexo, com referência na tela`);
  if (caso === "kit-v2") {
    eq(r.caixas, 3 + 2 + 3, `${caso}: caixas (múltipla 3 + 2, escolha 3)`);
    ok(r.linhas >= 4, `${caso}: linhas para a reflexão`);
    ok(await page.$eval(".aviso-refl", (e) => /Não escreva nomes/.test(e.textContent)), `${caso}: cuidado com dados na reflexão`);
  }
  if (caso === "categorizar-v2") {
    eq(r.tabelas, 2, `${caso}: uma tabela por bloco`);
    eq(r.caixas, 4 * 2 + 5 * 3, `${caso}: caixas = itens × categorias`);
  }
  if (caso === "ramificado-v2") {
    eq(r.destinos, ["→ vá para a pergunta 3", "→ vá para a pergunta 2", "→ vá para a pergunta 3", "→ vá para a pergunta 4",
      "→ vá para a pergunta 4", "→ vá para a pergunta 4", "→ fim do questionário", "→ fim do questionário"], `${caso}: roteiro de destinos`);
  }
  if (caso.endsWith("_LEITURA2")) ok(r.numerar > 0 || r.confira > 0 || r.caixas > 0, `${caso}: blocos dinâmicos impressos`);
  const pdf = await page.pdf({ format: "A4", printBackground: true, path: path.join(SAIDA, caso + ".pdf") });
  const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(paginas >= 1, `${caso}: PDF gerado`);
  console.log(`  ${caso}: ${r.telas} telas, ${paginas} página(s), ${Math.round(pdf.length / 1024)} KB`);
  ok(erros.length === 0, `${caso}: sem erros de console ${erros.join(" | ")}`);
  await page.close();
}

await browser.close();
srv.close();
console.log(`\n${nChecks} verificações (PDFs em ${SAIDA})`);
console.log(falhas.length ? `${falhas.length} FALHA(S)` : "TUDO OK");
process.exit(falhas.length ? 1 : 0);

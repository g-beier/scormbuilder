// Descartável (não vai para o pacote): testa o bloco "imagem" (M9) com a fixture
// fixtures/imagem-v2.data.js (+ fixtures/img/), em 1200x666 e 375x666: render, alt, decorativa,
// legenda, imagem que não carrega, endereços recusados, sem rolagem horizontal, cabe na altura
// do iframe do Moodle e não bloqueia o "Próximo" nem a conclusão.
// O pacote roda num iframe de 666px dentro de uma página "Moodle" com uma API SCORM 1.2 simulada.
// Uso: node runtime/test/imagem.mjs <saida>      (ex.: "$TMPDIR"cev-m9)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const SAIDA = process.argv[2] && path.resolve(process.argv[2], "imagem");
if (!SAIDA) { console.error("uso: node imagem.mjs <saida>"); process.exit(1); }

// ---------- monta o pacote de teste ----------
const PKG = path.join(SAIDA, "pkg");
fs.rmSync(SAIDA, { recursive: true, force: true });
for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(PKG, d), { recursive: true });
fs.cpSync(path.join(AQUI, "fixtures/img"), path.join(PKG, "img"), { recursive: true });
fs.copyFileSync(path.join(AQUI, "fixtures/imagem-v2.data.js"), path.join(PKG, "js/data.js"));
const idx = fs.readFileSync(path.join(RUNTIME, "index.html"), "utf8").split("{{TITULO}}").join("Imagens");
fs.writeFileSync(path.join(PKG, "index.html"), idx);
fs.writeFileSync(path.join(SAIDA, "moodle.html"), `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>html,body{margin:0}iframe{display:block;width:100%;height:666px;border:0}</style>
<script>
var d = window.__lms = {};
window.API = {
  LMSInitialize: function () { return "true"; }, LMSFinish: function () { return "true"; }, LMSCommit: function () { return "true"; },
  LMSGetValue: function (k) { return d[k] == null ? "" : d[k]; },
  LMSSetValue: function (k, v) { d[k] = String(v); return "true"; },
  LMSGetLastError: function () { return "0"; }, LMSGetErrorString: function () { return ""; }, LMSGetDiagnostic: function () { return ""; }
};
</script></head><body><iframe id="f" title="Pacote" src="pkg/index.html"></iframe></body></html>`);

// ---------- servidor estático ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };
const pedidos = [];
const srv = http.createServer((req, res) => {
  pedidos.push(req.url);
  const p = path.join(SAIDA, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(SAIDA) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + srv.address().port;

const browser = await chromium.launch();
const falhas = [];
const erros = [];
let nChecks = 0;
const ok = (cond, msg) => { nChecks++; if (!cond) { falhas.push(msg); console.log("  FALHA:", msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

async function novaPagina(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    // os 404 das imagens ausentes de propósito são esperados
    if (m.type() === "error" && !/404/.test(m.text())) erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(String(e)));
  return { ctx, page };
}
const quadro = (page) => page.frames().find((f) => /pkg\/index\.html/.test(f.url()));
async function pronto(f) {
  await f.waitForFunction(() => document.querySelector(".slide.active") && document.fonts.status === "loaded");
  await f.waitForTimeout(50);
}
const lms = (page) => page.evaluate(() => ({ ...window.__lms }));
const counter = (f) => f.$eval("#counter", (e) => e.textContent);
const nextDis = (f) => f.$eval("#next", (b) => b.disabled);
const aviso = (f) => f.evaluate(() => { const a = document.querySelector(".slide.active .quiz-aviso"); return a && !a.hidden ? a.textContent : ""; });
const A = ".slide.active ";
// Espera as imagens visíveis terminarem (carregadas ou com erro)
const imagensProntas = (f) => f.waitForFunction(() => [...document.querySelectorAll(".slide.active .figura img")].every((i) => i.complete));
// Sem rolagem horizontal e uma só barra (só o #stage rola)
const layout = (f) => f.evaluate(() => {
  const s = document.getElementById("stage"), de = document.documentElement;
  return {
    hs: s.scrollWidth > s.clientWidth || de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth,
    pg: de.scrollHeight > de.clientHeight + 1,
    rola: s.scrollHeight > s.clientHeight + 1, alt: s.scrollHeight, area: s.clientHeight,
  };
});
const figs = (f) => f.$$eval(A + ".figura", (l) => l.map((fig) => {
  const img = fig.querySelector("img");
  const cap = fig.querySelector("figcaption");
  const fal = fig.querySelector(".img-falha");
  const r = img.getBoundingClientRect();
  return {
    alt: img.getAttribute("alt"), role: img.getAttribute("role"), loading: img.getAttribute("loading"),
    src: img.getAttribute("src"), carregou: img.complete && img.naturalWidth > 0, imgVisivel: !img.hidden && r.height > 0,
    figHidden: fig.hidden, figAria: fig.getAttribute("aria-hidden"),
    capHtml: cap ? cap.innerHTML : null, falha: fal ? fal.textContent : null,
    w: Math.round(r.width), h: Math.round(r.height), raio: getComputedStyle(img).borderRadius,
  };
}));

for (const vp of [{ width: 1200, height: 666 }, { width: 375, height: 666 }]) {
  console.log(`== ${vp.width}x${vp.height} ==`);
  const W = vp.width;
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`${BASE}/moodle.html`);
  const f = quadro(page);
  await pronto(f);
  // carregamento preguiçoso: a imagem da tela 2 (escondida) não foi pedida ainda
  if (W === 1200) ok(!pedidos.some((u) => /\.png/.test(u)), `${W} loading=lazy não pede imagem de tela escondida`);

  // ---- tela 2: paisagem com alt e legenda ----
  await f.click("#next");
  eq(await counter(f), "02 / 07", `${W} tela 2`);
  await imagensProntas(f);
  let fs2 = await figs(f);
  eq(fs2.length, 1, `${W} uma figura`);
  const p = fs2[0];
  eq(p.alt, "Gráfico \"A\" & <b>faixas</b> do tema", `${W} alt literal (atributo, sem HTML)`);
  eq(p.role, null, `${W} imagem informativa sem role`);
  eq(p.loading, "lazy", `${W} loading=lazy`);
  ok(p.carregou && p.imgVisivel, `${W} paisagem carregou`);
  eq(p.capHtml, "Faixas do <strong>tema</strong> &amp; rodapé.", `${W} legenda como HTML`);
  eq(p.falha, null, `${W} sem caixa de erro`);
  eq(p.raio, "10px", `${W} cantos com var(--raio)`);
  eq(await f.$eval(A + ".figura figcaption", (c) => c.textContent), "Faixas do tema & rodapé.", `${W} texto da legenda`);
  ok(!(await nextDis(f)), `${W} imagem não bloqueia o Próximo`);
  eq(await aviso(f), "", `${W} sem aviso`);
  let lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} tela 2 sem rolagem horizontal/dupla (${JSON.stringify(lay)})`);
  ok(!lay.rola, `${W} tela 2 (kicker + título + imagem + legenda) cabe sem rolar (${lay.alt}px em ${lay.area}px)`);
  ok(p.w <= W && p.h <= 267, `${W} paisagem limitada (${p.w}x${p.h})`);
  console.log(`  paisagem ${p.w}x${p.h}; conteúdo ${lay.alt}px em ${lay.area}px`);

  // ---- tela 3: retrato decorativo ----
  await f.click("#next");
  await imagensProntas(f);
  fs2 = await figs(f);
  const r = fs2[0];
  eq(r.alt, "", `${W} decorativa com alt vazio`);
  eq(r.role, "presentation", `${W} decorativa com role=presentation`);
  eq(r.figAria, "true", `${W} figura decorativa sem legenda fora da árvore de acessibilidade`);
  ok(r.carregou && r.h <= 267 && r.h >= 260, `${W} retrato limitado pela altura (${r.w}x${r.h})`);
  lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} tela 3 sem rolagem horizontal/dupla`);
  ok(!lay.rola, `${W} tela 3 (retrato + texto) cabe sem rolar (${lay.alt}px em ${lay.area}px)`);
  console.log(`  retrato ${r.w}x${r.h}; conteúdo ${lay.alt}px em ${lay.area}px`);

  // ---- tela 4: imagens que não carregam ----
  await f.click("#next");
  await imagensProntas(f);
  await f.waitForTimeout(100);
  fs2 = await figs(f);
  eq(fs2.map((x) => [x.imgVisivel, x.falha, x.figHidden]), [
    [false, "Imagem não carregada: Mapa da região", false],
    [false, null, true],
    [false, null, false],
  ], `${W} erro de carga`);
  eq(fs2[2].capHtml, "Legenda que fica.", `${W} decorativa quebrada mantém a legenda`);
  lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} tela 4 sem rolagem horizontal/dupla`);
  ok(!(await nextDis(f)), `${W} erro de carga não bloqueia`);

  // ---- tela 5: endereços ----
  await f.click("#next");
  await imagensProntas(f);
  fs2 = await figs(f);
  eq(fs2.length, 1, `${W} só a imagem data:image/png é aceita`);
  ok(fs2[0].carregou && /^data:image\/png;base64,/.test(fs2[0].src), `${W} data:image/png carregou`);
  eq(await f.$$eval(A + "p.nota[role=note]", (l) => l.map((n) => n.textContent)),
    Array(7).fill("[Imagem não exibida: o arquivo precisa estar na pasta img/ do pacote.]"), `${W} endereços recusados`);
  ok(!pedidos.some((u) => /\/sub\/|\/a\.png/.test(u)), `${W} nenhum endereço recusado foi pedido`);
  lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} tela 5 sem rolagem horizontal/dupla`);

  // ---- tela 6: imagem + quiz: só o quiz bloqueia ----
  await f.click("#next");
  ok(await nextDis(f), `${W} quiz bloqueia`);
  eq(await aviso(f), "Responda todas as perguntas para avançar.", `${W} aviso só do quiz`);
  await f.click(A + ".quiz-opc");
  ok(!(await nextDis(f)), `${W} quiz respondido libera`);
  const sd = JSON.parse((await lms(page))["cmi.suspend_data"]);
  eq(Object.keys(sd.b), ["5.1"], `${W} imagem sem estado no suspend_data`);
  await f.click("#next");
  eq(await counter(f), "07 / 07", `${W} fim`);
  eq((await lms(page))["cmi.core.lesson_status"], "completed", `${W} concluído sem interação com imagens`);
  await ctx.close();
}

console.log("== Erros de console ==");
console.log(`  ${erros.length}`);
erros.slice(0, 10).forEach((e) => console.log("   ", e));
ok(erros.length === 0, "erros de console");

await browser.close();
srv.close();
console.log(`\n${nChecks} verificações`);
console.log(falhas.length ? `${falhas.length} FALHA(S)` : "TUDO OK");
process.exit(falhas.length ? 1 : 0);

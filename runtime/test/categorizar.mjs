// Descartável (não vai para o pacote): testa o bloco "categorizar" (M6) com a fixture
// fixtures/categorizar-v2.data.js, em 1200x666 e 375x666: clique+clique, teclado, arrastar,
// verificação, suspend_data, retomada e conclusão.
// O pacote roda num iframe de 666px dentro de uma página "Moodle" com uma API SCORM 1.2 simulada
// (window.API no pai), para inspecionar cmi.interactions, suspend_data e lesson_status.
// Uso: node runtime/test/categorizar.mjs <saida>      (ex.: "$TMPDIR"cev-m6)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const SAIDA = process.argv[2] && path.resolve(process.argv[2], "categ");
if (!SAIDA) { console.error("uso: node categorizar.mjs <saida>"); process.exit(1); }

// ---------- monta o pacote de teste ----------
const PKG = path.join(SAIDA, "pkg");
fs.rmSync(SAIDA, { recursive: true, force: true });
for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(PKG, d), { recursive: true });
fs.copyFileSync(path.join(AQUI, "fixtures/categorizar-v2.data.js"), path.join(PKG, "js/data.js"));
const idx = fs.readFileSync(path.join(RUNTIME, "index.html"), "utf8").split("{{TITULO}}").join("Classificar");
fs.writeFileSync(path.join(PKG, "index.html"), idx);
// "Moodle": API SCORM 1.2 no pai; ?falha=1 faz as gravações de interação falharem
fs.writeFileSync(path.join(SAIDA, "moodle.html"), `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>html,body{margin:0}iframe{display:block;width:100%;height:666px;border:0}</style>
<script>
var d = window.__lms = {};
var falha = /falha=1/.test(location.search);
function conta() { var m = -1; for (var k in d) { var r = /^cmi\\.interactions\\.(\\d+)\\./.exec(k); if (r) m = Math.max(m, +r[1]); } return m + 1; }
window.API = {
  LMSInitialize: function () { return "true"; }, LMSFinish: function () { return "true"; }, LMSCommit: function () { return "true"; },
  LMSGetValue: function (k) { if (k === "cmi.interactions._count") return String(conta()); return d[k] == null ? "" : d[k]; },
  LMSSetValue: function (k, v) { if (falha && /^cmi\\.interactions\\./.test(k)) return "false"; d[k] = String(v); return "true"; },
  LMSGetLastError: function () { return "0"; }, LMSGetErrorString: function () { return ""; }, LMSGetDiagnostic: function () { return ""; }
};
</script></head><body><iframe id="f" title="Pacote" src="pkg/index.html"></iframe></body></html>`);

// ---------- servidor estático ----------
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
const erros = [];
let nChecks = 0;
const ok = (cond, msg) => { nChecks++; if (!cond) { falhas.push(msg); console.log("  FALHA:", msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

async function novaPagina(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
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
const resultado = (f, sel) => f.$eval(sel, (box) => { const r = box.querySelector(".quiz-resultado .resultado"); return r ? r.className + "|" + r.textContent : ""; });
// Sem rolagem horizontal e uma só barra (só o #stage rola)
const layout = (f) => f.evaluate(() => {
  const s = document.getElementById("stage"), de = document.documentElement;
  return { hs: s.scrollWidth > s.clientWidth || de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth, pg: de.scrollHeight > de.clientHeight + 1 };
});
// Onde está cada item: -1 = bandeja; marcas e retorno
const estadoCat = (f) => f.$eval(A + ".bloco-q.categorizar", (box) => {
  const zonas = [...box.querySelectorAll(".cat-zona")];
  return [...box.querySelectorAll(".cat-item")].sort((a, b) => a.dataset.item - b.dataset.item).map((bt) => {
    const z = bt.closest(".cat-zona");
    const fb = bt.parentNode.querySelector(".fb");
    return { c: z ? zonas.indexOf(z) : -1, cls: ["ok", "erro"].filter((c) => bt.classList.contains(c)).join(""), fb: fb.hidden ? null : fb.textContent, dis: bt.getAttribute("aria-disabled") === "true" };
  });
});
const ondeEsta = async (f) => (await estadoCat(f)).map((x) => x.c);
const item = (i) => A + `.cat-item[data-item="${i}"]`;
const alvo = (c) => A + `.cat-zona:nth-child(${c + 1}) .cat-alvo`;
const status = async (f) => { await f.waitForTimeout(120); return f.$eval(A + ".bloco-q.categorizar .sr-only", (e) => e.textContent); };
const focado = (f) => f.evaluate(() => { const a = document.activeElement; return a.dataset.item != null ? "item" + a.dataset.item : a.className; });
// Arrasta com o mouse; se o destino estiver fora da área visível, segura o item na borda
// até a rolagem automática trazê-lo para a tela (como faria um usuário no celular)
async function arrastar(page, f, de, para) {
  const fr = await (await page.$("#f")).boundingBox();
  await f.$eval(de, (e) => e.scrollIntoView({ block: "center" }));
  const a = await (await f.$(de)).boundingBox();
  const x0 = fr.x + a.x + a.width / 2, y0 = fr.y + a.y + a.height / 2;
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x0 + 10, y0 + 10, { steps: 2 });
  const st = await f.$eval("#stage", (s) => { const r = s.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  let rolou = false;
  for (let t = 0; t < 60; t++) {
    const b = await (await f.$(para)).boundingBox();
    const cy = b.y + Math.min(b.height / 2, 20);
    if (cy > st.top + 60 && cy < st.bottom - 60) {
      await page.mouse.move(fr.x + b.x + b.width / 2, fr.y + cy, { steps: 8 });
      break;
    }
    rolou = true;
    await page.mouse.move(x0, fr.y + (cy > st.bottom - 60 ? st.bottom - 10 : st.top + 10), { steps: 2 });
    await page.waitForTimeout(80);
  }
  await page.mouse.up();
  return rolou;
}

for (const vp of [{ width: 1200, height: 666 }, { width: 375, height: 666 }]) {
  console.log(`== ${vp.width}x${vp.height} ==`);
  const W = vp.width;
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`${BASE}/moodle.html`);
  let f = quadro(page);
  await pronto(f);
  await f.click("#next");
  eq(await counter(f), "02 / 04", `${W} tela 2`);
  ok(await nextDis(f), `${W} bloqueada`);
  eq(await aviso(f), "Classifique os itens e verifique para avançar.", `${W} aviso`);
  eq(await ondeEsta(f), [-1, -1, -1, -1], `${W} tudo na bandeja`);
  eq(await f.$$eval(A + ".cat-alvo", (l) => l.map((b) => b.disabled)), [true, true], `${W} categorias inativas sem seleção`);

  // verificar com itens na bandeja
  await f.click(A + ".bloco-q .btn-act:not(.sec)");
  eq(await resultado(f, A + ".bloco-q"), "resultado parcial|Faltam 4 itens para colocar numa categoria antes de verificar.", `${W} faltam itens`);

  // clique + clique
  await f.click(item(0));
  eq(await f.$eval(item(0), (b) => b.getAttribute("aria-pressed")), "true", `${W} item selecionado`);
  eq(await status(f), "“Acolher e ouvir sem julgar” selecionado. Escolha a categoria.", `${W} anúncio da seleção`);
  await f.click(alvo(0));
  eq(await ondeEsta(f), [0, -1, -1, -1], `${W} clique+clique`);
  eq(await status(f), "“Acolher e ouvir sem julgar” colocado em “Adulto voluntário”.", `${W} anúncio da colocação`);
  // clicar de novo no mesmo item desfaz a seleção
  await f.click(item(1)); await f.click(item(1));
  eq(await f.$eval(item(1), (b) => b.getAttribute("aria-pressed")), "false", `${W} desmarcar seleção`);

  // teclado: Enter no item leva o foco à 1ª categoria; Escape cancela e devolve o foco ao item
  await f.focus(item(2)); await page.keyboard.press("Enter");
  eq(await focado(f), "cat-alvo", `${W} Enter no item foca a categoria`);
  await page.keyboard.press("Escape");
  eq(await f.$eval(item(2), (b) => b.getAttribute("aria-pressed")), "false", `${W} Escape cancela`);
  eq(await focado(f), "item2", `${W} Escape devolve o foco ao item`);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  eq(await ondeEsta(f), [0, -1, 1, -1], `${W} teclado`);
  eq(await focado(f), "item2", `${W} foco fica no item colocado`);
  eq(await status(f), "“Comunicar pelos canais oficiais” colocado em “Autoridades”.", `${W} anúncio (teclado)`);
  eq(await counter(f), "02 / 04", `${W} teclado não troca de tela`);

  // arrastar com o mouse (inclusive de uma zona para outra)
  await arrastar(page, f, item(1), A + ".cat-zona:nth-child(2) .cat-lista");
  await arrastar(page, f, item(3), A + ".cat-zona:nth-child(1)");
  eq(await ondeEsta(f), [0, 1, 1, 0], `${W} arrastar`);
  await arrastar(page, f, item(3), A + ".cat-zona:nth-child(2) .cat-alvo");
  eq(await ondeEsta(f), [0, 1, 1, 1], `${W} arrastar entre zonas`);
  eq(await counter(f), "02 / 04", `${W} arrastar não troca de tela`);
  ok(await nextDis(f), `${W} continua bloqueada antes de verificar`);
  ok(await f.$eval(A + ".cat-bandeja", (e) => e.classList.contains("vazia")), `${W} bandeja vazia`);

  // verificar: item 2 errado
  await f.click(A + ".bloco-q .btn-act:not(.sec)");
  eq(await estadoCat(f), [
    { c: 0, cls: "ok", fb: "Certo. Acolher é papel de quem recebe o relato.", dis: true },
    { c: 1, cls: "ok", fb: "Certo. Investigar é papel das autoridades, não do grupo.", dis: true },
    { c: 1, cls: "erro", fb: "Errado. O lugar dele é “Adulto voluntário”.", dis: true },
    { c: 1, cls: "ok", fb: "Certo. Medidas protetivas são do Conselho Tutelar e da Justiça.", dis: true },
  ], `${W} marcas após verificar`);
  eq(await f.evaluate(() => document.activeElement.textContent), "Tentar de novo", `${W} foco em Tentar de novo`);
  // item travado continua no Tab e não se move
  await f.focus(item(2)); await page.keyboard.press("Enter");
  eq(await f.$eval(item(2), (b) => b.getAttribute("aria-pressed")), "false", `${W} item travado não seleciona`);
  eq(await resultado(f, A + ".bloco-q"), "resultado parcial|Revise os itens marcados. (3 de 4 no lugar certo.)", `${W} msgRevisar`);
  ok(await f.$eval(A + ".cat-bandeja", (e) => e.hidden), `${W} bandeja some após verificar`);
  await f.focus(A + ".btn-act.sec");
  eq(await f.evaluate(() => document.activeElement.textContent), "Tentar de novo", `${W} Tentar de novo focável`);
  ok(!(await nextDis(f)), `${W} libera após verificar`);
  eq(JSON.parse((await lms(page))["cmi.suspend_data"]).b["1.0"], [0, 1, 1, 1], `${W} estado salvo`);
  const lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} sem rolagem horizontal/dupla (${JSON.stringify(lay)})`);
  const alturas = await f.$$eval(A + ".cat-item, " + A + ".btn-act:not([hidden])", (l) => l.map((e) => Math.round(e.getBoundingClientRect().height)));
  ok(alturas.every((h) => h >= 44), `${W} alvos ≥ 44px (${alturas})`);
  console.log(`  altura do conteúdo da tela 2: ${await f.$eval("#stage", (s) => s.scrollHeight)}px (área ${await f.$eval("#stage", (s) => s.clientHeight)}px)`);

  // tentar de novo: mantém posições, tira marcas
  await f.click(A + ".btn-act.sec");
  eq((await estadoCat(f)).map((x) => x.cls + (x.dis ? "!" : "")).join(","), ",,,", `${W} tentar de novo limpa`);
  ok(!(await f.$eval(A + ".cat-bandeja", (e) => e.hidden)), `${W} bandeja volta ao tentar de novo`);
  await f.click(item(2)); await f.click(alvo(0));
  await f.click(A + ".bloco-q .btn-act:not(.sec)");
  eq(await resultado(f, A + ".bloco-q"), "resultado bom|Muito bem: todos os itens estão na categoria certa.", `${W} acerto (msg padrão)`);

  // tela 3 (3 categorias)
  await f.click("#next");
  eq(await counter(f), "03 / 04", `${W} tela 3`);
  const sol = [0, 1, 2, 0, 2];
  for (let i = 0; i < 5; i++) { await f.click(item(i)); await f.click(alvo(sol[i])); }
  await f.click(A + ".bloco-q .btn-act:not(.sec)");
  eq(await resultado(f, A + ".bloco-q"), "resultado bom|Perfeito!", `${W} msgAcerto`);
  const lay3 = await layout(f);
  ok(!lay3.hs && !lay3.pg, `${W} tela 3 sem rolagem horizontal`);
  await f.click("#next");
  eq((await lms(page))["cmi.core.lesson_status"], "completed", `${W} concluído`);
  ok((await lms(page))["cmi.suspend_data"].length < 200, `${W} suspend_data curto`);

  // retomada: recarrega o iframe com os mesmos dados
  await f.evaluate(() => { window.location.reload(); });
  await page.waitForTimeout(300);
  f = quadro(page); await pronto(f);
  await page.evaluate(() => document.getElementById("f").contentWindow.document.getElementById("prev").click());
  await page.evaluate(() => document.getElementById("f").contentWindow.document.getElementById("prev").click());
  eq(await counter(f), "02 / 04", `${W} retomada: tela 2`);
  eq(await estadoCat(f), [
    { c: 0, cls: "ok", fb: "Certo. Acolher é papel de quem recebe o relato.", dis: true },
    { c: 1, cls: "ok", fb: "Certo. Investigar é papel das autoridades, não do grupo.", dis: true },
    { c: 0, cls: "ok", fb: "Certo.", dis: true },
    { c: 1, cls: "ok", fb: "Certo. Medidas protetivas são do Conselho Tutelar e da Justiça.", dis: true },
  ], `${W} retomada restaura`);
  ok(!(await nextDis(f)), `${W} retomada: liberada`);
  await ctx.close();
}

{
  console.log("== estado inválido ==");
  const { ctx, page } = await novaPagina({ width: 1200, height: 666 });
  await page.goto(`${BASE}/moodle.html`);
  // descarrega o pacote antes de injetar (o beforeunload gravaria o estado por cima)
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "about:blank"; }));
  await page.evaluate(() => { window.__lms["cmi.suspend_data"] = JSON.stringify({ v: [0, 1], b: { "1.0": [0, 5, 1, 1] } }); window.__lms["cmi.core.lesson_location"] = "1"; });
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "pkg/index.html"; }));
  const f = quadro(page); await pronto(f);
  eq(await ondeEsta(f), [-1, -1, -1, -1], "estado inválido é ignorado");
  ok(await nextDis(f), "estado inválido: continua bloqueada");
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

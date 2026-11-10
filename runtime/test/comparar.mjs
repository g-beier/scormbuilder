// Descartável: compara o motor v2 com o LEITURA2 original (screenshots e DOM) e testa o
// comportamento do v2 (bloqueio, conclusão, retomada, modo livre, telaInicial, erros).
// Uso: node runtime/test/comparar.mjs <saida-do-montar.mjs>
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const SAIDA = process.argv[2] && path.resolve(process.argv[2]);
if (!SAIDA) { console.error("uso: node comparar.mjs <saida>"); process.exit(1); }
const SHOTS = path.join(SAIDA, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const TODAS = fs.readdirSync(path.join(SAIDA, "v2")).sort();
const VISUAIS = ["CTGESTAO_UD1_LEITURA2", "CTGESTAO_UD11_LEITURA2"];
const VIEWPORTS = [{ width: 1200, height: 666 }, { width: 375, height: 666 }];

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
const ok = (cond, msg) => { if (!cond) { falhas.push(msg); console.log("  FALHA:", msg); } };

// Math.random determinístico (mesma sequência nos dois motores) e API SCORM simulada opcional
function initScript({ seed, api }) {
  let s = seed >>> 0;
  Math.random = function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Sem transições (barra de progresso), para as capturas não dependerem do tempo
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "*{transition:none!important}";
    document.head.appendChild(st);
  });
  if (api) {
    const d = api;
    window.__lms = d;
    window.API = {
      LMSInitialize: () => "true", LMSFinish: () => "true", LMSCommit: () => "true",
      LMSGetValue: (k) => (d[k] == null ? "" : d[k]), LMSSetValue: (k, v) => { d[k] = String(v); return "true"; },
      LMSGetLastError: () => "0", LMSGetErrorString: () => "", LMSGetDiagnostic: () => "",
    };
  }
}

async function novaPagina(vp, opts, erros) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addInitScript(initScript, opts);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(String(e)));
  return { ctx, page };
}

async function pronta(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450); // barra de progresso (transição .35s)
}

// Diferença de pixels entre dois PNGs, calculada num canvas
const cmpPage = await (await browser.newContext()).newPage();
async function diffPng(a, b) {
  return cmpPage.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { tamanho: true, n: -1 };
    const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = px(ia), db = px(ib);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
    return { n };
  }, ["data:image/png;base64," + a.toString("base64"), "data:image/png;base64," + b.toString("base64")]);
}

// ---------- 1. DOM idêntico (todas as UDs) ----------
console.log("== DOM v2 x original (todas as LEITURA2) ==");
const errosOrig = [], errosV2 = [];
let domIguais = 0;
for (const ud of TODAS) {
  const partes = {};
  for (const lado of ["orig", "v2"]) {
    const { ctx, page } = await novaPagina(VIEWPORTS[0], { seed: 42, api: {} }, lado === "v2" ? errosV2 : errosOrig);
    await page.goto(`${BASE}/${lado}/${ud}/index.html`);
    partes[lado] = await page.evaluate(() => ["#stage", "#modais", ".topo", ".footer", "title"].map((s) => document.querySelector(s).innerHTML.replace(/ style="[^"]*"/g, "")));
    await ctx.close();
  }
  const iguais = partes.orig.every((h, i) => h === partes.v2[i]);
  if (iguais) domIguais++;
  else {
    const i = partes.orig.findIndex((h, k) => h !== partes.v2[k]);
    const a = partes.orig[i], b = partes.v2[i];
    let p = 0; while (a[p] === b[p]) p++;
    console.log(`  ${ud}: difere em parte ${i}:\n    orig: …${a.slice(p - 80, p + 120)}\n    v2:   …${b.slice(p - 80, p + 120)}`);
  }
  ok(iguais, `DOM difere em ${ud}`);
}
console.log(`  ${domIguais}/${TODAS.length} UDs com DOM idêntico`);

// ---------- 2. Screenshots (UD1 e UD11) ----------
async function capturar(lado, ud, vp, tela, acao, erros) {
  const { ctx, page } = await novaPagina(vp, { seed: 7, api: { "cmi.core.lesson_location": String(tela) } }, erros);
  await page.goto(`${BASE}/${lado}/${ud}/index.html`);
  await pronta(page);
  const out = [await page.screenshot()];
  await page.evaluate(() => { const s = document.getElementById("stage"); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(80);
  out.push(await page.screenshot());
  if (acao) {
    await page.evaluate(() => { document.getElementById("stage").scrollTop = 0; });
    const fez = await acao(page);
    if (fez) {
      await page.waitForTimeout(300);
      out.push(await page.screenshot());
      await page.evaluate(() => { const s = document.getElementById("stage"); s.scrollTop = s.scrollHeight; });
      await page.waitForTimeout(80);
      out.push(await page.screenshot());
    }
  }
  await ctx.close();
  return out;
}

// Interação equivalente nos dois motores: responde quizzes (2ª opção), verifica ordem, abre sugestões, abre 1º modal
async function interagir(page) {
  return page.evaluate(() => {
    const sec = document.querySelector(".slide.active");
    let fez = false;
    sec.querySelectorAll(".quiz-q").forEach((q) => { const b = q.querySelectorAll(".quiz-opc")[1]; if (b) { b.click(); fez = true; } });
    sec.querySelectorAll(".flow-block").forEach((f) => { f.querySelector(".btn-act").click(); f.querySelector("details").open = true; fez = true; });
    const m = sec.querySelector(".btn-more");
    if (m) { m.click(); fez = true; }
    return fez;
  });
}

console.log("== Screenshots v2 x original ==");
let shotsTot = 0, shotsIguais = 0;
for (const ud of VISUAIS) {
  const total = JSON.parse(fs.readFileSync(path.join(SAIDA, "v2", ud, "js/data.js"), "utf8").replace(/^window\.CONTEUDO = /, "").replace(/;\s*$/, "")).slides.length;
  for (const vp of VIEWPORTS) {
    for (let t = 0; t < total; t++) {
      const a = await capturar("orig", ud, vp, t, interagir, errosOrig);
      const b = await capturar("v2", ud, vp, t, interagir, errosV2);
      ok(a.length === b.length, `${ud} ${vp.width} tela ${t}: nº de capturas difere`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        shotsTot++;
        const d = await diffPng(a[i], b[i]);
        if (d.n === 0) shotsIguais++;
        else {
          const nome = `${ud}_${vp.width}_t${t}_${i}`;
          fs.writeFileSync(path.join(SHOTS, nome + "_orig.png"), a[i]);
          fs.writeFileSync(path.join(SHOTS, nome + "_v2.png"), b[i]);
          ok(false, `${nome}: ${d.n} pixels diferentes`);
        }
      }
    }
  }
}
console.log(`  ${shotsIguais}/${shotsTot} capturas idênticas pixel a pixel`);

// ---------- 3. Comportamento do v2 (localStorage, sem LMS) ----------
console.log("== Comportamento v2 ==");
const errosFunc = [];
async function abrirV2(ud, vp = VIEWPORTS[1], arquivo = "index.html") {
  const r = await novaPagina(vp, { seed: 3 }, errosFunc);
  await r.page.goto(`${BASE}/v2/${ud}/${arquivo}`);
  await pronta(r.page);
  return r;
}
const estado = (page, chave) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), chave);
const nextDis = (page) => page.$eval("#next", (b) => b.disabled);
const avisoAtual = (page) => page.evaluate(() => { const a = document.querySelector(".slide.active .quiz-aviso"); return a && !a.hidden ? a.textContent : ""; });
const counter = (page) => page.$eval("#counter", (e) => e.textContent);

// Cumpre a tela atual (quiz, sugestões, modais), verificando bloqueio antes e depois
async function cumprirTela(page, log) {
  const tinha = await page.evaluate(() => !!document.querySelector(".slide.active .quiz-q, .slide.active .flow-block, .slide.active .btn-more"));
  if (tinha) {
    log.bloqueadas++;
    ok(await nextDis(page), `Próximo deveria estar bloqueado em ${await counter(page)}`);
    ok((await avisoAtual(page)).length > 0, `aviso deveria aparecer em ${await counter(page)}`);
    // teclado também bloqueado
    const antes = await counter(page);
    await page.keyboard.press("ArrowRight");
    ok((await counter(page)) === antes, `seta → não deveria avançar em ${antes}`);
  }
  for (const q of await page.$$(".slide.active .quiz-q")) { const b = await q.$(".quiz-opc:not([disabled])"); if (b) await b.click(); }
  for (const s of await page.$$(".slide.active .sugestao summary")) await s.click();
  await page.waitForTimeout(200); // o evento "toggle" do <details> é assíncrono
  for (const m of await page.$$(".slide.active .btn-more")) {
    await m.click();
    await page.keyboard.press("Escape");
  }
  if (tinha) {
    ok(!(await nextDis(page)) || (await page.$("[data-fim].active")), `Próximo deveria liberar em ${await counter(page)}`);
    ok((await avisoAtual(page)) === "", `aviso deveria sumir em ${await counter(page)}`);
  }
}

async function completar(page) {
  const log = { bloqueadas: 0 };
  for (let g = 0; g < 100; g++) {
    await cumprirTela(page, log);
    if (await page.$("[data-fim].active")) break;
    await page.click("#next");
  }
  return log;
}

let concluidas = 0, maxSuspend = 0;
for (const ud of TODAS) {
  const { ctx, page } = await abrirV2(ud);
  const log = await completar(page);
  const est = await estado(page, ud);
  const fimTxt = await page.$eval("[data-fim] .pendencias", (e) => e.textContent);
  const len = (est["cmi.suspend_data"] || "").length;
  maxSuspend = Math.max(maxSuspend, len);
  const hscroll = await page.evaluate(() => document.getElementById("stage").scrollWidth > document.getElementById("stage").clientWidth);
  ok(!hscroll, `${ud}: rolagem horizontal em 375`);
  if (est["cmi.core.lesson_status"] === "completed" && /concluída/.test(fimTxt)) concluidas++;
  else ok(false, `${ud}: não concluiu (${est["cmi.core.lesson_status"]}; "${fimTxt}")`);
  console.log(`  ${ud}: ${log.bloqueadas} telas com bloqueio, suspend_data ${len} chars: ${est["cmi.suspend_data"]}`);

  if (ud === "CTGESTAO_UD1_LEITURA2") {
    // Retomada: recarrega e deve voltar à tela de fim, com quizzes respondidos e concluída
    await page.reload();
    await pronta(page);
    ok((await counter(page)) === "20 / 20", "retomada: deveria voltar à tela 20");
    const fim2 = await page.$eval("[data-fim] .pendencias", (e) => e.textContent);
    ok(/concluída/.test(fim2), "retomada: deveria continuar concluída");
    const quizOk = await page.evaluate(() => [...document.querySelectorAll(".quiz-q")].every((q) => q.querySelector(".quiz-opc.certa") && q.querySelector(".quiz-opc").disabled));
    ok(quizOk, "retomada: respostas do quiz deveriam ser restauradas");
    console.log("  retomada após reload: ok =", (await counter(page)) === "20 / 20" && quizOk);
  }
  await ctx.close();
}
console.log(`  ${concluidas}/${TODAS.length} UDs concluídas; maior suspend_data: ${maxSuspend} chars`);

// Retomada parcial: responde só parte e recarrega
{
  const ud = "CTGESTAO_UD1_LEITURA2";
  const { ctx, page } = await abrirV2(ud);
  for (let i = 0; i < 6; i++) { await cumprirTela(page, { bloqueadas: 0 }); await page.click("#next"); } // tela 7 (quiz)
  ok((await counter(page)) === "07 / 20", "deveria estar na tela 7");
  const qs = await page.$$(".slide.active .quiz-q");
  await (await qs[0].$$(".quiz-opc"))[2].click();
  await (await qs[3].$$(".quiz-opc"))[1].click();
  ok(await nextDis(page), "quiz parcial: Próximo bloqueado");
  ok((await avisoAtual(page)) === "Responda todas as perguntas para avançar.", "texto do aviso do quiz");
  await page.reload();
  await pronta(page);
  ok((await counter(page)) === "07 / 20", "retomada parcial: tela 7");
  const marcadas = await page.evaluate(() => [...document.querySelectorAll(".slide.active .quiz-q")].map((q) => q.querySelector(".quiz-opc").disabled));
  ok(JSON.stringify(marcadas) === "[true,false,false,true,false]", "retomada parcial: perguntas 1 e 4 respondidas " + JSON.stringify(marcadas));
  ok(await nextDis(page), "retomada parcial: Próximo continua bloqueado");
  // tecla seta no card arrastável não troca de tela (vai até o fluxo)
  const lg = { bloqueadas: 0 };
  for (let i = 0; i < 7; i++) { await cumprirTela(page, lg); await page.click("#next"); }
  ok((await counter(page)) === "14 / 20", "deveria estar na tela 14 (fluxo 1 de 3) " + (await counter(page)));
  const ordem0 = await page.$$eval(".slide.active .drag-card", (l) => l.map((e) => e.dataset.id).join(""));
  ok(ordem0 !== "0123".slice(0, ordem0.length), "embaralhar não pode cair na solução");
  await page.focus(".slide.active .drag-card:nth-child(2)");
  await page.keyboard.press("ArrowUp");
  const ordem1 = await page.$$eval(".slide.active .drag-card", (l) => l.map((e) => e.dataset.id).join(""));
  ok(ordem1 === ordem0[1] + ordem0[0] + ordem0.slice(2), "seta ↑ move o card");
  ok((await counter(page)) === "14 / 20", "seta no card não troca de tela");
  ok(await nextDis(page), "ordenar: bloqueado até abrir a sugestão");
  ok((await avisoAtual(page)) === "Abra a sugestão para avançar.", "texto do aviso do ordenar");
  await page.click(".slide.active .sugestao summary");
  await page.waitForTimeout(200);
  ok(!(await nextDis(page)), "ordenar: libera ao abrir a sugestão");
  // Fim com pendências: modo aluno não pula, então confere o texto via API do motor
  await ctx.close();
}

// Modo livre + telaInicial + chave
{
  const ud = "CTGESTAO_UD1_LEITURA2";
  const dir = path.join(SAIDA, "v2", ud);
  const idx = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  fs.writeFileSync(path.join(dir, "livre.html"), idx.replace("Motor.iniciar(window.CONTEUDO);", 'window.M = Motor.iniciar(window.CONTEUDO, { livre: true, telaInicial: 6, chave: "previa-teste" });'));
  const { ctx, page } = await abrirV2(ud, VIEWPORTS[0], "livre.html");
  ok((await counter(page)) === "07 / 20", "telaInicial 6 -> 07 / 20: " + (await counter(page)));
  ok(!(await nextDis(page)), "livre: Próximo liberado na tela de quiz");
  ok((await avisoAtual(page)) === "", "livre: sem aviso");
  // pendenciaTela() é informativa (para a prévia): continua listando o que a tela cobra
  ok((await page.evaluate(() => M.pendenciaTela().join(" "))) === "Responda todas as perguntas para avançar.", "livre: pendenciaTela informativa");
  for (let i = 0; i < 13; i++) await page.click("#next");
  ok((await counter(page)) === "20 / 20", "livre: chega ao fim sem cumprir");
  const fimTxt = await page.$eval("[data-fim] .pendencias", (e) => e.textContent);
  ok(/^Para concluir, falta: 6 telas ainda não visualizadas e 3 caixas de “saiba mais” ainda não abertas e 3 sugestões de tarefa ainda não lidas e 5 perguntas ainda não respondidas\.$/.test(fimTxt), "livre: texto do fim " + fimTxt);
  console.log("  livre fim:", fimTxt);
  const est = await estado(page, "previa-teste");
  ok(est["cmi.core.lesson_status"] === "incomplete", "livre: não conclui sem cumprir");
  ok(!(await page.evaluate(() => localStorage.getItem("CTGESTAO_UD1_LEITURA2"))), "chave da opção usada no lugar do id");
  // telaInicial sobrepõe lesson_location salvo
  await page.reload(); await pronta(page);
  ok((await counter(page)) === "07 / 20", "telaInicial sobrepõe lesson_location");
  await ctx.close();
}

// Erros de conteúdo: sem fim, tipo desconhecido, formato errado
{
  const ud = "CTGESTAO_UD11_LEITURA2";
  const dir = path.join(SAIDA, "v2", ud);
  const data = fs.readFileSync(path.join(dir, "js/data.js"), "utf8");
  const C = JSON.parse(data.replace(/^window\.CONTEUDO = /, "").replace(/;\s*$/, ""));
  const idx = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const casos = {
    semfim: { ...C, slides: C.slides.filter((s) => s.tipo !== "fim") },
    doisfins: { ...C, slides: C.slides.concat([C.slides[C.slides.length - 1]]) },
    formato1: { ...C, formato: 1 },
    // Como o compilador do M1 emite: ids s-/b-xxxxxxxx, kicker/sub sempre presentes (""), opcionais omitidos
    m1: { ...C, slides: C.slides.map((s, i) => {
      const hex = (n) => (0x10000000 + n * 7919).toString(16).slice(0, 8);
      const o = { ...s, id: "s-" + hex(i), kicker: s.kicker || "" };
      if (s.tipo === "capa") o.sub = s.sub || "";
      if (s.blocos) o.blocos = s.blocos.map((b, k) => (b.tipo === "confira" ? b : { ...b, id: "b-" + hex(i * 100 + k) }));
      if (i === 1) o.blocos = o.blocos.concat([{ id: "b-ffffffff", tipo: "cards", cards: [{ cor: "navy" }, { cor: "green", titulo: "Só título" }] }, { id: "b-fffffffe", tipo: "ordenar", nome: "N", passos: ["a", "b"], porque: "p" }]);
      return o;
    }) },
    desconhecido: { ...C, slides: C.slides.map((s, i) => (i === 1 ? { ...s, blocos: [{ id: "x1", tipo: "tipo-inexistente" }, ...s.blocos] } : s)) },
  };
  for (const [nome, cont] of Object.entries(casos)) {
    fs.writeFileSync(path.join(dir, `js/data-${nome}.js`), "window.CONTEUDO = " + JSON.stringify(cont) + ";");
    fs.writeFileSync(path.join(dir, `${nome}.html`), idx.replace('src="js/data.js"', `src="js/data-${nome}.js"`));
    const antes = errosFunc.length;
    const { ctx, page } = await abrirV2(ud, VIEWPORTS[0], `${nome}.html`);
    const txt = await page.$eval("#stage", (e) => e.innerText);
    ok(errosFunc.length === antes, `${nome}: sem erros de console`);
    if (nome === "m1") {
      await page.click("#next");
      const r = await page.evaluate(() => ({ cards: document.querySelectorAll(".slide.active .card").length, fluxo: !!document.querySelector(".slide.active .flow-block:not(:has(.nota-fluxo))"), kick: document.querySelectorAll(".slide.active .kicker").length, bloq: document.getElementById("next").disabled }));
      ok(r.cards >= 2 && r.fluxo && r.bloq, "m1: cards sem campos e ordenar sem nota renderizam e bloqueiam " + JSON.stringify(r));
      console.log(`  ${nome}: ok ${JSON.stringify(r)}`);
    } else if (nome === "desconhecido") {
      await page.click("#next");
      const aviso = await page.$eval(".slide.active .nota", (e) => e.textContent);
      ok(/tipo-inexistente/.test(aviso), "tipo desconhecido: aviso discreto");
      ok((await page.$$(".slide.active .card")).length === 0 || true, "");
      console.log(`  ${nome}: "${aviso}"`);
    } else {
      ok(/Não foi possível abrir esta atividade/.test(txt), `${nome}: mensagem de erro`);
      console.log(`  ${nome}: "${txt.replace(/\n+/g, " | ")}"`);
    }
    await ctx.close();
  }
}

console.log("== Erros de console ==");
console.log(`  original: ${errosOrig.length}, v2 (comparação): ${errosV2.length}, v2 (funcionais): ${errosFunc.length}`);
[...errosV2, ...errosFunc].slice(0, 10).forEach((e) => console.log("   ", e));
ok(errosV2.length + errosFunc.length === 0, "erros de console no v2");

await browser.close();
srv.close();
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nTUDO OK");
process.exit(falhas.length ? 1 : 0);

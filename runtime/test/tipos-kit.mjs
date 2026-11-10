// Descartável (não vai para o pacote): testa os blocos do kit (M6) — multipla, reflexao, escolha —
// com a fixture escrita à mão em fixtures/kit-v2.data.js, em 1200x666 e 375x666.
// O pacote roda num iframe de 666px dentro de uma página "Moodle" com uma API SCORM 1.2 simulada
// (window.API no pai), para inspecionar cmi.interactions, suspend_data e lesson_status.
// Uso: node runtime/test/tipos-kit.mjs <saida>      (ex.: "$TMPDIR"cev-m6)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const SAIDA = process.argv[2] && path.resolve(process.argv[2], "kit");
if (!SAIDA) { console.error("uso: node tipos-kit.mjs <saida>"); process.exit(1); }

// ---------- monta o pacote de teste ----------
const PKG = path.join(SAIDA, "pkg");
fs.rmSync(SAIDA, { recursive: true, force: true });
for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(PKG, d), { recursive: true });
fs.copyFileSync(path.join(AQUI, "fixtures/kit-v2.data.js"), path.join(PKG, "js/data.js"));
const idx = fs.readFileSync(path.join(RUNTIME, "index.html"), "utf8").split("{{TITULO}}").join("Blocos do kit");
fs.writeFileSync(path.join(PKG, "index.html"), idx);
fs.writeFileSync(path.join(PKG, "livre.html"), idx.replace("Motor.iniciar(window.CONTEUDO);", 'window.M = Motor.iniciar(window.CONTEUDO, { livre: true, telaInicial: 1, chave: "kit-livre" });'));
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

const AVISO_REFL = "Ao enviar, sua reflexão é registrada na plataforma e pode ser lida pela equipe do curso. Não escreva nomes nem dados que identifiquem crianças, famílias ou casos reais. Depois de enviada, ela não pode ser editada; se você sair desta tela sem enviar, o texto é descartado.";
const ENVIADA = "✓ Reflexão enviada. Obrigado por compartilhar.";

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
const estadoMult = (f, sel) => f.$eval(sel, (box) => [...box.querySelectorAll(".opcao")].map((l) => ({
  cls: ["ok", "erro"].filter((c) => l.classList.contains(c)).join(""),
  fb: l.querySelector(".fb").hidden ? null : l.querySelector(".fb").textContent,
  chk: l.querySelector("input").checked, dis: l.querySelector("input").disabled,
})));
const resultado = (f, sel) => f.$eval(sel, (box) => { const r = box.querySelector(".quiz-resultado .resultado"); return r ? r.className + "|" + r.textContent : ""; });
// Sem rolagem horizontal e uma só barra (só o #stage rola)
const layout = (f) => f.evaluate(() => {
  const s = document.getElementById("stage"), de = document.documentElement;
  return { hs: s.scrollWidth > s.clientWidth || de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth, pg: de.scrollHeight > de.clientHeight + 1 };
});
// Alvos de toque da tela atual (opções, botões dos blocos, campo de texto)
const alvos = (f) => f.$$eval(A + ".bloco-q .opcao, " + A + ".bloco-q .btn-act:not([hidden]), " + A + ".bloco-q textarea:not([hidden])", (l) => l.map((e) => Math.round(e.getBoundingClientRect().height)));

for (const vp of [{ width: 1200, height: 666 }, { width: 375, height: 666 }]) {
  console.log(`== ${vp.width}x${vp.height} ==`);
  const W = vp.width;
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`${BASE}/moodle.html`);
  let f = quadro(page);
  await pronto(f);
  eq(await counter(f), "01 / 06", `${W} início`);
  await f.click("#next");

  // ----- múltipla 1: bloqueio, "marque ao menos uma", 3 casos de retorno, tentar de novo -----
  eq(await counter(f), "02 / 06", `${W} tela da múltipla`);
  ok(await nextDis(f), `${W} múltipla: Próximo bloqueado`);
  eq(await aviso(f), "Verifique suas respostas para avançar.", `${W} múltipla: aviso`);
  await f.focus("#next").catch(() => {});
  await f.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("ArrowRight");
  eq(await counter(f), "02 / 06", `${W} múltipla: seta → bloqueada`);
  const M1 = A + ".bloco-q.multipla";
  await f.click(M1 + " .btn-act:not(.sec)");
  eq(await resultado(f, M1), "resultado parcial|Marque ao menos uma alternativa antes de verificar.", `${W} múltipla: nenhuma marcada`);
  ok(await nextDis(f), `${W} múltipla: continua bloqueada sem verificar`);
  // teclado: Espaço marca; seta no checkbox não troca de tela
  const cbs = await f.$$(M1 + " input");
  await cbs[0].focus(); await page.keyboard.press("Space");
  ok(await f.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none"), `${W} múltipla: foco visível no checkbox`);
  await cbs[1].focus(); await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  eq(await counter(f), "02 / 06", `${W} múltipla: seta no checkbox não troca de tela`);
  await f.focus(M1 + " .btn-act:not(.sec)"); await page.keyboard.press("Enter");
  eq(await estadoMult(f, M1), [
    { cls: "ok", fb: "Proteger vem antes de qualquer outra ação.", chk: true, dis: true },
    { cls: "erro", fb: "Errado. Investigar é papel das autoridades, não do grupo.", chk: true, dis: true },
    { cls: "erro", fb: "Faltou marcar esta. Comunicar é dever: use os canais oficiais.", chk: false, dis: true },
  ], `${W} múltipla: retorno por alternativa (3 casos)`);
  eq(await resultado(f, M1), "resultado parcial|Revise: veja os comentários.", `${W} múltipla: msgRevisar`);
  eq(await f.evaluate(() => document.activeElement.textContent), "Tentar de novo", `${W} múltipla: foco vai para Tentar de novo`);
  ok(!(await nextDis(f)), `${W} múltipla: libera após verificar (mesmo com erro)`);
  eq(await aviso(f), "", `${W} múltipla: aviso some`);
  eq(JSON.parse((await lms(page))["cmi.suspend_data"]).b["1.1"], [0, 1], `${W} múltipla: estado salvo`);
  await page.keyboard.press("Enter"); // Tentar de novo
  eq(await estadoMult(f, M1), [
    { cls: "", fb: null, chk: true, dis: false }, { cls: "", fb: null, chk: true, dis: false }, { cls: "", fb: null, chk: false, dis: false },
  ], `${W} múltipla: tentar de novo reabilita`);
  eq(await resultado(f, M1), "", `${W} múltipla: resultado limpo`);
  ok(!(await nextDis(f)), `${W} múltipla: continua liberada após tentar de novo`);
  await f.click(M1 + " .opcao:nth-child(2) .opcao-txt");
  await f.click(M1 + " .opcao:nth-child(3) .opcao-txt");
  await f.click(M1 + " .btn-act:not(.sec)");
  eq(await estadoMult(f, M1), [
    { cls: "ok", fb: "Proteger vem antes de qualquer outra ação.", chk: true, dis: true },
    { cls: "", fb: null, chk: false, dis: true },
    { cls: "ok", fb: "Comunicar é dever: use os canais oficiais.", chk: true, dis: true },
  ], `${W} múltipla: tudo certo`);
  eq(await resultado(f, M1), "resultado bom|Isso: proteger e comunicar vêm antes de tudo.", `${W} múltipla: msgAcerto`);
  ok((await alvos(f)).every((h) => h >= 44), `${W} múltipla: alvos >= 44px ${JSON.stringify(await alvos(f))}`);
  eq(await layout(f), { hs: false, pg: false }, `${W} múltipla: sem rolagem horizontal, uma barra`);
  await f.click("#next");

  // ----- tela mista: múltipla com padrões + escolha (ordem dos avisos, troca, retomada parcial) -----
  eq(await counter(f), "03 / 06", `${W} tela mista`);
  eq(await aviso(f), "Verifique suas respostas para avançar. Escolha uma alternativa para avançar.", `${W} mista: dois avisos em ordem`);
  const E1 = A + ".bloco-q.escolha";
  eq(await f.$eval(E1 + " .escolha-retorno", (e) => e.textContent), "Escolha uma alternativa para ver o retorno.", `${W} escolha: dica inicial`);
  const rds = await f.$$(E1 + " input");
  await rds[0].focus(); await page.keyboard.press("Space");
  eq(await f.$eval(E1 + " .escolha-retorno", (e) => e.querySelector("h3").textContent + "|" + e.querySelector("p").textContent), "Retorno|Ótimo. Revise o fluxo mesmo assim.", `${W} escolha: retorno da 1ª`);
  await page.keyboard.press("ArrowDown");
  const r2 = await f.$eval(E1, (b) => ({ i: [...b.querySelectorAll("input")].findIndex((x) => x.checked), esc: [...b.querySelectorAll(".opcao")].findIndex((l) => l.classList.contains("escolhida")), p: b.querySelector(".escolha-retorno p").textContent, tags: b.querySelectorAll(".escolha-retorno i").length }));
  eq(r2, { i: 1, esc: 1, p: "Normal. A <i>equipe</i> & o fluxo ajudam.", tags: 0 }, `${W} escolha: troca pelo teclado, retorno como texto`);
  await page.keyboard.press("ArrowRight");
  eq(await counter(f), "03 / 06", `${W} escolha: seta no rádio não troca de tela`);
  eq(await f.$eval(E1, (b) => [...b.querySelectorAll("input")].findIndex((x) => x.checked)), 2, `${W} escolha: seta → move a escolha`);
  eq(await aviso(f), "Verifique suas respostas para avançar.", `${W} mista: resta o aviso da múltipla`);
  ok(await nextDis(f), `${W} mista: ainda bloqueada`);
  // retomada parcial (recarrega só o pacote, como uma nova sessão no Moodle)
  await f.goto(`${BASE}/pkg/index.html`); f = quadro(page); await pronto(f);
  eq(await counter(f), "03 / 06", `${W} retomada parcial: mesma tela`);
  eq(await f.$eval(E1, (b) => [[...b.querySelectorAll("input")].findIndex((x) => x.checked), b.querySelector(".escolha-retorno p").textContent]), [2, "Volte ao fluxo básico antes de seguir."], `${W} retomada parcial: escolha restaurada`);
  ok(await nextDis(f), `${W} retomada parcial: múltipla ainda bloqueia`);
  const M2 = A + ".bloco-q.multipla";
  await f.click(M2 + " .opcao:nth-child(1) .opcao-txt");
  await f.click(M2 + " .btn-act:not(.sec)");
  eq(await estadoMult(f, M2), [
    { cls: "erro", fb: "Errado. Use 5 < 6 & <b>não</b> isso.", chk: true, dis: true },
    { cls: "erro", fb: "Faltou marcar esta. ", chk: false, dis: true },
  ], `${W} múltipla 2: retornos como texto`);
  eq(await f.$$eval(M2 + " .fb b", (l) => l.length), 0, `${W} múltipla 2: fb não vira HTML`);
  eq(await resultado(f, M2), "resultado parcial|Alguns pontos merecem revisão. Veja os comentários nas alternativas.", `${W} múltipla 2: msgRevisar padrão`);
  ok(!(await nextDis(f)), `${W} mista: libera`);
  await f.click(E1 + " .opcao:nth-child(1) .opcao-txt"); // troca a escolha de novo
  ok((await alvos(f)).every((h) => h >= 44), `${W} mista: alvos >= 44px`);
  eq(await layout(f), { hs: false, pg: false }, `${W} mista: sem rolagem horizontal`);
  await f.click("#next");

  // ----- reflexão obrigatória -----
  eq(await counter(f), "04 / 06", `${W} reflexão`);
  ok(await nextDis(f), `${W} reflexão: bloqueada`);
  eq(await aviso(f), "Envie sua reflexão para avançar.", `${W} reflexão: aviso`);
  const R1 = A + ".bloco-q.reflexao";
  const lerR = (sel) => f.$eval(sel, (b) => ({
    rot: b.querySelector(".refl-rotulo").textContent, cont: b.querySelector(".refl-cont").textContent,
    av: b.querySelector(".aviso-refl") ? b.querySelector(".aviso-refl").textContent : null,
    btn: b.querySelector(".btn-act").disabled, nome: b.querySelector("textarea").getAttribute("aria-labelledby").split(" ").map((i) => document.getElementById(i).textContent).join(" "),
  }));
  eq(await lerR(R1), { rot: "Escreva sua reflexão.", cont: "0/600 · mínimo de 20 caracteres", av: AVISO_REFL, btn: true, nome: "O que você faria primeiro? Escreva sua reflexão." }, `${W} reflexão: estado inicial`);
  await f.focus(R1 + " textarea");
  await page.keyboard.type("curto");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  eq(await counter(f), "04 / 06", `${W} reflexão: setas no campo não trocam de tela`);
  eq((await lerR(R1)).cont, "5/600 · mínimo de 20 caracteres", `${W} reflexão: contador`);
  ok((await lerR(R1)).btn, `${W} reflexão: botão desabilitado abaixo do mínimo`);
  await f.fill(R1 + " textarea", " ".repeat(30));
  ok((await lerR(R1)).btn, `${W} reflexão: só espaços não contam`);
  const TXT = "Primeiro, garantir a segurança.\nDepois, comunicar. " + "a".repeat(260);
  await f.fill(R1 + " textarea", TXT);
  eq((await lerR(R1)).cont, TXT.length + "/600", `${W} reflexão: contador sem aviso de mínimo`);
  ok(!(await lerR(R1)).btn, `${W} reflexão: botão habilitado`);
  await f.click(R1 + " .btn-act");
  const r1 = await f.$eval(R1, (b) => ({ st: b.querySelector(".refl-status").textContent, ro: b.querySelector("textarea").readOnly, btn: b.querySelector(".btn-act").hidden, foco: document.activeElement === b.querySelector(".refl-status") }));
  eq(r1, { st: ENVIADA, ro: true, btn: true, foco: true }, `${W} reflexão: enviada`);
  ok(!(await nextDis(f)), `${W} reflexão: libera após envio`);
  let L = await lms(page);
  const limpo = TXT.replace(/\s*[\r\n]+\s*/g, " / ").replace(/\s+/g, " ").trim();
  eq([L["cmi.interactions.0.id"], L["cmi.interactions.1.id"], L["cmi.interactions.0.type"], L["cmi.interactions.0.result"], L["cmi.interactions.1.type"]], ["b-refl1_p1", "b-refl1_p2", "fill-in", "neutral", "fill-in"], `${W} reflexão: interações em 2 partes`);
  eq((L["cmi.interactions.0.student_response"] || "") + (L["cmi.interactions.1.student_response"] || ""), limpo, `${W} reflexão: texto gravado`);
  eq((L["cmi.interactions.0.student_response"] || "").length, 250, `${W} reflexão: parte de 250`);
  ok(!/aaaa|segurança/.test(L["cmi.suspend_data"]), `${W} reflexão: texto fora do suspend_data`);
  ok((await alvos(f)).every((h) => h >= 44), `${W} reflexão: alvos >= 44px`);
  eq(await layout(f), { hs: false, pg: false }, `${W} reflexão: sem rolagem horizontal`);
  await f.click("#next");

  // ----- reflexão opcional -----
  eq(await counter(f), "05 / 06", `${W} reflexão opcional`);
  ok(!(await nextDis(f)), `${W} reflexão opcional: não bloqueia`);
  const R2 = A + ".bloco-q.reflexao";
  eq((await lerR(R2)).rot, "Escreva sua reflexão (opcional).", `${W} reflexão opcional: rótulo`);
  eq((await lerR(R2)).cont, "0/500 · mínimo de 10 caracteres", `${W} reflexão opcional: padrões 10/500`);
  await f.fill(R2 + " textarea", "Nada a acrescentar, obrigado.");
  await f.click(R2 + " .btn-act");
  L = await lms(page);
  eq([L["cmi.interactions.2.id"], L["cmi.interactions.2.student_response"]], ["b-refl2", "Nada a acrescentar, obrigado."], `${W} reflexão opcional: interação 2`);
  await f.click("#next");

  // ----- conclusão -----
  eq(await counter(f), "06 / 06", `${W} fim`);
  eq(await f.$eval("[data-fim] .pendencias", (e) => e.textContent), "Atividade concluída. Seu progresso foi registrado.", `${W} fim: concluída`);
  L = await lms(page);
  eq(L["cmi.core.lesson_status"], "completed", `${W} lesson_status`);
  const SUSP = '{"v":[0,1,2,3,4,5],"b":{"1.1":[0,2],"2.0":[0],"2.1":0,"3.0":1,"4.0":1}}';
  eq(L["cmi.suspend_data"], SUSP, `${W} suspend_data`);
  console.log(`  suspend_data ${L["cmi.suspend_data"].length} chars: ${L["cmi.suspend_data"]}`);
  ok(L["cmi.suspend_data"].length < 4096, `${W} suspend_data < 4096`);

  // ----- retomada após reload -----
  await f.goto(`${BASE}/pkg/index.html`); f = quadro(page); await pronto(f);
  eq(await counter(f), "06 / 06", `${W} retomada: volta ao fim`);
  ok(/concluída/.test(await f.$eval("[data-fim] .pendencias", (e) => e.textContent)), `${W} retomada: continua concluída`);
  const ret = await f.evaluate(() => {
    const mult = [...document.querySelectorAll(".bloco-q.multipla")].map((b) => ({
      chk: [...b.querySelectorAll("input")].map((i) => i.checked), dis: [...b.querySelectorAll("input")].every((i) => i.disabled),
      cls: [...b.querySelectorAll(".opcao")].map((l) => ["ok", "erro"].filter((c) => l.classList.contains(c)).join("")),
      res: b.querySelector(".resultado") && b.querySelector(".resultado").className, refazer: !b.querySelector(".btn-act.sec").hidden,
    }));
    const esc = [...document.querySelectorAll(".bloco-q.escolha input")].map((i) => i.checked);
    const refl = [...document.querySelectorAll(".bloco-q.reflexao")].map((b) => ({ ta: b.querySelector("textarea").hidden, st: b.querySelector(".refl-status").textContent, btn: b.querySelector(".btn-act").hidden }));
    return { mult, esc, refl };
  });
  eq(ret, {
    mult: [{ chk: [true, false, true], dis: true, cls: ["ok", "", "ok"], res: "resultado bom", refazer: true },
      { chk: [true, false], dis: true, cls: ["erro", "erro"], res: "resultado parcial", refazer: true }],
    esc: [true, false, false],
    refl: [{ ta: true, st: ENVIADA, btn: true }, { ta: true, st: ENVIADA, btn: true }],
  }, `${W} retomada: blocos restaurados`);
  // volta tela a tela pelo teclado: tudo liberado, sem rolagem horizontal, mensagem de enviada visível
  for (let t = 5; t >= 1; t--) {
    eq(await layout(f), { hs: false, pg: false }, `${W} retomada tela ${t + 1}: layout`);
    if (t === 3) ok(await f.$eval(A + ".enviada", (e) => e.offsetParent !== null), `${W} retomada: "enviada" visível`);
    if (t <= 4 && t >= 1) ok(!(await nextDis(f)), `${W} retomada tela ${t + 1}: liberada`);
    await page.keyboard.press("ArrowLeft");
  }
  eq(await counter(f), "01 / 06", `${W} retomada: voltou ao início pelo teclado`);
  // Tentar de novo depois da retomada continua funcionando
  await f.click("#next");
  await f.click(M1 + " .btn-act.sec");
  ok(!(await f.$eval(M1 + " input", (i) => i.disabled)), `${W} retomada: tentar de novo reabilita`);
  await ctx.close();
}

// ----- modo livre (autor), sem LMS: não bloqueia, pendências contam; fallback em localStorage -----
{
  console.log("== modo livre (localStorage) ==");
  const { ctx, page } = await novaPagina({ width: 1200, height: 666 });
  await page.goto(`${BASE}/pkg/livre.html`);
  await page.waitForFunction(() => document.fonts.status === "loaded");
  eq(await page.$eval("#counter", (e) => e.textContent), "02 / 06", "livre: telaInicial 1");
  ok(!(await page.$eval("#next", (b) => b.disabled)), "livre: múltipla não bloqueia");
  eq(await page.evaluate(() => M.pendenciaTela(2)), ["Verifique suas respostas para avançar.", "Escolha uma alternativa para avançar."], "livre: pendenciaTela informativa");
  await page.click("#next"); await page.click("#next");
  ok(!(await page.$eval("#next", (b) => b.disabled)), "livre: reflexão não bloqueia");
  eq(await page.evaluate(() => { const a = document.querySelector(".slide.active .quiz-aviso"); return a.hidden; }), true, "livre: sem aviso");
  await page.fill(".slide.active textarea", "Texto de teste da reflexão no modo livre.");
  await page.click(".slide.active .bloco-q .btn-act");
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("kit-livre")));
  eq([ls["cmi.interactions.0.id"], ls["cmi.interactions.0.type"]], ["b-refl1", "fill-in"], "livre: reflexão gravada no fallback");
  await page.click("#next"); await page.click("#next");
  eq(await page.$eval("[data-fim] .pendencias", (e) => e.textContent), "Para concluir, falta: 1 tela ainda não visualizada e 2 perguntas de múltipla escolha ainda não verificadas e 1 escolha ainda não feita.", "livre: texto do fim");
  eq(await page.evaluate(() => M.pendencias()), ["1 tela ainda não visualizada", "2 perguntas de múltipla escolha ainda não verificadas", "1 escolha ainda não feita"], "livre: pendencias()");
  ok(!(await page.evaluate(() => M.concluido())), "livre: não concluído");
  await ctx.close();
}

// ----- falha ao gravar no LMS: texto fica, mensagem aparece, continua pendente -----
{
  console.log("== falha de envio ==");
  const { ctx, page } = await novaPagina({ width: 375, height: 666 });
  await page.goto(`${BASE}/moodle.html?falha=1`);
  const f = quadro(page); await pronto(f);
  // chega à tela 4 cumprindo as anteriores
  await f.click("#next");
  await f.click(A + ".opcao .opcao-txt"); await f.click(A + ".bloco-q .btn-act:not(.sec)"); await f.click("#next");
  for (const b of await f.$$(A + ".bloco-q.multipla .opcao-txt")) { await b.click(); break; }
  await f.click(A + ".bloco-q.multipla .btn-act:not(.sec)");
  await f.click(A + ".bloco-q.escolha .opcao-txt"); await f.click("#next");
  eq(await counter(f), "04 / 06", "falha: tela da reflexão");
  await f.fill(A + "textarea", "Um texto com mais de vinte caracteres.");
  await f.click(A + ".bloco-q .btn-act");
  const r = await f.$eval(A + ".bloco-q", (b) => ({ st: b.querySelector(".refl-status").textContent, ro: b.querySelector("textarea").readOnly, v: b.querySelector("textarea").value, btn: b.querySelector(".btn-act").hidden }));
  eq(r, { st: "Não foi possível enviar agora. Seu texto continua na tela: tente novamente.", ro: false, v: "Um texto com mais de vinte caracteres.", btn: false }, "falha: mensagem e texto preservado");
  ok(await nextDis(f), "falha: continua bloqueada");
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

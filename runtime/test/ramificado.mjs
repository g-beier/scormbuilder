// Descartável (não vai para o pacote): testa o bloco "ramificado" (M6) com a fixture
// fixtures/ramificado-v2.data.js, em 1200x666 e 375x666: caminhos, voltar, resumo, registro
// em cmi.interactions, falha de gravação, retomada no meio e depois de registrar, conclusão.
// O pacote roda num iframe de 666px dentro de uma página "Moodle" com uma API SCORM 1.2 simulada
// (window.API no pai), para inspecionar cmi.interactions, suspend_data e lesson_status.
// Uso: node runtime/test/ramificado.mjs <saida>      (ex.: "$TMPDIR"cev-m6)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const SAIDA = process.argv[2] && path.resolve(process.argv[2], "ram");
if (!SAIDA) { console.error("uso: node ramificado.mjs <saida>"); process.exit(1); }

// ---------- monta o pacote de teste ----------
const PKG = path.join(SAIDA, "pkg");
fs.rmSync(SAIDA, { recursive: true, force: true });
for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(PKG, d), { recursive: true });
fs.copyFileSync(path.join(AQUI, "fixtures/ramificado-v2.data.js"), path.join(PKG, "js/data.js"));
const idx = fs.readFileSync(path.join(RUNTIME, "index.html"), "utf8").split("{{TITULO}}").join("Caminhos");
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
const Q = A + ".bloco-q.ramificado ";
const visivel = (f) => f.evaluate(() => {
  const box = document.querySelector(".slide.active .bloco-q.ramificado");
  const fim = box.querySelector(".ram-fim");
  if (!fim.hidden) return "fim";
  const secs = [...box.querySelectorAll(".ram-pergunta")];
  return secs.findIndex((s) => !s.hidden) + 1;
});
const sec = (n) => Q + `.ram-pergunta:nth-of-type(${n}) `;
const escolher = (f, n, j) => f.click(sec(n) + `.opcao:nth-child(${j}) .opcao-txt`);
const retorno = (f, n) => f.$eval(sec(n) + ".escolha-retorno", (e) => e.textContent);
const botaoProx = (f, n) => f.$eval(sec(n) + ".ram-nav .btn-act:not(.sec)", (b) => ({ t: b.textContent, d: b.disabled }));
const resumo = (f) => f.$$eval(Q + ".ram-resumo li", (l) => l.map((li) => li.value + "|" + li.querySelector(".ram-resumo-r").textContent));
const interacoes = (d) => Object.keys(d).filter((k) => /^cmi\.interactions\.\d+\.(id|student_response)$/.test(k)).sort().map((k) => d[k]);

for (const vp of [{ width: 1200, height: 666 }, { width: 375, height: 666 }]) {
  console.log(`== ${vp.width}x${vp.height} ==`);
  const W = vp.width;
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`${BASE}/moodle.html`);
  let f = quadro(page);
  await pronto(f);
  await f.click("#next");
  eq(await counter(f), "02 / 03", `${W} tela do questionário`);
  ok(await nextDis(f), `${W} bloqueada`);
  eq(await aviso(f), "Responda o questionário até o fim e registre as respostas para avançar.", `${W} aviso`);
  eq(await visivel(f), 1, `${W} começa na pergunta 1`);
  eq(await f.$eval(sec(1) + ".ram-nav .btn-act.sec", (b) => b.hidden), true, `${W} sem Voltar na 1`);
  eq(await botaoProx(f, 1), { t: "Próxima pergunta", d: true }, `${W} Próxima desabilitada sem resposta`);
  eq(await retorno(f, 1), "Escolha uma alternativa para continuar.", `${W} dica sem resposta`);

  // 1 → Não → 2
  await escolher(f, 1, 2);
  eq(await retorno(f, 1), "RetornoSiga para a pergunta 2.", `${W} retorno da alternativa`);
  eq(await f.$eval(sec(1) + ".bloco-perg", (e) => e.textContent), "Pergunta 1A UEL tem CNPJ próprio?", `${W} número dentro do enunciado`);
  eq(await botaoProx(f, 1), { t: "Próxima pergunta", d: false }, `${W} Próxima liberada`);
  await f.click(sec(1) + ".ram-nav .btn-act:not(.sec)");
  eq(await visivel(f), 2, `${W} caminho 1 → 2`);
  eq(await f.evaluate(() => document.activeElement.className), "bloco-perg", `${W} foco no enunciado`);
  await page.keyboard.press("ArrowLeft");
  eq(await counter(f), "02 / 03", `${W} seta no enunciado não troca de tela`);
  // retorno vazio não mostra card; caracteres especiais via textContent
  await escolher(f, 2, 2);
  eq(await retorno(f, 2), "", `${W} retorno vazio (sem card nem dica)`);
  await escolher(f, 2, 1);
  eq(await retorno(f, 2), "RetornoUEL patrocinada & <ok>.", `${W} retorno com & e < literais`);
  // voltar e trocar: 1 → Sim → 3
  await f.click(sec(2) + ".ram-nav .btn-act.sec");
  eq(await visivel(f), 1, `${W} voltar`);
  await escolher(f, 1, 1);
  await f.click(sec(1) + ".ram-nav .btn-act:not(.sec)");
  eq(await visivel(f), 3, `${W} caminho 1 → 3`);
  await escolher(f, 3, 2);
  await f.click(sec(3) + ".ram-nav .btn-act:not(.sec)");
  eq(await visivel(f), 4, `${W} 3 → 4`);
  // seta no rádio não troca de tela
  await f.focus(sec(4) + "input");
  await page.keyboard.press("ArrowRight");
  eq(await counter(f), "02 / 03", `${W} seta no rádio não troca de tela`);
  await escolher(f, 4, 1);
  eq(await botaoProx(f, 4), { t: "Ver resumo", d: false }, `${W} última: Ver resumo`);
  await f.click(sec(4) + ".ram-nav .btn-act:not(.sec)");
  eq(await visivel(f), "fim", `${W} resumo`);
  eq(await resumo(f), ["1|Sim.", "3|De um adulto.", "4|Associação própria."], `${W} resumo só do caminho`);
  ok(await nextDis(f), `${W} ainda bloqueada antes de registrar`);
  const sd = JSON.parse((await lms(page))["cmi.suspend_data"]).b["1.0"];
  eq(sd, { r: [0, 0, 1, 0] }, `${W} estado parcial salvo`);
  const lay = await layout(f);
  ok(!lay.hs && !lay.pg, `${W} sem rolagem horizontal (${JSON.stringify(lay)})`);

  // retomada no meio: volta ao resumo (caminho completo, não registrado)
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "pkg/index.html"; }));
  f = quadro(page); await pronto(f);
  eq(await counter(f), "02 / 03", `${W} retomada: tela 2`);
  eq(await visivel(f), "fim", `${W} retomada: resumo`);

  // registrar
  await f.click(Q + ".ram-fim .btn-act:not(.sec)");
  const d = await lms(page);
  eq(interacoes(d), ["b-q-P1", "Pergunta 1: A UEL tem CNPJ próprio? → Sim.", "b-q-P3", "Pergunta 3: Em nome de quem está a conta? → De um adulto.", "b-q-P4", "Pergunta 4: Registre a situação da UEL. → Associação própria."], `${W} interações`);
  eq(await f.$eval(Q + ".refl-status", (e) => e.textContent), "✓ Respostas registradas. Obrigado.", `${W} confirmação`);
  eq(await f.evaluate(() => document.activeElement.className), "refl-status", `${W} foco na confirmação`);
  ok(!(await nextDis(f)), `${W} libera após registrar`);
  eq(JSON.parse(d["cmi.suspend_data"]).b["1.0"], { r: [0, 0, 1, 0], e: 1 }, `${W} estado registrado`);
  await f.click("#next");
  eq((await lms(page))["cmi.core.lesson_status"], "completed", `${W} concluído`);

  // retomada depois de registrar
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "pkg/index.html"; }));
  f = quadro(page); await pronto(f);
  await f.click("#prev");
  eq(await visivel(f), "fim", `${W} retomada registrada: resumo`);
  eq(await f.$eval(Q + ".ram-fim .btn-act:not(.sec)", (b) => b.hidden), true, `${W} sem botão de registrar`);
  ok(await f.$$eval(Q + "input", (l) => l.every((i) => i.disabled)), `${W} alternativas travadas`);
  ok(!(await nextDis(f)), `${W} retomada: liberada`);
  await ctx.close();
}

{
  console.log("== falha de registro ==");
  const { ctx, page } = await novaPagina({ width: 375, height: 666 });
  await page.goto(`${BASE}/moodle.html?falha=1`);
  const f = quadro(page); await pronto(f);
  await f.click("#next");
  await escolher(f, 1, 2); await f.click(sec(1) + ".ram-nav .btn-act:not(.sec)");
  await escolher(f, 2, 2); await f.click(sec(2) + ".ram-nav .btn-act:not(.sec)");
  eq(await visivel(f), 4, "falha: 2 → 4");
  await escolher(f, 4, 2); await f.click(sec(4) + ".ram-nav .btn-act:not(.sec)");
  eq(await resumo(f), ["1|Não.", "2|Não.", "4|Tenho dúvida."], "falha: resumo");
  await f.click(Q + ".ram-fim .btn-act:not(.sec)");
  eq(await f.$eval(Q + ".refl-status", (e) => e.textContent), "Não foi possível registrar agora. Suas respostas continuam na tela: tente novamente.", "falha: mensagem");
  ok(await nextDis(f), "falha: continua bloqueada");
  ok(!(await f.$eval(Q + ".ram-fim .btn-act:not(.sec)", (b) => b.hidden)), "falha: botão continua");
  // revisar volta à pergunta 1 com a resposta marcada
  await f.click(Q + ".ram-fim .btn-act.sec");
  eq(await visivel(f), 1, "falha: revisar desde a 1");
  ok(await f.$eval(sec(1) + ".opcao:nth-child(2) input", (i) => i.checked), "falha: resposta mantida");
  await ctx.close();
}

{
  console.log("== estado inválido ==");
  const { ctx, page } = await novaPagina({ width: 1200, height: 666 });
  await page.goto(`${BASE}/moodle.html`);
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "about:blank"; }));
  await page.evaluate(() => { window.__lms["cmi.suspend_data"] = JSON.stringify({ v: [0, 1], b: { "1.0": { r: [0, 5, 0, 0], e: 1 } } }); window.__lms["cmi.core.lesson_location"] = "1"; });
  await page.evaluate(() => new Promise((r) => { const fr = document.getElementById("f"); fr.onload = r; fr.src = "pkg/index.html"; }));
  const f = quadro(page); await pronto(f);
  eq(await visivel(f), 1, "estado inválido: começa na 1");
  ok(await nextDis(f), "estado inválido: bloqueada");
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

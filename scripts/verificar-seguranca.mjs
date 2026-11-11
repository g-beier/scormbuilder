/**
 * Verificação do M8 em navegador real (Chromium e WebKit, o motor do WKWebView):
 * serve o `dist/` com a CSP do `src-tauri/tauri.conf.json` (como o Tauri faz com
 * os .html) e confere:
 *  1. a importação: o worker do build avalia data.js; código malicioso não alcança
 *     window/document/objetos do app nem a rede; laço infinito é interrompido;
 *  2. a prévia: iframe sandbox sem allow-same-origin, motor abre com as fontes,
 *     sem violação de CSP, "Situação SCORM" atualiza, salto de tela pelo editor,
 *     e o iframe não alcança o app;
 *  3. imagens (M9): uma imagem `data:` num srcdoc com o mesmo sandbox carrega sob a CSP.
 * Uso: npm run verificar-seguranca (faz o build e roda este script)
 */
import http from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(RAIZ, "dist");
const CSP = JSON.parse(readFileSync(join(RAIZ, "src-tauri", "tauri.conf.json"), "utf8")).app.security.csp;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

if (!existsSync(join(DIST, "index.html"))) {
  console.error("Rode `npm run build` antes.");
  process.exit(2);
}

const servidor = http.createServer((req, res) => {
  const caminho = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let arq = normalize(join(DIST, caminho));
  if (!arq.startsWith(DIST) || !existsSync(arq) || statSync(arq).isDirectory()) arq = join(DIST, "index.html");
  res.setHeader("Content-Type", TIPOS[extname(arq)] ?? "application/octet-stream");
  if (extname(arq) === ".html") res.setHeader("Content-Security-Policy", CSP);
  res.end(readFileSync(arq));
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const URL_APP = `http://127.0.0.1:${servidor.address().port}/`;
const PNG = "data:image/png;base64," + readFileSync(join(RAIZ, "runtime", "test", "fixtures", "img", "paisagem.png")).toString("base64");
const worker = "/assets/" + readdirSync(join(DIST, "assets")).find((n) => /^avaliador\.worker-.*\.js$/.test(n));

let falhas = 0;
function conferir(nome, ok, detalhe = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHOU"} ${nome}${!ok && detalhe ? ` — ${detalhe}` : ""}`);
}

for (const [nomeNav, tipo] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  console.log(`\n== ${nomeNav} ==`);
  const nav = await tipo.launch();
  const pagina = await nav.newPage({ viewport: { width: 1500, height: 1000 } });
  const violacoes = [];
  const erros = [];
  pagina.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violacoes.push(m.text());
    else if (m.type() === "error") erros.push(m.text());
  });
  pagina.on("pageerror", (e) => erros.push(String(e)));
  await pagina.addInitScript(() => {
    // Marcador no window do app (um __TAURI_INTERNALS__ falso faria o app tentar falar com o Tauri).
    window.__SEGREDO_DO_APP__ = { segredo: "nao-pode-vazar" };
    window.__violacoes = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violacoes.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await pagina.goto(URL_APP);

  // ---------- 1. Importação (worker do build) ----------
  const avaliar = (fonte, ms = 3000) =>
    pagina.evaluate(
      ([url, fonte, ms]) =>
        new Promise((ok) => {
          const w = new Worker(url);
          const t = setTimeout(() => (w.terminate(), ok({ tempo: true })), ms);
          w.onmessage = (e) => (clearTimeout(t), w.terminate(), ok(e.data));
          w.onerror = (e) => (clearTimeout(t), w.terminate(), ok({ erroWorker: e.message }));
          w.postMessage({ fonte });
        }),
      [worker, fonte, ms],
    );
  const r1 = await avaliar(`var CONTEUDO = { slides: [{ tipo: "capa" }] };`);
  conferir("worker avalia data.js (var CONTEUDO)", r1.ok === true && r1.valor.slides[0].tipo === "capa", JSON.stringify(r1));
  const r2 = await avaliar(`
    var g = ({}).constructor.constructor("return this")();
    var rede = "bloqueada";
    try { if (g.fetch) { g.fetch("${URL_APP}?vazou"); rede = "aberta"; } } catch (e) {}
    try { if (g.importScripts) { rede = "aberta"; } } catch (e) {}
    window.CONTEUDO = { slides: [], doc: typeof g.document, win: typeof g.window, tauri: typeof g.__TAURI_INTERNALS__, segredo: typeof g.__SEGREDO_DO_APP__,
      parent: typeof g.parent, rede: rede, idb: typeof g.indexedDB };`);
  conferir(
    "data.js malicioso não alcança window/document/Tauri/rede",
    r2.ok && r2.valor.doc === "undefined" && r2.valor.win === "undefined" && r2.valor.tauri === "undefined" && r2.valor.segredo === "undefined" &&
      r2.valor.parent === "undefined" && r2.valor.rede === "bloqueada" && r2.valor.idb === "undefined",
    JSON.stringify(r2),
  );
  const r3 = await avaliar(`while (true) {}`, 1500);
  conferir("laço infinito é interrompido", r3.tempo === true, JSON.stringify(r3));
  conferir("app intacto", (await pagina.evaluate(() => window.__SEGREDO_DO_APP__.segredo)) === "nao-pode-vazar");

  // ---------- 2. Prévia ----------
  await pagina.getByRole("button", { name: /Novo SCORM/ }).click();
  await pagina.locator("#form-novo [data-autofoco]").fill("Teste de segurança");
  await pagina.locator("#form-novo input[type=number]").first().fill("3");
  await pagina.locator('button[type=submit][form="form-novo"]').click();
  const iframe = pagina.locator(".painel-previa iframe");
  await iframe.waitFor();
  conferir("iframe com sandbox sem allow-same-origin", (await iframe.getAttribute("sandbox")) === "allow-scripts allow-popups allow-popups-to-escape-sandbox");
  const quadro = pagina.frameLocator(".painel-previa iframe");
  await quadro.locator("#counter").waitFor({ timeout: 10000 });
  await pagina.waitForTimeout(800);
  const dentro = await (await iframe.elementHandle()).contentFrame();
  const info = await dentro.evaluate(async () => {
    await document.fonts.ready;
    let pai = "";
    try {
      pai = String(window.parent.__SEGREDO_DO_APP__);
    } catch (e) {
      pai = "bloqueado: " + e.name;
    }
    let ls = "";
    try {
      localStorage.getItem("x");
      ls = "acessível";
    } catch (e) {
      ls = "bloqueado";
    }
    return {
      origem: location.origin,
      pai,
      ls,
      contador: document.getElementById("counter").textContent,
      poppins: document.fonts.check("16px Poppins"),
      krona: document.fonts.check("16px 'Krona One'"),
      familia: getComputedStyle(document.body).fontFamily,
    };
  });
  conferir("iframe com origem opaca", info.origem === "null", info.origem);
  conferir("iframe não alcança o app", info.pai.startsWith("bloqueado"), info.pai);
  conferir("motor abriu", /\d+ \/ \d+/.test(info.contador), info.contador);
  conferir("fontes do tema carregadas (data:)", info.poppins && info.krona && /Poppins/.test(info.familia), JSON.stringify(info));
  const aviso = await pagina.locator(".previa-aviso").count();
  conferir("sem aviso de falha na prévia", aviso === 0);

  // Situação SCORM
  await pagina.locator(".situacao-scorm summary").click();
  const situacao = await pagina.locator(".situacao-scorm").innerText();
  conferir("Situação SCORM: LMS simulado conectado e em andamento", /conectado\./.test(situacao) && /incomplete/.test(situacao), situacao);

  // Navegar no iframe atualiza lesson_location
  await quadro.locator("#next").click();
  await pagina.waitForTimeout(300);
  const sit2 = await pagina.locator(".situacao-scorm").innerText();
  conferir("navegar na prévia grava 'onde parou'", /tela 2/.test(sit2), sit2);

  // Editor → prévia: clicar na 1ª tela da lista salta para ela
  await pagina.locator("[data-slide] .slide-botao").first().click();
  await pagina.waitForTimeout(500);
  const cont3 = await quadro.locator("#counter").innerText();
  conferir("selecionar tela no editor salta a prévia (por mensagem)", /^01 \//.test(cont3), cont3);

  // Reiniciar progresso
  await pagina.getByRole("button", { name: "Reiniciar progresso" }).click();
  await pagina.waitForTimeout(800);
  await quadro.locator("#counter").waitFor();
  const sit4 = await pagina.locator(".situacao-scorm").innerText();
  conferir("reiniciar progresso recarrega com LMS limpo", /tela 1/.test(sit4) && /incomplete/.test(sit4), sit4);

  // Modo aluno até o fim: concluída
  await pagina.getByRole("button", { name: "Modo aluno" }).click();
  await pagina.waitForTimeout(800);
  await quadro.locator("#counter").waitFor();
  for (let i = 0; i < 5 && !/completed/.test(await pagina.locator(".situacao-scorm").innerText()); i++) {
    await quadro.locator("#next").click().catch(() => {});
    await pagina.waitForTimeout(300);
  }
  const sit5 = await pagina.locator(".situacao-scorm").innerText();
  conferir("modo aluno até o fim: lesson_status completed", /completed/.test(sit5), sit5);

  // ---------- 3. Imagem data: no srcdoc isolado (como a prévia faz com img/<arquivo>) ----------
  await pagina.evaluate((png) => {
    const f = document.createElement("iframe");
    f.id = "teste-imagem";
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    f.srcdoc = `<!doctype html><img id="i" alt="teste" src="${png}">`;
    document.body.appendChild(f);
  }, PNG);
  const quadroImg = await (await pagina.locator("#teste-imagem").elementHandle()).contentFrame();
  await quadroImg.waitForSelector("#i");
  const largura = await quadroImg.evaluate(
    () =>
      new Promise((ok) => {
        const i = document.getElementById("i");
        if (i.complete) ok(i.naturalWidth);
        else {
          i.onload = () => ok(i.naturalWidth);
          i.onerror = () => ok(0);
        }
      }),
  );
  conferir("imagem data: carrega no srcdoc isolado sob a CSP", largura > 0, String(largura));
  await pagina.evaluate(() => document.getElementById("teste-imagem")?.remove());

  const v = await pagina.evaluate(() => window.__violacoes);
  conferir("nenhuma violação de CSP", v.length === 0 && violacoes.length === 0, JSON.stringify([...v, ...violacoes]));
  conferir("nenhum erro no console", erros.length === 0, erros.join(" | "));
  await nav.close();
}

servidor.close();
console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

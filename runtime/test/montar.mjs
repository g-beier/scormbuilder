// Descartável (não vai para o pacote): converte data.js LEITURA2 legado -> formato 2 e
// monta pacotes de teste fora do repositório.
// Uso: node runtime/test/montar.mjs <saida> [UD ...]   (padrão: todas as LEITURA2)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(AQUI, "..");
const EAD = path.join(process.env.HOME, "Dev/ead-scorm");
const REF = path.join(EAD, "CTGESTAO_UD18_LEITURA2"); // app.js e tema.css de referência

export function lerLegado(arquivo) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(arquivo, "utf8"), ctx, { filename: arquivo });
  return ctx.window.CONTEUDO;
}

// Igual ao expandirFluxos do app.js: 2+ fluxos viram uma tela por fluxo
function expandirFluxos(slides) {
  const out = [];
  slides.forEach((s) => {
    if (!s.fluxos || s.fluxos.length < 2) { out.push(s); return; }
    const n = s.fluxos.length;
    s.fluxos.forEach((f, k) => {
      const ultimo = k === n - 1;
      out.push({
        kicker: (s.kicker || "") + " · " + (k + 1) + " de " + n,
        titulo: s.titulo,
        paras: k === 0 ? s.paras : null,
        fluxos: [f],
        contraste: ultimo ? s.contraste : null,
        destaque: ultimo ? s.destaque : null,
        fonte: ultimo ? s.fonte : null,
      });
    });
  });
  return out;
}

export function converter(legado, id) {
  const slides = expandirFluxos(legado.slides).map((s, i) => {
    const sid = "s" + (i + 1);
    if (s.tipo === "capa") return { id: sid, tipo: "capa", kicker: s.kicker, titulo: s.titulo, sub: s.sub };
    if (s.tipo === "fim") return { id: sid, tipo: "fim", titulo: s.titulo, texto: s.texto };
    const blocos = [];
    let n = 0;
    const bid = () => sid + "b" + ++n;
    if (s.paras) blocos.push({ id: bid(), tipo: "texto", paras: s.paras });
    if (s.lista) blocos.push({ id: bid(), tipo: "lista", itens: s.lista });
    if (s.cards && s.cards.length) {
      const b = { id: bid(), tipo: "cards", cards: s.cards };
      if (s.colunas) b.colunas = s.colunas;
      blocos.push(b);
    }
    (s.fluxos || []).forEach((f) => {
      const b = { id: bid(), tipo: "ordenar", nome: f.nome, passos: f.passos, porque: f.porque };
      if (f.nota) b.nota = f.nota;
      blocos.push(b);
    });
    if (s.linha) blocos.push({ id: bid(), tipo: "linha", itens: s.linha });
    if (s.quiz) blocos.push({ id: bid(), tipo: "quiz", perguntas: s.quiz });
    if (s.contraste) blocos.push({ id: bid(), tipo: "contraste", itens: s.contraste });
    if (s.destaque) blocos.push({ id: bid(), tipo: "destaque", html: s.destaque });
    (s.modais || []).forEach((m) => blocos.push({ id: m.id, tipo: "confira", botao: m.botao, titulo: m.titulo, paras: m.paras }));
    if (s.fonte) blocos.push({ id: bid(), tipo: "fonte", html: s.fonte });
    const out = { id: sid, tipo: "conteudo", titulo: s.titulo, blocos };
    if (s.kicker) out.kicker = s.kicker;
    return out;
  });
  return { formato: 2, id, contexto: legado.contexto, titulo: legado.titulo || "", slides };
}

function tituloDoIndex(dir) {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  return html.match(/<title>([^<]*)<\/title>/)[1];
}

export function montar(saida, ud) {
  const src = path.join(EAD, ud);
  // Original: pacote como está, com app.js e tema.css da UD18 (compatíveis)
  const orig = path.join(saida, "orig", ud);
  fs.rmSync(orig, { recursive: true, force: true });
  fs.cpSync(src, orig, { recursive: true });
  fs.copyFileSync(path.join(REF, "js/app.js"), path.join(orig, "js/app.js"));
  fs.copyFileSync(path.join(REF, "css/tema.css"), path.join(orig, "css/tema.css"));

  // v2: runtime + data.js convertido
  const v2 = path.join(saida, "v2", ud);
  fs.rmSync(v2, { recursive: true, force: true });
  for (const d of ["css", "fonts", "js"]) fs.cpSync(path.join(RUNTIME, d), path.join(v2, d), { recursive: true });
  const titulo = tituloDoIndex(src);
  const C = converter(lerLegado(path.join(src, "js/data.js")), ud);
  C.titulo = titulo;
  fs.writeFileSync(path.join(v2, "js/data.js"), "window.CONTEUDO = " + JSON.stringify(C, null, 2) + ";\n");
  const idx = fs.readFileSync(path.join(RUNTIME, "index.html"), "utf8").split("{{TITULO}}").join(titulo);
  fs.writeFileSync(path.join(v2, "index.html"), idx);
  return { orig, v2, telas: C.slides.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = process.argv[2];
  if (!saida) { console.error("uso: node montar.mjs <saida> [UD ...]"); process.exit(1); }
  let uds = process.argv.slice(3);
  if (!uds.length) uds = fs.readdirSync(EAD).filter((d) => /_LEITURA2$/.test(d)).sort();
  for (const ud of uds) {
    const r = montar(saida, ud);
    console.log(ud, r.telas, "telas");
  }
}

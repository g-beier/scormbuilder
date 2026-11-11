/**
 * Monta o documento da prévia a partir do `runtime/index.html` real. Função pura.
 *
 * A prévia roda num iframe `sandbox` sem `allow-same-origin` (origem opaca): o
 * conteúdo não alcança o `window` do app nem os comandos do Tauri. Por isso:
 * - o `tema.css` vai inline, com as fontes embutidas como `data:` (fonte de
 *   origem opaca exigiria CORS);
 * - `motor.js` e `scorm.js` continuam vindo de `/runtime/` (via `<base>`): script
 *   clássico não precisa de CORS e passa na CSP do app (`script-src 'self'`);
 * - nenhum `<script>` inline (a CSP do app vale também no srcdoc): CONTEUDO,
 *   opções e o estado SCORM inicial vão num bloco JSON, e a `previa/ponte.js`
 *   (arquivo estático do app) cria a API SCORM simulada e chama `Motor.iniciar`;
 * - imagens: o iframe não alcança a pasta do rascunho, então `img/<arquivo>`
 *   vira o `data:` de `imagens` (a CSP do app já aceita `img-src data:`).
 */
import type { ConteudoV2 } from "../modelo/tipos";
import { escaparHtml } from "../modelo/texto";
import { trocarImagens } from "../modelo/imagens";

/** Estado SCORM que a ponte usa para responder às leituras síncronas do motor. */
export interface EstadoScormInicial {
  /** Valores gravados até agora (cmi.*). */
  dados: Record<string, string>;
  /** Respostas fixas (aluno, crédito, entry…), ver `valoresFixos` em apiScorm.ts. */
  fixos: Record<string, string>;
}

export interface OpcoesPrevia {
  /** URL absoluta da pasta do runtime, terminada em "/". */
  base: string;
  /** URL absoluta da `previa/ponte.js`. */
  ponte: string;
  /** `tema.css` já com as fontes embutidas (ver `cssComFontesEmbutidas`). */
  css: string;
  titulo: string;
  conteudo: ConteudoV2;
  chave: string;
  telaInicial: number;
  livre: boolean;
  /** Identifica a carga do iframe nas mensagens (ver ponteScorm.ts). */
  sessao: string;
  scorm: EstadoScormInicial;
  /** `data:` URL de cada imagem (chave = nome em `img/`). Faltando: fica `img/<nome>`. */
  imagens?: Readonly<Record<string, string>>;
}

/** Id do bloco JSON lido pela ponte. */
export const ID_DADOS = "previa-dados";

/** JSON seguro dentro de `<script>`: nada de `</script>`, `<!--` nem separadores de linha. */
export function jsonParaScript(valor: unknown): string {
  return JSON.stringify(valor)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Troca `url("../fonts/<arquivo>")` do tema pelos `data:` de `fontes`
 * (chave = nome do arquivo). Fonte sem `data:` fica como está.
 */
export function cssComFontesEmbutidas(css: string, fontes: Record<string, string>): string {
  return css.replace(/url\(\s*(["']?)\.\.\/fonts\/([^"')]+)\1\s*\)/g, (orig, _q: string, nome: string) =>
    fontes[nome] ? `url("${fontes[nome]}")` : orig,
  );
}

function substituirUma(texto: string, alvo: string | RegExp, por: string): string {
  const achou = typeof alvo === "string" ? texto.includes(alvo) : alvo.test(texto);
  if (!achou) throw new Error(`runtime/index.html mudou: não encontrei ${String(alvo)}`);
  return texto.replace(alvo, () => por);
}

export function montarSrcdoc(modelo: string, o: OpcoesPrevia): string {
  const dados = {
    sessao: o.sessao,
    conteudo: o.imagens ? trocarImagens(o.conteudo, o.imagens) : o.conteudo,
    opcoes: { chave: o.chave, telaInicial: o.telaInicial, livre: o.livre },
    scorm: o.scorm,
  };
  let html = modelo.split("{{TITULO}}").join(escaparHtml(o.titulo));
  html = substituirUma(html, /<head>/i, `<head>\n<base href="${escaparHtml(o.base)}">`);
  html = substituirUma(
    html,
    /<link rel="stylesheet" href="css\/tema\.css">/,
    `<style>\n${o.css.replace(/<\/style/gi, "<\\/style")}\n</style>`,
  );
  html = substituirUma(
    html,
    /<script src="js\/data\.js"><\/script>/,
    `<script type="application/json" id="${ID_DADOS}">${jsonParaScript(dados)}</script>`,
  );
  html = substituirUma(
    html,
    /<script>\s*Motor\.iniciar\(window\.CONTEUDO\);\s*<\/script>/,
    `<script src="${escaparHtml(o.ponte)}"></script>`,
  );
  return html;
}

/**
 * Monta o documento da prévia a partir do `runtime/index.html` real: título
 * escapado, `<base>` apontando para `/runtime/`, CONTEUDO inline (no lugar do
 * `js/data.js`) e `Motor.iniciar` com as opções da prévia. Função pura.
 */
import type { ConteudoV2 } from "../modelo/tipos";
import { escaparHtml } from "../modelo/texto";

export interface OpcoesPrevia {
  /** URL absoluta da pasta do runtime, terminada em "/". */
  base: string;
  titulo: string;
  conteudo: ConteudoV2;
  chave: string;
  telaInicial: number;
  livre: boolean;
}

/** Nome da variável global, no iframe, com o handle devolvido por Motor.iniciar. */
export const HANDLE_GLOBAL = "__previa";

/** JSON seguro dentro de `<script>`: nada de `</script>`, `<!--` nem separadores de linha. */
export function jsonParaScript(valor: unknown): string {
  return JSON.stringify(valor)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function substituirUma(texto: string, alvo: string | RegExp, por: string): string {
  const achou = typeof alvo === "string" ? texto.includes(alvo) : alvo.test(texto);
  if (!achou) throw new Error(`runtime/index.html mudou: não encontrei ${String(alvo)}`);
  return texto.replace(alvo, () => por);
}

export function montarSrcdoc(modelo: string, o: OpcoesPrevia): string {
  const opcoes = { chave: o.chave, telaInicial: o.telaInicial, livre: o.livre };
  let html = modelo.split("{{TITULO}}").join(escaparHtml(o.titulo));
  html = substituirUma(html, /<head>/i, `<head>\n<base href="${escaparHtml(o.base)}">`);
  html = substituirUma(
    html,
    /<script src="js\/data\.js"><\/script>/,
    `<script>window.CONTEUDO = ${jsonParaScript(o.conteudo)};</script>`,
  );
  html = substituirUma(
    html,
    /<script>\s*Motor\.iniciar\(window\.CONTEUDO\);\s*<\/script>/,
    `<script>window.${HANDLE_GLOBAL} = Motor.iniciar(window.CONTEUDO, ${jsonParaScript(opcoes)});</script>`,
  );
  return html;
}

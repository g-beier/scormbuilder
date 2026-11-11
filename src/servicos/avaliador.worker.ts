/**
 * Web Worker de uso único que executa o `data.js` importado.
 *
 * O worker não tem `window`, `document`, `parent` nem os objetos internos do
 * Tauri (que só existem no documento principal), e o app o encerra ao terminar
 * ou ao estourar o tempo. Antes de executar, as APIs de rede e armazenamento
 * ficam inacessíveis (`bloquearApis`).
 */
import { avaliarParaResposta, bloquearApis, type PedidoAvaliacao } from "./avaliadorNucleo";

const escopo = self as unknown as { onmessage: ((e: MessageEvent<PedidoAvaliacao>) => void) | null };
const responder = self.postMessage.bind(self) as (m: unknown) => void;

escopo.onmessage = (e) => {
  escopo.onmessage = null;
  bloquearApis(self);
  const fonte = typeof e.data?.fonte === "string" ? e.data.fonte : "";
  responder(avaliarParaResposta(fonte));
};

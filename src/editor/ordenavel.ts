/** Configuração comum do dnd-kit (sensores, textos para leitor de tela em pt-BR). */
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * `soPonteiro`: sem o sensor de teclado do dnd-kit. Na faixa horizontal ele rola o
 * contêiner e pula posições; lá o teclado usa Alt + ←/→ (ver ListaSlides).
 */
export function useSensoresOrdenaveis(soPonteiro = false) {
  // Distância mínima: um clique simples não inicia arrasto.
  const ponteiro = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const teclado = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  return useSensors(ponteiro, ...(soPonteiro ? [] : [teclado]));
}

export const instrucoesLeitor: ScreenReaderInstructions = {
  draggable:
    "Para mudar a posição, pressione Espaço, use as setas para cima e para baixo e pressione Espaço de novo para soltar. Esc cancela.",
};

/** `nome(id)` descreve o item; `posicao(id)` dá a posição (1-based) atual. */
export function anuncios(nome: (id: string) => string, posicao: (id: string) => number, total: () => number): Announcements {
  return {
    onDragStart: ({ active }) => `${nome(String(active.id))} selecionado, na posição ${posicao(String(active.id))} de ${total()}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nome(String(active.id))} na posição ${posicao(String(over.id))} de ${total()}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nome(String(active.id))} solto na posição ${posicao(String(over.id))} de ${total()}.` : `${nome(String(active.id))} solto.`,
    onDragCancel: ({ active }) => `Movimento cancelado. ${nome(String(active.id))} voltou para a posição original.`,
  };
}

/** Arrasto só na vertical (listas de uma coluna). */
export const soVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Arrasto só na horizontal (faixas de uma linha). */
export const soHorizontal: Modifier = ({ transform }) => ({ ...transform, y: 0 });


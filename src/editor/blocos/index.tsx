import type { ComponentType } from "react";
import type { Bloco, TipoBloco } from "../../modelo/tipos";
import type { PropsFormBloco } from "./comum";
import { FormTexto } from "./FormTexto";
import { FormLista } from "./FormLista";
import { FormCards } from "./FormCards";
import { FormOrdenar } from "./FormOrdenar";
import { FormLinha } from "./FormLinha";
import { FormQuiz } from "./FormQuiz";
import { FormContraste } from "./FormContraste";
import { FormDestaque, FormFonte } from "./FormDestaque";
import { FormConfira } from "./FormConfira";
import { FormMultipla } from "./FormMultipla";
import { FormReflexao } from "./FormReflexao";
import { FormEscolha } from "./FormEscolha";
import { FormCategorizar } from "./FormCategorizar";
import { FormRamificado } from "./FormRamificado";
import { FormImagem } from "./FormImagem";

/** Form de cada tipo de bloco. */
export const FORMS_BLOCO: { [T in TipoBloco]: ComponentType<PropsFormBloco<Extract<Bloco, { tipo: T }>>> } = {
  texto: FormTexto,
  lista: FormLista,
  cards: FormCards,
  ordenar: FormOrdenar,
  linha: FormLinha,
  quiz: FormQuiz,
  contraste: FormContraste,
  destaque: FormDestaque,
  confira: FormConfira,
  fonte: FormFonte,
  multipla: FormMultipla,
  reflexao: FormReflexao,
  escolha: FormEscolha,
  categorizar: FormCategorizar,
  ramificado: FormRamificado,
  imagem: FormImagem,
};

/** Descrição curta de cada tipo, para o menu "Adicionar bloco". */
export const DESCRICOES_BLOCO: Record<TipoBloco, string> = {
  texto: "Um ou mais parágrafos de texto corrido.",
  lista: "Itens com marcadores.",
  cards: "Cartões coloridos com título e texto, lado a lado.",
  ordenar: "O aluno arrasta passos para a ordem certa.",
  linha: "Marcos numerados, de cima para baixo.",
  quiz: "Perguntas de escolha única, com explicação.",
  contraste: "Comparação lado a lado (ex.: evite × prefira).",
  destaque: "Caixa colorida com a ideia principal.",
  confira: "Botão que abre uma janela com mais detalhes.",
  fonte: "Referência ou link para a fonte, em letra pequena.",
  multipla: "Pergunta com uma ou mais alternativas certas, cada uma comentada.",
  reflexao: "O aluno escreve uma resposta livre, sem nota.",
  escolha: "Sem certo ou errado: cada alternativa mostra um retorno.",
  categorizar: "O aluno arrasta cada item para a categoria certa e clica em Verificar.",
  ramificado: "Uma pergunta por vez; cada resposta leva a outra pergunta. Sem nota.",
  imagem: "Foto, mapa ou ilustração, com descrição e legenda.",
};

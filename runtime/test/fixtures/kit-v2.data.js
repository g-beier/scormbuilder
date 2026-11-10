// Fixture escrita à mão para runtime/test/tipos-kit.mjs: data.js v2 com os blocos do kit (M6).
// Campos html (enunciado, pergunta, opcoes[].texto) vêm escapados como HTML;
// campos de texto puro (fb, retorno, aviso, msgAcerto, msgRevisar) vêm crus (o motor usa textContent).
window.CONTEUDO = {
  formato: 2,
  id: "TESTE_UD1_KIT1",
  contexto: "Teste · Blocos do kit",
  titulo: "Blocos do kit",
  slides: [
    { id: "s-capa", tipo: "capa", kicker: "Teste", titulo: "Blocos do kit", sub: "Múltipla, reflexão e escolha" },
    { id: "s-mult", tipo: "conteudo", kicker: "Múltipla", titulo: "Quais atitudes vêm primeiro?", blocos: [
      { id: "b-texto1", tipo: "texto", paras: ["Leia o caso e marque <strong>todas</strong> as atitudes adequadas."] },
      { id: "b-mult1", tipo: "multipla", enunciado: "Marque as atitudes que o grupo deve tomar <em>primeiro</em>.",
        msgAcerto: "Isso: proteger e comunicar vêm antes de tudo.", msgRevisar: "Revise: veja os comentários.",
        opcoes: [
          { texto: "Garantir a segurança imediata da criança", correta: true, fb: "Proteger vem antes de qualquer outra ação." },
          { texto: "Investigar o caso por conta própria", correta: false, fb: "Investigar é papel das autoridades, não do grupo." },
          { texto: "Comunicar a Diretoria &amp; o Conselho Tutelar", correta: true, fb: "Comunicar é dever: use os canais oficiais." }
        ] }
    ] },
    { id: "s-misto", tipo: "conteudo", titulo: "Dois blocos na mesma tela", blocos: [
      { id: "b-mult2", tipo: "multipla", enunciado: "Qual destas é correta?",
        opcoes: [
          { texto: "Opção errada", correta: false, fb: "Use 5 < 6 & <b>não</b> isso." },
          { texto: "Opção certa", correta: true, fb: "" }
        ] },
      { id: "b-esc1", tipo: "escolha", pergunta: "Como você se sente diante deste caso?",
        opcoes: [
          { texto: "Seguro", retorno: "Ótimo. Revise o fluxo mesmo assim." },
          { texto: "Inseguro", retorno: "Normal. A <i>equipe</i> & o fluxo ajudam." },
          { texto: "Não sei", retorno: "Volte ao fluxo básico antes de seguir." }
        ] }
    ] },
    { id: "s-refl", tipo: "conteudo", titulo: "Reflexão obrigatória", blocos: [
      { id: "b-refl1", tipo: "reflexao", pergunta: "O que você faria <strong>primeiro</strong>?", opcional: false, minChars: 20, maxChars: 600 }
    ] },
    { id: "s-refl2", tipo: "conteudo", titulo: "Reflexão opcional", blocos: [
      { id: "b-refl2", tipo: "reflexao", pergunta: "Algo mais a acrescentar?" },
      { id: "b-fonte", tipo: "fonte", html: "Fonte: material de teste." }
    ] },
    { id: "s-fim", tipo: "fim", titulo: "Fim do teste", texto: "Você chegou ao fim." }
  ]
};

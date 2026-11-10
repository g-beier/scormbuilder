// Fixture escrita à mão para runtime/test/categorizar.mjs: data.js v2 com o bloco "categorizar" (M6).
// enunciado, categorias[] e itens[].texto vêm escapados como HTML; fb, msgAcerto e msgRevisar vêm crus (textContent).
window.CONTEUDO = {
  formato: 2,
  id: "TESTE_UD1_CATEG1",
  contexto: "Teste · Classificar",
  titulo: "Classificar",
  slides: [
    { id: "s-capa", tipo: "capa", kicker: "Teste", titulo: "Classificar", sub: "Arrastar para categorias" },
    { id: "s-c2", tipo: "conteudo", kicker: "Parte 1", titulo: "Quem faz o quê", blocos: [
      { id: "b-c2", tipo: "categorizar", enunciado: "Classifique cada ação de acordo com quem é <strong>responsável</strong> por ela.",
        categorias: ["Adulto voluntário", "Autoridades"],
        itens: [
          { texto: "Acolher e ouvir sem julgar", categoria: 0, fb: "Acolher é papel de quem recebe o relato." },
          { texto: "Investigar o caso", categoria: 1, fb: "Investigar é papel das autoridades, não do grupo." },
          { texto: "Comunicar pelos canais oficiais", categoria: 0 },
          { texto: "Aplicar medidas de proteção", categoria: 1, fb: "Medidas protetivas são do Conselho Tutelar e da Justiça." }
        ],
        msgRevisar: "Revise os itens marcados." }
    ] },
    { id: "s-c3", tipo: "conteudo", kicker: "Parte 2", titulo: "Três categorias", blocos: [
      { id: "b-c3", tipo: "categorizar", enunciado: "Em que momento cada ação acontece?",
        categorias: ["Antes da atividade", "Durante", "Depois"],
        itens: [
          { texto: "Conferir autorizações dos responsáveis", categoria: 0 },
          { texto: "Manter a regra dos dois adultos", categoria: 1 },
          { texto: "Registrar ocorrências no relatório", categoria: 2 },
          { texto: "Planejar a logística com a equipe", categoria: 0 },
          { texto: "Devolver os jovens aos responsáveis", categoria: 2 }
        ],
        msgAcerto: "Perfeito!" }
    ] },
    { id: "s-fim", tipo: "fim", titulo: "Fim", texto: "Obrigado." }
  ]
};

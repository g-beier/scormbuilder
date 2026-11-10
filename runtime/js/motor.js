/* Motor v2 dos pacotes SCORM do construtor (derivado do LEITURA2 da UD18, ead-scorm).
   ES5, sem dependências. Conteúdo em window.CONTEUDO (formato 2): telas com blocos
   renderizados na ordem do array. Cada tipo de bloco é um registro em Motor.bloco(). */
var Motor = (function () {
  "use strict";

  var registro = {};
  var iniciado = false;
  var CORES = ["navy", "green", "red", "yellow"];

  // ---------- Utilitários (também expostos aos blocos pelo ctx) ----------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function paras(parent, lista, cls) {
    (lista || []).forEach(function (t) { parent.appendChild(el("p", cls, t)); });
  }

  function lista(parent, itens) {
    if (!itens || !itens.length) return;
    var ul = el("ul");
    itens.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    parent.appendChild(ul);
  }

  // Embaralha índices, garantindo que a ordem não seja a da solução
  function embaralhar(n) {
    var ordem = [];
    for (var i = 0; i < n; i++) ordem.push(i);
    if (n < 2) return ordem;
    for (var tent = 0; tent < 20; tent++) {
      for (var k = ordem.length - 1; k > 0; k--) {
        var j = Math.floor(Math.random() * (k + 1));
        var t = ordem[k]; ordem[k] = ordem[j]; ordem[j] = t;
      }
      var igual = ordem.every(function (v, idx) { return v === idx; });
      if (!igual) break;
    }
    return ordem;
  }

  /* Registro de um tipo de bloco.
     def = {
       render(b, ctx) -> Node | null      obrigatório; pode devolver DocumentFragment
       pendentes(b, ctx) -> número        unidades que faltam (0 = feito); omitir em blocos passivos
       aviso: "texto"                     aviso da tela enquanto pendentes > 0 (bloqueia "Próximo")
       falta: ["singular", "plural"]      texto da tela de fim: "<n> <singular|plural>"
       ordemAviso, ordemFalta: número     ordem das frases quando há vários tipos pendentes
       estado(b, ctx) -> valor JSON curto | undefined   o que vai para o suspend_data
       restaurar(b, ctx, valor)           reaplica o estado salvo (chamado depois do render)
     }
     O ctx é um objeto por instância do bloco: guarde nele o estado da instância. */
  function bloco(tipo, def) {
    def = def || {};
    def.tipo = tipo;
    if (def.ordemAviso == null) def.ordemAviso = 100;
    if (def.ordemFalta == null) def.ordemFalta = 100;
    registro[tipo] = def;
    return def;
  }

  // ---------- Validação mínima do conteúdo ----------
  function problemaConteudo(C) {
    if (!C || typeof C !== "object") return "O arquivo de conteúdo (js/data.js) não foi carregado.";
    if (C.formato !== 2) return "O conteúdo está num formato que este motor não reconhece (esperado: formato 2).";
    if (!C.slides || !C.slides.length) return "O conteúdo não tem telas.";
    var fins = 0;
    C.slides.forEach(function (s) { if (s && s.tipo === "fim") fins++; });
    if (fins === 0) return "O conteúdo não tem a tela de encerramento (tipo \"fim\").";
    if (fins > 1) return "O conteúdo tem " + fins + " telas de encerramento; deve haver exatamente uma.";
    return null;
  }

  function iniciar(conteudo, opcoes) {
    if (iniciado) return null;
    iniciado = true;
    opcoes = opcoes || {};

    var stage = document.getElementById("stage");
    var modaisBox = document.getElementById("modais");
    var prevBtn = document.getElementById("prev");
    var nextBtn = document.getElementById("next");
    var bar = document.getElementById("bar");
    var counter = document.getElementById("counter");
    var contexto = document.getElementById("contexto");
    var livre = opcoes.livre === true;

    function mostrarErro(msg) {
      var sec = el("section", "slide active");
      sec.appendChild(el("h1", null, "Não foi possível abrir esta atividade"));
      sec.appendChild(el("p")).textContent = msg;
      stage.innerHTML = "";
      stage.appendChild(sec);
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      counter.textContent = "–";
    }

    var problema = problemaConteudo(conteudo);
    if (problema) { mostrarErro(problema); return null; }

    var C = conteudo;
    var S = window.Scorm;
    var total = C.slides.length;
    var current = 0;
    var idxFim = 0;
    var visitadas = {};      // índices de telas já exibidas
    var instancias = [];     // todos os blocos: { t, k, b, def, ctx }
    var porTela = {};        // índice da tela -> instâncias dela
    var ganchosModal = {};   // id do modal -> função chamada ao abrir
    var avisos = {};         // índice da tela -> aviso de "falta fazer algo para avançar"
    var contadores = {};
    var concluido = false;

    contexto.textContent = C.contexto || "";

    // Atualiza navegação, conclusão e estado depois de uma interação do aluno
    function mudou() {
      atualizarNav();
      verificarConclusao();
      salvarEstado();
      S.commit();
    }

    function criarModal(id, titulo, ps, aoAbrir) {
      var ov = el("div", "overlay");
      ov.id = id;
      ov.hidden = true;
      var md = el("div", "modal");
      var close = el("button", "close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "Fechar");
      md.appendChild(close);
      md.appendChild(el("h2", null, titulo));
      paras(md, ps);
      ov.appendChild(md);
      modaisBox.appendChild(ov);
      ov.addEventListener("click", function (e) {
        if (e.target === ov || e.target.classList.contains("close")) closeModals();
      });
      if (aoAbrir) ganchosModal[id] = aoAbrir;
      return ov;
    }

    function novoCtx(s, t, k) {
      return {
        conteudo: C, slide: s, tela: t, indice: k, livre: livre,
        el: el, paras: paras, lista: lista, embaralhar: embaralhar, CORES: CORES,
        mudou: mudou,
        criarModal: criarModal,
        seq: function (nome) { var v = contadores[nome] || 0; contadores[nome] = v + 1; return v; }
      };
    }

    function avisoDesconhecido(tipo) {
      var p = el("p", "nota");
      p.setAttribute("role", "note");
      p.textContent = "[Bloco \"" + tipo + "\" não é suportado por esta versão do motor.]";
      return p;
    }

    function renderBloco(sec, s, t, k) {
      var b = s.blocos[k] || {};
      var def = registro[b.tipo] || null;
      var ctx = novoCtx(s, t, k);
      var no = null;
      if (def) {
        try { no = def.render(b, ctx); } catch (e) { def = null; no = avisoDesconhecido(b.tipo); }
      } else {
        no = avisoDesconhecido(b.tipo);
      }
      if (no) sec.appendChild(no);
      var inst = { t: t, k: k, b: b, def: def, ctx: ctx };
      instancias.push(inst);
      porTela[t].push(inst);
    }

    function renderSlide(s, idx) {
      var sec = el("section", "slide" + (s.tipo === "capa" ? " cover" : "") + (s.tipo === "fim" ? " finish" : ""));
      sec.dataset.index = idx;
      porTela[idx] = [];

      if (s.tipo === "fim") {
        var box = el("div", "finish-box");
        box.appendChild(el("h1", null, s.titulo));
        sec.appendChild(box);
        sec.appendChild(el("p", "finish-next", s.texto));
        sec.appendChild(el("p", "pendencias", ""));
        sec.setAttribute("data-fim", "1");
        return sec;
      }

      if (s.kicker) sec.appendChild(el("p", "kicker", s.kicker));
      sec.appendChild(el("h1", null, s.titulo));
      if (s.tipo === "capa") {
        sec.appendChild(el("p", "cover-sub", s.sub));
        return sec;
      }

      // O aviso de pendência fica no fim da tela, antes das fontes finais
      var bl = s.blocos || [];
      var corte = bl.length;
      while (corte > 0 && bl[corte - 1] && bl[corte - 1].tipo === "fonte") corte--;
      var k;
      for (k = 0; k < corte; k++) renderBloco(sec, s, idx, k);

      var aviso = el("p", "quiz-aviso", "");
      aviso.hidden = true;
      avisos[idx] = aviso;
      sec.appendChild(aviso);

      for (k = corte; k < bl.length; k++) renderBloco(sec, s, idx, k);
      return sec;
    }

    // Telas
    C.slides.forEach(function (s, i) {
      if (s.tipo === "fim") idxFim = i;
      stage.appendChild(renderSlide(s, i));
    });

    var slides = Array.prototype.slice.call(stage.querySelectorAll(".slide"));
    var pendEl = slides[idxFim].querySelector(".pendencias");

    // ---------- Persistência (SCORM 1.2; fora do LMS, localStorage) ----------
    var lmsOn = S.init(opcoes.chave || C.id);

    function salvarEstado() {
      var est = { v: Object.keys(visitadas).map(Number) };
      var bs = {}, tem = false;
      instancias.forEach(function (it) {
        if (!it.def || !it.def.estado) return;
        var val;
        try { val = it.def.estado(it.b, it.ctx); } catch (e) { val = undefined; }
        if (val === undefined || val === null) return;
        bs[it.t + "." + it.k] = val;
        tem = true;
      });
      if (tem) est.b = bs;
      S.set("cmi.suspend_data", JSON.stringify(est));
      S.set("cmi.core.lesson_location", current);
    }

    function carregarEstado() {
      var raw = S.get("cmi.suspend_data");
      if (raw) {
        try {
          var est = JSON.parse(raw);
          (est.v || []).forEach(function (i) { if (i >= 0 && i < total) visitadas[i] = true; });
          var bs = est.b || {};
          instancias.forEach(function (it) {
            var chave = it.t + "." + it.k;
            if (!it.def || !it.def.restaurar || !bs.hasOwnProperty(chave)) return;
            try { it.def.restaurar(it.b, it.ctx, bs[chave]); } catch (e) { /* estado incompatível: ignora */ }
          });
        } catch (e) { /* dados inválidos: começa do zero */ }
      }
      var loc = parseInt(S.get("cmi.core.lesson_location"), 10);
      if (!isNaN(loc) && loc >= 0 && loc < total) current = loc;
      concluido = (S.get("cmi.core.lesson_status") === "completed");
    }

    carregarEstado();
    var st = S.get("cmi.core.lesson_status");
    if (!st || st === "not attempted") S.set("cmi.core.lesson_status", "incomplete");
    S.commit();

    var ini = parseInt(opcoes.telaInicial, 10);
    if (!isNaN(ini)) current = Math.max(0, Math.min(total - 1, ini));

    function pendentesDe(it) {
      if (!it.def || !it.def.pendentes) return 0;
      try { return it.def.pendentes(it.b, it.ctx) || 0; } catch (e) { return 0; }
    }

    // Conclusão: todas as telas vistas e nenhum bloco com pendência
    function pendencias() {
      var partes = [];
      var telas = total - Object.keys(visitadas).length;
      if (telas > 0) partes.push(telas + (telas === 1 ? " tela ainda não visualizada" : " telas ainda não visualizadas"));
      var soma = {}, defs = [];
      instancias.forEach(function (it) {
        var n = pendentesDe(it);
        if (n <= 0 || !it.def.falta) return;
        if (!soma[it.def.tipo]) { soma[it.def.tipo] = 0; defs.push(it.def); }
        soma[it.def.tipo] += n;
      });
      defs.sort(function (a, b) { return a.ordemFalta - b.ordemFalta; });
      defs.forEach(function (d) {
        var n = soma[d.tipo];
        partes.push(n + " " + (n === 1 ? d.falta[0] : d.falta[1]));
      });
      return partes;
    }

    function verificarConclusao() {
      if (concluido) return;
      if (pendencias().length === 0) {
        concluido = true;
        S.set("cmi.core.lesson_status", "completed");
      }
    }

    function atualizarFim() {
      if (concluido) {
        pendEl.textContent = "Atividade concluída. Seu progresso foi registrado.";
        return;
      }
      var p = pendencias();
      pendEl.textContent = p.length
        ? "Para concluir, falta: " + p.join(" e ") + "."
        : "";
    }

    // Indicador "há mais conteúdo abaixo": aparece só quando a tela ainda tem trecho para rolar
    var cue = el("button", "mais-cue", "↓ Role para ver o restante desta tela");
    cue.type = "button";
    cue.hidden = true;
    var rodape = document.querySelector(".footer");
    rodape.parentNode.insertBefore(cue, rodape);
    cue.addEventListener("click", function () {
      stage.scrollBy({ top: stage.clientHeight * 0.8, behavior: "smooth" });
    });

    // Telas em que o leitor chegou ao fim nesta visita: a dica some até ele sair da tela
    var fimLido = {};
    function atualizarMais() {
      var falta = stage.scrollHeight - stage.clientHeight - stage.scrollTop;
      if (falta < 16) fimLido[current] = true;
      cue.hidden = falta < 16 || fimLido[current] === true;
    }
    stage.addEventListener("scroll", atualizarMais, { passive: true });
    stage.addEventListener("toggle", atualizarMais, true);
    window.addEventListener("resize", atualizarMais);

    function pad(n) { return (n < 10 ? "0" : "") + n; }

    // Cada tela libera "Próximo" só depois das ações que os blocos dela cobram
    function pendenciaTela(i) {
      var defs = [];
      (porTela[i] || []).forEach(function (it) {
        if (pendentesDe(it) > 0 && it.def.aviso && defs.indexOf(it.def) < 0) defs.push(it.def);
      });
      defs.sort(function (a, b) { return a.ordemAviso - b.ordemAviso; });
      return defs.map(function (d) { return d.aviso; });
    }

    function telaBloqueada(i) {
      return !livre && pendenciaTela(i).length > 0;
    }

    function atualizarNav() {
      var p = livre ? [] : pendenciaTela(current);
      var bloq = p.length > 0;
      nextBtn.disabled = (current === total - 1) || bloq;
      atualizarMais();
      if (avisos[current]) {
        avisos[current].textContent = p.join(" ");
        avisos[current].hidden = !bloq;
      }
    }

    function show(i) {
      if (i > current && telaBloqueada(current)) return;
      if (i < 0) i = 0;
      if (i > total - 1) i = total - 1;
      fimLido = {};   // ao trocar de tela, a dica volta a valer para a nova visita
      current = i;
      visitadas[i] = true;

      slides.forEach(function (s, k) { s.classList.toggle("active", k === i); });
      prevBtn.disabled = (i === 0);
      atualizarNav();
      bar.style.width = ((i + 1) / total * 100) + "%";
      counter.textContent = pad(i + 1) + " / " + pad(total);

      stage.scrollTop = 0;
      atualizarMais();

      verificarConclusao();
      if (i === idxFim) atualizarFim();
      salvarEstado();
      S.commit();
    }

    prevBtn.addEventListener("click", function () { show(current - 1); });
    nextBtn.addEventListener("click", function () { if (current < total - 1) show(current + 1); });

    // ---------- Modais ----------
    function closeModals() {
      Array.prototype.forEach.call(document.querySelectorAll(".overlay"), function (o) { o.hidden = true; });
    }

    document.addEventListener("click", function (e) {
      var op = e.target.closest && e.target.closest("[data-modal]");
      if (op) {
        var id = op.getAttribute("data-modal");
        var m = document.getElementById(id);
        if (m) {
          m.hidden = false;
          if (ganchosModal[id]) ganchosModal[id]();
          mudou();
          var c = m.querySelector(".close");
          if (c) c.focus();
        }
      }
    });

    // ---------- Teclado e toque ----------
    document.addEventListener("keydown", function (e) {
      if (document.querySelector(".overlay:not([hidden])")) {
        if (e.key === "Escape") closeModals();
        return;
      }
      // Setas dentro de um card arrastável movem o card, não trocam de tela
      if (e.target.closest && e.target.closest(".drag-list")) return;
      // Setas em campos de formulário (texto, opções) ficam com o campo
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      // Dentro do questionário com caminhos, setas não saem da tela no meio das perguntas
      if (e.target.closest && e.target.closest(".ramificado")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") show(current + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") show(current - 1);
    });

    var tx = null;
    stage.addEventListener("touchstart", function (e) {
      tx = e.target.closest && e.target.closest(".drag-list, .cat-item, .ramificado, textarea") ? null : e.changedTouches[0].clientX;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (tx === null) return;
      var dx = e.changedTouches[0].clientX - tx;
      tx = null;
      if (Math.abs(dx) > 60) show(current + (dx < 0 ? 1 : -1));
    }, { passive: true });

    window.addEventListener("beforeunload", function () {
      salvarEstado();
      S.finish();
    });

    show(current);

    return {
      ir: show,
      tela: function () { return current; },
      total: total,
      pendencias: pendencias,
      pendenciaTela: function (i) { return pendenciaTela(i == null ? current : i); },
      concluido: function () { return concluido; },
      conectado: lmsOn
    };
  }

  // =====================================================================
  // Blocos da v1
  // =====================================================================

  bloco("texto", {
    render: function (b) {
      var f = document.createDocumentFragment();
      paras(f, b.paras);
      return f;
    }
  });

  bloco("lista", {
    render: function (b) {
      var f = document.createDocumentFragment();
      lista(f, b.itens);
      return f;
    }
  });

  bloco("cards", {
    render: function (b) {
      if (!b.cards || !b.cards.length) return null;
      var grid = el("div", "grid" + (b.colunas === 2 ? " grid-2" : ""));
      b.cards.forEach(function (c) {
        var card = el("div", "card c-" + c.cor);
        if (c.titulo) card.appendChild(el("h3", null, c.titulo));
        if (c.breve) card.appendChild(el("p", "breve", c.breve));
        paras(card, c.paras);
        lista(card, c.lista);
        grid.appendChild(card);
      });
      return grid;
    }
  });

  // Roteiro em linha do tempo, no formato de percurso do guia visual
  bloco("linha", {
    render: function (b) {
      var box = el("div", "timeline");
      (b.itens || []).forEach(function (it, i) {
        var row = el("div", "tl-row");
        row.appendChild(el("div", "tl-n c-" + CORES[i % CORES.length], String(i + 1)));
        var p = el("div", "tl-p");
        p.appendChild(el("h3", null, it.titulo));
        p.appendChild(el("p", null, it.texto));
        row.appendChild(p);
        box.appendChild(row);
      });
      return box;
    }
  });

  bloco("contraste", {
    render: function (b) {
      var cg = el("div", "grid contraste");
      (b.itens || []).forEach(function (c) {
        var cc = el("div", "card c-" + c.cor);
        cc.appendChild(el("h3", null, c.titulo));
        cc.appendChild(el("p", null, c.texto));
        cg.appendChild(cc);
      });
      return cg;
    }
  });

  bloco("destaque", {
    render: function (b) { return b.html ? el("div", "callout", b.html) : null; }
  });

  bloco("fonte", {
    render: function (b) { return b.html ? el("p", "source", b.html) : null; }
  });

  // ---------- Quiz de escolha única, com explicação ----------
  function aplicarQuiz(ui, escolha) {
    var q = ui.q, btns = ui.btns, fb = ui.fb;
    if (!btns[escolha]) return;
    btns.forEach(function (bt) { bt.disabled = true; });
    if (btns[q.correta]) btns[q.correta].classList.add("certa");
    if (escolha !== q.correta) btns[escolha].classList.add("errada");
    fb.className = "quiz-fb " + (escolha === q.correta ? "ok" : "erro");
    fb.textContent = (escolha === q.correta ? "Correto. " : "Não é esse. ") + q.explica;
  }

  bloco("quiz", {
    aviso: "Responda todas as perguntas para avançar.",
    falta: ["pergunta ainda não respondida", "perguntas ainda não respondidas"],
    ordemAviso: 1,
    ordemFalta: 3,
    render: function (b, ctx) {
      ctx.res = [];   // índice da pergunta -> opção escolhida
      ctx.ui = [];
      var wrap = el("div", "quiz");
      (b.perguntas || []).forEach(function (q, qi) {
        var box = el("div", "quiz-q");
        box.appendChild(el("p", "quiz-pergunta", q.pergunta));
        var ops = el("div", "quiz-opcoes");
        var btns = [];
        var fb = el("p", "quiz-fb");
        fb.setAttribute("aria-live", "polite");
        (q.opcoes || []).forEach(function (txt, oi) {
          var bt = el("button", "quiz-opc", txt);
          bt.type = "button";
          bt.addEventListener("click", function () {
            if (ctx.res[qi] != null) return;
            ctx.res[qi] = oi;
            aplicarQuiz(ctx.ui[qi], oi);
            ctx.mudou();
          });
          btns.push(bt);
          ops.appendChild(bt);
        });
        box.appendChild(ops);
        box.appendChild(fb);
        wrap.appendChild(box);
        ctx.ui[qi] = { q: q, btns: btns, fb: fb };
      });
      return wrap;
    },
    pendentes: function (b, ctx) {
      var n = 0;
      for (var i = 0; i < ctx.ui.length; i++) if (ctx.res[i] == null) n++;
      return n;
    },
    estado: function (b, ctx) {
      var r = [], tem = false;
      for (var i = 0; i < ctx.ui.length; i++) {
        var v = ctx.res[i] == null ? null : ctx.res[i];
        if (v !== null) tem = true;
        r.push(v);
      }
      while (r.length && r[r.length - 1] === null) r.pop();
      return tem ? r : undefined;
    },
    restaurar: function (b, ctx, valor) {
      (valor || []).forEach(function (v, qi) {
        if (typeof v !== "number" || !ctx.ui[qi] || !ctx.ui[qi].btns[v]) return;
        ctx.res[qi] = v;
        aplicarQuiz(ctx.ui[qi], v);
      });
    }
  });

  // ---------- Arrastar e ordenar, com sugestão em accordion ----------
  function criarCardPasso(b, solIdx) {
    var li = el("li", "drag-card c-" + CORES[solIdx % CORES.length]);
    li.setAttribute("tabindex", "0");
    li.setAttribute("data-id", solIdx);
    li.appendChild(el("span", "drag-text", b.passos[solIdx]));
    return li;
  }

  bloco("ordenar", {
    aviso: "Abra a sugestão para avançar.",
    falta: ["sugestão de tarefa ainda não lida", "sugestões de tarefa ainda não lidas"],
    ordemAviso: 2,
    ordemFalta: 2,
    render: function (b, ctx) {
      ctx.ok = false;
      var passos = b.passos || [];
      var n = passos.length;
      var blocoEl = el("div", "flow-block");
      blocoEl.setAttribute("data-fluxo", ctx.seq("fluxo"));
      var nomeEl = el("p", "flow-name", b.nome);
      blocoEl.appendChild(nomeEl);
      blocoEl.appendChild(el("p", "flow-help", "Arraste os cards para colocar os passos na ordem em que acontecem. Também dá para usar as setas ↑ ↓ do teclado."));

      var ol = el("ol", "drag-list");
      ol.setAttribute("aria-label", "Ordem dos passos: " + (nomeEl.textContent || "").trim());
      embaralhar(n).forEach(function (solIdx) { ol.appendChild(criarCardPasso(b, solIdx)); });
      blocoEl.appendChild(ol);

      var acoes = el("div", "flow-actions");
      var bVer = el("button", "btn-act", "Verificar ordem");
      bVer.type = "button";
      var bEmb = el("button", "btn-act sec", "Embaralhar");
      bEmb.type = "button";
      acoes.appendChild(bVer);
      acoes.appendChild(bEmb);
      blocoEl.appendChild(acoes);

      var fb = el("p", "feedback");
      fb.setAttribute("aria-live", "polite");
      blocoEl.appendChild(fb);

      // Sugestão em accordion: fechada por padrão; pode ser recolhida após a leitura
      var det = el("details", "sugestao");
      det.appendChild(el("summary", null, "Ver sugestão e o porquê"));
      var corpo = el("div", "sug-corpo");
      var solOl = el("ol", "sug-list");
      passos.forEach(function (p) { solOl.appendChild(el("li", null, p)); });
      corpo.appendChild(el("h3", null, "Sugestão de ordem"));
      corpo.appendChild(solOl);
      corpo.appendChild(el("p", "porque", "<strong>Por quê:</strong> " + (b.porque || "")));
      corpo.appendChild(el("p", "nota", "Esta é uma sugestão. Outra UEL pode definir uma sequência diferente, desde que cada passo tenha um responsável."));
      if (b.nota) corpo.appendChild(el("div", "nota-fluxo", b.nota));
      det.appendChild(corpo);
      blocoEl.appendChild(det);

      det.addEventListener("toggle", function () {
        if (det.open && !ctx.ok) {
          ctx.ok = true;
          ctx.mudou();
        }
      });

      function ordemAtual() {
        return Array.prototype.map.call(ol.children, function (li) { return Number(li.getAttribute("data-id")); });
      }

      bVer.addEventListener("click", function () {
        var fora = 0;
        ordemAtual().forEach(function (v, pos) { if (v !== pos) fora++; });
        if (fora === 0) {
          fb.className = "feedback ok";
          fb.textContent = "Ordem correta. Veja abaixo por que ela funciona.";
          det.open = true;
        } else {
          fb.className = "feedback erro";
          fb.textContent = (fora === 1 ? "1 passo está fora de lugar." : fora + " passos estão fora de lugar.") + " Tente de novo ou abra a sugestão.";
        }
      });

      bEmb.addEventListener("click", function () {
        while (ol.firstChild) ol.removeChild(ol.firstChild);
        embaralhar(n).forEach(function (solIdx) { ol.appendChild(criarCardPasso(b, solIdx)); });
        fb.className = "feedback";
        fb.textContent = "";
      });

      // Arrastar: o card acompanha o ponteiro e os demais abrem espaço
      var arrastando = null;
      var grab = 0;           // distância entre o ponteiro e o topo do card no momento do clique
      var olTop = 0;

      function posicionar(y) {
        var alvo = (y - grab) - (olTop + arrastando.offsetTop);
        arrastando.style.transform = "translateY(" + alvo + "px)";
      }

      // Guarda a posição de layout (offsetTop) de cada card que não está sendo arrastado
      function capturar() {
        return Array.prototype.filter.call(ol.children, function (c) { return c !== arrastando; })
          .map(function (c) { return { el: c, top: c.offsetTop }; });
      }

      // Animação: cada card volta da posição antiga para a nova
      function animar(antes) {
        antes.forEach(function (item) {
          var d = item.top - item.el.offsetTop;
          if (Math.abs(d) < 0.5) return;
          item.el.style.transition = "none";
          item.el.style.transform = "translateY(" + d + "px)";
          void item.el.offsetHeight; // força o navegador a aplicar o estado inicial
          item.el.style.transition = "transform 0.2s ease";
          item.el.style.transform = "";
        });
      }

      ol.addEventListener("pointerdown", function (e) {
        var li = e.target.closest(".drag-card");
        if (!li || e.button > 0) return;
        e.preventDefault();
        arrastando = li;
        grab = e.clientY - li.getBoundingClientRect().top;
        olTop = ol.getBoundingClientRect().top;
        li.classList.add("dragging");
        li.style.transition = "none";
        li.style.zIndex = "2";
        ol.setPointerCapture(e.pointerId);
        posicionar(e.clientY);
      });

      ol.addEventListener("pointermove", function (e) {
        if (!arrastando) return;
        var y = e.clientY;
        olTop = ol.getBoundingClientRect().top;

        // Procura a posição: antes do primeiro card cujo meio esteja abaixo do ponteiro
        var alvo = null;
        var itens = Array.prototype.slice.call(ol.children);
        for (var k = 0; k < itens.length; k++) {
          var it = itens[k];
          if (it === arrastando) continue;
          var meio = olTop + it.offsetTop + it.offsetHeight / 2;
          if (y < meio) { alvo = it; break; }
        }

        var mudouPos = alvo
          ? arrastando.nextElementSibling !== alvo
          : ol.lastElementChild !== arrastando;

        if (mudouPos) {
          var antes = capturar();
          if (alvo) ol.insertBefore(arrastando, alvo);
          else ol.appendChild(arrastando);
          animar(antes);
        }
        posicionar(y);
      });

      function soltar() {
        if (!arrastando) return;
        var li = arrastando;
        arrastando = null;
        li.classList.remove("dragging");
        // Assenta o card na posição final
        li.style.transition = "transform 0.18s ease";
        li.style.transform = "";
        setTimeout(function () { li.style.transition = ""; li.style.zIndex = ""; }, 200);
      }
      ol.addEventListener("pointerup", soltar);
      ol.addEventListener("pointercancel", soltar);

      // Teclado: setas movem o card focado
      ol.addEventListener("keydown", function (e) {
        var li = e.target.closest(".drag-card");
        if (!li) return;
        if (e.key === "ArrowUp" && li.previousElementSibling) {
          e.preventDefault();
          ol.insertBefore(li, li.previousElementSibling);
          li.focus();
        } else if (e.key === "ArrowDown" && li.nextElementSibling) {
          e.preventDefault();
          ol.insertBefore(li.nextElementSibling, li);
          li.focus();
        }
      });

      return blocoEl;
    },
    pendentes: function (b, ctx) { return ctx.ok ? 0 : 1; },
    estado: function (b, ctx) { return ctx.ok ? 1 : undefined; },
    restaurar: function (b, ctx, valor) { if (valor) ctx.ok = true; }
  });

  // ---------- "Confira" / saiba mais: botão na tela + modal (id do bloco = id do modal) ----------
  bloco("confira", {
    aviso: "Abra as caixas “saiba mais” para avançar.",
    falta: ["caixa de “saiba mais” ainda não aberta", "caixas de “saiba mais” ainda não abertas"],
    ordemAviso: 3,
    ordemFalta: 1,
    render: function (b, ctx) {
      ctx.ok = false;
      ctx.criarModal(b.id, b.titulo, b.paras, function () { ctx.ok = true; });
      var bt = el("button", "btn-more", b.botao);
      bt.type = "button";
      bt.setAttribute("data-modal", b.id);
      return bt;
    },
    pendentes: function (b, ctx) { return ctx.ok ? 0 : 1; },
    estado: function (b, ctx) { return ctx.ok ? 1 : undefined; },
    restaurar: function (b, ctx, valor) { if (valor) ctx.ok = true; }
  });

  // =====================================================================
  // Blocos do kit (M6): múltipla seleção, reflexão e escolha com retorno.
  // Portados de ead-scorm/base/scorm-kit/js/kit.js (Kit.quiz, Kit.reflexao, Kit.escolha).
  // Campos "html" vão por innerHTML; campos de texto puro (fb, retorno, aviso,
  // msgAcerto, msgRevisar) vão por textContent.
  // =====================================================================

  function texto(tag, cls, t) {
    var e = el(tag, cls);
    e.textContent = t == null ? "" : String(t);
    return e;
  }

  function botao(cls, rotulo) {
    var bt = texto("button", cls, rotulo);
    bt.type = "button";
    return bt;
  }

  // Caixa com a pergunta/enunciado; devolve { box, id } (id do enunciado, para aria-labelledby)
  function caixaPergunta(ctx, cls, html) {
    var box = el("div", "bloco-q " + cls);
    var id = "kq" + ctx.seq("kit");
    var p = el("p", "bloco-perg", html || "");
    p.id = id;
    box.appendChild(p);
    return { box: box, id: id };
  }

  // ---------- Múltipla seleção, com retorno por alternativa (Kit.quiz) ----------
  var MSG_ACERTO = "Muito bem: sua resposta coincide com o esperado.";
  var MSG_REVISAR = "Alguns pontos merecem revisão. Veja os comentários nas alternativas.";

  function aplicarMultipla(b, ui, marcadas) {
    var tudoCerto = true;
    ui.ops.forEach(function (op, i) {
      var o = (b.opcoes || [])[i] || {};
      var correta = o.correta === true;
      var marcado = marcadas.indexOf(i) >= 0;
      var fbTxt = o.fb == null ? "" : String(o.fb);
      op.inp.checked = marcado;
      op.inp.disabled = true;
      op.lab.classList.remove("ok", "erro");
      op.lab.classList.add("travada");
      op.fb.hidden = true;
      if (marcado === correta) {
        if (correta) {
          op.lab.classList.add("ok");
          op.fb.textContent = fbTxt;
          op.fb.hidden = !fbTxt;
        }
      } else {
        tudoCerto = false;
        op.lab.classList.add("erro");
        op.fb.textContent = (correta ? "Faltou marcar esta. " : "Errado. ") + fbTxt;
        op.fb.hidden = false;
      }
    });
    ui.res.innerHTML = "";
    ui.res.appendChild(tudoCerto
      ? texto("div", "resultado bom", b.msgAcerto || MSG_ACERTO)
      : texto("div", "resultado parcial", b.msgRevisar || MSG_REVISAR));
    ui.ver.hidden = true;
    ui.ref.hidden = false;
  }

  bloco("multipla", {
    aviso: "Verifique suas respostas para avançar.",
    falta: ["pergunta de múltipla escolha ainda não verificada", "perguntas de múltipla escolha ainda não verificadas"],
    ordemAviso: 4,
    ordemFalta: 4,
    render: function (b, ctx) {
      ctx.marcadas = null;   // índices marcados na última verificação (null = nunca verificou)
      var cx = caixaPergunta(ctx, "multipla", b.enunciado);
      var grupo = el("div", "opcoes");
      grupo.setAttribute("role", "group");
      grupo.setAttribute("aria-labelledby", cx.id);
      var ops = [];
      (b.opcoes || []).forEach(function (o) {
        var lab = el("label", "opcao");
        var inp = el("input");
        inp.type = "checkbox";
        lab.appendChild(inp);
        lab.appendChild(el("span", "opcao-txt", o.texto || ""));
        var fb = el("span", "fb");
        fb.hidden = true;
        lab.appendChild(fb);
        grupo.appendChild(lab);
        ops.push({ lab: lab, inp: inp, fb: fb });
      });
      cx.box.appendChild(grupo);
      var res = el("div", "quiz-resultado");
      res.setAttribute("aria-live", "polite");
      cx.box.appendChild(res);
      var acoes = el("div", "acoes");
      var ver = botao("btn-act", "Verificar respostas");
      var ref = botao("btn-act sec", "Tentar de novo");
      ref.hidden = true;
      acoes.appendChild(ver);
      acoes.appendChild(ref);
      cx.box.appendChild(acoes);
      ctx.ui = { ops: ops, res: res, ver: ver, ref: ref };

      ver.addEventListener("click", function () {
        var marcadas = [];
        ops.forEach(function (op, i) { if (op.inp.checked) marcadas.push(i); });
        if (!marcadas.length) {
          res.innerHTML = "";
          res.appendChild(texto("div", "resultado parcial", "Marque ao menos uma alternativa antes de verificar."));
          return;
        }
        ctx.marcadas = marcadas;
        aplicarMultipla(b, ctx.ui, marcadas);
        ref.focus();
        ctx.mudou();
      });

      ref.addEventListener("click", function () {
        ops.forEach(function (op) {
          op.inp.disabled = false;
          op.lab.classList.remove("ok", "erro", "travada");
          op.fb.hidden = true;
        });
        res.innerHTML = "";
        ver.hidden = false;
        ref.hidden = true;
        ver.focus();
      });
      return cx.box;
    },
    pendentes: function (b, ctx) { return (ctx.marcadas || !ctx.ui.ops.length) ? 0 : 1; },
    estado: function (b, ctx) { return ctx.marcadas ? ctx.marcadas.slice() : undefined; },
    restaurar: function (b, ctx, valor) {
      if (!valor || !valor.length) return;
      var n = ctx.ui.ops.length, m = [];
      valor.forEach(function (v) { if (typeof v === "number" && v >= 0 && v < n && m.indexOf(v) < 0) m.push(v); });
      if (!m.length) return;
      ctx.marcadas = m;
      aplicarMultipla(b, ctx.ui, m);
    }
  });

  // ---------- Reflexão com envio ao LMS (Kit.reflexao) ----------
  var AVISO_REFLEXAO = "Ao enviar, sua reflexão é registrada na plataforma e pode ser lida pela equipe do curso. Não escreva nomes nem dados que identifiquem crianças, famílias ou casos reais. Depois de enviada, ela não pode ser editada; se você sair desta tela sem enviar, o texto é descartado.";
  var MSG_ENVIADA = "✓ Reflexão enviada. Obrigado por compartilhar.";

  function limparTexto(t) { return String(t).replace(/\s+/g, " ").replace(/^ | $/g, ""); }

  function mostrarEnviada(ui, manterTexto) {
    ui.ta.readOnly = true;
    ui.btn.hidden = true;
    ui.cont.hidden = true;
    if (ui.aviso) ui.aviso.hidden = true;
    if (!manterTexto) { ui.rot.hidden = true; ui.ta.hidden = true; }
    ui.status.innerHTML = "";
    ui.status.appendChild(texto("p", "enviada", MSG_ENVIADA));
  }

  bloco("reflexao", {
    aviso: "Envie sua reflexão para avançar.",
    falta: ["reflexão ainda não enviada", "reflexões ainda não enviadas"],
    ordemAviso: 6,
    ordemFalta: 6,
    render: function (b, ctx) {
      ctx.ok = false;
      var MIN = b.minChars > 0 ? b.minChars : 10;
      var MAX = b.maxChars > 0 ? b.maxChars : 500;
      var opcional = b.opcional !== false;
      var cx = caixaPergunta(ctx, "reflexao", b.pergunta);
      var n = cx.id;
      var rot = texto("label", "nota refl-rotulo", "Escreva sua reflexão" + (opcional ? " (opcional)" : "") + ".");
      rot.id = n + "r";
      rot.setAttribute("for", n + "t");
      var ta = el("textarea");
      ta.id = n + "t";
      ta.rows = 4;
      ta.maxLength = MAX;
      ta.setAttribute("aria-labelledby", cx.id + " " + rot.id);
      var cont = texto("p", "nota refl-cont", "");
      cont.id = n + "c";
      var avisoTxt = b.aviso == null ? AVISO_REFLEXAO : String(b.aviso);
      var aviso = null;
      if (avisoTxt) {
        aviso = texto("p", "nota aviso-refl", avisoTxt);
        aviso.id = n + "a";
      }
      ta.setAttribute("aria-describedby", cont.id + (aviso ? " " + aviso.id : ""));
      var acoes = el("div", "acoes");
      var btn = botao("btn-act", "Enviar reflexão");
      btn.disabled = true;
      acoes.appendChild(btn);
      var status = el("div", "refl-status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.tabIndex = -1;
      [rot, ta, cont, aviso, acoes, status].forEach(function (x) { if (x) cx.box.appendChild(x); });
      ctx.ui = { rot: rot, ta: ta, cont: cont, aviso: aviso, btn: btn, status: status };

      function contar() {
        var bruto = ta.value.length, util = limparTexto(ta.value).length;
        cont.textContent = bruto + "/" + MAX + (util < MIN ? " · mínimo de " + MIN + " caracteres" : "");
        btn.disabled = util < MIN;
      }
      contar();
      ta.addEventListener("input", contar);

      btn.addEventListener("click", function () {
        if (ctx.ok || limparTexto(ta.value).length < MIN) return;
        var gravou = false;
        try { gravou = window.Scorm.gravarResposta(b.id, ta.value); } catch (e) { gravou = false; }
        if (!gravou) {
          status.innerHTML = "";
          status.appendChild(texto("div", "resultado parcial", "Não foi possível enviar agora. Seu texto continua na tela: tente novamente."));
          return;
        }
        ctx.ok = true;
        mostrarEnviada(ctx.ui, true);
        status.focus();
        ctx.mudou();
      });
      return cx.box;
    },
    pendentes: function (b, ctx) { return (b.opcional === false && !ctx.ok) ? 1 : 0; },
    estado: function (b, ctx) { return ctx.ok ? 1 : undefined; },
    restaurar: function (b, ctx, valor) {
      if (!valor) return;
      ctx.ok = true;
      mostrarEnviada(ctx.ui, false);
    }
  });

  // ---------- Escolha com retorno, sem gabarito (Kit.escolha) ----------
  function aplicarEscolha(b, ui, i) {
    ui.ops.forEach(function (op, k) {
      op.inp.checked = (k === i);
      op.lab.classList.toggle("escolhida", k === i);
    });
    var o = (b.opcoes || [])[i];
    ui.ret.innerHTML = "";
    if (o) {
      var card = el("div", "card pergunta");
      card.appendChild(texto("h3", null, "Retorno"));
      card.appendChild(texto("p", null, o.retorno));
      ui.ret.appendChild(card);
    } else {
      ui.ret.appendChild(texto("p", "nota", "Escolha uma alternativa para ver o retorno."));
    }
  }

  bloco("escolha", {
    aviso: "Escolha uma alternativa para avançar.",
    falta: ["escolha ainda não feita", "escolhas ainda não feitas"],
    ordemAviso: 5,
    ordemFalta: 5,
    render: function (b, ctx) {
      ctx.escolha = null;
      var cx = caixaPergunta(ctx, "escolha", b.pergunta);
      var grupo = el("div", "opcoes");
      grupo.setAttribute("role", "radiogroup");
      grupo.setAttribute("aria-labelledby", cx.id);
      var ops = [];
      (b.opcoes || []).forEach(function (o, i) {
        var lab = el("label", "opcao");
        var inp = el("input");
        inp.type = "radio";
        inp.name = cx.id;
        inp.value = String(i);
        lab.appendChild(inp);
        lab.appendChild(el("span", "opcao-txt", o.texto || ""));
        grupo.appendChild(lab);
        ops.push({ lab: lab, inp: inp });
        inp.addEventListener("change", function () {
          if (!inp.checked) return;
          ctx.escolha = i;
          aplicarEscolha(b, ctx.ui, i);
          ctx.mudou();
        });
      });
      cx.box.appendChild(grupo);
      var ret = el("div", "escolha-retorno");
      ret.setAttribute("aria-live", "polite");
      cx.box.appendChild(ret);
      ctx.ui = { ops: ops, ret: ret };
      aplicarEscolha(b, ctx.ui, -1);
      return cx.box;
    },
    pendentes: function (b, ctx) { return (ctx.escolha == null && ctx.ui.ops.length) ? 1 : 0; },
    estado: function (b, ctx) { return ctx.escolha == null ? undefined : ctx.escolha; },
    restaurar: function (b, ctx, valor) {
      if (typeof valor !== "number" || !ctx.ui.ops[valor]) return;
      ctx.escolha = valor;
      aplicarEscolha(b, ctx.ui, valor);
    }
  });

  // =====================================================================
  // Classificar em categorias (M6). Novo, sem equivalente no kit.
  // Três formas de mover um item: arrastar com o ponteiro; tocar no item e depois na
  // categoria; ou Tab até o item, Enter/Espaço, Tab até a categoria e Enter.
  // Estado = categoria de cada item (na ordem do data.js) na última verificação.
  // =====================================================================

  // Coloca cada item no seu recipiente (bandeja = -1), na ordem embaralhada da instância
  function distribuirCat(ui, pos) {
    ui.ordem.forEach(function (i) {
      var c = pos[i];
      var alvo = c >= 0 && ui.zonas[c] ? ui.zonas[c].lista : ui.bandeja;
      alvo.appendChild(ui.itens[i].li);
    });
    ui.bandejaBox.classList.toggle("vazia", pos.every(function (c) { return c >= 0; }));
  }

  function limparMarcasCat(ui) {
    ui.itens.forEach(function (it) {
      it.bt.classList.remove("ok", "erro");
      it.bt.removeAttribute("aria-disabled");
      it.bt.removeAttribute("aria-describedby");
      it.fb.hidden = true;
      it.fb.textContent = "";
    });
    ui.bandejaBox.hidden = false;
  }

  function aplicarCategorizar(b, ui, pos) {
    var certos = 0;
    distribuirCat(ui, pos);
    ui.itens.forEach(function (it, i) {
      var o = (b.itens || [])[i] || {};
      var fbTxt = o.fb == null ? "" : String(o.fb);
      var ok = pos[i] === o.categoria;
      var certa = ui.zonas[o.categoria] ? (ui.zonas[o.categoria].titulo.textContent || "").trim() : "";
      // Travado, mas focável (aria-disabled): o retorno continua acessível pelo Tab
      it.bt.setAttribute("aria-disabled", "true");
      it.bt.setAttribute("aria-pressed", "false");
      it.bt.classList.remove("ok", "erro", "sel");
      it.bt.classList.add(ok ? "ok" : "erro");
      // Certo/errado também em texto, não só pela cor
      it.fb.textContent = ((ok ? "Certo." : "Errado." + (certa ? " O lugar dele é “" + certa + "”." : "")) + " " + fbTxt).replace(/ $/, "");
      it.fb.hidden = false;
      it.bt.setAttribute("aria-describedby", it.fb.id);
      if (ok) certos++;
    });
    ui.zonas.forEach(function (z) { z.alvo.disabled = true; });
    ui.bandejaBox.hidden = true;   // tudo colocado e travado: a dica de "trocar de lugar" não vale
    ui.res.innerHTML = "";
    var n = ui.itens.length;
    ui.res.appendChild(certos === n
      ? texto("div", "resultado bom", b.msgAcerto || "Muito bem: todos os itens estão na categoria certa.")
      : texto("div", "resultado parcial", (b.msgRevisar || "Alguns itens merecem revisão. Veja o comentário de cada item.") +
          " (" + certos + " de " + n + " no lugar certo.)"));
    ui.ver.hidden = true;
    ui.ref.hidden = false;
  }

  bloco("categorizar", {
    aviso: "Classifique os itens e verifique para avançar.",
    falta: ["atividade de classificar ainda não verificada", "atividades de classificar ainda não verificadas"],
    ordemAviso: 7,
    ordemFalta: 7,
    render: function (b, ctx) {
      var cats = b.categorias || [];
      var itensB = b.itens || [];
      ctx.resp = null;     // categorias na última verificação (null = nunca verificou)
      ctx.pos = itensB.map(function () { return -1; });
      ctx.sel = null;

      var cx = caixaPergunta(ctx, "categorizar", b.enunciado);
      cx.box.appendChild(texto("p", "flow-help",
        "Arraste cada item para a categoria certa, ou toque no item e depois na categoria. No teclado: Enter no item e depois Enter na categoria."));

      var status = el("p", "sr-only");
      status.setAttribute("aria-live", "polite");

      var bandejaBox = el("div", "cat-bandeja");
      var bandejaRot = texto("p", "cat-bandeja-rot", "Itens para classificar");
      bandejaRot.id = cx.id + "-b";
      bandejaBox.appendChild(bandejaRot);
      var bandeja = el("ul", "cat-lista");
      bandeja.setAttribute("aria-labelledby", bandejaRot.id);
      bandejaBox.appendChild(bandeja);
      var tudoFeito = texto("p", "cat-bandeja-ok", "Todos os itens já estão numa categoria. Para trocar um item de lugar, selecione-o e escolha outra categoria.");
      bandejaBox.appendChild(tudoFeito);
      cx.box.appendChild(bandejaBox);

      var grade = el("div", "cat-zonas" + (cats.length === 3 ? " tres" : ""));
      var zonas = cats.map(function (titulo, c) {
        var z = el("div", "cat-zona c-" + CORES[c % CORES.length]);
        z.setAttribute("data-cat", c);
        var alvo = el("button", "cat-alvo");
        alvo.type = "button";
        var tit = el("span", "cat-titulo", titulo || "");
        tit.id = cx.id + "-c" + c;
        alvo.appendChild(tit);
        alvo.appendChild(texto("span", "cat-dica", "Colocar aqui o item selecionado"));
        alvo.disabled = true;
        z.appendChild(alvo);
        var ul = el("ul", "cat-lista");
        ul.setAttribute("aria-labelledby", tit.id);
        z.appendChild(ul);
        grade.appendChild(z);
        return { el: z, alvo: alvo, lista: ul, titulo: tit };
      });
      cx.box.appendChild(grade);

      var itens = itensB.map(function (o, i) {
        var li = el("li", "cat-item-li");
        var bt = el("button", "cat-item", o.texto || "");
        bt.type = "button";
        bt.setAttribute("aria-pressed", "false");
        bt.setAttribute("data-item", i);
        var fb = el("span", "fb");
        fb.id = cx.id + "-f" + i;
        fb.hidden = true;
        li.appendChild(bt);
        li.appendChild(fb);
        return { li: li, bt: bt, fb: fb };
      });

      var res = el("div", "quiz-resultado");
      res.setAttribute("aria-live", "polite");
      cx.box.appendChild(res);
      var acoes = el("div", "acoes");
      var ver = botao("btn-act", "Verificar");
      var ref = botao("btn-act sec", "Tentar de novo");
      ref.hidden = true;
      acoes.appendChild(ver);
      acoes.appendChild(ref);
      cx.box.appendChild(acoes);
      cx.box.appendChild(status);

      var ui = ctx.ui = { itens: itens, zonas: zonas, bandeja: bandeja, bandejaBox: bandejaBox, res: res, ver: ver, ref: ref,
                          ordem: embaralhar(itens.length) };
      distribuirCat(ui, ctx.pos);

      function nomeItem(i) { return (itens[i].bt.textContent || "").trim(); }
      function nomeCat(c) { return (zonas[c].titulo.textContent || "").trim(); }
      function travado(bt) { return bt.getAttribute("aria-disabled") === "true"; }
      // Limpa antes de escrever, para que leitores de tela repitam uma frase igual à anterior
      var anuncioT = 0;
      function anunciar(t) {
        status.textContent = "";
        clearTimeout(anuncioT);
        anuncioT = setTimeout(function () { status.textContent = t; }, 60);
      }

      function selecionar(i) {
        ctx.sel = i;
        itens.forEach(function (it, k) {
          it.bt.classList.toggle("sel", k === i);
          it.bt.setAttribute("aria-pressed", k === i ? "true" : "false");
          // Com um item selecionado, o Tab vai direto de uma categoria para a outra
          it.bt.tabIndex = (i != null && k !== i) ? -1 : 0;
        });
        zonas.forEach(function (z) { z.alvo.disabled = i == null; });
        grade.classList.toggle("escolhendo", i != null);
        if (i != null) anunciar("“" + nomeItem(i) + "” selecionado. Escolha a categoria.");
      }

      // Depois de mover, o foco fica no item (já na nova lista); o anúncio diz onde ele foi parar
      function mover(i, c) {
        ctx.pos[i] = c;
        res.innerHTML = "";
        distribuirCat(ui, ctx.pos);
        selecionar(null);
        anunciar("“" + nomeItem(i) + "” colocado em “" + nomeCat(c) + "”.");
        itens[i].bt.focus();
      }

      var aposArrastar = false;
      itens.forEach(function (it, i) {
        it.bt.addEventListener("click", function (e) {
          if (aposArrastar) { aposArrastar = false; return; }
          if (travado(it.bt)) return;
          var nova = ctx.sel === i ? null : i;
          selecionar(nova);
          // Pelo teclado (Enter/Espaço), o foco já vai para a primeira categoria
          if (nova != null && e.detail === 0 && zonas[0]) zonas[0].alvo.focus();
        });
      });

      zonas.forEach(function (z, c) {
        z.alvo.addEventListener("click", function () {
          if (ctx.sel == null) return;
          mover(ctx.sel, c);
        });
      });

      cx.box.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && ctx.sel != null) {
          var i = ctx.sel;
          selecionar(null);
          anunciar("Seleção cancelada.");
          itens[i].bt.focus();
        }
      });

      // Arrastar com o ponteiro (mouse, toque, caneta). Perto da borda de cima ou de baixo
      // da área de conteúdo, a tela rola sozinha (no celular as categorias ficam empilhadas).
      var drag = null;
      var palco = document.getElementById("stage");
      function zonaEm(x, y, bt) {
        bt.style.visibility = "hidden";
        var alvo = document.elementFromPoint(x, y);
        bt.style.visibility = "";
        return alvo && alvo.closest ? alvo.closest(".cat-zona") : null;
      }
      function acompanhar() {
        var d = drag;
        d.bt.style.transform = "translate(" + (d.cx - d.x) + "px," + (d.cy - d.y + palco.scrollTop - d.top0) + "px)";
        var z = zonaEm(d.cx, d.cy, d.bt);
        zonas.forEach(function (zz) { zz.el.classList.toggle("sobre", zz.el === z); });
      }
      function rolarSozinho() {
        if (!drag || !drag.ativo) return;
        var r = palco.getBoundingClientRect(), borda = 48, v = 0;
        if (drag.cy > r.bottom - borda) v = Math.min(16, (drag.cy - (r.bottom - borda)) / 3 + 2);
        else if (drag.cy < r.top + borda) v = -Math.min(16, ((r.top + borda) - drag.cy) / 3 + 2);
        if (v) {
          var antes = palco.scrollTop;
          palco.scrollTop = antes + v;
          if (palco.scrollTop !== antes) acompanhar();
        }
        drag.raf = window.requestAnimationFrame(rolarSozinho);
      }
      grade.parentNode.addEventListener("pointerdown", function (e) {
        var bt = e.target.closest && e.target.closest(".cat-item");
        if (!bt || travado(bt) || e.button > 0) return;
        document.addEventListener("pointermove", aoMover);
        document.addEventListener("pointerup", soltar);
        document.addEventListener("pointercancel", soltar);
        drag = { bt: bt, i: Number(bt.getAttribute("data-item")), x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY,
                 top0: palco.scrollTop, ativo: false, id: e.pointerId, raf: 0 };
      });
      function aoMover(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.cx = e.clientX;
        drag.cy = e.clientY;
        if (!drag.ativo) {
          if (Math.abs(drag.cx - drag.x) + Math.abs(drag.cy - drag.y) < 8) return;
          drag.ativo = true;
          drag.bt.classList.add("arrastando");
          grade.classList.add("escolhendo");
          try { drag.bt.setPointerCapture(e.pointerId); } catch (er) { /* sem captura */ }
          drag.raf = window.requestAnimationFrame(rolarSozinho);
        }
        e.preventDefault();
        acompanhar();
      }
      function soltar(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var d = drag;
        drag = null;
        document.removeEventListener("pointermove", aoMover);
        document.removeEventListener("pointerup", soltar);
        document.removeEventListener("pointercancel", soltar);
        if (!d.ativo) return;
        window.cancelAnimationFrame(d.raf);
        aposArrastar = true;
        setTimeout(function () { aposArrastar = false; }, 0);
        var z = e.type === "pointerup" ? zonaEm(e.clientX, e.clientY, d.bt) : null;
        d.bt.classList.remove("arrastando");
        d.bt.style.transform = "";
        zonas.forEach(function (zz) { zz.el.classList.remove("sobre"); });
        grade.classList.toggle("escolhendo", ctx.sel != null);
        if (z) mover(d.i, Number(z.getAttribute("data-cat")));
      }

      ver.addEventListener("click", function () {
        var faltam = ctx.pos.filter(function (c) { return c < 0; }).length;
        if (faltam) {
          res.innerHTML = "";
          res.appendChild(texto("div", "resultado parcial",
            faltam === 1 ? "Falta colocar 1 item numa categoria antes de verificar." : "Faltam " + faltam + " itens para colocar numa categoria antes de verificar."));
          return;
        }
        selecionar(null);
        ctx.resp = ctx.pos.slice();
        aplicarCategorizar(b, ui, ctx.resp);
        ref.focus();
        ctx.mudou();
      });

      ref.addEventListener("click", function () {
        limparMarcasCat(ui);
        res.innerHTML = "";
        ver.hidden = false;
        ref.hidden = true;
        selecionar(null);
        ver.focus();
      });

      return cx.box;
    },
    pendentes: function (b, ctx) { return (ctx.resp || !ctx.ui.itens.length) ? 0 : 1; },
    estado: function (b, ctx) { return ctx.resp ? ctx.resp.slice() : undefined; },
    restaurar: function (b, ctx, valor) {
      var n = ctx.ui.itens.length, m = ctx.ui.zonas.length;
      if (!valor || valor.length !== n || !n) return;
      for (var i = 0; i < n; i++) {
        if (typeof valor[i] !== "number" || valor[i] < 0 || valor[i] >= m) return;
      }
      ctx.resp = valor.slice();
      ctx.pos = valor.slice();
      aplicarCategorizar(b, ctx.ui, ctx.resp);
    }
  });

  // =====================================================================
  // Questionário com caminhos (M6). Modelo: ead-scorm/CTGESTAO_UD11_QUIZ (app.js).
  // Uma pergunta por vez, sem nota; cada alternativa tem retorno (textContent) e
  // "proxima" (id de outra pergunta do bloco, ou "fim"). No fim, resumo do caminho
  // e "Registrar respostas" (Scorm.gravarResposta, uma interação por pergunta).
  // Estado: {"r":[alternativa de cada pergunta, -1 = sem resposta],"e":1 se registrado}.
  // =====================================================================

  function textoPuro(html) {
    var d = document.createElement("div");
    d.innerHTML = html == null ? "" : String(html);
    return (d.textContent || "").replace(/\s+/g, " ").replace(/^ | $/g, "");
  }

  bloco("ramificado", {
    aviso: "Responda o questionário até o fim e registre as respostas para avançar.",
    falta: ["questionário ainda não registrado", "questionários ainda não registrados"],
    ordemAviso: 8,
    ordemFalta: 8,
    render: function (b, ctx) {
      var P = b.perguntas || [];
      var N = P.length;
      var idx = {};
      P.forEach(function (p, k) { if (p && p.id != null) idx[p.id] = k; });
      ctx.r = P.map(function () { return -1; });
      ctx.e = false;
      ctx.hist = [];
      ctx.vista = 0;   // índice da pergunta à mostra, ou "fim"

      var box = el("div", "bloco-q ramificado");
      var base = "kr" + ctx.seq("ram");

      function alt(k) { var p = P[k]; return p && ctx.r[k] >= 0 ? (p.alternativas || [])[ctx.r[k]] : null; }
      function destino(k) {
        var a = alt(k);
        if (!a) return null;
        if (a.proxima === "fim" || !idx.hasOwnProperty(a.proxima) || idx[a.proxima] === k) return "fim";
        return idx[a.proxima];
      }
      // Perguntas do caminho a partir da 1; para na primeira sem resposta
      function caminho() {
        var seq = [], k = 0, vistos = {};
        while (k !== "fim" && k != null && k < N && !vistos[k]) {
          vistos[k] = true;
          seq.push(k);
          k = destino(k);
        }
        return seq;
      }
      ctx.caminho = caminho;
      function completo() { var c = caminho(); return c.length > 0 && destino(c[c.length - 1]) === "fim"; }

      // ---------- telas das perguntas ----------
      var telas = P.map(function (p, k) {
        var sec = el("div", "ram-pergunta");
        sec.hidden = true;
        // O número fica dentro do enunciado focado: o leitor de tela anuncia "Pergunta n" junto
        var perg = el("p", "bloco-perg");
        perg.appendChild(texto("span", "ram-num", "Pergunta " + (k + 1)));
        perg.appendChild(el("span", "ram-enun", p.enunciado || ""));
        perg.id = base + "p" + k;
        perg.tabIndex = -1;
        sec.appendChild(perg);
        var grupo = el("div", "opcoes");
        grupo.setAttribute("role", "radiogroup");
        grupo.setAttribute("aria-labelledby", perg.id);
        var ops = (p.alternativas || []).map(function (a, j) {
          var lab = el("label", "opcao");
          var inp = el("input");
          inp.type = "radio";
          inp.name = base + "q" + k;
          inp.value = String(j);
          lab.appendChild(inp);
          lab.appendChild(el("span", "opcao-txt", a.texto || ""));
          grupo.appendChild(lab);
          inp.addEventListener("change", function () {
            if (!inp.checked || ctx.e) return;
            ctx.r[k] = j;
            atualizarPergunta(k);
            ctx.mudou();
          });
          return { lab: lab, inp: inp };
        });
        sec.appendChild(grupo);
        var ret = el("div", "escolha-retorno");
        ret.setAttribute("aria-live", "polite");
        sec.appendChild(ret);
        var acoes = el("div", "acoes ram-nav");
        var volta = botao("btn-act sec", "Voltar");
        var prox = botao("btn-act", "Próxima pergunta");
        acoes.appendChild(volta);
        acoes.appendChild(prox);
        sec.appendChild(acoes);
        volta.addEventListener("click", function () { mostrar(ctx.hist.length ? ctx.hist.pop() : 0, true); });
        prox.addEventListener("click", function () {
          var d = destino(k);
          if (d == null) return;
          ctx.hist.push(k);
          mostrar(d, true);
        });
        box.appendChild(sec);
        return { sec: sec, perg: perg, ops: ops, ret: ret, volta: volta, prox: prox };
      });

      function atualizarPergunta(k) {
        var t = telas[k], a = alt(k);
        t.ops.forEach(function (op, j) {
          op.inp.checked = (j === ctx.r[k]);
          op.inp.disabled = ctx.e;
          op.lab.classList.toggle("escolhida", j === ctx.r[k]);
          op.lab.classList.toggle("travada", ctx.e);
        });
        t.ret.innerHTML = "";
        if (a && a.retorno) {
          var card = el("div", "card pergunta");
          card.appendChild(texto("p", "card-tit", "Retorno"));   // não é título: fica numa região aria-live
          card.appendChild(texto("p", null, a.retorno));
          t.ret.appendChild(card);
        } else if (!a) {
          t.ret.appendChild(texto("p", "nota", "Escolha uma alternativa para continuar."));
        }
        var d = destino(k);
        t.prox.disabled = d == null;
        t.prox.textContent = d === "fim" ? "Ver resumo" : "Próxima pergunta";
      }

      // ---------- resumo ----------
      var fim = el("div", "ram-fim");
      fim.hidden = true;
      var fimTit = texto("h3", "ram-fim-tit", "Resumo das suas respostas");
      fimTit.tabIndex = -1;
      fim.appendChild(fimTit);
      var lista = el("ol", "ram-resumo");
      fim.appendChild(lista);
      var fimNota = texto("p", "nota", "Confira as respostas. Ao registrar, elas são enviadas à plataforma e não podem mais ser alteradas. O questionário não tem nota.");
      fim.appendChild(fimNota);
      var fimAcoes = el("div", "acoes");
      var reg = botao("btn-act", "Registrar respostas");
      var rev = botao("btn-act sec", "Revisar desde a pergunta 1");
      fimAcoes.appendChild(reg);
      fimAcoes.appendChild(rev);
      fim.appendChild(fimAcoes);
      var status = el("div", "refl-status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.tabIndex = -1;
      fim.appendChild(status);
      box.appendChild(fim);

      function desenharFim() {
        lista.innerHTML = "";
        caminho().forEach(function (k) {
          var li = el("li");
          li.setAttribute("value", k + 1);
          li.appendChild(el("span", "ram-resumo-p", P[k].enunciado || ""));
          var a = alt(k);
          var resp = el("strong", "ram-resumo-r", a ? (a.texto || "") : "");
          if (!a) resp.textContent = "Não respondida";
          li.appendChild(resp);
          lista.appendChild(li);
        });
        reg.hidden = ctx.e;
        rev.hidden = ctx.e;
        fimNota.hidden = ctx.e;
        reg.disabled = !completo();
        if (ctx.e) {
          status.innerHTML = "";
          status.appendChild(texto("p", "enviada", "✓ Respostas registradas. Obrigado."));
        }
      }

      reg.addEventListener("click", function () {
        if (ctx.e || !completo()) return;
        var ok = true;
        caminho().forEach(function (k) {
          var g = false;
          var txt = "Pergunta " + (k + 1) + ": " + textoPuro(P[k].enunciado) + " → " + textoPuro(alt(k).texto);
          try { g = window.Scorm.gravarResposta(b.id + "-P" + (k + 1), txt); } catch (er) { g = false; }
          ok = g && ok;
        });
        if (!ok) {
          status.innerHTML = "";
          status.appendChild(texto("div", "resultado parcial", "Não foi possível registrar agora. Suas respostas continuam na tela: tente novamente."));
          status.focus();
          return;
        }
        ctx.e = true;
        P.forEach(function (p, k) { atualizarPergunta(k); });
        desenharFim();
        status.focus();
        ctx.mudou();
      });
      rev.addEventListener("click", function () { ctx.hist = []; mostrar(0, true); });

      function mostrar(v, focar) {
        ctx.vista = v;
        telas.forEach(function (t, k) {
          t.sec.hidden = (k !== v);
          t.volta.hidden = ctx.hist.length === 0;
        });
        fim.hidden = (v !== "fim");
        if (v === "fim") {
          desenharFim();
          if (focar) fimTit.focus();
        } else if (telas[v]) {
          atualizarPergunta(v);
          if (focar) telas[v].perg.focus();
        }
      }
      ctx.mostrar = mostrar;
      ctx.atualizarPergunta = atualizarPergunta;

      if (!N) return box;
      mostrar(0, false);
      return box;
    },
    pendentes: function (b, ctx) { return (!ctx.e && (b.perguntas || []).length) ? 1 : 0; },
    estado: function (b, ctx) {
      if (!ctx.r || !ctx.r.some(function (v) { return v >= 0; })) return undefined;
      var o = { r: ctx.r.slice() };
      if (ctx.e) o.e = 1;
      return o;
    },
    restaurar: function (b, ctx, valor) {
      var P = b.perguntas || [];
      if (!valor || !valor.r || valor.r.length !== P.length) return;
      for (var k = 0; k < P.length; k++) {
        var v = valor.r[k];
        if (typeof v !== "number" || v < -1 || v >= (P[k].alternativas || []).length || v !== Math.floor(v)) return;
      }
      ctx.r = valor.r.slice();
      var c = ctx.caminho();
      if (valor.e === 1) {
        var ultimo = c[c.length - 1];
        var a = ultimo != null && ctx.r[ultimo] >= 0 ? P[ultimo].alternativas[ctx.r[ultimo]] : null;
        // Só aceita "registrado" com o caminho completo
        ctx.e = !!a;
      }
      P.forEach(function (p, k) { ctx.atualizarPergunta(k); });
      // Volta para a primeira pergunta sem resposta do caminho, ou para o resumo
      var pend = -1;
      for (var i = 0; i < c.length; i++) if (ctx.r[c[i]] < 0) { pend = i; break; }
      if (ctx.e || pend < 0) {
        ctx.hist = c.slice();
        ctx.mostrar("fim", false);
      } else {
        ctx.hist = c.slice(0, pend);
        ctx.mostrar(c[pend], false);
      }
    }
  });

  // =====================================================================
  // Impressão (M7): a leitura inteira numa página corrida, para o aluno salvar em PDF
  // e guardar como registro. A capa vira o cabeçalho; a tela de fim não entra.
  // Blocos passivos usam o próprio render; os interativos têm uma versão para
  // preencher à mão (sem gabarito). Cada tipo pode trazer `imprimir(b, ctx)`.
  // =====================================================================

  function caixa() { var c = el("span", "imp-caixa"); c.setAttribute("aria-hidden", "true"); return c; }

  // Lista de alternativas com caixa para marcar
  function opcoesMarcar(itens, rotulo) {
    var ul = el("ul", "imp-opcoes");
    itens.forEach(function (html, i) {
      var li = el("li");
      li.appendChild(caixa());
      li.appendChild(el("span", "imp-op-txt", html));
      if (rotulo) li.appendChild(texto("span", "imp-destino", rotulo(i)));
      ul.appendChild(li);
    });
    return ul;
  }

  function linhasEmBranco(n) {
    var d = el("div", "imp-linhas");
    d.setAttribute("aria-hidden", "true");
    for (var i = 0; i < n; i++) d.appendChild(el("div"));
    return d;
  }

  var IMPRESSAO = {
    quiz: function (b) {
      var wrap = el("div", "quiz");
      (b.perguntas || []).forEach(function (q) {
        var box = el("div", "quiz-q");
        box.appendChild(el("p", "quiz-pergunta", q.pergunta));
        box.appendChild(opcoesMarcar(q.opcoes || []));
        wrap.appendChild(box);
      });
      return wrap;
    },
    multipla: function (b) {
      var box = el("div", "bloco-q");
      box.appendChild(el("p", "bloco-perg", b.enunciado || ""));
      box.appendChild(texto("p", "nota", "Marque todas as alternativas que considerar corretas."));
      box.appendChild(opcoesMarcar((b.opcoes || []).map(function (o) { return o.texto || ""; })));
      return box;
    },
    escolha: function (b) {
      var box = el("div", "bloco-q");
      box.appendChild(el("p", "bloco-perg", b.pergunta || ""));
      box.appendChild(texto("p", "nota", "Marque uma alternativa."));
      box.appendChild(opcoesMarcar((b.opcoes || []).map(function (o) { return o.texto || ""; })));
      return box;
    },
    ordenar: function (b) {
      var box = el("div", "flow-block");
      box.appendChild(el("p", "flow-name", b.nome));
      box.appendChild(texto("p", "flow-help", "Numere os passos na ordem em que acontecem."));
      var ul = el("ul", "imp-numerar");
      var passos = b.passos || [];
      embaralhar(passos.length).forEach(function (i) {
        var li = el("li");
        li.appendChild(texto("span", "imp-num", ""));
        li.appendChild(el("span", null, passos[i]));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      if (b.nota) box.appendChild(el("div", "nota-fluxo", b.nota));
      return box;
    },
    // O "Confira" costuma trazer as respostas: vai para o anexo do fim, e aqui fica a referência
    confira: function (b, ctx) {
      var n = ctx.anexo.length + 1;
      var box = el("div", "imp-confira");
      box.appendChild(el("h3", null, b.titulo));
      paras(box, b.paras);
      box.insertBefore(texto("p", "imp-anexo-ref", n + "."), box.firstChild);
      ctx.anexo.push(box);
      var ref = el("p", "imp-confira-ref");
      ref.appendChild(texto("span", null, "Para conferir depois: "));
      ref.appendChild(el("strong", null, b.titulo));
      ref.appendChild(texto("span", null, " (no fim do documento, item " + n + ")."));
      return ref;
    },
    reflexao: function (b) {
      var box = el("div", "bloco-q");
      box.appendChild(el("p", "bloco-perg", b.pergunta || ""));
      // O aviso padrão fala do envio à plataforma; no papel fica só o cuidado com os dados
      var aviso = b.aviso == null ? "Não escreva nomes nem dados que identifiquem crianças, famílias ou casos reais." : String(b.aviso);
      if (aviso) box.appendChild(texto("p", "nota aviso-refl", aviso));
      var max = b.maxChars > 0 ? b.maxChars : 500;
      box.appendChild(linhasEmBranco(Math.max(4, Math.min(14, Math.round(max / 70)))));
      return box;
    },
    categorizar: function (b) {
      var box = el("div", "bloco-q");
      box.appendChild(el("p", "bloco-perg", b.enunciado || ""));
      box.appendChild(texto("p", "nota", "Marque, em cada linha, a categoria do item."));
      var cats = b.categorias || [], itens = b.itens || [];
      var tab = el("table", "imp-tabela");
      var tr = el("tr");
      tr.appendChild(texto("th", null, "Item"));
      cats.forEach(function (c) { tr.appendChild(el("th", null, c)); });
      var thead = el("thead");
      thead.appendChild(tr);
      tab.appendChild(thead);
      var tbody = el("tbody");
      embaralhar(itens.length).forEach(function (i) {
        var linha = el("tr");
        linha.appendChild(el("td", null, itens[i].texto || ""));
        cats.forEach(function () { var td = el("td", "imp-cel"); td.appendChild(caixa()); linha.appendChild(td); });
        tbody.appendChild(linha);
      });
      tab.appendChild(tbody);
      box.appendChild(tab);
      return box;
    },
    ramificado: function (b) {
      var P = b.perguntas || [];
      var idx = {};
      P.forEach(function (p, k) { idx[p.id] = k; });
      var box = el("div", "bloco-q ramificado");
      box.appendChild(texto("p", "nota", "Comece pela pergunta 1 e siga a indicação ao lado da alternativa que escolher."));
      P.forEach(function (p, k) {
        var q = el("div", "imp-ram-q");
        var perg = el("p", "bloco-perg");
        perg.appendChild(texto("span", "ram-num", "Pergunta " + (k + 1)));
        perg.appendChild(el("span", "ram-enun", p.enunciado || ""));
        q.appendChild(perg);
        var alts = p.alternativas || [];
        q.appendChild(opcoesMarcar(alts.map(function (a) { return a.texto || ""; }), function (j) {
          var d = alts[j].proxima;
          return d === "fim" || !idx.hasOwnProperty(d) ? "→ fim do questionário" : "→ vá para a pergunta " + (idx[d] + 1);
        }));
        box.appendChild(q);
      });
      return box;
    }
  };

  function imprimir(conteudo, raiz) {
    var C = conteudo;
    raiz = raiz || document.body;
    raiz.innerHTML = "";
    document.documentElement.classList.add("impressao");
    document.body.classList.add("impressao");
    var problema = problemaConteudo(C);
    if (problema) {
      raiz.appendChild(texto("p", "imp-erro", problema));
      return false;
    }
    var contadores = {};
    var ctx = {
      conteudo: C, imprimindo: true, anexo: [], el: el, paras: paras, lista: lista, embaralhar: embaralhar, CORES: CORES,
      mudou: function () {}, criarModal: function () {},
      seq: function (nome) { var v = contadores[nome] || 0; contadores[nome] = v + 1; return v; }
    };
    var doc = el("article", "imp-doc");

    // Cabeçalho: contexto + capa (ou o título da atividade) + campos para identificar o registro
    var cab = el("header", "imp-cab");
    if (C.contexto) cab.appendChild(texto("p", "imp-contexto", C.contexto));
    var capa = null;
    C.slides.forEach(function (s) { if (!capa && s && s.tipo === "capa") capa = s; });
    if (capa) {
      if (capa.kicker) cab.appendChild(el("p", "kicker", capa.kicker));
      cab.appendChild(el("h1", null, capa.titulo));
      if (capa.sub) cab.appendChild(el("p", "cover-sub", capa.sub));
    } else {
      cab.appendChild(texto("h1", null, C.titulo));
    }
    var reg = el("div", "imp-registro");
    ["Nome", "Data"].forEach(function (r) {
      var f = el("p");
      f.appendChild(texto("span", null, r + ":"));
      f.appendChild(el("span", "imp-campo"));
      reg.appendChild(f);
    });
    cab.appendChild(reg);
    doc.appendChild(cab);

    C.slides.forEach(function (s, t) {
      if (!s || s.tipo !== "conteudo") return;
      var sec = el("section", "imp-tela");
      if (s.kicker) sec.appendChild(el("p", "kicker", s.kicker));
      sec.appendChild(el("h2", "imp-tela-tit", s.titulo));
      (s.blocos || []).forEach(function (b, k) {
        b = b || {};
        var def = registro[b.tipo] || null;
        var no = null;
        try {
          var f = IMPRESSAO[b.tipo] || (def && def.imprimir);
          if (f) no = f(b, ctx);
          else if (def && !def.pendentes) no = def.render(b, ctx);
          else no = texto("p", "nota", "[Bloco \"" + b.tipo + "\" sem versão para impressão.]");
        } catch (e) {
          no = texto("p", "nota", "[Bloco \"" + b.tipo + "\" não pôde ser impresso.]");
        }
        if (no) sec.appendChild(no);
      });
      sec.setAttribute("data-tela", t);
      doc.appendChild(sec);
    });
    if (ctx.anexo.length) {
      var anexo = el("section", "imp-tela imp-anexo");
      anexo.appendChild(texto("h2", "imp-tela-tit", "Para conferir"));
      anexo.appendChild(texto("p", "nota", "Leia depois de responder às perguntas de cada tela."));
      ctx.anexo.forEach(function (box) { anexo.appendChild(box); });
      doc.appendChild(anexo);
    }
    raiz.appendChild(doc);
    return true;
  }

  return {
    versao: 2,
    iniciar: iniciar,
    imprimir: imprimir,
    bloco: bloco,
    tipos: function () { return Object.keys(registro); }
  };
})();

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
      if (e.key === "ArrowRight" || e.key === "PageDown") show(current + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") show(current - 1);
    });

    var tx = null;
    stage.addEventListener("touchstart", function (e) {
      tx = e.target.closest && e.target.closest(".drag-list") ? null : e.changedTouches[0].clientX;
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

  return {
    versao: 2,
    iniciar: iniciar,
    bloco: bloco,
    tipos: function () { return Object.keys(registro); }
  };
})();

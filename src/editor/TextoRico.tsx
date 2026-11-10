/**
 * Editor de texto rico mínimo (TipTap): negrito, itálico e link.
 *
 * - `inline` (padrão): sem parágrafos, para os campos que o motor já põe
 *   dentro de um <p>/<li>/<button>. Enter não quebra linha.
 * - `inline={false}`: um ou mais parágrafos (<p>).
 * - Saída: só <strong>, <em> e <a href target="_blank" rel="noopener">.
 *   O esquema do TipTap descarta qualquer outra marcação colada.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { EditorContent, Extension, Node, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { limparColagemHtml, limparColagemTexto, normalizarSaida, normalizarUrl, urlPermitida } from "./htmlRico";
import { Icone } from "./Icones";

const DocInline = Node.create({ name: "doc", topNode: true, content: "inline*" });

function extensoes(inline: boolean, abrirLink: () => void) {
  return [
    StarterKit.configure({
      document: inline ? false : undefined,
      paragraph: inline ? false : undefined,
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      hardBreak: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      link: false,
    }),
    ...(inline ? [DocInline] : []),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      HTMLAttributes: { target: "_blank", rel: "noopener", class: null },
      isAllowedUri: (url) => urlPermitida(url),
      shouldAutoLink: (url) => urlPermitida(url) || /^[^\s@]+\.[a-z]{2,}/i.test(url),
    }),
    Extension.create({
      name: "atalhoLink",
      addKeyboardShortcuts: () => ({
        "Mod-k": () => {
          abrirLink();
          return true;
        },
      }),
    }),
  ];
}

export interface PropsTextoRico {
  valor: string;
  aoMudar(html: string): void;
  /** id do elemento com o rótulo (aria-labelledby). */
  rotuloId: string;
  ajudaId?: string;
  /** Chave para o painel de problemas focar este campo. */
  foco?: string;
  inline?: boolean;
  id?: string;
}

export function TextoRico({ valor, aoMudar, rotuloId, ajudaId, foco, inline = true, id }: PropsTextoRico) {
  const ultimo = useRef(valor);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const [linkAberto, setLinkAberto] = useState(false);
  const abrirLinkRef = useRef(() => setLinkAberto(true));

  const editor = useEditor({
    extensions: extensoes(inline, () => abrirLinkRef.current()),
    content: valor || "",
    editorProps: {
      attributes: {
        class: "rico-area",
        role: "textbox",
        "aria-multiline": inline ? "false" : "true",
        "aria-labelledby": rotuloId,
        ...(ajudaId ? { "aria-describedby": ajudaId } : {}),
        ...(foco ? { "data-foco": foco } : {}),
        ...(id ? { id } : {}),
        spellcheck: "true",
        lang: "pt-BR",
      },
      transformPastedHTML: (html) => (inline ? limparColagemHtml(html) : html),
      transformPastedText: (texto) => (inline ? limparColagemTexto(texto) : texto),
    },
    onUpdate({ editor: ed }) {
      const html = normalizarSaida(ed.getHTML(), inline);
      ultimo.current = html;
      aoMudarRef.current(html);
    },
  });

  // Valor mudou por fora (desfazer, mover item, abrir outro projeto).
  useEffect(() => {
    if (!editor || valor === ultimo.current) return;
    ultimo.current = valor;
    editor.commands.setContent(valor || "", { emitUpdate: false });
  }, [valor, editor]);

  const ativo = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      negrito: ed?.isActive("bold") ?? false,
      italico: ed?.isActive("italic") ?? false,
      link: ed?.isActive("link") ?? false,
    }),
  });

  if (!editor) return null;
  return (
    <div className="rico">
      <EditorContent editor={editor} />
      <div className="rico-barra" role="toolbar" aria-label="Formatação">
        <BotaoFormato
          rotulo="Negrito (⌘B)"
          ativo={ativo?.negrito}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong aria-hidden="true">N</strong>
        </BotaoFormato>
        <BotaoFormato
          rotulo="Itálico (⌘I)"
          ativo={ativo?.italico}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em aria-hidden="true">I</em>
        </BotaoFormato>
        <BotaoFormato rotulo="Link (⌘K)" ativo={ativo?.link} onClick={() => setLinkAberto((v) => !v)}>
          <Icone nome="link" />
        </BotaoFormato>
      </div>
      {linkAberto && <EditorLink editor={editor} aoFechar={() => setLinkAberto(false)} />}
    </div>
  );
}

function BotaoFormato({
  rotulo,
  ativo,
  onClick,
  children,
}: {
  rotulo: string;
  ativo?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn-icone btn-formato"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={!!ativo}
      // Não tira o foco/seleção do editor ao clicar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EditorLink({ editor, aoFechar }: { editor: Editor; aoFechar(): void }) {
  const idCampo = useId();
  const atual = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [url, setUrl] = useState(atual);
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  function fechar() {
    aoFechar();
    editor.commands.focus();
  }

  function aplicar() {
    if (!url.trim()) return remover();
    const href = normalizarUrl(url);
    if (!href) {
      setErro("Endereço inválido. Use um endereço da web (https://…) ou um e-mail.");
      return;
    }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    aoFechar();
  }

  function remover() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    aoFechar();
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      aplicar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    }
  }

  return (
    <div className="rico-link" onKeyDown={teclas}>
      <label htmlFor={idCampo}>Endereço do link</label>
      <input
        id={idCampo}
        ref={campo}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={url}
        aria-invalid={!!erro}
        aria-describedby={erro ? `${idCampo}-erro` : undefined}
        onChange={(e) => {
          setUrl(e.target.value);
          setErro("");
        }}
      />
      <button type="button" className="btn btn-pequeno btn-primario" onClick={aplicar}>
        Aplicar
      </button>
      {atual && (
        <button type="button" className="btn btn-pequeno" onClick={remover}>
          Tirar link
        </button>
      )}
      <button type="button" className="btn btn-pequeno" onClick={fechar}>
        Cancelar
      </button>
      {erro && (
        <p id={`${idCampo}-erro`} className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      <p className="ajuda">O link sempre abre em nova aba, para o aluno não sair da atividade.</p>
    </div>
  );
}

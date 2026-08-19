import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";

const TextStyleWithSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => (el as HTMLElement).style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    };
  },
});
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, ChevronDown,
} from "lucide-react";

// ── Font options available on canvas (web-safe approximations of PDF fonts) ──
const FONT_OPTIONS = [
  { label: "Default",   value: "" },
  { label: "Arial",     value: "Arial, sans-serif" },
  { label: "Georgia",   value: "Georgia, serif" },
  { label: "Courier",   value: "'Courier New', monospace" },
  { label: "Times",     value: "'Times New Roman', serif" },
];

const SIZE_OPTIONS = [9, 10, 11, 12, 13, 14, 16, 18, 20];

// ── Toolbar ───────────────────────────────────────────────────────────────────

function ToolBtn({ active, disabled, onClick, title, children }: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={[
        "p-1 rounded transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border mx-0.5 shrink-0" />;
}

function Toolbar({ editor }: { editor: Editor }) {
  const currentFamily = editor.getAttributes("textStyle").fontFamily ?? "";
  const currentSize   = editor.getAttributes("textStyle").fontSize   ?? "";

  function setSize(size: string) {
    if (!size) editor.chain().focus().unsetMark("textStyle").run();
    else editor.chain().focus().setMark("textStyle", { fontSize: `${size}pt` }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1 bg-muted/40">
      {/* Font family */}
      <div className="relative flex items-center">
        <select
          value={currentFamily}
          onChange={e => {
            if (!e.target.value) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(e.target.value).run();
          }}
          className="appearance-none rounded border border-border bg-background px-2 pr-6 py-0.5 text-xs text-foreground cursor-pointer"
        >
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-muted-foreground" />
      </div>

      {/* Font size */}
      <div className="relative flex items-center">
        <select
          value={currentSize.replace("pt", "")}
          onChange={e => setSize(e.target.value)}
          className="appearance-none rounded border border-border bg-background px-2 pr-6 py-0.5 text-xs text-foreground cursor-pointer"
        >
          <option value="">Size</option>
          {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-muted-foreground" />
      </div>

      <Divider />

      <ToolBtn active={editor.isActive("bold")}       onClick={() => editor.chain().focus().toggleBold().run()}      title="Bold"      ><Bold      size={13} /></ToolBtn>
      <ToolBtn active={editor.isActive("italic")}     onClick={() => editor.chain().focus().toggleItalic().run()}    title="Italic"    ><Italic    size={13} /></ToolBtn>
      <ToolBtn active={editor.isActive("underline")}  onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" ><UnderlineIcon size={13} /></ToolBtn>

      <Divider />

      <ToolBtn active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Bullet list"   ><List        size={13} /></ToolBtn>
      <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list" ><ListOrdered size={13} /></ToolBtn>

      <Divider />

      <ToolBtn active={editor.isActive({ textAlign: "left" })}   onClick={() => editor.chain().focus().setTextAlign("left").run()}   title="Align left"  ><AlignLeft   size={13} /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center"><AlignCenter size={13} /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "right" })}  onClick={() => editor.chain().focus().setTextAlign("right").run()}  title="Align right" ><AlignRight  size={13} /></ToolBtn>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({ value, onChange, placeholder = "Write something…", minHeight = 120 }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, code: false, codeBlock: false }),
      TextAlign.configure({ types: ["paragraph", "listItem"] }),
      Underline,
      TextStyleWithSize,
      FontFamily,
      Color,
    ],
    content: value || `<p></p>`,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: "outline-none px-3 py-2 text-sm text-foreground",
        style: `min-height:${minHeight}px`,
        "data-placeholder": placeholder,
      },
    },
  });

  // Sync external value changes (e.g. from canvas edits) without resetting cursor
  const lastExternalValue = useCallback(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (current !== incoming && incoming !== "" && incoming !== "<p></p>") {
      editor.commands.setContent(incoming, false);
    }
  }, [editor, value]);
  useEffect(lastExternalValue, [value]);

  if (!editor) return null;

  return (
    <div className="rounded border border-border bg-background overflow-hidden focus-within:ring-1 focus-within:ring-primary/40">
      <Toolbar editor={editor} />
      <div className="relative">
        <EditorContent editor={editor} />
        {!value && (
          <div className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground/60 select-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

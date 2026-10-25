// The post editor's text box (plan, section 4: TipTap). Only what the site can show is allowed:
// paragraphs, subheads (h2, h3), lists, quotes, links, photos, bold, italic, underline and strike.
// The schema drops everything else, so text pasted from WhatsApp or Word arrives clean. Typing
// Malayalam works with any phone keyboard; the editor adds no keyboard of its own. Browser only.
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import type { RichDoc } from '../richtext';

interface Options {
  content: RichDoc;
  placeholder: string;
  lang: 'ml' | 'en';
  editable: boolean;
  onChange: (doc: RichDoc) => void;
}

export function createRichEditor(el: HTMLElement, o: Options) {
  return new Editor({
    element: el,
    editable: o.editable,
    content: o.content as JSONContent,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'], HTMLAttributes: { rel: 'noopener', target: null } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: o.placeholder }),
    ],
    editorProps: {
      attributes: { class: 'prose rich-input', lang: o.lang, 'aria-label': o.lang === 'ml' ? 'Text in Malayalam' : 'Text in English', 'aria-multiline': 'true', role: 'textbox' },
      // Drop inline styles and classes from pasted HTML before the schema sorts out the rest
      transformPastedHTML: (html) => html.replace(/\s(style|class|id)="[^"]*"/gi, ''),
    },
    onUpdate: ({ editor }) => o.onChange(editor.getJSON() as RichDoc),
  });
}

type Cmd = 'bold' | 'italic' | 'underline' | 'strike' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote' | 'link' | 'undo' | 'redo' | 'image';

/** Runs a toolbar button's command; `link` asks for the address */
export function runCommand(editor: Editor, cmd: Cmd) {
  const c = editor.chain().focus();
  switch (cmd) {
    case 'bold': return c.toggleBold().run();
    case 'italic': return c.toggleItalic().run();
    case 'underline': return c.toggleUnderline().run();
    case 'strike': return c.toggleStrike().run();
    case 'h2': return c.toggleHeading({ level: 2 }).run();
    case 'h3': return c.toggleHeading({ level: 3 }).run();
    case 'bulletList': return c.toggleBulletList().run();
    case 'orderedList': return c.toggleOrderedList().run();
    case 'blockquote': return c.toggleBlockquote().run();
    case 'undo': return c.undo().run();
    case 'redo': return c.redo().run();
    case 'link': {
      const current = editor.getAttributes('link').href as string | undefined;
      const url = window.prompt('Link address (leave empty to remove the link)', current ?? 'https://');
      if (url === null) return;
      const clean = url.trim();
      if (!clean || clean === 'https://') return c.extendMarkRange('link').unsetLink().run();
      if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(clean)) return void alert('Use a full address starting with https://');
      return c.extendMarkRange('link').setLink({ href: clean }).run();
    }
  }
}

/** Which toolbar buttons show as pressed for the current selection */
export function activeStates(editor: Editor): Partial<Record<Cmd, boolean>> {
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    link: editor.isActive('link'),
  };
}

import { emitKeypressEvents } from 'node:readline';
import { realpath } from 'node:fs/promises';
import { Editor, saveFile } from './editor';
import { fileEntries, sortFiles, type SortKey } from './sort';
import { join } from 'node:path';
import { discover } from './files';
import { render, sanitize } from './render';
import type { Options } from './config';

export async function browse(root: string, options: Options, initial?: { name: string; text: string; path?: string }, startEditing = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive mode requires a terminal');
  let entries = await fileEntries(root, initial ? [] : await discover(root, options.all));
  let sort: SortKey = options.sort, reverse = options.reverse;
  let editor: Editor | undefined, editorOffset = 0, discard = false, busy = false, statusMessage = '';
  if (startEditing && initial?.path) editor = new Editor(initial.text);
  if (startEditing && !initial?.path) throw new Error('Only local files can be edited');
  let selected = 0, offset = 0, query = '', editing = false, help = false, error = '';
  let document: { name: string; text: string; path?: string } | undefined = initial, lines: string[] = [], matches: number[] = [], match = -1;
  let revision = 0;
  const dimensions = () => ({ width: Math.max(10, process.stdout.columns || 80), height: Math.max(6, process.stdout.rows || 24) });
  const filtered = () => sortFiles(entries, sort, reverse).map(file => file.name).filter(file => file.toLowerCase().includes(query.toLowerCase()));
  const style = (s: string, code: number) => process.env.NO_COLOR === undefined ? `\x1b[${code}m${s}\x1b[0m` : s;
  const clip = (s: string, width: number) => Bun.stringWidth(s) <= width ? s : truncate(s, width);
  function truncate(s: string, width: number) {
    // Keep escape sequences intact while fitting the visible terminal columns.
    let result = '', used = 0;
    for (const token of s.match(/\x1b\[[0-9;]*m|[^]/gu) || []) {
      const size = token.startsWith('\x1b') ? 0 : Bun.stringWidth(token);
      if (used + size > width) break;
      result += token; used += size;
    }
    return result + '\x1b[0m';
  }
  function renderDocument() {
    if (!document) return;
    const { width } = dimensions();
    lines = render(document.text, { ...options, width: Math.max(10, Math.min(options.width, width - (options.showLineNumbers ? 7 : 2))) }).trimEnd().split('\n');
    matches = query ? lines.flatMap((line, index) => Bun.stripANSI(line).toLowerCase().includes(query.toLowerCase()) ? [index] : []) : [];
  }
  function draw() {
    const { width, height } = dimensions(), bodyHeight = height - 4;
    let body: string[] = [];
    let cursorPosition: { row: number; column: number } | undefined;
    if (editor) {
      const raw = editor.text.split('\n');
      editorOffset = Math.max(0, Math.min(editorOffset, editor.row));
      if (editor.row >= editorOffset + bodyHeight) editorOffset = editor.row - bodyHeight + 1;
      const before = raw[editor.row]!.slice(0, editor.column);
      const col = Bun.stringWidth(sanitize(before).replace(/\t/g, '    '));
      const horizontal = Math.max(0, col - width + 9);
      body = raw.slice(editorOffset, editorOffset + bodyHeight).map((line, i) => {
        let used = 0, visible = '';
        for (const ch of sanitize(line).replace(/\t/g, '    ')) {
          const size = Bun.stringWidth(ch);
          if (used >= horizontal) visible += ch;
          used += size;
        }
        return style(String(editorOffset + i + 1).padStart(5) + ' ', 2) + visible;
      });
      cursorPosition = { row: editor.row - editorOffset + 3, column: Math.min(width, Math.max(7, 7 + col - horizontal)) };
    } else if (help) body = ['Navigation', '', '↑/k ↓/j   Move / scroll', 'PgUp/b PgDn/space   Page', 'g / G   First / last', 'Enter   Open document', '/   Filter files / search document', 'Enter   Finish search    Esc   Clear / back', 'n / N   Next / previous search match', '?   Toggle help    q   Back / quit', 'e   Edit local document', 's   Cycle name/date/size sort    R   Reverse', 'Editor: Ctrl+S save    Esc return', 'Ctrl+C   Quit'];
    else if (document) {
      offset = Math.max(0, Math.min(offset, Math.max(0, lines.length - bodyHeight)));
      body = lines.slice(offset, offset + bodyHeight).map((line, i) => `${options.showLineNumbers ? style(String(offset + i + 1).padStart(5) + ' ', 2) : ''}${line}`);
    } else {
      const list = filtered();
      selected = Math.max(0, Math.min(selected, list.length - 1));
      const start = Math.max(0, selected - bodyHeight + 1);
      body = list.slice(start, start + bodyHeight).map((file, i) => {
        const entry = entries.find(entry => entry.name === file)!;
        const detail = sort === 'date' ? new Date(entry.modified).toISOString().slice(0, 16).replace('T', ' ') : sort === 'size' ? `${entry.size.toLocaleString('en')} B`.padStart(10) : '';
        return `${start + i === selected ? style('›', 35) : ' '} ${detail ? style(detail + '  ', 2) : ''}${start + i === selected ? style(sanitize(file), 1) : sanitize(file)}`;
      });
      if (!list.length) body = [query ? 'No matching Markdown files.' : 'No Markdown files found. Try --all to include hidden files.'];
    }
    const title = document ? sanitize(document.name) : `Local Markdown · ${sanitize(root)}`;
    const status = sanitize(error || statusMessage) || (editor ? (discard ? 'Discard unsaved changes? y discard / n keep editing' : `${editor.dirty ? 'Modified' : 'Saved'} · ${editor.row + 1}:${editor.column + 1}`) : (editing ? `/${sanitize(query)}▏` : document ? `${offset + 1}–${Math.min(lines.length, offset + bodyHeight)} / ${lines.length}${query ? ` · ${matches.length} matches for “${sanitize(query)}”` : ''}` : `${filtered().length} documents · sort: ${sort} ${reverse ? 'reversed' : sort === 'name' ? 'A–Z' : sort === 'date' ? 'newest first' : 'largest first'}${query ? ` · /${sanitize(query)}` : ''}`));
    const screen = [style(' LANTERN ', 35) + ' ' + title, style('─'.repeat(width), 2), ...Array.from({ length: bodyHeight }, (_, i) => body[i] || ''), status, style(editor ? ' Ctrl+S save  Esc back  arrows move  type to edit' : ' ↑↓ move  / search  e edit  s sort  R reverse  ? help  q back', 2)];
    process.stdout.write('\x1b[?25l\x1b[H' + screen.map(line => clip(line, width) + '\x1b[0m\x1b[K').join('\r\n'));
    if (cursorPosition) process.stdout.write(`\x1b[${cursorPosition.row};${cursorPosition.column}H\x1b[?25h`);
  }
  async function open(edit = false) {
    const name = filtered()[selected];
    if (!name) return;
    const current = ++revision;
    try {
      const text = await Bun.file(join(root, name)).text();
      const path = await realpath(join(root, name));
      if (current !== revision) return;
      document = { name, text, path }; if (edit) { editor = new Editor(text); editorOffset = 0; } query = ''; offset = 0; renderDocument(); draw();
    } catch (e) { error = (e as Error).message; draw(); }
  }
  renderDocument();
  await new Promise<void>((resolve) => {
    let closed = false;
    const cleanup = () => {
      if (closed) return; closed = true; revision++;
      process.stdin.removeListener('keypress', onKey);
      process.stdout.removeListener('resize', resize);
      process.removeListener('SIGTERM', cleanup);
      process.removeListener('SIGINT', cleanup);
      process.stdin.setRawMode(false); process.stdin.pause();
      process.stdout.write('\x1b[?25h\x1b[?1049l'); resolve();
    };
    function resize() { renderDocument(); draw(); }
    function leaveEditor() {
      editor = undefined; discard = false; statusMessage = ''; renderDocument(); draw();
    }
    async function save() {
      if (!editor || !document?.path) return;
      busy = true;
      try {
        await saveFile(await realpath(document.path), editor);
        document.text = editor.content; statusMessage = 'Saved';
        entries = await fileEntries(root, entries.map(entry => entry.name));
        renderDocument();
      } catch (e) { error = (e as Error).message; }
      finally { busy = false; if (!closed) draw(); }
    }
    function onKey(text: string, key: { name?: string; ctrl?: boolean; shift?: boolean } = {}) {
      if (busy) return;
      error = ''; statusMessage = '';
      if (editor) {
        if (discard) {
          if (text === 'y') leaveEditor();
          else if (text === 'n' || key.name === 'escape') { discard = false; draw(); }
          return;
        }
        if (key.ctrl && key.name === 's') { void save(); return; }
        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          if (editor.dirty) discard = true; else leaveEditor();
        } else if (key.name === 'backspace') editor.backspace();
        else if (key.name === 'delete') editor.delete();
        else if (key.name === 'return') editor.insert('\n');
        else if (key.name === 'tab') editor.insert('\t');
        else if (['left', 'right', 'up', 'down', 'home', 'end'].includes(key.name || '')) editor.move(key.name!);
        else if (text && !key.ctrl && !text.includes('\x1b')) editor.insert(sanitize(text));
        draw(); return;
      }
      if (key.ctrl && key.name === 'c') return cleanup();
      if (editing) {
        if (key.name === 'escape') { query = ''; editing = false; }
        else if (key.name === 'return') { editing = false; if (document && matches.length) offset = matches[0]!; }
        else if (key.name === 'backspace') query = [...query].slice(0, -1).join('');
        else if (text && !key.ctrl && !text.includes('\x1b')) query += sanitize(text);
        selected = 0; renderDocument(); draw(); return;
      }
      if (text === 'e' && !help) {
        if (!document) { void open(true); return; }
        if (!document.path) error = 'Only local files can be edited';
        else { editor = new Editor(document.text); editorOffset = 0; }
      }
      else if (!document && !help && (text === 's' || text === 'R')) {
        const name = filtered()[selected];
        if (text === 's') sort = sort === 'name' ? 'date' : sort === 'date' ? 'size' : 'name';
        else reverse = !reverse;
        selected = Math.max(0, filtered().indexOf(name || ''));
      }
      else if (text === '?') help = !help;
      else if (help && (text === 'q' || key.name === 'escape')) help = false;
      else if (text === 'q' || key.name === 'escape') {
        if (document && !initial) { document = undefined; query = ''; offset = 0; }
        else return cleanup();
      } else if (text === '/') { query = ''; editing = true; match = -1; }
      else if (!document && key.name === 'return') { void open(); return; }
      else {
        const page = dimensions().height - 5;
        const delta = key.name === 'down' || text === 'j' ? 1 : key.name === 'up' || text === 'k' ? -1 : key.name === 'pagedown' || text === ' ' || text === 'f' ? page : key.name === 'pageup' || text === 'b' ? -page : 0;
        if (document) {
          offset += delta;
          if (text === 'g' || key.name === 'home') offset = 0;
          if (text === 'G' || key.name === 'end') offset = lines.length;
          if ((text === 'n' || text === 'N') && matches.length) {
            match = (match + (text === 'N' ? -1 : 1) + matches.length) % matches.length;
            offset = matches[match]!;
          }
        } else {
          selected += delta;
          if (text === 'g' || key.name === 'home') selected = 0;
          if (text === 'G' || key.name === 'end') selected = filtered().length - 1;
        }
      }
      draw();
    }
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true); process.stdin.resume();
    process.stdin.on('keypress', onKey); process.stdout.on('resize', resize);
    process.on('SIGTERM', cleanup); process.on('SIGINT', cleanup);
    process.stdout.write('\x1b[?1049h\x1b[?25l'); draw();
  });
}

import { open, rename, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export class Editor {
  text: string;
  cursor = 0;
  preferredColumn: number | undefined;
  private lineEnding: string;
  constructor(public original: string) { this.lineEnding = original.includes('\r\n') ? '\r\n' : '\n'; this.text = original.replace(/\r\n/g, '\n'); }
  get content() { return this.text.replace(/\n/g, this.lineEnding); }
  get dirty() { return this.content !== this.original; }
  get row() { return this.text.slice(0, this.cursor).split('\n').length - 1; }
  get column() { return this.cursor === 0 ? 0 : this.cursor - (this.text.lastIndexOf('\n', this.cursor - 1) + 1); }
  insert(text: string) { this.text = this.text.slice(0, this.cursor) + text + this.text.slice(this.cursor); this.cursor += text.length; this.preferredColumn = undefined; }
  backspace() {
    if (!this.cursor) return;
    const size = [...this.text.slice(0, this.cursor)].at(-1)!.length;
    this.text = this.text.slice(0, this.cursor - size) + this.text.slice(this.cursor); this.cursor -= size; this.preferredColumn = undefined;
  }
  delete() {
    const size = [...this.text.slice(this.cursor)][0]?.length || 0;
    this.text = this.text.slice(0, this.cursor) + this.text.slice(this.cursor + size); this.preferredColumn = undefined;
  }
  move(key: string) {
    if (key === 'up' || key === 'down') {
      const lines = this.text.split('\n'), row = this.row;
      const target = Math.max(0, Math.min(lines.length - 1, row + (key === 'up' ? -1 : 1)));
      this.preferredColumn ??= this.column;
      this.cursor = lines.slice(0, target).reduce((n, line) => n + line.length + 1, 0) + Math.min(this.preferredColumn, lines[target]!.length);
      // Avoid landing inside a surrogate pair on a shorter adjacent line.
      if (this.cursor > 0 && /[\uDC00-\uDFFF]/.test(this.text[this.cursor] || '')) this.cursor--;
      return;
    }
    this.preferredColumn = undefined;
    if (key === 'left') this.cursor -= [...this.text.slice(0, this.cursor)].at(-1)?.length || 0;
    if (key === 'right') this.cursor += [...this.text.slice(this.cursor)][0]?.length || 0;
    if (key === 'home') this.cursor -= this.column;
    if (key === 'end') { const end = this.text.indexOf('\n', this.cursor); this.cursor = end === -1 ? this.text.length : end; }
  }
}
export async function saveFile(path: string, editor: Editor) {
  if (await Bun.file(path).text() !== editor.original) throw new Error('File changed on disk. Your edits are retained; reopen before saving.');
  const info = await stat(path);
  const temporary = join(dirname(path), `.lantern-${crypto.randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', info.mode & 0o777);
    try { await file.chmod(info.mode & 0o777); await file.writeFile(editor.content); await file.sync(); } finally { await file.close(); }
    // Recheck after writing the temporary file to avoid overwriting detected external edits.
    if (await Bun.file(path).text() !== editor.original) throw new Error('File changed on disk. Your edits are retained; reopen before saving.');
    await rename(temporary, path);
    editor.original = editor.content;
  } finally { await unlink(temporary).catch(() => {}); }
}

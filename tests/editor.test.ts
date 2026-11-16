import { test, expect, afterAll } from 'bun:test';
import { mkdtemp, rm, chmod, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Editor, saveFile } from '../src/editor';
import { sortFiles } from '../src/sort';
const temp = await mkdtemp(join(tmpdir(), 'lantern-editor-'));
afterAll(() => rm(temp, { recursive: true, force: true }));
test('editor inserts, joins lines, and moves through Unicode without splitting pairs', () => {
  const editor = new Editor('abc\nx\nhello');
  editor.move('end'); editor.move('down'); expect(editor.column).toBe(1);
  editor.move('down'); expect(editor.column).toBe(3);
  editor.move('home'); editor.backspace(); expect(editor.text).toBe('abc\nxhello');
  editor.insert('😀'); editor.move('left'); editor.delete(); expect(editor.text).toBe('abc\nxhello');
  editor.move('home'); editor.move('up'); editor.move('home');
  editor.insert('😀'); editor.backspace(); expect(editor.text).toBe('abc\nxhello');
  expect(new Editor('\n').column).toBe(0);
});
test('saving writes complete contents, preserves permissions and CRLF', async () => {
  const path = join(temp, 'saved.md');
  await Bun.write(path, '# Original\r\n'); await chmod(path, 0o640);
  const editor = new Editor(await Bun.file(path).text());
  expect(editor.dirty).toBe(false);
  editor.move('end'); editor.insert(' updated');
  await saveFile(path, editor);
  expect(await Bun.file(path).text()).toBe('# Original updated\r\n');
  expect((await stat(path)).mode & 0o777).toBe(0o640);
  expect(editor.dirty).toBe(false);
  expect((await readdir(temp)).some(name => name.endsWith('.tmp'))).toBe(false);
});
test('saving refuses external changes and retains unsaved buffer', async () => {
  const path = join(temp, 'conflict.md'); await Bun.write(path, 'original');
  const editor = new Editor('original'); editor.insert('mine ');
  await Bun.write(path, 'external');
  await expect(saveFile(path, editor)).rejects.toThrow('File changed on disk');
  expect(await Bun.file(path).text()).toBe('external'); expect(editor.text).toBe('mine original'); expect(editor.dirty).toBe(true);
});
test('browser sorts name, date and size deterministically in either direction', () => {
  const files = [ { name: 'z.md', modified: 10, size: 1 }, { name: 'A.md', modified: 30, size: 2 }, { name: 'b.md', modified: 20, size: 3 } ];
  const names = (key: 'name' | 'date' | 'size', reverse = false) => sortFiles(files, key, reverse).map(f => f.name);
  expect(names('name')).toEqual(['A.md', 'b.md', 'z.md']);
  expect(names('date')).toEqual(['A.md', 'b.md', 'z.md']);
  expect(names('size')).toEqual(['b.md', 'A.md', 'z.md']);
  expect(names('name', true)).toEqual(['z.md', 'b.md', 'A.md']);
  expect(names('date', true)).toEqual(['z.md', 'b.md', 'A.md']);
  expect(names('size', true)).toEqual(['z.md', 'A.md', 'b.md']);
  expect(files[0]!.name).toBe('z.md');
});

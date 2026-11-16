import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { render, sanitize } from '../src/render';
import { discover, readSource } from '../src/files';
import { loadConfig } from '../src/config';
import { splitCommand } from '../index';
const temp = await mkdtemp(join(tmpdir(), 'lantern-test-'));
afterAll(() => rm(temp, { recursive: true, force: true }));
const opts = { style: 'notty' as const, width: 40, preserveNewLines: false };
async function cli(args: string[], input = '') {
  const inputPath = join(temp, 'stdin-' + crypto.randomUUID());
  await Bun.write(inputPath, input);
  const process = Bun.spawn([Bun.which('bun')!, resolve('index.ts'), ...args], { stdin: Bun.file(inputPath), stdout: 'pipe', stderr: 'pipe', env: { ...Bun.env, XDG_CONFIG_HOME: temp } });
  const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  return { stdout, stderr, code };
}
describe('rendering', () => {
  test('renders GFM, links, and code without ANSI in notty mode', () => {
    const output = render('# Heading\n\n**bold** [site](https://example.com)\n\n- [x] done\n\n| A | B |\n|---|---|\n| one | two |\n\n```ts\nconst x = 1\n```', opts);
    expect(output).toContain('Heading'); expect(output).toContain('https://example.com');
    expect(output).toContain('done'); expect(output).toContain('one'); expect(output).toContain('const x = 1');
    expect(output).not.toContain('\x1b'); expect(output).not.toContain('**bold**');
  });
  test('wraps prose to requested width', () => {
    const output = render('word '.repeat(50), opts);
    expect(output.trim().split('\n').every(line => Bun.stringWidth(line) <= 40)).toBe(true);
  });
  test('strips injected terminal commands', () => {
    expect(sanitize('hello\x1b[2Jworld\x07\x1b]0;evil\x07')).toBe('helloworld');
  });
});
test('preserving prose line breaks leaves fenced code intact', () => {
  const source = 'first\nsecond\n\n```ts\nconst value = 1;\nconsole.log(value);\n```';
  const output = render(source, { ...opts, preserveNewLines: true });
  expect(output).toContain('first\nsecond');
  expect(output).toContain('const value = 1;');
  expect(output).toContain('console.log(value);');
});
test('CLI supports stdin, files, help, and actionable errors', async () => {
  expect((await cli(['-'], '# Piped')).stdout).toContain('Piped');
  expect((await cli([], '# Automatic')).stdout).toContain('Automatic');
  const path = join(temp, 'hello.md'); await Bun.write(path, '# File');
  expect((await cli([path])).stdout).toContain('File');
  expect((await cli(['--help'])).stdout).toContain('Usage:');
  expect((await cli(['--width', 'NaN', path])).code).toBe(1);
  expect((await cli(['--style', 'invalid', path])).stderr).toContain('Style must');
  expect((await cli([join(temp, 'missing')])).code).toBe(1);
  expect((await cli(['--unknown'])).code).toBe(1);
  expect((await cli(['--sort', 'invalid', path])).stderr).toContain('Sort must');
  expect((await cli(['--edit', '--pager', path])).stderr).toContain('Cannot combine');
});
test('discovery honors Git ignores and skips symlink cycles', async () => {
  const dir = join(temp, 'repo'); await mkdir(dir);
  await Bun.spawn(['git', 'init', dir], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await Bun.write(join(dir, 'README.md'), '# Hi');
  await Bun.write(join(dir, '.gitignore'), 'ignored/\n');
  await Bun.write(join(dir, 'ignored', 'secret.md'), 'hidden');
  await Bun.write(join(dir, '.hidden.md'), 'hidden');
  await symlink(dir, join(dir, 'cycle'));
  expect(await discover(dir)).toEqual(['README.md']);
  expect(await discover(dir, true)).toEqual(['.hidden.md', 'README.md', 'ignored/secret.md']);
  expect((await cli([dir])).stdout).toContain('Hi');
});
test('config YAML validates values', async () => {
  const path = join(temp, 'config.yml');
  await Bun.write(path, 'width: 60\nstyle: light\nall: true\nsort: size\nreverse: true\n');
  expect(await loadConfig(path)).toMatchObject({ width: 60, style: 'light', all: true, sort: 'size', reverse: true });
  await Bun.write(path, 'width: nope');
  await expect(loadConfig(path)).rejects.toThrow('Invalid config');
});
test('HTTP sources validate status', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: string | URL | Request) => new Response('# Remote', { status: String(input).endsWith('/missing') ? 404 : 200 })) as typeof fetch;
    expect(await readSource('https://example.com/readme.md')).toBe('# Remote');
    await expect(readSource('https://example.com/missing')).rejects.toThrow('HTTP 404');
  } finally { globalThis.fetch = original; }
});
test('editor and pager commands support quoted arguments', () => {
  expect(splitCommand('less -R')).toEqual(['less', '-R']);
  expect(splitCommand('"/path with spaces/editor" --wait')).toEqual(['/path with spaces/editor', '--wait']);
});

#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { stat, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { configPath, loadConfig, validate } from './src/config';
import { readSource, repositoryRoot, discover } from './src/files';
import { render } from './src/render';
import { browse } from './src/tui';

const help = `Lantern — a Bun-native Markdown reader inspired by Glow

Usage: lantern [options] [FILE | DIR | URL | -]

No source: browse Markdown in the current Git repository or directory.
Piped input is rendered automatically. Use - to explicitly read stdin.

  -a, --all                 Include hidden and ignored files
  -s, --style STYLE         auto, dark, light, notty
  -w, --width COLUMNS       Wrap width (10–1000; default terminal width, max 120)
  -p, --pager               Display through $PAGER (default: less -R)
  -t, --tui                 Open source in the built-in interactive reader
  -e, --edit               Edit a local file in the built-in editor
      --sort KEY           name (A–Z), date (newest), size (largest)
      --reverse            Reverse sort order
  -l, --line-numbers        Show line numbers in the interactive reader
      --preserve-new-lines Preserve soft line breaks
      --config PATH        Read an alternate YAML config
  -h, --help               Show help
  -v, --version            Show version

  lantern config           Create/open config with $EDITOR
  lantern config --path    Print config path

Examples:
  lantern README.md
  lantern docs/
  echo '# Hello' | lantern
  lantern github.com/charmbracelet/glow
  lantern -s light -w 60 https://example.com/README.md
`;
export async function main(args = Bun.argv.slice(2)) {
  const { values: flags, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    all: { type: 'boolean', short: 'a' }, style: { type: 'string', short: 's' }, width: { type: 'string', short: 'w' },
    pager: { type: 'boolean', short: 'p' }, tui: { type: 'boolean', short: 't' },
    'line-numbers': { type: 'boolean', short: 'l' }, 'preserve-new-lines': { type: 'boolean' },
    edit: { type: 'boolean', short: 'e' }, sort: { type: 'string' }, reverse: { type: 'boolean' },
    config: { type: 'string' }, path: { type: 'boolean' },
  } });
  if (flags.help) { console.log(help); return; }
  if (flags.version) { console.log('lantern 0.1.0'); return; }
  if (positionals.length > 1) throw new Error('Expected at most one source');
  if (positionals[0] === 'config') {
    const path = flags.config || configPath;
    if (flags.path) { console.log(path); return; }
    if (!await Bun.file(path).exists()) {
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, '# Lantern configuration\nstyle: auto\nwidth: 80\nsort: name\nreverse: false\nall: false\npager: false\nshowLineNumbers: false\npreserveNewLines: false\n');
    }
    const editor = process.env.EDITOR || process.env.VISUAL;
    if (!editor) { console.log(path); return; }
    // Parse simple quoted editor arguments, then spawn directly without shell expansion.
    const command = splitCommand(editor);
    const child = Bun.spawn([...command, path], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
    if (await child.exited) throw new Error('Editor exited unsuccessfully');
    return;
  }
  const options = await loadConfig(flags.config, !!flags.config);
  if (flags.style !== undefined) options.style = flags.style as typeof options.style;
  if (flags.width !== undefined) options.width = Number(flags.width);
  if (flags.all !== undefined) options.all = flags.all;
  if (flags.pager !== undefined) options.pager = flags.pager;
  if (flags.tui !== undefined) options.tui = flags.tui;
  if (flags['line-numbers'] !== undefined) options.showLineNumbers = flags['line-numbers'];
  if (flags['preserve-new-lines'] !== undefined) options.preserveNewLines = flags['preserve-new-lines'];
  if (flags.sort !== undefined) options.sort = flags.sort as typeof options.sort;
  if (flags.reverse !== undefined) options.reverse = flags.reverse;
  if (flags.edit) options.tui = true;
  validate(options);
  let source = positionals[0];
  if (!source && !process.stdin.isTTY) source = '-';
  if (!source) { await browse(await repositoryRoot(process.cwd()), options); return; }
  const info = await stat(source).catch(() => null);
  if (info?.isDirectory()) {
    const root = resolve(source);
    if (process.stdin.isTTY && process.stdout.isTTY) { await browse(root, options); return; }
    const files = await discover(root, options.all);
    const readme = files.find(file => /^readme\.(md|markdown)$/i.test(file)) || files.find(file => /(^|\/)readme\.(md|markdown)$/i.test(file));
    if (!readme) throw new Error(`No README found in ${source}; directory browsing requires a terminal`);
    source = join(root, readme);
  }
  const text = await readSource(source);
  if (options.tui) { await browse(process.cwd(), options, { name: source, text, path: source !== '-' && !/^(?:https?:\/\/|github\.com\/|gitlab\.com\/)/.test(source) ? resolve(source) : undefined }, !!flags.edit); return; }
  const output = render(text, options);
  if (options.pager && process.stdout.isTTY) {
    const command = splitCommand(process.env.PAGER || 'less -R');
    if (!Bun.which(command[0]!)) throw new Error(`Pager not found: ${command[0]}; set PAGER or use --tui`);
    const child = Bun.spawn(command, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
    await child.stdin.write(output); await child.stdin.end();
    const code = await child.exited;
    if (code) throw new Error(`Pager exited with status ${code}`);
  } else await Bun.write(Bun.stdout, output);
}
export function splitCommand(command: string): string[] {
  const args = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(arg => arg.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => a ?? b)) || [];
  if (!args.length) throw new Error('Empty command');
  return args;
}
if (import.meta.main) main().catch(error => { console.error(`lantern: ${error.message}`); process.exitCode = 1; });

import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
export async function repositoryRoot(cwd: string): Promise<string> {
  let dir = resolve(cwd);
  while (true) {
    if (await Bun.file(join(dir, '.git')).exists() || await stat(join(dir, '.git')).catch(() => null)) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}
export async function discover(root: string, all = false): Promise<string[]> {
  const result: string[] = [];
  // Git provides correct nested .gitignore / negation behavior without parsing patterns ourselves.
  const git = Bun.which('git');
  if (!all && git) {
    const child = Bun.spawn([git, '-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { stdout: 'pipe', stderr: 'ignore' });
    const output = await new Response(child.stdout).text();
    if (await child.exited === 0) {
      for (const file of new Set(output.split('\0').filter(Boolean))) {
        if (/\.(md|markdown|mdown|mkd)$/i.test(file) && !file.split('/').some(p => p.startsWith('.')) && (await stat(join(root, file)).catch(() => null))?.isFile()) result.push(file);
      }
      return result.sort();
    }
  }
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || (!all && (entry.name.startsWith('.') || entry.name === 'node_modules'))) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(md|markdown|mdown|mkd)$/i.test(entry.name)) result.push(relative(root, path));
    }
  }
  await walk(root);
  return result.sort();
}
export async function readSource(source: string): Promise<string> {
  if (source === '-') return await Bun.stdin.text();
  const repo = source.match(/^(?:https?:\/\/)?(github\.com|gitlab\.com)\/([^/]+)\/([^/#?]+)\/?$/);
  if (repo) {
    const [, host, owner, name] = repo;
    if (host === 'github.com') {
      const response = await fetch(`https://api.github.com/repos/${owner}/${name}/readme`, { headers: { Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`GitHub README: HTTP ${response.status}`);
      return await response.text();
    }
    return readSource(`https://gitlab.com/${owner}/${name}/-/raw/HEAD/README.md`);
  }
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${source}`);
    return await response.text();
  }
  if (/^[a-z]+:\/\//i.test(source)) throw new Error('Only HTTP and HTTPS URLs are supported');
  return await Bun.file(source).text();
}

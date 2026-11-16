export type Style = 'auto' | 'dark' | 'light' | 'notty';
export interface RenderOptions { width: number; style: Style; preserveNewLines: boolean }
// Remove terminal control sequences from untrusted files and remote documents.
export function sanitize(text: string): string {
  return Bun.stripANSI(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}
export function render(text: string, options: RenderOptions): string {
  const colors = options.style !== 'notty' && process.env.NO_COLOR === undefined &&
    (options.style !== 'auto' || !!process.stdout.isTTY);
  let source = sanitize(text);
  if (options.preserveNewLines) {
    let fence: string | undefined;
    source = source.split('\n').map(line => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = undefined;
        return line;
      }
      return fence || /^(?: {4}|\t)/.test(line) || !line.trim() ? line : line + '  ';
    }).join('\n');
  }
  return Bun.markdown.ansi(source, {
    columns: options.width, colors,
    light: options.style === 'light' || (options.style === 'auto' && process.env.COLORFGBG?.split(';').at(-1) === '15'),
    hyperlinks: false,
  });
}

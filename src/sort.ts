import { stat } from 'node:fs/promises';
import { join } from 'node:path';
export type SortKey = 'name' | 'date' | 'size';
export interface FileEntry { name: string; size: number; modified: number }
export async function fileEntries(root: string, names: string[]): Promise<FileEntry[]> {
  return await Promise.all(names.map(async name => {
    const info = await stat(join(root, name)).catch(() => null);
    return { name, size: info?.size || 0, modified: info?.mtimeMs || 0 };
  }));
}
export function sortFiles(files: FileEntry[], key: SortKey, reverse = false): FileEntry[] {
  return [...files].sort((a, b) => {
    const name = a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name, 'en');
    return (key === 'name' ? name : (key === 'date' ? b.modified - a.modified : b.size - a.size) || name) * (reverse ? -1 : 1);
  });
}

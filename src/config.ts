import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SortKey } from './sort';
import type { RenderOptions } from './render';
export interface Options extends RenderOptions { sort: SortKey; reverse: boolean; all: boolean; pager: boolean; tui: boolean; showLineNumbers: boolean }
export const configPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'lantern', 'glow.yml');
export const defaults: Options = { width: Math.min(process.stdout.columns || 80, 120), style: 'auto', sort: 'name', reverse: false, all: false, pager: false, tui: false, showLineNumbers: false, preserveNewLines: false };
export async function loadConfig(path = configPath, required = false): Promise<Options> {
  if (!await Bun.file(path).exists()) {
    if (required) throw new Error(`Config file not found: ${path}`);
    return { ...defaults };
  }
  const data = Bun.YAML.parse(await Bun.file(path).text());
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Config must be a YAML mapping');
  const options = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Options)[]) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (typeof value !== typeof defaults[key]) throw new Error(`Invalid config value: ${key}`);
      Object.assign(options, { [key]: value });
    }
  }
  validate(options);
  return options;
}
export function validate(options: Options) {
  if (!Number.isInteger(options.width) || options.width < 10 || options.width > 1000) throw new Error('Width must be an integer between 10 and 1000');
  if (!['auto', 'dark', 'light', 'notty'].includes(options.style)) throw new Error('Style must be auto, dark, light, or notty');
  if (!['name', 'date', 'size'].includes(options.sort)) throw new Error('Sort must be name, date, or size');
  if (options.pager && options.tui) throw new Error('Cannot combine --pager and --tui');
}

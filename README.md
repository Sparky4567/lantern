# Lantern

A terminal Markdown reader and editor built with Bun and TypeScript, inspired by [Charmbracelet Glow](https://github.com/charmbracelet/glow).

Browse local documentation, read remote READMEs, edit local files, and sort your library without leaving the terminal. Lantern uses Bun's native Markdown renderer, with no third-party runtime dependencies and no Go or Node.js installation required.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Install the command](#install-the-command)
- [Read Markdown](#read-markdown)
- [Browse and search](#browse-and-search)
- [Edit and save](#edit-and-save)
- [Sort files](#sort-files)
- [Command reference](#command-reference)
- [Configuration](#configuration)
- [Build and development](#build-and-development)
- [Troubleshooting](#troubleshooting)
- [Scope and limitations](#scope-and-limitations)
- [License](#license)

## Requirements

- **Bun 1.4.4 or newer**, with `Bun.markdown.ansi` and `Bun.YAML`. Install Bun from [bun.sh](https://bun.sh/) if needed.
- A terminal with interactive input and output for the browser and editor. Rendering files or piped input also works without a terminal.
- Optional: **Git** for honoring Git ignore rules during discovery.
- Optional: **less** or another pager for `--pager`. The built-in reader needs no external pager.
- Internet access for HTTP sources and remote repository READMEs.

Check your Bun version:

```sh
bun --version
```

## Quick start

Open a terminal in this project directory, then install the command:

```sh
./install.sh
export PATH="$HOME/.local/bin:$PATH"  # Bash/Zsh: enable it in this session
lantern
```

For Fish, use `fish_add_path "$HOME/.local/bin"` instead of `export`. Future sessions load the PATH entry added by the installer. Installation builds directly from source; `bun install` is needed for development tools, not for the standalone installation.

Select a Markdown file with the arrow keys and press **Enter** to read it. Press **e** to edit, **Ctrl+S** to save, and **Esc** to return to the preview. Press **q** to return to the browser, then **q** again to quit.

Once installed, use Lantern from any folder:

```sh
lantern README.md
lantern --tui README.md
lantern --edit README.md
lantern --sort date .
lantern --help
```

To run the source directly without installing the command:

```sh
bun index.ts
bun index.ts --tui README.md
```

For development tools and tests, run `bun install` in the checkout first.

`bun index.ts` commands in this guide run from the project directory. Once you install the command below, replace `bun index.ts` with `lantern` to use it from any directory.

## Install the command

On Linux or macOS, run the installer from your checkout:

```sh
./install.sh
```

The executable [install.sh](install.sh) script builds a standalone executable, installs it as `~/.local/bin/lantern`, and adds that directory to your shell configuration for Bash (`~/.bashrc`), Zsh (`${ZDOTDIR:-$HOME}/.zshrc`), or Fish (`${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish`). It does not need `sudo` or install third-party runtime dependencies. Bun must already be available to build the executable.

Restart your shell after installation, or load the PATH in your current Bash/Zsh session:

```sh
export PATH="$HOME/.local/bin:$PATH"
lantern --version
cd /path/to/your/notes
lantern
```

For Fish, run `fish_add_path "$HOME/.local/bin"` in the current session. A running installer cannot change its parent shell's environment. For other shells, add the install directory to PATH using your shell's configuration.

You can run the script by its path from another directory. Custom installation directories and skipping shell configuration are supported:

```sh
/path/to/lantern/install.sh
./install.sh --bin-dir "$HOME/bin"
./install.sh --no-path
./install.sh --help
```

Installer options:

| Option | Effect |
| --- | --- |
| `--bin-dir DIR` | Set the executable directory; defaults to `$HOME/.local/bin` |
| `--no-path` | Install without modifying shell startup files |
| `-h`, `--help` | Print installation help without building |

The installer chooses a startup file from `$SHELL`; invoking it with `sh install.sh` does not change that selection. If `$SHELL` is missing or unsupported, it installs the executable and prints instructions for configuring PATH manually. Existing startup file contents are preserved; a `# Lantern command` block is appended only when its PATH line is absent.

Relative `--bin-dir` paths resolve against the directory from which you invoke the script. With `--no-path`, configure PATH yourself. Re-running the installer rebuilds and replaces the executable; the same PATH entry is added only once. Run it again after updating the source.

You can choose a specific Bun executable or temporary build directory:

```sh
BUN="/path/to/bun" ./install.sh --no-path
TMPDIR="/path/to/writable/temp" ./install.sh
```

`BUN` must name a single executable, without arguments. `TMPDIR` must be an existing writable directory. The install directory must also be writable. The installer builds and verifies a temporary executable before replacing an existing installation, and cleans up its temporary files on exit. Shell configuration is updated after the executable is installed; if that step fails, fix startup-file permissions or use `--no-path` and configure PATH manually.

The installed executable includes the Bun runtime and works independently of the checkout on a compatible machine. Commands use your current working directory to find Markdown files.

To check which installation your shell runs:

```sh
command -v lantern
lantern --version
```

If another installation takes precedence, put the desired install directory first on PATH. For a custom install directory, use that path in the PATH and removal commands below.

To uninstall a default installation:

```sh
rm "$HOME/.local/bin/lantern"
```

If you no longer need the install directory on PATH, remove the installer-added `# Lantern command` block from your shell startup file. Your documents and Lantern configuration are kept.

To build without installing:

```sh
bun run build
./dist/lantern README.md
```

For a source-based development link instead, run `chmod +x index.ts` and `bun link` in this project. This requires Bun and its global bin directory on PATH. Use `bun unlink` in the project to remove that link.

## Read Markdown

### Local files and directories

```sh
bun index.ts README.md
bun index.ts --tui README.md
bun index.ts --line-numbers --tui README.md
bun index.ts "notes/project plan.md"
bun index.ts .
```

A file normally renders once to standard output. `--tui` opens it in the interactive reader. A directory opens the browser when both input and output are terminals.

Without a source, Lantern browses the enclosing Git repository, or the current directory if outside a repository. Supplying a directory explicitly limits discovery to that directory and its descendants.

### Standard input and redirected output

```sh
printf '# Hello\n\n**Made with Bun**\n' | bun index.ts
cat README.md | bun index.ts -
bun index.ts README.md > rendered.txt
bun index.ts . > readme.txt
```

Piped input is read automatically when no source is supplied. Use `-` to request standard input explicitly. Redirected output is plain text by default. A directory used noninteractively renders its top-level README, or a README found below it; it reports an error if none exists.

### Remote Markdown

```sh
bun index.ts https://raw.githubusercontent.com/charmbracelet/glow/main/README.md
bun index.ts github.com/charmbracelet/glow
bun index.ts https://github.com/charmbracelet/glow
```

Direct HTTP(S) URLs must return Markdown text; use a raw file URL rather than a website's HTML file-view page.

GitHub repository URLs fetch the default branch README through GitHub's public API. GitLab repository URLs in the form `gitlab.com/owner/project` fetch `README.md` from `HEAD`. Requests time out after 15 seconds. Authentication for private repositories is not implemented, and GitHub's unauthenticated API rate limits apply.

### Appearance and paging

```sh
bun index.ts -s dark -w 60 README.md
bun index.ts -s light README.md
bun index.ts -s notty README.md
bun index.ts --preserve-new-lines README.md
bun index.ts --pager README.md
PAGER='less -R' bun index.ts --pager README.md
NO_COLOR=1 bun index.ts README.md
```

The renderer supports headings, emphasis, links, nested lists, task lists, blockquotes, tables, and syntax-highlighted fenced code. Styles are `auto`, `dark`, `light`, and `notty` (plain text). `NO_COLOR` disables colors even with an explicit color style. Terminal control sequences in source text are removed before rendering.

`auto` uses terminal detection and the `COLORFGBG` environment variable when available. Choose `dark` or `light` explicitly if the result does not suit your terminal.

`--pager` uses `$PAGER`, or `less -R` if unset. It applies to rendered sources with terminal output. `--tui` uses Lantern's own reader. The two modes cannot be combined; `--edit` also enables TUI mode.

## Browse and search

Discovered extensions are `.md`, `.markdown`, `.mdown`, and `.mkd`, case-insensitively.

With Git available inside a repository, discovery uses tracked files and nonignored untracked files. Hidden paths are excluded by default. Outside a repository, or without Git, hidden entries and `node_modules` are skipped; ignore patterns are not parsed in that fallback mode. `--all` includes hidden and ignored files. `.git` and symlink directories are never traversed by the recursive walker.

```sh
bun index.ts --all .
```

| Key | Browser or reader action |
| --- | --- |
| ↑ / k, ↓ / j | Move selection or scroll |
| PgUp / b, PgDn / Space / f | Move one page |
| g / Home, G / End | First / last |
| Enter | Open selected file |
| / | Filter filenames in the browser; search rendered text in the reader |
| Enter while searching | Finish search; jump to the first matching line in the reader |
| Esc while searching | Clear the search and leave search input |
| n / N | Next / previous matching line in the reader |
| e | Edit the selected or open local file |
| s | Cycle browser sort: name → date → size |
| R | Reverse browser sort order |
| ? | Toggle keyboard help |
| q / Esc | Return to browser; quit from browser or a directly opened reader |
| Ctrl+C | Quit outside the editor |

Resizing reflows the rendered document. Line numbers refer to rendered display lines, rather than source lines. Search reports matching lines; it does not highlight individual words.

## Edit and save

Press **e** on a local file in the browser or reader, or open an existing file directly:

```sh
bun index.ts --edit README.md
```

The editor displays Markdown source with line numbers and a visible cursor. Type to insert text; long lines scroll horizontally.

| Key | Editor action |
| --- | --- |
| Arrow keys | Move cursor |
| Home / End | Start / end of current line |
| Backspace / Delete | Delete before / at cursor |
| Enter | Insert a line break |
| Tab | Insert a tab |
| Ctrl+S | Save and remain in the editor |
| Esc / Ctrl+C | Return to preview; prompt if changes are unsaved |
| y at discard prompt | Discard unsaved changes and return to preview |
| n / Esc at discard prompt | Keep editing |

The status line shows whether the buffer is modified and the cursor's line and column. After saving, the rendered preview and browser file metadata are refreshed. Unsaved text stays in memory until saved or explicitly discarded.

Saves write a temporary sibling file and rename it over the original, preserve file permission bits and CRLF line endings, and reject detected external content changes. The parent directory must be writable. A failed save retains the editor buffer and shows an error.

If the file changes externally, copy out any edits you need before discarding. Return to the browser and reopen the file to load the external version. For a directly opened file, quit and run the command again.

Editing supports existing local files only. Remote documents and stdin are read-only. There is no new-file command, Save As, undo/redo, selection, or editor search yet. Use your terminal's copy/paste facilities as available.

## Sort files

The browser defaults to **A–Z** by relative filename, case-insensitively and with numeric ordering. Date sorting uses modification time, newest first. Size sorting uses file size in bytes, largest first. Equal dates or sizes are resolved by filename.

Press **s** to cycle sort modes and **R** to reverse the current order. The selected file stays selected when the order changes. Date and size modes show the corresponding metadata beside filenames; displayed dates use UTC. Browser shortcuts affect the current session only.

```sh
bun index.ts --sort name .
bun index.ts --sort date .
bun index.ts --sort size .
bun index.ts --sort name --reverse .
```

Use configuration to choose the initial order for future sessions.

## Command reference

```text
lantern [options] [FILE | DIR | URL | -]
lantern config [--config PATH]
lantern config --path [--config PATH]
```

At most one source is accepted. Use `--` before a filename beginning with a dash, for example `bun index.ts -- -notes.md`.

| Option | Meaning |
| --- | --- |
| `-a`, `--all` | Include hidden and ignored files |
| `-s`, `--style STYLE` | `auto`, `dark`, `light`, or `notty` |
| `-w`, `--width COLUMNS` | Wrap width, integer from 10 to 1000 |
| `-p`, `--pager` | Render through `$PAGER` or `less -R` |
| `-t`, `--tui` | Read a source interactively |
| `-e`, `--edit` | Open a local file in the built-in editor |
| `-l`, `--line-numbers` | Show rendered line numbers in the reader |
| `--sort KEY` | Initial browser sort: `name`, `date`, or `size` |
| `--reverse` | Reverse initial sort order |
| `--preserve-new-lines` | Preserve soft breaks in prose |
| `--config PATH` | Read an alternate YAML config; the file must exist |
| `-h`, `--help` | Show CLI help |
| `-v`, `--version` | Show version |

`config --path` prints the config location. `config` creates a missing config and opens it with `$EDITOR`, falling back to `$VISUAL`. With neither variable set, it prints the path instead. The `config` subcommand may create a file specified by `--config`.

## Configuration

```sh
bun index.ts config --path
bun index.ts config
EDITOR='nano' bun index.ts config
bun index.ts --config ./glow.yml README.md
```

The default location is `$XDG_CONFIG_HOME/lantern/glow.yml`, or `~/.config/lantern/glow.yml` if `XDG_CONFIG_HOME` is unset.

A complete example:

```yaml
style: auto
width: 80
sort: name
reverse: false
all: false
pager: false
tui: false
showLineNumbers: false
preserveNewLines: false
```

Without a config width, the default is the terminal width capped at 120 columns, or 80 when unavailable. The generated config explicitly sets `width: 80`. Other defaults match the example above. The interactive reader also fits the current terminal width.

CLI flags override valid configuration values. Boolean flags enable their setting; there are no `--no-*` switches. To disable a setting enabled in your config, change it to `false` or use an alternate config. Config values are validated before CLI overrides, so invalid YAML settings must be corrected in the file.

| Environment variable | Purpose |
| --- | --- |
| `XDG_CONFIG_HOME` | Parent directory for Lantern's default config |
| `EDITOR` | Preferred external editor for the `config` subcommand |
| `VISUAL` | Fallback config editor when `EDITOR` is unset |
| `PAGER` | External pager command used by `--pager` |
| `NO_COLOR` | Disable colors when set |
| `COLORFGBG` | Background hint for the automatic style |

External editor and pager commands support quoted arguments and run directly without shell expansion. Supply executable names or full paths; shell pipes, redirects, and `~` expansion inside these command strings are not supported. These editors apply to the config subcommand; Markdown editing uses the built-in editor.

## Build and development

```sh
bun install
bun test
bun run typecheck
bun run build
./dist/lantern --version
```

| Command | Purpose |
| --- | --- |
| `./install.sh` | Build and install the standalone command |
| `bun start` | Run the application from source |
| `bun run dev` | Run with Bun's source watch mode |
| `bun test` | Run rendering, CLI, discovery, configuration, sorting, and editor tests |
| `bun run typecheck` | Check TypeScript without emitting files |
| `bun run build` | Compile `dist/lantern` for the current platform |

For an interactive smoke check, run `bun start`, filter with `/`, open a file, edit a disposable local Markdown file with **e**, save with **Ctrl+S**, return with **Esc**, and try **s** and **R** in the browser.

Source layout:

```text
install.sh       Standalone build, installation, and shell PATH setup
index.ts         CLI entry point, flags, sources, pager, config command
src/config.ts    YAML loading, defaults, validation
src/files.ts     Markdown discovery and local/remote source loading
src/render.ts    Markdown rendering and terminal-input sanitization
src/tui.ts       Browser, reader, and editor terminal interface
src/editor.ts    Text editing and file saving
src/sort.ts      File metadata and sort order
tests/           Automated tests
```

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `bun: command not found` | Install Bun and ensure its executable directory is on PATH. |
| `Bun.markdown.ansi` or `Bun.YAML` is unavailable | Check `bun --version`; this project requires Bun 1.4.4 or newer with those APIs. |
| `Interactive mode requires a terminal` | Run in a terminal with interactive input and output, or omit `--tui` / `--edit` to render plain output. |
| No Markdown files appear | Check the directory and extensions; use `--all` to include hidden and ignored paths. |
| A directory fails when output is redirected | Noninteractive directory mode requires a README. Supply a file explicitly. |
| `Pager not found` | Install `less`, set `PAGER` to an installed pager, or use `--tui`. |
| File will not save | Check the displayed error and parent-directory write permissions. External changes block saving; the buffer remains available. |
| GitHub returns HTTP 403 or 429 | Public API access may be rate-limited; retry later or read a local/raw Markdown copy. |
| A URL renders website markup | Use the raw Markdown URL rather than an HTML page. |
| YAML or validation error | Check config value types, style/sort names, and width range. `pager` and `tui` cannot both be true. |
| Installed command uses old behavior | Re-run `./install.sh` from the updated checkout. |
| `lantern: command not found` after installing | Restart your shell or run the PATH command printed by the installer; check that the chosen install directory is on PATH. |
| `./install.sh: Permission denied` | Run `sh install.sh` from the checkout, or restore execute permission with `chmod +x install.sh`. |
| Installer reports unsupported Bun | Select a Bun executable with the required APIs using `BUN=/path/to/bun ./install.sh`. |
| Installer cannot write files | Choose a writable `--bin-dir`, check `TMPDIR`, and use `--no-path` if shell startup files cannot be changed. |
| Installer updated the wrong shell file | Check `$SHELL`; configure your actual shell's PATH manually or run again with the correct `SHELL` value. |

## Scope and limitations

Lantern implements Glow's core Markdown reading workflow independently, with additional local editing and sorting. Its appearance comes from Bun's renderer and differs from Glow's Glamour output.

Glamour JSON themes, mouse navigation, private repository authentication, shell completions, manpage generation, and Glow's platform-specific config paths are not implemented. This project is not affiliated with Charmbracelet.

## License

[MIT](LICENSE) — Copyright (c) 2026 Sparky4567.
# lantern

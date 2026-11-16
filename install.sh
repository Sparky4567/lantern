#!/bin/sh
# Build and install Lantern without changing the caller's working directory.
set -eu

usage() {
  cat <<'HELP'
Usage: ./install.sh [--bin-dir DIR] [--no-path]

Build a standalone Lantern executable and install it for the current user.
Requires Bun 1.4.4+ with Bun.markdown.ansi and Bun.YAML.

  --bin-dir DIR  Install directory (default: $HOME/.local/bin)
  --no-path      Do not update shell configuration
  -h, --help     Show this help

Bash, Zsh, and Fish startup files are supported. Restart your shell after
installation to load PATH changes. Run this script again to update Lantern.
HELP
}

fail() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

bin_dir=${HOME:?HOME must be set}/.local/bin
update_path=true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --bin-dir)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail '--bin-dir requires a directory'
      bin_dir=$2
      shift 2
      ;;
    --no-path) update_path=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1 (use --help)" ;;
  esac
done

bun_command=${BUN:-bun}
command -v "$bun_command" >/dev/null 2>&1 || fail 'Bun was not found. Install Bun from https://bun.sh and retry.'
"$bun_command" -e 'if (typeof Bun.markdown?.ansi !== "function" || typeof Bun.YAML?.parse !== "function") { console.error("Bun with Bun.markdown.ansi and Bun.YAML is required (1.4.4+)."); process.exit(1); }' || fail 'Unsupported Bun installation.'

project_dir=$(CDPATH= cd -P -- "$(dirname -- "$0")" && pwd)
[ -f "$project_dir/index.ts" ] || fail 'index.ts is missing. Run the installer from a complete Lantern checkout.'
# Resolve a relative destination against the caller's directory, not the project.
mkdir -p -- "$bin_dir"
bin_dir=$(CDPATH= cd -P -- "$bin_dir" && pwd)
[ ! -d "$bin_dir/lantern" ] || fail "Destination is a directory: $bin_dir/lantern"
# Startup files require a single-line path.
case "$bin_dir" in
  *'
'*) fail 'Installation directory must not contain a newline' ;;
esac

stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/lantern-install.XXXXXX")
install_temp=
cleanup() {
  rm -rf -- "$stage_dir"
  if [ -n "$install_temp" ]; then rm -f -- "$install_temp"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Building Lantern with %s…\n' "$bun_command"
"$bun_command" build --compile "$project_dir/index.ts" --outfile "$stage_dir/lantern"
"$stage_dir/lantern" --version
# Stage beside the destination so replacement is atomic, including on updates.
install_temp=$(mktemp "$bin_dir/.lantern-install.XXXXXX")
cp -- "$stage_dir/lantern" "$install_temp"
chmod 755 "$install_temp"
mv -f -- "$install_temp" "$bin_dir/lantern"
install_temp=
printf 'Installed: %s/lantern\n' "$bin_dir"

# Quote literal paths safely, including spaces, apostrophes, and shell metacharacters.
shell_quote() {
  printf "'"
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}
quoted_bin=$(shell_quote "$bin_dir")
path_line="export PATH=$quoted_bin:\"\$PATH\""
if [ "$update_path" = true ]; then
  profile=
  login_shell=${SHELL:-}
  case "${login_shell##*/}" in
    bash) profile=$HOME/.bashrc ;;
    zsh) profile=${ZDOTDIR:-$HOME}/.zshrc ;;
    fish)
      profile=${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish
      # Fish single quotes only escape backslashes and apostrophes.
      fish_bin=$(printf '%s' "$bin_dir" | sed "s/\\\\/\\\\\\\\/g; s/'/\\\\'/g")
      path_line="fish_add_path -- '$fish_bin'"
      ;;
    *) printf 'Shell not recognized; add the install directory to PATH manually.\n' ;;
  esac
  if [ -n "$profile" ]; then
    mkdir -p -- "$(dirname -- "$profile")"
    if ! [ -f "$profile" ] || ! grep -Fqx -- "$path_line" "$profile"; then
      printf '\n# Lantern command\n%s\n' "$path_line" >> "$profile"
      printf 'Updated PATH in %s\n' "$profile"
    else
      printf 'PATH already configured in %s\n' "$profile"
    fi
  fi
fi

printf '\nRun from any folder: lantern\n'
printf 'For the current Bash/Zsh session, run:\n  export PATH=%s:"$PATH"\n' "$quoted_bin"
printf 'For Fish, add the install directory with fish_add_path.\n'
printf 'Restart your shell if the installer updated its startup file.\n'

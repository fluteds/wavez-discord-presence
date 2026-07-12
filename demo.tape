# Records assets/demo.gif: install to running, the README's npx path.
#   vhs demo.tape
# Discord desktop must be running, or the bridge just logs "unreachable".
# Close the wavez.fm tab first, its userscript POSTs collide with the staged tracks.
# Nothing else may hold port 6969, the tape kills whatever does.

Output assets/demo.gif

Require npx
Require curl
Require starship

# Ghostty: Rose Pine, Iosevka Comfy. Symbols Nerd Font Mono backs the starship glyphs.
Set Theme { "name": "Rose Pine", "background": "#191724", "foreground": "#e0def4", "cursor": "#e0def4", "selection": "#403d52", "black": "#26233a", "red": "#eb6f92", "green": "#31748f", "yellow": "#f6c177", "blue": "#9ccfd8", "magenta": "#c4a7e7", "cyan": "#ebbcba", "white": "#e0def4", "brightBlack": "#6e6a86", "brightRed": "#eb6f92", "brightGreen": "#31748f", "brightYellow": "#f6c177", "brightBlue": "#9ccfd8", "brightMagenta": "#c4a7e7", "brightCyan": "#ebbcba", "brightWhite": "#e0def4" }
Set FontFamily "Iosevka Comfy, Symbols Nerd Font Mono"
Set Shell "zsh"
Set FontSize 20
Set Width 1300
Set Height 640
Set Padding 24
Set BorderRadius 10
Set WindowBar Colorful
Set TypingSpeed 60ms

Hide
# VHS runs zsh with rc files off, so bring the prompt and highlighting in by hand.
# Same starship config minus the username segment, so the recording carries no name.
Type `export STARSHIP_CONFIG=$(mktemp -d)/starship.toml`  Enter
Type `sed -e '/^\$username\\$/d' -e '/^\$os\\$/d' -e '/(#9A348E)\\$/d' -e 's/bg:#DA627D fg:#9A348E/#DA627D/' ~/.config/starship.toml > $STARSHIP_CONFIG`  Enter
Type `eval "$(starship init zsh)"; source "$(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"`  Enter
# From ~, not the repo: inside it, npx would resolve the repo's own bin and skip the install.
# Throwaway cache so the download is real, not a cache hit.
Type `lsof -ti :6969 | xargs -r kill; cd ~ && export npm_config_cache=$(mktemp -d) npm_config_update_notifier=false`  Enter
# Stand in for the userscript: wait for the bridge's port, then POST what wavez.fm sends.
Type `post() { curl -s -X POST localhost:6969 -d "$1" > /dev/null; }`  Enter
Type `track() { post "{\"playing\":true,\"track\":\"$1\",\"artist\":\"$2\",\"room\":\"Move It! - Brasil\",\"dj\":\"yngk\",\"listeners\":6,\"startedAt\":$(date +%s),\"durationMs\":149000,\"image\":\"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg\"}"; }`  Enter
Type `(until nc -z localhost 6969 2> /dev/null; do sleep 1; done; sleep 2; track "Ghostlight" "Skeler"; sleep 7; track "Not In Love" "Crystal Castles"; sleep 7; post '{"playing":true,"paused":true}') &> /dev/null &!`  Enter
Type "clear"  Enter
Show

Type "npx wavez-discord-presence"  Enter
Sleep 4s
Type "y"  Enter
Sleep 28s

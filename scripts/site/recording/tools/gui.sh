#!/bin/zsh
# gui.sh <scenario> <out dir> [extra run.ps1 args] - one harness run at 1280x800 under the
# shared GUI lock, with settings.json backed up just before and compared after (the backup
# is kept and named, for restoring by hand; it is never restored on its own).
W=${0:a:h}/../../../..
SET="$HOME/Library/Application Support/com.kfchem.meno/settings.json"
LOCK="$HOME/.meno-gui.lock"
scenario=$1; out=$2; shift 2
for i in {1..720}; do mkdir "$LOCK" 2>/dev/null && break; [ $i -eq 1 ] && echo "waiting for the GUI lock"; sleep 5; done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
BK=$(mktemp "${TMPDIR:-/tmp}/meno-settings.XXXXXX"); cp -p "$SET" "$BK"
cd $W && pwsh scripts/gui/run.ps1 -Scenario "$scenario" -Out "$out" -Width 1280 -Height 800 "$@"
rc=$?
if ! cmp -s "$SET" "$BK"; then echo "settings.json changed during the run:"; diff <(python3 -m json.tool "$BK") <(python3 -m json.tool "$SET") | head -20; fi
echo "backup of settings.json from before this run: $BK"
exit $rc

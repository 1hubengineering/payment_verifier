#!/bin/sh
set -eu

target=${1:-bingo-vps}
socket=/opt/andhub-verifier/telebirr-tunnel/receipt.sock

# OpenSSH can leave a socket file behind after a disconnect. Never unlink a
# listener that is still active or replace an unexpected file.
ssh -a -x -T -S none -o StrictHostKeyChecking=yes -o ClearAllForwardings=yes "$target" "
set -eu
exec 9>'${socket%/*}/connect.lock'
flock 9
if [ -L '$socket' ]; then exit 1; fi
if [ -e '$socket' ]; then
  if [ ! -S '$socket' ]; then exit 1; fi
  listeners=\$(ss -Hxl)
  if printf '%s\n' \"\$listeners\" | awk '\$2 == \"LISTEN\" && \$5 == \"$socket\" { found=1 } END { exit !found }'; then
    printf '%s\n' 'The Telebirr tunnel is already connected.' >&2
    exit 1
  fi
  rm -- '$socket'
fi
"

exec ssh -a -x -tt -S none -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -R "$socket:transactioninfo.ethiotelecom.et:443" "$target" "
set -eu
test -S '$socket'
chgrp 1001 '$socket'
chmod 0660 '$socket'
printf '%s\n' 'Telebirr tunnel connected. Keep this terminal open. Press Ctrl+C to stop.'
exec sleep infinity
"

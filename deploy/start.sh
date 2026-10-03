#!/bin/sh
set -eu
: "${BACKEND_URL:?Set BACKEND_URL to the Go Runtime origin (https://...)}"
if ! printf '%s' "$BACKEND_URL" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
  echo 'BACKEND_URL must be an http(s) origin without a path or trailing slash' >&2
  exit 1
fi
case "$PORT" in ''|*[!0-9]*) echo 'PORT must be numeric' >&2; exit 1;; esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  echo 'PORT must be between 1024 and 65535 for this non-root image' >&2
  exit 1
fi
# Variable proxy_pass resolves the backend at request time and honors DNS changes.
DNS_RESOLVER=$(awk '/^nameserver / { if (index($2, ":")) print "[" $2 "]"; else print $2; exit }' /etc/resolv.conf)
: "${DNS_RESOLVER:?No DNS resolver found in /etc/resolv.conf}"
export DNS_RESOLVER
envsubst '${PORT} ${BACKEND_URL} ${DNS_RESOLVER}' < /etc/nginx/app.conf.template > /tmp/nginx.conf
nginx -t -c /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'

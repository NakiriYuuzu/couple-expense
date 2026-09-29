#!/bin/sh
# 把 menu.svg 轉成 menu.png（2500x1686）。需要 macOS 內建的 PingFang 字型與 uv。
set -eu
cd "$(dirname "$0")"
font=$(find /System/Library/AssetsV2 /System/Library/Fonts -iname 'PingFang.ttc' 2>/dev/null | head -n 1)
if [ -z "$font" ]; then
    echo '找不到 PingFang.ttc' >&2
    exit 1
fi
uv run --quiet --with resvg-py==0.5.0 python - "$font" <<'EOF'
import sys
import resvg_py
png = resvg_py.svg_to_bytes(svg_path='menu.svg', font_files=[sys.argv[1]], skip_system_fonts=True)
open('menu.png', 'wb').write(bytes(png))
print(f'已產生 menu.png（{len(png) // 1024} KB）')
EOF

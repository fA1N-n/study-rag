#!/usr/bin/env bash
# Один кадр мока: shot.sh <a|b|c> <chat|board> <light|dark|375>
# Headless Edge сохраняет кадр только при одиночном запуске — поэтому по вызову на кадр.
v=$1 s=$2 t=$3 W=1440,900 T=$3
[ "$t" = 375 ] && W=375,812 && T=light
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars \
  --user-data-dir="C:\\Users\\dimik\\AppData\\Local\\Temp\\es_$v$s$t" --virtual-time-budget=6000 --window-size=$W \
  --screenshot="C:\\Projects\\study-rag\\docs\\screenshots\\design\\$v-$s-$t.png" \
  "file:///C:/Projects/study-rag/docs/design/variant-$v.html?screen=$s&theme=$T"

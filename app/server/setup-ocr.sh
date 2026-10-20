#!/usr/bin/env bash
set -euo pipefail
# Ubuntu/deb only. No sudo, no package installation, no service restart.
cd "$(dirname "$0")/.."
for tool in python3 prlimit nice bwrap pdfinfo pdftotext pdftoppm apt-get dpkg-deb; do command -v "$tool" >/dev/null || { printf "Missing required tool: %s\n" "$tool" >&2; exit 1; }; done
bwrap --unshare-all --die-with-parent --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 /usr/bin/true
mkdir -p .tools/ocr/packages .tools/ocr/root
cd .tools/ocr/packages
apt-get download tesseract-ocr libtesseract5 libleptonica6 libarchive13t64 libgif7 tesseract-ocr-eng tesseract-ocr-chi-sim
for p in ./*.deb; do dpkg-deb -x "$p" ../root; done
cd ../../..
export LD_LIBRARY_PATH="$PWD/.tools/ocr/root/usr/lib/x86_64-linux-gnu"
export TESSDATA_PREFIX="$PWD/.tools/ocr/root/usr/share/tesseract-ocr/5/tessdata"
.tools/ocr/root/usr/bin/tesseract --version
.tools/ocr/root/usr/bin/tesseract --list-langs
printf "Private native OCR ready; binaries/models are ignored by Git.\n"

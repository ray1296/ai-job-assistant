#!/usr/bin/env python3
"""Consistent SQLite online backup; private unique destination, never overwrite."""
import argparse
import os
from pathlib import Path
import sqlite3

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("source")
p.add_argument("destination")
a = p.parse_args()
source = Path(a.source).resolve(strict=True)
destination = Path(a.destination).resolve()
if source == destination:
    p.error("Source and destination must differ")
os.umask(0o077)
destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
try:
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst, pages=128)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
    print("SQLite backup verified:", destination.name)
except Exception:
    destination.unlink(missing_ok=True)
    raise

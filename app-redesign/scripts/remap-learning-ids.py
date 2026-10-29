#!/usr/bin/env python3
"""Remap regenerated learning catalog IDs to an older catalog by stable question metadata.

Why: the old ID hash included the answer text. When answers are rewritten/detailed,
the hash changes and existing favorites/wrong-question state would be orphaned.
This remaps by direction/category/question/importance/source/sourceUrl/publishedAt.
"""
import argparse, hashlib, json
from pathlib import Path

FIELDS = ["direction", "category", "question", "importance", "source", "sourceUrl", "publishedAt"]

def key(q):
    return tuple(q.get(k) for k in FIELDS)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("old_catalog")
    ap.add_argument("new_catalog")
    ap.add_argument("--output-dir", default=None)
    args = ap.parse_args()
    old = json.loads(Path(args.old_catalog).read_text(encoding="utf-8"))["questions"]
    new_doc = json.loads(Path(args.new_catalog).read_text(encoding="utf-8"))
    new = new_doc["questions"]
    old_by_key = {key(q): q for q in old}
    if len(old_by_key) != len(old):
        raise SystemExit("old catalog has duplicate stable keys")
    if len({key(q) for q in new}) != len(new):
        raise SystemExit("new catalog has duplicate stable keys")
    for q in new:
        o = old_by_key.get(key(q))
        if not o:
            raise SystemExit("missing stable key in old catalog: " + q.get("question", "")[:30])
        q["id"] = o["id"]
    out_dir = Path(args.output_dir or Path(args.new_catalog).parent)
    catalog_path = out_dir / "learning-catalog.json"
    catalog_path.write_text(json.dumps(new_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = out_dir / "learning-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["catalogSha256"] = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(new), "catalogSha256": manifest["catalogSha256"]}))

if __name__ == "__main__":
    main()

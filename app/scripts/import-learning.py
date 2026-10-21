#!/usr/bin/env python3
"""Offline, deterministic import. No source URLs are fetched."""
import argparse, csv, hashlib, io, ipaddress, json, os, tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

HEADERS = ['序号','岗位方向','模块/分类','面试题 / 面经问题','考察点 / 答题要点','重要程度','来源网站','来源链接','发布时间']

def safe_url(value):
    value = value.strip()
    if not value or any(ord(c) < 33 for c in value): return None
    try:
        p = urlsplit(value)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password: return None
        host = p.hostname.lower()
        if host == 'localhost' or '.' not in host or host.endswith(('.local','.localhost','.internal')): return None
        try:
            if not ipaddress.ip_address(host).is_global: return None
        except ValueError: pass
        if p.port and p.port not in (80, 443): return None
        return value
    except ValueError: return None

def published(value):
    value = value.strip()
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M', '%Y-%m-%d %H:%M:%S'):
        try: return datetime.strptime(value, fmt).isoformat(timespec='minutes') if ' ' in value else datetime.strptime(value, fmt).date().isoformat()
        except ValueError: pass
    return None

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.learning-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False, indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def convert(source, output, expected=1761):
    content = Path(source).read_bytes()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig'), newline=''), strict=True)
    if reader.fieldnames != HEADERS: raise ValueError('Unexpected CSV headers')
    questions, seen = [], Counter()
    for record, raw in enumerate(reader, 2):
        if None in raw or any(v is None for v in raw.values()): raise ValueError(f'Malformed CSV record {record}')
        if not raw[HEADERS[3]].strip(): raise ValueError(f'Missing question at record {record}')
        identity = json.dumps([raw[k].strip() for k in HEADERS[1:]], ensure_ascii=False, separators=(',',':'))
        digest = hashlib.sha256(identity.encode()).hexdigest()
        occurrence = seen[digest]; seen[digest] += 1
        qid = hashlib.sha256((digest + ':' + str(occurrence)).encode()).hexdigest()[:24]
        questions.append(dict(id=qid, direction=raw[HEADERS[1]].strip(), category=raw[HEADERS[2]].strip(), question=raw[HEADERS[3]].strip(), answer=raw[HEADERS[4]].strip() or None, importance=raw[HEADERS[5]].strip(), source=raw[HEADERS[6]].strip(), sourceUrl=safe_url(raw[HEADERS[7]]), publishedAt=published(raw[HEADERS[8]]), raw=raw, sourceRecord=record))
    if expected is not None and len(questions) != expected: raise ValueError(f'Expected {expected} rows, got {len(questions)}')
    if len({q['id'] for q in questions}) != len(questions): raise ValueError('ID collision')
    catalog = dict(schemaVersion=1, questions=questions)
    serialized = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode()
    manifest = dict(schemaVersion=1, sourceFilename=Path(source).name, sourceSha256=hashlib.sha256(content).hexdigest(), catalogSha256=hashlib.sha256(serialized).hexdigest(), rowCount=len(questions), columns=HEADERS, idAlgorithm='sha256(trimmed source columns except serial + exact duplicate occurrence), first 24 hex', duplicateRows=sum(n-1 for n in seen.values()), unsafeOrMissingUrls=sum(q['sourceUrl'] is None for q in questions), directions=dict(Counter(q['direction'] for q in questions)), categories=dict(Counter(q['category'] for q in questions)), runtimeSource='learning-catalog.json only; no attachment reads or URL fetching')
    atomic_json(Path(output)/'learning-catalog.json', catalog)
    atomic_json(Path(output)/'learning-manifest.json', manifest)
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1]/'data')); parser.add_argument('--expected', type=int, default=1761)
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output, args.expected), ensure_ascii=False))

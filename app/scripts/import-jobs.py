#!/usr/bin/env python3
"""Offline XLSX import. Prints artifact bundle as JSON; never modifies source files.
Bootstrap: --legacy-csv old.csv; subsequent imports: --identity-map jobs-identities.json.
No network access or third-party dependencies. Blank cells remain blank, not invented.
"""
import argparse
import collections
import csv
import hashlib
import json
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:24]


def identity(raw):
    # Source IDs may be corrected too: match stable descriptive identity.
    # Ambiguity is a hard error rather than silently remapping saved intents.
    return json.dumps([raw.get(k, '').strip() for k in
                      ('公司', '来源平台', '岗位名称', '方向')], ensure_ascii=False, separators=(',', ':'))


def safe_url(value):
    value = str(value or '').strip()
    if re.search(r'[\x00- \x7f\\]', value):
        return ''
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            return ''
        parsed.port  # Validate the port too.
        return value
    except ValueError:
        return ''


def relationships(z, part):
    name = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
    if name not in z.namelist():
        return {}
    return {r.attrib['Id']: dict(r.attrib) for r in ET.fromstring(z.read(name))}


def cell_text(cell, shared):
    if cell.get('t') == 'inlineStr':
        return ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
    value = cell.find('m:v', NS)
    value = value.text if value is not None and value.text is not None else ''
    return shared[int(value)] if cell.get('t') == 's' and value else value


def read_workbook(source):
    records, sheets = [], []
    with zipfile.ZipFile(source) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(t.text or '' for t in si.findall('.//m:t', NS)) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        workbook_rels = relationships(z, 'xl/workbook.xml')
        for sheet in workbook.findall('m:sheets/m:sheet', NS):
            target = workbook_rels[sheet.get(REL)]['Target']
            part = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
            root = ET.fromstring(z.read(part))
            rels = relationships(z, part)
            links = {}
            for link in root.findall('m:hyperlinks/m:hyperlink', NS):
                relation = rels.get(link.get(REL), {})
                links[link.get('ref')] = {'relationshipId': link.get(REL, ''), 'target': relation.get('Target', ''), 'targetMode': relation.get('TargetMode', ''), 'location': link.get('location', ''), 'display': link.get('display', '')}
            rows = root.findall('m:sheetData/m:row', NS)
            if not rows:
                continue
            headers = {re.sub(r'\d', '', c.get('r')): cell_text(c, shared) for c in rows[0].findall('m:c', NS)}
            if '岗位名称' not in headers.values():
                continue
            sheets.append({'name': sheet.get('name'), 'part': part, 'hyperlinkRelationships': len(links)})
            for row in rows[1:]:
                cells = {re.sub(r'\d', '', c.get('r')): c for c in row.findall('m:c', NS)}
                raw = {header: cell_text(cells[col], shared) if col in cells else '' for col, header in headers.items()}
                if not any(raw.values()):
                    continue
                col = next(c for c, h in headers.items() if h == '职位链接')
                cell = cells.get(col)
                formula = cell.find('m:f', NS) if cell is not None else None
                link = links.get(col + row.get('r'), {})
                formula_text = formula.text if formula is not None else ''
                formula_match = re.match(r'(?i)^HYPERLINK\(\s*"((?:[^"]|"")*)"', formula_text or '')
                candidates = [('relationship', link.get('target', '') if link.get('targetMode') == 'External' else ''), ('cell', raw['职位链接']), ('formula', formula_match.group(1).replace('""', '"') if formula_match else '')]
                resolved = next(((kind, safe_url(url)) for kind, url in candidates if safe_url(url)), ('missing', ''))
                records.append({'raw': raw, 'url': resolved[1], 'provenance': {'sheet': sheet.get('name'), 'row': int(row.get('r')), 'linkCell': col + row.get('r'), 'hyperlink': link, 'formula': formula_text or '', 'urlSource': resolved[0]}})
    return records, sheets


def build(source, identities, legacy_count=0):
    records, sheets = read_workbook(source)
    seen, ids = set(), set()
    reused = 0
    for record in records:
        key = identity(record['raw'])
        if key in seen:
            raise ValueError('Ambiguous duplicate identity: ' + key)
        seen.add(key)
        reused += key in identities
        job_id = identities.get(key) or digest('job-v2|' + key)
        if job_id in ids:
            raise ValueError('Duplicate ID: ' + job_id)
        ids.add(job_id)
        identities[key] = job_id
        record['id'] = job_id
    def describe(r):
        return {'id': r['id'], 'row': r['provenance']['row'], 'company': r['raw']['公司'], 'title': r['raw']['岗位名称'], 'direction': r['raw']['方向']}
    manifest = {'schemaVersion': 1, 'sourceFile': Path(source).name, 'sourceSha256': hashlib.sha256(Path(source).read_bytes()).hexdigest(), 'rowCount': len(records), 'sheets': sheets, 'directionCounts': dict(collections.Counter(r['raw']['方向'] for r in records)), 'urlSourceCounts': dict(collections.Counter(r['provenance']['urlSource'] for r in records)), 'salaryValueCounts': dict(collections.Counter(r['raw']['薪资'] for r in records)), 'blankSalary': [describe(r) for r in records if not r['raw']['薪资'].strip()], 'missingSalary': [dict(describe(r), salary=r['raw']['薪资']) for r in records if not r['raw']['薪资'].strip() or r['raw']['薪资'] in ('未公示（企业官网不公开）', '未标注')], 'missingLinks': [describe(r) for r in records if not r['url']], 'identitiesReused': reused, 'legacyIdentityCount': legacy_count}
    return {'catalog': {'schemaVersion': 1, 'jobs': records}, 'identities': {'schemaVersion': 1, 'identities': identities}, 'manifest': manifest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xlsx')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--legacy-csv')
    group.add_argument('--identity-map')
    args = parser.parse_args()
    identities = {}
    if args.legacy_csv:
        with open(args.legacy_csv, encoding='utf-8-sig', newline='') as f:
            for i, raw in enumerate(csv.DictReader(f)):
                key = identity(raw)
                if key in identities:
                    raise ValueError('Ambiguous legacy identity: ' + key)
                base = raw['职位链接'] or raw['来源平台'] + '|' + raw['职位ID']
                identities[key] = digest(base + '|' + raw['公司'] + '|' + raw['岗位名称'] + '|' + str(i))
    else:
        identities = json.loads(Path(args.identity_map).read_text(encoding='utf-8'))['identities']
    print(json.dumps(build(args.xlsx, identities, len(identities)), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

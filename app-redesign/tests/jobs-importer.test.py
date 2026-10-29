"""Offline importer regression tests; synthetic OOXML needs no attachment access."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('import_jobs', ROOT / 'scripts/import-jobs.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImporterTests(unittest.TestCase):
    def test_url_safety(self):
        for bad in ['javascript:alert(1)', 'data:text/html,a', '//example.com', 'https:///example.com', 'https://u:p@example.com', 'https://example.com/a\nb', 'https://example.com:99999']:
            self.assertEqual(module.safe_url(bad), '')
        self.assertEqual(module.safe_url('https://example.com/a'), 'https://example.com/a')

    def test_identity_ignores_url_source_id_and_order(self):
        raw = {'公司':'测试公司','来源平台':'官网','岗位名称':'软件工程师','方向':'Java后端','职位ID':'old','职位链接':'https://example.com/old'}
        changed = dict(raw, 职位ID='new', 职位链接='https://example.com/new', 序号='999')
        self.assertEqual(module.identity(raw), module.identity(changed))
        self.assertEqual(module.digest('job-v2|' + module.identity(raw)), module.digest('job-v2|' + module.identity(changed)))

    def test_raw_and_relationship_link_precedence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.xlsx'
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Jobs" r:id="sheet"/></sheets></workbook>')
                z.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="sheet" Target="worksheets/sheet1.xml"/></Relationships>')
                z.writestr('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="link" Target="https://example.com/actual" TargetMode="External"/></Relationships>')
                headers = ['岗位名称','职位链接','薪资']
                def cell(col,row,value):
                    return '<c r="%s%s" t="inlineStr"><is><t>%s</t></is></c>' % (col,row,value)
                first = ''.join(cell(col,1,value) for col,value in zip('ABC',headers))
                second = ''.join(cell(col,2,value) for col,value in zip('ABC',['工程师','查看详情','200-250元/天']))
                z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1">'+first+'</row><row r="2">'+second+'</row></sheetData><hyperlinks><hyperlink ref="B2" r:id="link"/></hyperlinks></worksheet>')
            rows, sheets = module.read_workbook(path)
            self.assertEqual(rows[0]['raw']['职位链接'], '查看详情')
            self.assertEqual(rows[0]['url'], 'https://example.com/actual')
            self.assertEqual(rows[0]['raw']['薪资'], '200-250元/天')
            self.assertEqual(sheets[0]['hyperlinkRelationships'], 1)

    def test_all_legacy_identities_remain_mapped(self):
        records = json.loads((ROOT / 'data/jobs-catalog.json').read_text())['jobs']
        identities = json.loads((ROOT / 'data/jobs-identities.json').read_text())['identities']
        self.assertEqual(len(identities), 107)
        for record in reversed(records):
            raw = dict(record['raw'], 职位链接='https://example.com/changed')
            self.assertEqual(record['id'], identities[module.identity(raw)])

if __name__ == '__main__':
    unittest.main()

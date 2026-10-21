import csv, hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('importer',Path(__file__).resolve().parents[1]/'scripts/import-learning.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Importer(unittest.TestCase):
 def test_csv_provenance_stability(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.csv';out=Path(d)/'out'
   rows=[['1','Java','分类','含逗号,与"引号"\n换行','原文答案','高','来源','https://example.com/a','2026-10-18'],['2','测试','分类','另一题','','低','来源','javascript:alert(1)','未知']]
   def write(rows):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
     w=csv.writer(f);w.writerow(m.HEADERS);w.writerows(rows)
   write(rows);manifest=m.convert(p,out,2);data=json.loads((out/'learning-catalog.json').read_text());q=data['questions']
   self.assertEqual(q[0]['raw'][m.HEADERS[3]],rows[0][3]);self.assertIsNone(q[1]['answer']);self.assertIsNone(q[1]['sourceUrl']);self.assertIsNone(q[1]['publishedAt'])
   self.assertEqual(manifest['catalogSha256'],hashlib.sha256((out/'learning-catalog.json').read_bytes()).hexdigest())
   write(list(reversed(rows)));m.convert(p,out,2);self.assertEqual({x['id'] for x in q},{x['id'] for x in json.loads((out/'learning-catalog.json').read_text())['questions']})
   before=(out/'learning-catalog.json').read_bytes()
   with self.assertRaises(ValueError):m.convert(p,out,1761)
   self.assertEqual(before,(out/'learning-catalog.json').read_bytes())
 def test_safe_urls(self):
  for u in ['javascript:alert(1)','data:text/html,x','https://user:pass@example.com','http://127.0.0.1','http://10.0.0.1','http://localhost','http://example.local','https://example.com:8080','https://example.com/\nx']:
   self.assertIsNone(m.safe_url(u),u)
  self.assertEqual(m.safe_url('https://example.com/a'),'https://example.com/a')
if __name__=='__main__':unittest.main()

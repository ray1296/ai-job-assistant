"""Offline worker tests. No server, private config, or external model calls."""
import base64, json, pathlib, subprocess, tempfile, unittest, zipfile
WORKER=pathlib.Path(__file__).resolve().parents[1]/'server/parse-resume.py'
NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def xml(text):return f'<w:document xmlns:w="{NS}"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>'
class WorkerTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)
 def tearDown(self):self.temp.cleanup()
 def run_worker(self,file,kind,*args):
  p=subprocess.run(['/usr/bin/python3',str(WORKER),str(file),kind,*args],capture_output=True,text=True,timeout=20)
  return p.returncode,json.loads(p.stdout)
 def docx(self,parts):
  p=self.root/'input.docx'
  with zipfile.ZipFile(p,'w') as z:
   for k,v in parts.items():z.writestr(k,v)
  return p
 def test_docx_header_footer_arbitrary_order_preserved(self):
  p=self.docx({'word/document.xml':xml('Project Z before Education'),'word/header1.xml':xml('Lin Example'),'word/footer1.xml':xml('lin@example.invalid')})
  code,result=self.run_worker(p,'docx')
  self.assertEqual(code,0);self.assertIn('Lin Example',result['text']);self.assertIn('lin@example.invalid',result['text']);self.assertIn('Project Z before Education',result['text']);self.assertEqual(result['images'],[]);self.assertIsNone(result['pages'][0]['page'])
 def test_docx_security_guards(self):
  for parts in [{'word/document.xml':'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>'},{'word/document.xml':xml('X'),'word/vbaProject.bin':'macro'}]:
   p=self.docx(parts);code,result=self.run_worker(p,'docx');self.assertNotEqual(code,0);self.assertIn('error',result)
 def test_docx_text_boxes_emitted_once(self):
  p=self.docx({'word/document.xml':f'<w:document xmlns:w="{NS}"><w:p><w:r><w:t>Outer</w:t><w:txbxContent><w:p><w:r><w:t>Inner</w:t></w:r></w:p></w:txbxContent></w:r></w:p></w:document>'})
  code,result=self.run_worker(p,'docx');self.assertEqual(code,0);self.assertEqual(result['text'].count('Inner'),1)
 def test_pdf_always_renders_actual_pages_without_local_text_fallback(self):
  # Small valid vector PDF; even with a text layer it must yield visual pages, not pdftotext.
  p=self.root/'input.pdf';stream=b'BT /F1 12 Tf 30 150 Td (Lin Example) Tj ET'
  objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
  data=b'%PDF-1.4\n';offsets=[0]
  for i,obj in enumerate(objects,1):offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
  xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets[1:])+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF'
  p.write_bytes(data);code,result=self.run_worker(p,'pdf')
  self.assertEqual(code,0,result);self.assertEqual(result['text'],'');self.assertEqual(len(result['images']),1);self.assertTrue(base64.b64decode(result['images'][0]['data']).startswith(b'\x89PNG'));self.assertIn('视觉',result['pages'][0]['method'])
 def test_no_ocr_implementation_or_local_classification(self):
  text=WORKER.read_text();self.assertNotIn('pdftotext',text);self.assertNotIn('tesseract',text);self.assertNotIn('def recognize(',text)
if __name__=='__main__':unittest.main()

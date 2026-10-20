import zipfile,os
root="artifacts/intake-fixtures"
os.makedirs(root,exist_ok=True)
with zipfile.ZipFile(root+"/bomb.docx","w",zipfile.ZIP_DEFLATED) as z:z.writestr("word/document.xml",b"X"*9000000)
with zipfile.ZipFile(root+"/entity.docx","w") as z:z.writestr("word/document.xml",b'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>')
with zipfile.ZipFile(root+"/macro.docx","w") as z:
 z.writestr("word/document.xml",b"<root/>")
 z.writestr("word/vbaProject.bin",b"macro")
print("Generated bounded malicious-shape fixtures only")

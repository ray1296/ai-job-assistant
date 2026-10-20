import zipfile
with zipfile.ZipFile("artifacts/batch2-export.docx") as z:
    text = z.read("word/document.xml").decode()
assert "原位编辑同学" in text and "真实开源项目" in text and "window.injected" in text
assert "&lt;script&gt;" in text
print("DOCX ZIP/XML content and inert escaped markup verified")

"""Extract bounded plain text from office/PDF files for chat attachments."""
import sys, os, json, subprocess, zipfile, re, tempfile, time
import xml.etree.ElementTree as ET

path, kind = sys.argv[1:3]
DEADLINE = time.monotonic() + 25
MAX = 30000
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def run(args, timeout=20):
    remaining = DEADLINE - time.monotonic()
    if remaining < 1: raise ValueError("解析时间超限，请精简文件")
    with tempfile.TemporaryFile(dir=os.path.dirname(path)) as out:
        r = subprocess.run(args, stdout=out, stderr=subprocess.DEVNULL, timeout=min(timeout, remaining))
        if r.returncode: raise ValueError("文件无法解析、加密或格式损坏")
        out.seek(0); return out.read(400000).decode("utf8", "replace")

def safe_zip():
    z = zipfile.ZipFile(path)
    items = z.infolist()
    if len(items) > 3000 or sum(i.file_size for i in items) > 30 * 1024 * 1024:
        raise ValueError("文件解压体积过大")
    for i in items:
        if i.flag_bits & 1 or "vbaproject" in i.filename.lower():
            raise ValueError("不接受加密或含宏文件")
        if i.file_size > 12 * 1024 * 1024 or i.file_size / max(i.compress_size, 1) > 300:
            raise ValueError("文件压缩结构异常")
    return z

def docx():
    z = safe_zip()
    if "word/document.xml" not in z.namelist(): raise ValueError("DOCX 缺少正文")
    raw = z.read("word/document.xml")
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("不接受含实体声明的文档")
    tree = ET.fromstring(raw); lines = []
    for p in tree.iter(W + "p"):
        parts = []
        for n in p.iter():
            if n.tag == W + "t": parts.append(n.text or "")
            elif n.tag == W + "tab": parts.append("\t")
            elif n.tag in (W + "br", W + "cr"): parts.append("\n")
        text = "".join(parts).strip()
        if text: lines.append(text)
    return "\n".join(lines), "DOCX"

def xlsx():
    z = safe_zip()
    names = z.namelist()
    shared = []
    if "xl/sharedStrings.xml" in names:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.iter(S + "si"):
            shared.append("".join(t.text or "" for t in si.iter(S + "t")))
    sheets = [n for n in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)]
    sheets.sort(key=lambda n: int(re.search(r"sheet(\d+)", n).group(1)))
    out = []
    for sheet in sheets[:5]:
        root = ET.fromstring(z.read(sheet)); out.append("## " + sheet)
        for row in root.iter(S + "row"):
            vals = []
            for c in row.iter(S + "c"):
                t = c.get("t"); v = c.find(S + "v")
                if t == "inlineStr":
                    vals.append("".join(x.text or "" for x in c.iter(S + "t")))
                elif v is not None:
                    val = v.text or ""
                    if t == "s":
                        try: val = shared[int(val)]
                        except Exception: pass
                    vals.append(val)
                else: vals.append("")
            if any(str(v).strip() for v in vals): out.append("\t".join(map(str, vals)))
    return "\n".join(out), "XLSX"

def pptx():
    z = safe_zip()
    slides = [n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    slides.sort(key=lambda n: int(re.search(r"slide(\d+)", n).group(1)))
    out = []
    for i, s in enumerate(slides[:30], 1):
        root = ET.fromstring(z.read(s))
        texts = [t.text or "" for t in root.iter(A + "t")]
        if texts: out.append("## 第 " + str(i) + " 页\n" + "\n".join(texts))
    return "\n\n".join(out), "PPTX"

def pdf():
    text = run(["/usr/bin/pdftotext", "-layout", "-enc", "UTF-8", path, "-"])
    if not text.strip():
        raise ValueError("这个 PDF 没有可提取文字（可能是扫描件）。扫描件请用简历识别的视觉识别，或在 AI 协作空间上传图片。")
    return text, "PDF"

try:
    if kind == "docx": text, method = docx()
    elif kind == "xlsx": text, method = xlsx()
    elif kind == "pptx": text, method = pptx()
    elif kind == "pdf": text, method = pdf()
    else: raise ValueError("不支持的文档格式")
    text = text.strip()
    if not text: raise ValueError("没有提取到可用文字")
    truncated = len(text) > MAX
    print(json.dumps({"text": text[:MAX], "chars": len(text), "truncated": truncated, "method": method}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}, ensure_ascii=False)); sys.exit(1)

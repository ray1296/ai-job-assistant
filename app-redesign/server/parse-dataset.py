#!/usr/bin/env python3
"""把结构化文件解析成 {columns, rows}。只用标准库，支持 CSV/TSV/JSON/NDJSON/XML/XLSX。"""
import sys, os, json, csv, io, re, zipfile
import xml.etree.ElementTree as ET

MAX_ROWS = 3000
MAX_COLS = 60
MAX_CELL = 500

def fail(msg):
    print(json.dumps({"error": msg}, ensure_ascii=False)); sys.exit(0)

def clean_cell(v):
    if v is None: return ""
    if isinstance(v, (dict, list)): v = json.dumps(v, ensure_ascii=False)
    s = str(v).replace("\x00", "").strip()
    return s[:MAX_CELL]

def normalise(columns, rows):
    # 去重空列名
    seen, cols = {}, []
    for i, c in enumerate(columns):
        name = clean_cell(c) or ("列%d" % (i + 1))
        if name in seen:
            seen[name] += 1; name = "%s(%d)" % (name, seen[name])
        else:
            seen[name] = 1
        cols.append(name)
    if not cols: fail("没有识别到表头")
    if len(cols) > MAX_COLS: fail("列数超过%d，请精简后再上传" % MAX_COLS)
    out = []
    for r in rows[:MAX_ROWS]:
        row = [clean_cell(x) for x in (r if isinstance(r, list) else list(r.values()))]
        row = (row + [""] * len(cols))[:len(cols)]
        if any(x for x in row): out.append(row)
    if not out: fail("没有识别到数据行")
    return cols, out

def read_bytes(path):
    with open(path, "rb") as f: return f.read()

def decode_text(raw):
    for enc in ("utf-8-sig", "utf-8", "gb18030", "big5", "latin-1"):
        try: return raw.decode(enc)
        except Exception: continue
    fail("无法识别文件编码，请另存为 UTF-8")

def parse_csv(text):
    sample = text[:4096]
    delim = "\t" if sample.count("\t") > sample.count(",") else ","
    if sample.count(";") > sample.count(delim): delim = ";"
    reader = list(csv.reader(io.StringIO(text), delimiter=delim))
    if not reader: fail("文件为空")
    return reader[0], reader[1:]

def parse_json(text):
    data = json.loads(text)
    if isinstance(data, dict):
        for key in ("data", "rows", "items", "list", "records", "result"):
            if isinstance(data.get(key), list): data = data[key]; break
        else:
            data = [data]
    if not isinstance(data, list) or not data: fail("JSON 里没有可导入的数组")
    if all(isinstance(x, dict) for x in data):
        cols = []
        for row in data:
            for k in row:
                if k not in cols: cols.append(k)
        return cols, [[row.get(c, "") for c in cols] for row in data]
    if all(isinstance(x, list) for x in data):
        head = data[0]
        return [clean_cell(c) or ("列%d" % (i + 1)) for i, c in enumerate(head)], data[1:]
    fail("JSON 需要是对象数组或二维数组")

def parse_ndjson(text):
    rows = [json.loads(l) for l in text.splitlines() if l.strip()]
    return parse_json(json.dumps(rows, ensure_ascii=False))

def parse_xml(text):
    root = ET.fromstring(text)
    # 找重复出现的同类节点作为"记录"：同一父节点下同名子节点 >= 2 个
    best = []
    for parent in root.iter():
        groups = {}
        for ch in parent:
            groups.setdefault(ch.tag, []).append(ch)
        for _, nodes in groups.items():
            if len(nodes) >= 2 and any(len(n) > 0 or n.attrib for n in nodes):
                if len(nodes) > len(best): best = nodes
    if not best: fail("XML 里没有找到重复的记录节点")
    cols, rows = [], []
    for node in best:
        row = {}
        for sub in node:
            tag = sub.tag.split("}")[-1]
            row[tag] = (sub.text or "").strip() if len(sub) == 0 else ET.tostring(sub, encoding="unicode")
        for k, v in node.attrib.items(): row.setdefault(k, v)
        for k in row:
            if k not in cols: cols.append(k)
        rows.append(row)
    if not cols: fail("XML 记录里没有字段")
    return cols, [[r.get(c, "") for c in cols] for r in rows]

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def col_index(ref):
    letters = re.match(r"([A-Z]+)", ref or "")
    if not letters: return 0
    n = 0
    for ch in letters.group(1): n = n * 26 + (ord(ch) - 64)
    return n - 1

def parse_xlsx(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        sheets = [n for n in names if re.fullmatch(r"xl/worksheets/[^/]+\.xml", n)]
        # 优先 sheet1，但第一个表为空时继续找后面的工作表。
        sheets.sort(key=lambda n: (0 if n.endswith("/sheet1.xml") else 1, n))
        if not sheets: fail("XLSX 里没有工作表")
        shared = []
        if "xl/sharedStrings.xml" in names:
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in tree.findall(NS + "si"):
                shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
        first_header = None
        for sheet in sheets:
            try:
                tree = ET.fromstring(z.read(sheet))
            except Exception:
                continue
            grid = []
            for row in tree.iter(NS + "row"):
                values = {}
                for c in row.findall(NS + "c"):
                    idx = col_index(c.get("r"))
                    t = c.get("t")
                    if t == "inlineStr":
                        v = "".join(x.text or "" for x in c.iter(NS + "t"))
                    else:
                        vnode = c.find(NS + "v")
                        v = vnode.text if vnode is not None else ""
                        if t == "s" and v not in (None, ""):
                            try: v = shared[int(v)]
                            except Exception: pass
                    values[idx] = v
                if values:
                    width = max(values) + 1
                    grid.append([values.get(i, "") for i in range(width)])
            if not grid: continue
            if len(grid) >= 1 and first_header is None: first_header = grid[0]
            if len(grid) >= 2:
                return grid[0], grid[1:]
        if first_header is not None: fail("XLSX 只有表头，没有数据行")
        fail("工作表是空的")

def main():
    if len(sys.argv) < 3: fail("用法：parse-dataset.py <file> <ext>")
    path, ext = sys.argv[1], sys.argv[2].lower().lstrip(".")
    if not os.path.exists(path): fail("文件不存在")
    if os.path.getsize(path) > 8 * 1024 * 1024: fail("文件超过 8MiB")
    try:
        if ext == "xlsx": cols, rows = parse_xlsx(path)
        elif ext == "json": cols, rows = parse_json(decode_text(read_bytes(path)))
        elif ext in ("ndjson", "jsonl"): cols, rows = parse_ndjson(decode_text(read_bytes(path)))
        elif ext == "xml": cols, rows = parse_xml(decode_text(read_bytes(path)))
        elif ext == "xls": fail("旧版 .xls 请另存为 .xlsx 或 CSV 再上传")
        else: cols, rows = parse_csv(decode_text(read_bytes(path)))
    except ET.ParseError: fail("XML 格式不正确")
    except json.JSONDecodeError: fail("JSON 格式不正确")
    except csv.Error: fail("CSV 格式不正确")
    except zipfile.BadZipFile: fail("XLSX 文件已损坏或不是真正的 Excel 文件")
    cols, rows = normalise(cols, rows)
    print(json.dumps({"columns": cols, "rows": rows, "truncated": len(rows) >= MAX_ROWS}, ensure_ascii=False))

try:
    main()
except SystemExit:
    raise
except Exception as e:
    fail("解析失败：%s" % str(e)[:120])

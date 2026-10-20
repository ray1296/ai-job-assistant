"""Bounded local extraction. No network, no macros, no arbitrary HTML rendering."""
import sys,os,json,subprocess,zipfile,struct,re,tempfile,time,xml.etree.ElementTree as ET
path,kind=sys.argv[1:3]
root=os.path.dirname(path)
ocrroot=os.path.abspath(os.path.join(os.path.dirname(__file__),'../.tools/ocr/root/usr'))
env={**os.environ,'OMP_THREAD_LIMIT':'1','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1'}
if os.path.exists(ocrroot+'/bin/tesseract'):
    env['LD_LIBRARY_PATH']=ocrroot+'/lib/x86_64-linux-gnu'
    env['TESSDATA_PREFIX']=ocrroot+'/share/tesseract-ocr/5/tessdata'
ocr=ocrroot+'/bin/tesseract' if os.path.exists(ocrroot+'/bin/tesseract') else '/usr/bin/tesseract'
MAX_TEXT=40000
DEADLINE=time.monotonic()+68

def run(args,timeout=25):
    remaining=DEADLINE-time.monotonic()
    if remaining<1:raise ValueError("本机识别时间预算耗尽，请减少页数或缩小图片")
    timeout=min(timeout,remaining)
    with tempfile.TemporaryFile(dir=root) as output:
        r=subprocess.run(args,env=env,stdout=output,stderr=subprocess.DEVNULL,timeout=timeout)
        if r.returncode:raise ValueError('文件无法解析、已加密或格式损坏；请另存为标准PDF/DOCX/PNG/JPEG后重试')
        output.seek(0);raw=output.read(500001)
        if len(raw)>500000:raise ValueError('提取结果过大，请精简文件')
        return raw.decode('utf8',errors='replace')

def recognize(file):
    if not os.path.exists(ocr):raise ValueError('本机OCR暂不可用，请上传文字型PDF或DOCX')
    return run([ocr,file,'stdout','-l','chi_sim+eng','--psm','3'],30).strip()

def dimensions(file):
    with open(file,'rb') as f:
        h=f.read(24)
        if h.startswith(b'\x89PNG\r\n\x1a\n'):
            return struct.unpack('>II',h[16:24])
        if h.startswith(b'\xff\xd8'):
            f.seek(2)
            while f.tell()<5242880:
                b=f.read(1)
                if not b:break
                if b!=b'\xff':continue
                while b==b'\xff':b=f.read(1)
                if not b:break
                marker=b[0]
                if marker in (0xd8,0xd9,0x01) or 0xd0<=marker<=0xd7:continue
                n=f.read(2)
                if len(n)!=2:break
                length=struct.unpack('>H',n)[0]
                if length<2:break
                if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
                    data=f.read(5)
                    if len(data)!=5:break
                    height,width=struct.unpack('>HH',data[1:5]);return width,height
                f.seek(length-2,1)
    raise ValueError('不支持的图片结构，请转换成普通PNG或JPEG')

def main():
    pages=[];warnings=[];method=''
    if kind=='docx':
        method='DOCX正文提取'
        with zipfile.ZipFile(path) as z:
            items=z.infolist()
            if len(items)>4000 or sum(i.file_size for i in items)>20*1024*1024:raise ValueError('DOCX解压体积过大')
            for i in items:
                if i.flag_bits&1 or i.file_size>8*1024*1024 or i.file_size/max(i.compress_size,1)>250:raise ValueError('DOCX压缩结构异常')
                if 'vbaproject' in i.filename.lower():raise ValueError('不接受含宏文档')
            info=z.getinfo('word/document.xml')
            if sum(i.filename=='word/document.xml' for i in items)!=1:raise ValueError('DOCX正文重复或缺失')
            with z.open(info) as stream:raw=stream.read(8*1024*1024+1)
            if len(raw)>8*1024*1024:raise ValueError('DOCX正文体积过大')
            checked=raw.replace(b'\x00',b'').upper()
            if b'<!DOCTYPE' in checked or b'<!ENTITY' in checked:raise ValueError('不接受含实体声明的文档')
            tree=ET.fromstring(raw)
            ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            lines=[''.join(n.text or '' for n in p.iter(ns+'t')) for p in tree.iter(ns+'p')]
            pages=[{'page':1,'text':'\n'.join(lines),'method':method}]
            warnings.append('仅提取正文与表格文字；页眉、图片和复杂版式不作还原，DOCX页码未计算。')
    elif kind=='pdf':
        info=run(['/usr/bin/pdfinfo',path],10)
        n=re.search(r'^Pages:\s+(\d+)',info,re.M)
        if not n:raise ValueError('无法读取PDF页数')
        count=int(n[1])
        if count<1 or count>4:raise ValueError('本机保护上限为4页，请只保留简历页面后再上传')
        method='PDF文字提取 / 按需OCR'
        warnings.append('有文字层的页面优先提取文字，不保证识别同页内嵌图片；请逐页检查原文是否完整。')
        for i in range(1,count+1):
            text=run(['/usr/bin/pdftotext','-f',str(i),'-l',str(i),'-layout','-enc','UTF-8',path,'-'],10).strip()
            origin='PDF文字层'
            if len(re.sub(r'\s','',text))<25:
                prefix=os.path.join(root,'page-'+str(i))
                run(['/usr/bin/pdftoppm','-f',str(i),'-l',str(i),'-singlefile','-scale-to','2200','-png',path,prefix],15)
                text=recognize(prefix+'.png');origin='本地OCR'
                try:os.unlink(prefix+'.png')
                except OSError:pass
            pages.append({'page':i,'text':text,'method':origin})
    else:
        width,height=dimensions(path)
        if width<20 or height<20 or width*height>12000000 or max(width,height)>6000:raise ValueError('图片限制为1200万像素且长边≤6000，请缩小后重试')
        method='本地中英文OCR';pages=[{'page':1,'text':recognize(path),'method':method}]
    text='\n\n'.join(p['text'] for p in pages)
    if not text.strip():raise ValueError('未识别到可用文字，请使用清晰正向图片或文字型PDF')
    if len(text)>MAX_TEXT:raise ValueError('识别文字超过40000字，请精简文件')
    warnings.append('这是本地文字提取与规则归类，不是AI理解；请逐项核对，OCR可能错字或错序。')
    print(json.dumps({'text':text,'pages':pages,'method':method,'warnings':warnings},ensure_ascii=False))
try:main()
except Exception as e:
    if isinstance(e,ValueError):message=str(e)
    elif isinstance(e,subprocess.TimeoutExpired):message='解析子任务超时，请换更精简清晰的文件'
    else:message='文件无法解析，请检查格式、加密状态或重新导出'
    print(json.dumps({'error':message},ensure_ascii=False));sys.exit(1)

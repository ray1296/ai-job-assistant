"""Bounded local extraction. No network, no macros, no arbitrary HTML rendering."""
import sys,os,json,subprocess,zipfile,struct,re,tempfile,time,base64,xml.etree.ElementTree as ET
path,kind=sys.argv[1:3]
root=os.path.dirname(path)
# All formats require downstream AI semantic structuring.
vision=True
env={**os.environ,'OMP_THREAD_LIMIT':'1','OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1'}
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

def photo_candidate(data,mime,source):
    if len(data)>800*1024:return None
    fd,tmp=tempfile.mkstemp(dir=root,suffix='.img')
    try:
        with os.fdopen(fd,'wb') as f:f.write(data)
        width,height=dimensions(tmp)
    except Exception:
        return None
    finally:
        try:os.unlink(tmp)
        except OSError:pass
    if width<80 or height<80 or width*height>12000000:return None
    # 过滤长条横幅/logo，保留接近人像/照片比例的候选
    ratio=width/height
    if ratio<0.18 or ratio>4.5:return None
    return {'mime':mime,'data':base64.b64encode(data).decode('ascii'),'source':source,'width':width,'height':height}

def main():
    pages=[];warnings=[];method='';images=[];photos=[]
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
            ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            parts=['word/document.xml']+sorted(i.filename for i in items if re.fullmatch(r'word/(?:header|footer)\d+\.xml',i.filename))
            lines=[]
            def paragraph_text(node):
                out=[]
                for n in node:
                    if n.tag==ns+'p':continue
                    if n.tag==ns+'t':out.append(n.text or '')
                    elif n.tag==ns+'tab':out.append('\t')
                    elif n.tag in (ns+'br',ns+'cr'):out.append('\n')
                    else:out.append(paragraph_text(n))
                return ''.join(out)
            for part in parts:
                if sum(i.filename==part for i in items)!=1:raise ValueError('DOCX正文重复或缺失')
                with z.open(part) as stream:raw=stream.read(8*1024*1024+1)
                if len(raw)>8*1024*1024:raise ValueError('DOCX正文体积过大')
                checked=raw.replace(b'\x00',b'').upper()
                if b'<!DOCTYPE' in checked or b'<!ENTITY' in checked:raise ValueError('不接受含实体声明的文档')
                tree=ET.fromstring(raw)
                for p in tree.iter(ns+'p'):
                    value=paragraph_text(p)
                    if value.strip():lines.append(value)
            pages=[{'page':None,'text':'\n'.join(lines),'method':method}]
            warnings.append('提取正文、表格、文本框与页眉页脚文字供AI理解；DOCX页码未知，图片内文字未提取。')
            for item in items:
                if len(photos)>=3:break
                if not re.fullmatch(r'word/media/[^/]+\.(?:png|jpe?g)',item.filename,re.I):continue
                if item.file_size<100 or item.file_size>800*1024:continue
                if item.flag_bits&1:continue
                try:data=z.read(item)
                except Exception:continue
                mime='image/png' if item.filename.lower().endswith('.png') else 'image/jpeg'
                candidate=photo_candidate(data,mime,'DOCX内嵌图片：'+item.filename.split('/')[-1])
                if candidate:photos.append(candidate)
            if photos:warnings.append('从DOCX中提取到 '+str(len(photos))+' 张图片，请自行确认哪张是个人照片。')
    elif kind=='pdf':
        info=run(['/usr/bin/pdfinfo',path],10)
        n=re.search(r'^Pages:\s+(\d+)',info,re.M)
        if not n:raise ValueError('无法读取PDF页数')
        count=int(n[1])
        if count<1 or count>4:raise ValueError('本机保护上限为4页，请只保留简历页面后再上传')
        method='PDF页面渲染供AI视觉识别'
        for i in range(1,count+1):
            prefix=os.path.join(root,'page-'+str(i))
            run(['/usr/bin/pdftoppm','-f',str(i),'-l',str(i),'-singlefile','-scale-to','1800','-png',path,prefix],15)
            with open(prefix+'.png','rb') as f:image=f.read(4*1024*1024+1)
            if len(image)>4*1024*1024:raise ValueError('渲染图片过大，请精简页面')
            images.append({'mime':'image/png','data':base64.b64encode(image).decode('ascii')})
            pages.append({'page':i,'text':'','method':'PDF页面视觉识别'})
            os.unlink(prefix+'.png')
        # PDF里的照片通常是独立嵌入图片；单独提取供用户选择，不混入AI页面。
        try:
            pdf_prefix=os.path.join(root,'embedded')
            subprocess.run(['/usr/bin/pdfimages','-png','-f','1','-l',str(count),path,pdf_prefix],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
            for name in sorted(os.listdir(root)):
                if len(photos)>=3:break
                if not re.fullmatch(r'embedded-\d+\.png',name):continue
                p=os.path.join(root,name)
                try:
                    if os.path.getsize(p)>800*1024:continue
                    with open(p,'rb') as f:data=f.read()
                except OSError:continue
                candidate=photo_candidate(data,'image/png','PDF内嵌图片：'+name)
                if candidate:photos.append(candidate)
            if photos:warnings.append('从PDF中提取到 '+str(len(photos))+' 张图片，请自行确认哪张是个人照片。')
        except Exception:
            pass
        finally:
            for name in os.listdir(root):
                if re.fullmatch(r'embedded-\d+\.png',name):
                    try:os.unlink(os.path.join(root,name))
                    except OSError:pass
    else:
        width,height=dimensions(path)
        if width<20 or height<20 or width*height>12000000 or max(width,height)>6000:raise ValueError('图片限制为1200万像素且长边≤6000，请缩小后重试')
        with open(path,'rb') as f:image=f.read(5*1024*1024+1)
        images=[{'mime':'image/png' if kind=='png' else 'image/jpeg','data':base64.b64encode(image).decode('ascii')}]
        method='图片供AI视觉识别';pages=[{'page':1,'text':'','method':method}]
    text='\n\n'.join(p['text'] for p in pages)
    if images:text=''
    if not text.strip() and not images:raise ValueError('未识别到可用文字，请使用清晰正向图片或文字型PDF')
    if len(text)>MAX_TEXT:raise ValueError('识别文字超过40000字，请精简文件')
    warnings.append('本进程仅准备原文/页面，必须经AI语义结构化后方可使用；不会本地规则归类。')
    result={'text':text,'pages':pages,'method':method,'warnings':warnings}
    if photos:result['photos']=photos
    if vision:result['images']=images
    print(json.dumps(result,ensure_ascii=False))
try:main()
except Exception as e:
    if isinstance(e,ValueError):message=str(e)
    elif isinstance(e,subprocess.TimeoutExpired):message='解析子任务超时，请换更精简清晰的文件'
    else:message='文件无法解析，请检查格式、加密状态或重新导出'
    print(json.dumps({'error':message},ensure_ascii=False));sys.exit(1)

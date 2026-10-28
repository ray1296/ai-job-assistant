import type { ResumeDocument } from "./resume-model";
export async function exportWord(d: ResumeDocument, title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } =
    await import("docx");
  // 生图装饰：取回服务端图片并作为顶部横幅嵌入；失败不影响正文导出。
  let decorChild = null;
  if (d.decoration?.image) {
    try {
      const r = await fetch(
        "/api/decoration-assets/" + d.decoration.image + ".png",
      );
      if (r.ok) {
        const { ImageRun } = await import("docx");
        decorChild = new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [
            new ImageRun({
              type: "png",
              data: await r.arrayBuffer(),
              transformation: { width: 600, height: 120 },
            }),
          ],
        });
      }
    } catch {
      decorChild = null;
    }
  }
  const color = { purple: "7460C9", navy: "2D425D", charcoal: "3C3C3C" }[
    d.layout.accent
  ];
  const paragraph = (text: string, extra: object = {}) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      ...extra,
      children: text
        .split("\n")
        .flatMap((line, i) => [new TextRun({ text: line, break: i ? 1 : 0 })]),
    });
  let backgroundChild = null;
  if (d.background?.image && !d.decoration?.image) {
    try {
      const r = await fetch("/api/decoration-assets/" + d.background.image + ".png");
      if (r.ok) {
        const { ImageRun } = await import("docx");
        // 整页背景：浮动在正文之后（behindDocument），保持 210:297 比例，不再裁成顶部横幅。
        backgroundChild = new Paragraph({
          spacing: { after: 0 },
          children: [new ImageRun({
            type: "png",
            data: await r.arrayBuffer(),
            transformation: { width: 600, height: Math.round(600 * 297 / 210) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE },
            },
          })],
        });
      }
    } catch { backgroundChild = null; }
  }
  let multiDecorationChild = null;
  if (Array.isArray(d.decorations) && d.decorations.length) {
    try {
      const { ImageRun } = await import("docx");
      const images = [];
      const width = Math.max(20, Math.floor(600 / Math.min(15, d.decorations.length)));
      for (const item of d.decorations.slice(0, 15)) {
        const r = await fetch("/api/decoration-assets/" + item.image + ".png");
        if (!r.ok) continue;
        images.push(new ImageRun({
          type: "png",
          data: await r.arrayBuffer(),
          transformation: { width, height: 42 },
        }));
      }
      if (images.length) multiDecorationChild = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: images,
      });
    } catch { multiDecorationChild = null; }
  }
  let photoChild = null;
  const photo = Array.isArray(d.header.photos) ? d.header.photos[0] : "";
  if (photo) {
    try {
      const m = photo.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
      if (m) {
        const { ImageRun } = await import("docx");
        const data = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        photoChild = new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
          children: [new ImageRun({
            type: m[1] === "image/png" ? "png" : "jpg",
            data,
            transformation: { width: 96, height: 124 },
          })],
        });
      }
    } catch { photoChild = null; }
  }
  const children = [
    ...(decorChild ? [decorChild] : []),
    ...(backgroundChild ? [backgroundChild] : []),
    ...(multiDecorationChild ? [multiDecorationChild] : []),
    ...(photoChild ? [photoChild] : []),
    paragraph(d.header.name || "简历", {
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    paragraph(d.header.headline, { alignment: AlignmentType.CENTER }),
    paragraph(d.header.contact, { alignment: AlignmentType.CENTER }),
  ];
  if (d.header.summary) children.push(paragraph(d.header.summary, { spacing: { after: 220 } }));
  for (const s of d.sections) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: s.title, bold: true, color })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 320, after: 160 },
      }),
    );
    for (const i of s.items) {
      if (i.title)
        children.push(paragraph(i.title, { heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 40 } }));
      if (i.meta) children.push(paragraph(i.meta, { spacing: { after: 40 } }));
      if (i.content) children.push(paragraph(i.content, { spacing: { after: 220 } }));
      // 经历之间额外留一个空行，Word 里与网页的板块/条目间距一致
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    }
  }
  // 页脚装饰：同样作为图片段落追加在正文之后；失败不影响正文导出
  if (d.decorationFooter?.image) {
    try {
      const rf = await fetch(
        "/api/decoration-assets/" + d.decorationFooter.image + ".png",
      );
      if (rf.ok) {
        const { ImageRun } = await import("docx");
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
            children: [
              new ImageRun({
                type: "png",
                data: await rf.arrayBuffer(),
                transformation: { width: 600, height: 120 },
              }),
            ],
          }),
        );
      }
    } catch {}
  }
  const document = new Document({
    creator: "逐光 · Career Companion",
    title,
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: d.layout.fontSize * 2 },
          paragraph: { spacing: { after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  download(blob, title + ".docx");
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

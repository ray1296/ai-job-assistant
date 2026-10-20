import type { ResumeDocument } from "./resume-model";
export async function exportWord(d: ResumeDocument, title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } =
    await import("docx");
  const color = { purple: "7460C9", navy: "2D425D", charcoal: "3C3C3C" }[
    d.layout.accent
  ];
  const paragraph = (text: string, extra: object = {}) =>
    new Paragraph({
      ...extra,
      children: text
        .split("\n")
        .flatMap((line, i) => [new TextRun({ text: line, break: i ? 1 : 0 })]),
    });
  const children = [
    paragraph(d.header.name || "简历", {
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    paragraph(d.header.headline, { alignment: AlignmentType.CENTER }),
    paragraph(d.header.contact, { alignment: AlignmentType.CENTER }),
  ];
  if (d.header.summary) children.push(paragraph(d.header.summary));
  for (const s of d.sections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: s.title, bold: true, color })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      }),
    );
    for (const i of s.items) {
      if (i.title)
        children.push(paragraph(i.title, { heading: HeadingLevel.HEADING_3 }));
      if (i.meta) children.push(paragraph(i.meta));
      if (i.content) children.push(paragraph(i.content));
    }
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

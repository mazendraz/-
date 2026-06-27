// Minimal, dependency-free Markdown renderer. Supports the small subset the admin
// Legal editor can produce: paragraphs, **bold**, *italic*, and unordered (-/*)
// and ordered (1.) lists. Renders to React elements (never dangerouslySetInnerHTML),
// so stored content stays XSS-safe — the backend already strips HTML on save.
import React from "react";

// Inline: **bold** and *italic*. Bold is matched first, then italic within.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((chunk, i) => {
    if (/^\*\*[^*]+\*\*$/.test(chunk)) {
      out.push(<strong key={`${keyBase}-b${i}`}>{renderItalic(chunk.slice(2, -2), `${keyBase}-b${i}`)}</strong>);
    } else if (chunk) {
      out.push(...renderItalic(chunk, `${keyBase}-${i}`));
    }
  });
  return out;
}

function renderItalic(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*[^*]+\*)/g).map((chunk, i) =>
    /^\*[^*]+\*$/.test(chunk)
      ? <em key={`${keyBase}-i${i}`}>{chunk.slice(1, -1)}</em>
      : <React.Fragment key={`${keyBase}-t${i}`}>{chunk}</React.Fragment>,
  );
}

const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+\.\s+/;

export default function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // List runs (consecutive matching bullets / numbers).
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const pattern = ordered ? OL : UL;
      const items: React.ReactNode[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        const content = lines[i].replace(pattern, "");
        items.push(<li key={`li-${key}-${items.length}`}>{renderInline(content, `li-${key}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(
        ordered
          ? <ol key={`ol-${key++}`} className="list-decimal ms-5 space-y-1 mb-4">{items}</ol>
          : <ul key={`ul-${key++}`} className="list-disc ms-5 space-y-1 mb-4">{items}</ul>,
      );
      continue;
    }

    // Paragraph — gather until a blank line, joining soft-wrapped lines.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !UL.test(lines[i]) && !OL.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    const pk = key++;
    blocks.push(
      <p key={`p-${pk}`} className="mb-4">
        {para.flatMap((ln, li) => [
          ...(li > 0 ? [<br key={`br-${pk}-${li}`} />] : []),
          ...renderInline(ln, `p-${pk}-${li}`),
        ])}
      </p>,
    );
  }

  return <div className={className}>{blocks}</div>;
}

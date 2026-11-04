// file: src/pdf.js
// A small PDF maker (no extra packages). Uses the PDF's built-in Helvetica fonts,
// so nothing is embedded and files stay tiny. Handles text, wrapping, lines, boxes, pages.
//
//   const doc = new PdfDoc();                 // US Letter, 0.55" margins
//   doc.text('Hello', doc.left, doc.y, { size: 12, bold: true });
//   const lines = doc.wrap('long text…', 400, { size: 10 });
//   doc.save() → Blob (application/pdf)
//
// y is measured from the TOP of the page (like the screen); this file flips it for PDF.

// Character widths (1/1000 of the font size) for codes 32–255, Windows-1252 order.
const WIDTHS = {
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,761,222,556,333,1000,556,556,333,1000,667,333,1000,761,611,761,761,222,222,333,333,350,556,1000,333,1000,500,333,944,761,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,761,278,556,500,1000,556,556,333,1000,667,333,1000,761,611,761,761,278,278,500,500,350,556,1000,333,1000,556,333,944,761,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
};

// Unicode → Windows-1252 code for the characters outside plain ASCII that PDFs' basic fonts have.
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Turn any text into codes the basic fonts can show (unknown characters are dropped).
function toCodes(str) {
  const out = [];
  for (const ch of String(str == null ? '' : str)) {
    const u = ch.codePointAt(0);
    if (u === 9) out.push(32);
    else if (u >= 32 && u <= 126) out.push(u);
    else if (u >= 160 && u <= 255) out.push(u);
    else if (CP1252[u]) out.push(CP1252[u]);
    else if (u === 0x2212) out.push(45); // minus sign → hyphen
  }
  return out;
}

const esc = (codes) =>
  codes
    .map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 128 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0')))
    .join('');

const num = (n) => (Math.round(n * 100) / 100).toString();

function rgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [0, 2, 4].map((i) => num(parseInt(h.slice(i, i + 2), 16) / 255)).join(' ');
}

export class PdfDoc {
  constructor({ width = 612, height = 792, margin = 40 } = {}) {
    this.width = width;
    this.height = height;
    this.margin = margin;
    this.left = margin;
    this.right = width - margin;
    this.top = margin;
    this.bottom = height - margin;
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = this.top;
  }

  // Start a new page if `space` points won't fit below the current y.
  ensure(space) {
    if (this.y + space > this.bottom) {
      this.addPage();
      return true;
    }
    return false;
  }

  widthOf(str, { size = 10, bold = false, spacing = 0 } = {}) {
    const table = bold ? WIDTHS.bold : WIDTHS.regular;
    const codes = toCodes(str);
    return codes.reduce((w, c) => w + (table[c - 32] || 0), 0) * (size / 1000) + spacing * codes.length;
  }

  // Break text into lines no wider than maxWidth (keeps the user's own line breaks).
  wrap(str, maxWidth, opts = {}) {
    const lines = [];
    String(str == null ? '' : str)
      .split(/\r?\n/)
      .forEach((para) => {
        const words = para.split(/ +/);
        let line = '';
        words.forEach((word) => {
          const tryLine = line ? `${line} ${word}` : word;
          if (this.widthOf(tryLine, opts) <= maxWidth || !line) {
            line = tryLine;
          } else {
            lines.push(line);
            line = word;
          }
          // a single word longer than the line: cut it
          while (this.widthOf(line, opts) > maxWidth && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && this.widthOf(line.slice(0, cut), opts) > maxWidth) cut--;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        });
        lines.push(line);
      });
    return lines;
  }

  // Text with its top at y. align: 'left' | 'right' (x is the right edge) | 'center'
  text(str, x, y, { size = 10, bold = false, color = '#000000', align = 'left', spacing = 0 } = {}) {
    const codes = toCodes(str);
    if (!codes.length) return;
    const w = this.widthOf(str, { size, bold, spacing });
    const tx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const baseline = this.height - (y + size * 0.8);
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(spacing)} Tc ${rgb(color)} rg ${num(tx)} ${num(baseline)} Td (${esc(codes)}) Tj ET`
    );
  }

  line(x1, y1, x2, y2, { width = 1, color = '#000000' } = {}) {
    this.ops.push(
      `${num(width)} w ${rgb(color)} RG ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`
    );
  }

  rect(x, y, w, h, { stroke = '#000000', fill = null, width = 1 } = {}) {
    const box = `${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re`;
    if (fill) this.ops.push(`${rgb(fill)} rg ${box} f`);
    if (stroke) this.ops.push(`${num(width)} w ${rgb(stroke)} RG ${box} S`);
  }

  // A checkbox (optionally ticked) with its top-left at x, y
  checkbox(x, y, size, checked) {
    this.rect(x, y, size, size, { width: 0.9 });
    if (checked) {
      this.ops.push(
        `1.2 w 0 0 0 RG ${num(x + size * 0.2)} ${num(this.height - y - size * 0.55)} m ${num(x + size * 0.42)} ${num(
          this.height - y - size * 0.78
        )} l ${num(x + size * 0.82)} ${num(this.height - y - size * 0.22)} l S`
      );
    }
  }

  // Run fn(pageNumber, pageCount) on every page (e.g. for footers), after everything is laid out.
  eachPage(fn) {
    const keep = this.ops;
    this.pages.forEach((ops, i) => {
      this.ops = ops;
      fn(i + 1, this.pages.length);
    });
    this.ops = keep;
  }

  save(title = 'Crumb') {
    const enc = new TextEncoder();
    const objects = []; // strings, object n = index + 1
    const add = (s) => {
      objects.push(s);
      return objects.length;
    };
    const catalogId = add(''); // filled in below
    const pagesId = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = this.pages.map((ops) => {
      const content = ops.join('\n');
      const contentId = add(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const infoId = add(`<< /Title (${esc(toCodes(title))}) /Producer (Crumb) >>`);

    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(enc.encode(out).length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = enc.encode(out).length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => {
      out += `${String(o).padStart(10, '0')} 00000 n \n`;
    });
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([enc.encode(out)], { type: 'application/pdf' });
  }
}

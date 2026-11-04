// file: src/notesPdf.js
// Notes as a PDF (used by the Notes page and an account's notes screen).
import { PdfDoc } from './pdf';
import { isCheckable, isNoteDone } from './noteStatus';

// The shared PDF: same look as the printout (Crumb header, day headings, time column).
// showAccount = false for one account's notes (the heading already names it): rows show just the label.
export function buildNotesPdf({ heading, groups, groupSide, whenText, showAccount = true }) {
  const doc = new PdfDoc();
  const BLUE = '#0077cc';
  const timeW = 70;
  const textX = doc.left + timeW;
  const textW = doc.right - textX;

  // Header
  doc.text('Crumb.', doc.left, doc.y, { size: 15, bold: true, color: BLUE });
  doc.text('NOTES', doc.right, doc.y + 4, { size: 8, bold: true, align: 'right', spacing: 1.4 });
  doc.y += 20;
  doc.wrap(heading, doc.right - doc.left, { size: 14, bold: true }).forEach((ln) => {
    doc.text(ln, doc.left, doc.y, { size: 14, bold: true });
    doc.y += 17;
  });
  doc.y += 3;
  doc.line(doc.left, doc.y, doc.right, doc.y, { width: 2, color: BLUE });
  doc.y += 6;

  groups.forEach((g) => {
    doc.ensure(60); // keep a heading with at least one note
    doc.y += 10;
    doc.text(g.label, doc.left, doc.y, { size: 12, bold: true });
    if (g.label === 'Today' || g.label === 'Yesterday') {
      doc.text(groupSide(g), doc.right, doc.y + 2, { size: 9, bold: true, color: '#444444', align: 'right' });
    }
    doc.y += 16;
    doc.line(doc.left, doc.y, doc.right, doc.y, { width: 1 });

    g.notes.forEach((n) => {
      const lines = doc.wrap(n.text, textW, { size: 10.5 });
      const hasNameLine = showAccount || n.cat !== 'General';
      const rowH = 8 + (hasNameLine ? 14 : 0) + lines.length * 14 + 6;
      if (doc.ensure(rowH)) doc.y += 4;
      const top = doc.y + 8;
      doc.text(whenText(n), doc.left, top + 1, { size: 9, color: '#444444' });

      // Name line: [box] Account  PROSPECT  VISIT   (one account's notes: [box] VISIT)
      let x = textX;
      if (hasNameLine) {
        if (isCheckable(n.cat)) {
          doc.checkbox(x, top, 9, isNoteDone(n));
          x += 14;
        }
        if (showAccount) {
          doc.text(n.accountName, x, top, { size: 10.5, bold: true });
          x += doc.widthOf(n.accountName, { size: 10.5, bold: true }) + 8;
          const kind = n.kind === 'prospect' ? 'PROSPECT' : 'CUSTOMER';
          doc.text(kind, x, top + 2, { size: 7.5, bold: true, color: '#555555', spacing: 0.5 });
          x += doc.widthOf(kind, { size: 7.5, bold: true, spacing: 0.5 }) + 8;
        }
        if (n.cat !== 'General') doc.text(n.cat.toUpperCase(), x, top + 2, { size: 7.5, bold: true, color: BLUE, spacing: 0.5 });
      }

      let ly = hasNameLine ? top + 15 : top;
      lines.forEach((ln) => {
        doc.text(ln, textX, ly, { size: 10.5 });
        ly += 14;
      });
      doc.y = ly + 4;
      doc.line(doc.left, doc.y, doc.right, doc.y, { width: 0.6, color: '#c4c4c4' });
    });
  });

  doc.eachPage((page, count) => {
    if (count > 1) doc.text(`Page ${page} of ${count}`, doc.right, doc.bottom + 14, { size: 8, color: '#777777', align: 'right' });
  });
  return doc.save('Crumb notes');
}

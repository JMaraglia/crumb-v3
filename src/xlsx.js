// file: src/xlsx.js
// Builds a small, formatted Excel (.xlsx) file in the browser with no extra packages.
// An .xlsx is a zip of a few XML files; this writes them and zips them (uncompressed).
//
// makeXlsx({ title, subtitle, sheetName, columns, rows }) — see makeXlsx below for the details.
// → Blob you can share or download.

const enc = new TextEncoder();

/* ---------- zip (store only, no compression) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach(({ name, text }) => {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ---------- spreadsheet XML ---------- */
const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colLetter = (i) => String.fromCharCode(65 + i); // up to 26 columns is plenty

// Fonts, fills, borders (positions are referenced by the cell styles below)
const FONTS = [
  '<font><sz val="11"/><color rgb="FF1C1C1E"/><name val="Arial"/></font>', // 0 body
  '<font><b/><sz val="18"/><color rgb="FF0077CC"/><name val="Arial"/></font>', // 1 title
  '<font><sz val="11"/><color rgb="FF6E6E73"/><name val="Arial"/></font>', // 2 subtitle / acct #
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>', // 3 header
  '<font><b/><sz val="11"/><color rgb="FF1C1C1E"/><name val="Arial"/></font>', // 4 bold
  '<font><sz val="11"/><color rgb="FFAEAEB2"/><name val="Arial"/></font>', // 5 muted (N/A rows)
];
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0077CC"/><bgColor indexed="64"/></patternFill></fill>', // 2 header blue
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FC"/><bgColor indexed="64"/></patternFill></fill>', // 3 stripe
];
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E5EA"/></bottom><diagonal/></border>', // 1 row line
  '<border><left/><right/><top/><bottom style="medium"><color rgb="FF0077CC"/></bottom><diagonal/></border>', // 2 blue rule
];

// Excel's built-in cell checkbox (Microsoft 365). Older Excel shows TRUE / FALSE instead.
const CHECKBOX_EXT =
  '<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><xfpb:xfComplement i="0"/></ext></extLst>';

// Builds the cell-style list as cells ask for styles.
function styleBook() {
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const seen = new Map();
  const get = ({ font = 0, fill = 0, border = 0, h, v = 'center', wrap = false, indent = 0, checkbox = false }) => {
    const key = [font, fill, border, h, v, wrap, indent, checkbox].join('|');
    if (seen.has(key)) return seen.get(key);
    const align = `<alignment${h ? ` horizontal="${h}"` : ''} vertical="${v}"${wrap ? ' wrapText="1"' : ''}${
      indent ? ` indent="${indent}"` : ''
    }/>`;
    xfs.push(
      `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}${
        checkbox ? CHECKBOX_EXT : ''
      }</xf>`
    );
    seen.set(key, xfs.length - 1);
    return xfs.length - 1;
  };
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>
<fills count="${FILLS.length}">${FILLS.join('')}</fills>
<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  return { get, xml };
}

function cell(ref, value, style) {
  if (typeof value === 'boolean') return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (value === '' || value == null) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

// columns: [{ label, width, kind }] where kind is 'text' (default), 'bold', 'quiet' (gray),
// 'center', or 'check' (value true/false → a tappable checkbox in Excel).
// rows: [{ cells: [...], muted }]   muted = grayed-out row (e.g. N/A, no call)
export function makeXlsx({ title, subtitle, sheetName = 'Sheet1', columns, rows }) {
  const st = styleBook();
  const last = colLetter(columns.length - 1);
  const headRow = 4;
  const hasCheckbox = columns.some((c) => c.kind === 'check');

  const titleStyle = st.get({ font: 1, v: 'bottom' });
  const subStyle = st.get({ font: 2, border: 2, v: 'top' });
  const headStyle = (c) =>
    st.get({ font: 3, fill: 2, h: c.kind === 'check' || c.kind === 'center' ? 'center' : undefined, indent: c.kind === 'check' || c.kind === 'center' ? 0 : 1 });

  const bodyStyle = (c, stripe, muted) => {
    const fill = stripe ? 3 : 0;
    const base = { fill, border: 1 };
    if (c.kind === 'check') return st.get({ ...base, font: muted ? 5 : 0, h: 'center', checkbox: true });
    if (c.kind === 'center') return st.get({ ...base, font: muted ? 5 : 0, h: 'center' });
    const font = muted ? 5 : c.kind === 'bold' ? 4 : c.kind === 'quiet' ? 2 : 0;
    return st.get({ ...base, font, wrap: true, indent: 1 });
  };

  const xmlRows = [
    `<row r="1" ht="30" customHeight="1">${cell('A1', title, titleStyle)}</row>`,
    `<row r="2" ht="22" customHeight="1">${columns
      .map((_, i) => cell(`${colLetter(i)}2`, i === 0 ? subtitle : '', subStyle))
      .join('')}</row>`,
    `<row r="3" ht="10" customHeight="1"/>`,
    `<row r="${headRow}" ht="26" customHeight="1">${columns
      .map((c, i) => cell(`${colLetter(i)}${headRow}`, c.label.toUpperCase(), headStyle(c)))
      .join('')}</row>`,
    ...rows.map((r, ri) => {
      const n = headRow + 1 + ri;
      // Short rows get a comfortable fixed height; rows with long text are left for Excel to size.
      const long = r.cells.some((v, i) => typeof v === 'string' && v.length > columns[i].width);
      return `<row r="${n}"${long ? '' : ' ht="24" customHeight="1"'}>${r.cells
        .map((v, i) => cell(`${colLetter(i)}${n}`, v, bodyStyle(columns[i], ri % 2 === 1, r.muted)))
        .join('')}</row>`;
    }),
  ];

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${last}${headRow + rows.length}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${xmlRows.join('')}</sheetData>
<mergeCells count="2"><mergeCell ref="A1:${last}1"/><mergeCell ref="A2:${last}2"/></mergeCells>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  const safeName = esc(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const files = [
    {
      name: '[Content_Types].xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
        hasCheckbox
          ? '\n<Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/>'
          : ''
      }
</Types>`,
    },
    {
      name: '_rels/.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${
        hasCheckbox
          ? '\n<Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/>'
          : ''
      }
</Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', text: sheet },
    { name: 'xl/styles.xml', text: st.xml() },
  ];
  if (hasCheckbox) {
    files.push({
      name: 'xl/featurePropertyBag/featurePropertyBag.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><bag type="Checkbox"/><bag type="XFControls"><bagId k="CellControl">0</bagId></bag><bag type="XFComplement"><bagId k="XFControls">1</bagId></bag><bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag></FeaturePropertyBags>`,
    });
  }
  return zip(files);
}

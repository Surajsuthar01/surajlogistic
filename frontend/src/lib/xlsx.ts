import { strToU8, zipSync } from 'fflate';
import { LOGO_PNG } from './brand-logo';
import { saveFile } from './format';

/*
  A small Excel (.xlsx) writer for our downloads. Every file opens with the Surajlogistic
  logo, the report's name and when it was downloaded, then a dark header row with filters,
  frozen so it stays in view, and the rows underneath. Numbers stay numbers and ISO dates
  become real Excel dates, so people can sort, filter and add up without cleaning anything.
  Printing is set to landscape, one page wide, with the header repeated on every page.
*/

export type Cell = string | number | null | undefined;

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEADER_ROW = 5;

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function colName(i: number) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** An ISO timestamp as an Excel serial date, in the viewer's own time zone. */
function excelDate(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return local / 86_400_000 + 25_569;
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const safeSheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet1';

// Cell styles, by index into cellXfs below.
const S = { title: 1, sub: 2, head: 3, text: 4, int: 5, dec: 6, date: 7, headRight: 8 } as const;

const STYLES = `${XML}<styleSheet xmlns="${NS_MAIN}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy, hh:mm"/></numFmts>
<fonts count="4">
<font><sz val="11"/><color rgb="FF1F2328"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF0B0D12"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6B7078"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF14171D"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FFFF8A1F"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE4E4E0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref: string, v: Cell, style: number, header = false): string {
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}" s="${style}"/>` : '';
  if (typeof v === 'number' && Number.isFinite(v) && !header) {
    return `<c r="${ref}" s="${Number.isInteger(v) ? S.int : S.dec}"><v>${v}</v></c>`;
  }
  const s = String(v);
  if (!header && ISO.test(s)) {
    const serial = excelDate(s);
    if (serial !== null) return `<c r="${ref}" s="${S.date}"><v>${(Math.round(serial * 86_400) / 86_400).toFixed(10)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
}

/** Builds the .xlsx file. The first row of `rows` is the header. */
export function buildXlsx({ title, sheet, rows, now = new Date() }: { title: string; sheet?: string; rows: Cell[][]; now?: Date }): Uint8Array {
  const name = safeSheetName(sheet ?? title);
  const [head = [], ...body] = rows;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const lastCol = colName(cols - 1);
  const lastRow = HEADER_ROW + body.length;

  // Column widths from the longest value in each column, dates counted as their printed width.
  const widths = Array.from({ length: cols }, (_, c) => {
    let w = String(head[c] ?? '').length + 4;
    for (const r of body) {
      const v = r[c];
      if (v === null || v === undefined) continue;
      const s = String(v);
      w = Math.max(w, ISO.test(s) ? 19 : typeof v === 'number' ? s.length + 3 : s.length + 2);
    }
    return Math.min(48, Math.max(9, w));
  });

  // Columns that hold numbers get their heading on the right, over the figures.
  const numeric = Array.from({ length: cols }, (_, c) => {
    const vals = body.map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== '');
    return vals.length > 0 && vals.every((v) => typeof v === 'number');
  });

  const logoW = Math.round(LOGO_PNG.width / 2);
  const logoH = Math.round(LOGO_PNG.height / 2);
  const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const sheetRows: string[] = [];
  sheetRows.push(`<row r="1" ht="${((logoH + 16) * 0.75).toFixed(1)}" customHeight="1"/>`);
  sheetRows.push(`<row r="2" ht="24" customHeight="1">${cellXml('A2', title, S.title)}</row>`);
  sheetRows.push(`<row r="3">${cellXml('A3', `Downloaded ${stamp} · ${body.length} ${body.length === 1 ? 'row' : 'rows'} · Surajlogistic, to every direction`, S.sub)}</row>`);
  sheetRows.push(`<row r="4" ht="8" customHeight="1"/>`);
  sheetRows.push(`<row r="${HEADER_ROW}" ht="22" customHeight="1">${Array.from({ length: cols }, (_, c) => cellXml(`${colName(c)}${HEADER_ROW}`, head[c] ?? '', numeric[c] ? S.headRight : S.head, true)).join('')}</row>`);
  body.forEach((r, i) => {
    const n = HEADER_ROW + 1 + i;
    sheetRows.push(`<row r="${n}">${Array.from({ length: cols }, (_, c) => cellXml(`${colName(c)}${n}`, r[c], S.text)).join('')}</row>`);
  });

  const quoted = `'${name.replace(/'/g, "''")}'`;
  const filterRef = `A${HEADER_ROW}:${lastCol}${Math.max(lastRow, HEADER_ROW)}`;

  const sheetXml = `${XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastCol}${Math.max(lastRow, HEADER_ROW)}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEADER_ROW + 1}" sqref="A${HEADER_ROW + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${sheetRows.join('')}</sheetData>
${body.length ? `<autoFilter ref="${filterRef}"/>` : ''}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L&amp;8Surajlogistic · To every direction&amp;C&amp;8${esc(title)}&amp;R&amp;8Page &amp;P of &amp;N</oddFooter></headerFooter>
<drawing r:id="rId1"/>
</worksheet>`;

  const emu = (px: number) => Math.round(px * 9525);
  const drawingXml = `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${emu(2)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${emu(8)}</xdr:rowOff></xdr:from><xdr:ext cx="${emu(logoW)}" cy="${emu(logoH)}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Surajlogistic logo" descr="Surajlogistic, to every direction"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip xmlns:r="${NS_REL}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(logoW)}" cy="${emu(logoH)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>
<xdr:clientData/></xdr:oneCellAnchor>
</xdr:wsDr>`;

  const definedNames = [
    body.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${esc(quoted)}!$A$${HEADER_ROW}:$${lastCol}$${lastRow}</definedName>` : '',
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">${esc(quoted)}!$${HEADER_ROW}:$${HEADER_ROW}</definedName>`,
  ].join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="${NS_PKG}">
<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="${NS_REL}/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    'docProps/core.xml': strToU8(`${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Surajlogistic</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now.toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`),
    'docProps/app.xml': strToU8(`${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Surajlogistic</Application><Company>Surajlogistic</Company></Properties>`),
    'xl/workbook.xml': strToU8(`${XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets><definedNames>${definedNames}</definedNames></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${XML}<Relationships xmlns="${NS_PKG}">
<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    'xl/worksheets/_rels/sheet1.xml.rels': strToU8(`${XML}<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`),
    'xl/drawings/drawing1.xml': strToU8(drawingXml),
    'xl/drawings/_rels/drawing1.xml.rels': strToU8(`${XML}<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/image" Target="../media/logo.png"/></Relationships>`),
    'xl/media/logo.png': base64ToBytes(LOGO_PNG.base64),
  };
  return zipSync(files, { level: 6 });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Builds and hands the viewer a branded Excel file. */
export function downloadXlsx(filename: string, title: string, rows: Cell[][]) {
  const bytes = buildXlsx({ title, rows });
  return saveFile(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, bytes, XLSX_MIME);
}

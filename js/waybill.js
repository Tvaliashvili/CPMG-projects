// RS.ge waybills (სასაქონლო ზედნადები) read from their PDF - one, or many printed together.
// The PDF's own text is read where it sits on the page: each value is put in the
// column whose heading it stands under, so a name wrapped onto a second line stays
// with its item. A long waybill goes on over "annex" pages (დანართი) under its number.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

/** pdf.js, loaded the first time a waybill is read. */
let loading;
function pdfjs() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => { loading = null; reject(new Error('PDF-ის წამკითხველი ვერ ჩაიტვირთა. შეამოწმეთ ინტერნეტი.')); };
    document.head.append(s);
  });
  return loading;
}

/** Every page's text pieces: [{ str, x, y, w }] - y grows up the page, as in the PDF. */
export async function pdfPages(file) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    pages.push(items.filter((it) => it.str.trim()).map((it) => ({
      str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width,
    })));
  }
  return pages;
}

/** Reads every waybill in a PDF file (see parseWaybills). */
export async function readWaybills(file) {
  return parseWaybills(await pdfPages(file));
}

// The item table's columns, by their headings (centres from the RS.ge form, used when a heading is missing).
const COLUMNS = [
  ['no', '#', 33],
  ['name', 'საქონლის დასახელება', 101],
  ['code', 'საქონლის კოდი', 259],
  ['unit', 'ერთეული', 333],
  ['qty', 'რაოდენობა', 404],
  ['price', 'ერთეულის ფასი', 475],
  ['total', 'საქონლის ფასი', 545],
];
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TAX_ID = /^\d{9}$|^\d{11}$/;
const num = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const sameLine = (a, b) => Math.abs(a.y - b.y) < 3;
const centre = (it) => it.x + it.w / 2;
const byReading = (a, b) => b.y - a.y || a.x - b.x;

/** What stands on the line of a numbered field ("4", "8"...) to the right of its number, left to right. */
function fieldLine(page, label, minX = 0) {
  const tag = page.find((it) => it.str === label && it.x >= minX && it.w < 10);
  if (!tag) return [];
  return page.filter((it) => it !== tag && sameLine(it, tag) && it.x > tag.x).sort((a, b) => a.x - b.x);
}

/** The item rows of one page's table: [{ no, name, code, unit, qty, price, total }]. */
function tableRows(page) {
  const head = page.find((it) => it.str === 'საქონლის დასახელება');
  if (!head) return [];
  const columns = COLUMNS.map(([key, title, fallback]) => {
    const h = page.find((it) => it.str.startsWith(title) && Math.abs(it.y - head.y) < 15);
    return { key, x: h ? centre(h) : fallback };
  });
  // The table runs from under its headings to the end mark, the total (field 13) or the page's foot.
  const end = page.filter((it) => /საბეჭდი ფორმის ბოლო გვერდი/.test(it.str) || (it.str === '13' && it.w < 10) || /^შენიშვნა:/.test(it.str))
    .reduce((top, it) => Math.max(top, it.y), 0);
  const cells = page.filter((it) => it.y < head.y - 12 && it.y > end + 1).map((it) => ({
    ...it, col: columns.reduce((best, c) => (Math.abs(centre(it) - c.x) < Math.abs(centre(it) - best.x) ? c : best)).key,
  }));
  const rows = cells.filter((c) => c.col === 'no' && /^\d+$/.test(c.str)).sort(byReading)
    .map((c) => ({ y: c.y, no: Number(c.str), parts: { name: [], code: [], unit: [], qty: [], price: [], total: [] } }));
  for (const c of cells.filter((x) => x.col !== 'no').sort(byReading)) {
    // A piece belongs to the row that starts on its line or the nearest above it.
    const row = rows.filter((r) => r.y >= c.y - 2).at(-1);
    if (row) row.parts[c.col].push(c.str);
  }
  return rows.map(({ no, parts }) => ({
    no,
    name: parts.name.join(' ').replace(/\s+/g, ' ').trim(),
    code: parts.code.join(''),
    unit: parts.unit.join(' '),
    qty: num(parts.qty[0]),
    price: num(parts.price[0]),
    total: num(parts.total[0]),
  })).filter((r) => r.name || r.total);
}

/** "ელ- 1012219478" anywhere on a page, as "ელ-1012219478"; or a bare number after "ზედნადები #". */
function numberOn(page) {
  for (const it of page.slice().sort(byReading)) {
    const m = it.str.match(/ელ-?\s*(\d{6,})/) ?? it.str.match(/ზედნადები\s*#\s*(\d{6,})/);
    if (m) return `ელ-${m[1]}`;
  }
  const title = page.find((it) => /ზედნადები\s*#/.test(it.str));
  const beside = title && page.find((it) => it !== title && sameLine(it, title) && /\d{6,}/.test(it.str));
  return beside ? `ელ-${beside.str.match(/\d{6,}/)[0]}` : null;
}

/** The page number at the foot of a page ("გვ. 2"), or null. */
function pageNoOf(page) {
  const it = page.find((x) => /^გვ\.?\s*\d+$/.test(x.str));
  return it ? Number(it.str.match(/\d+/)[0]) : null;
}

/** A waybill's first page, read for its heading fields. */
function coverOf(page, number) {
  const dateItem = page.filter((it) => DATE.test(it.str)).sort(byReading)[0];
  const [, d, m, y] = dateItem?.str.match(DATE) ?? [];
  const parties = fieldLine(page, '4');
  const ids = parties.filter((it) => TAX_ID.test(it.str));
  const sellerEnd = parties.indexOf(ids[0]);
  return {
    number: number ?? '',
    date: y ? `${y}-${m}-${d}` : null,
    seller: (sellerEnd > 0 ? parties.slice(0, sellerEnd) : []).map((it) => it.str).join(' '),
    sellerId: ids[0]?.str ?? '',
    buyerId: ids[1]?.str ?? '',
    from: fieldLine(page, '7').map((it) => it.str).join(' '),
    to: fieldLine(page, '8').map((it) => it.str).join(' '),
    total: null,
    items: [],
  };
}

/**
 * The waybills in a PDF's pages, in the order printed:
 * [{ number, date, seller, sellerId, buyerId, from, to, total, items: [...] }].
 * `total` is the waybill's own total (field 13); the items' totals add up to it.
 *
 * A page starts a new waybill when it is a cover - "გვ. 1" at its foot, or a title
 * whose number is not the waybill being read. Other pages (გვ. 2, 3..., and annexes,
 * "1012219478 სასაქონლო ზედნადების დანართი") go on with the waybill before them.
 */
export function parseWaybills(pages) {
  const bills = [];
  for (const page of pages) {
    const isAnnex = page.some((it) => /ზედნადების დანართი/.test(it.str));
    const hasTitle = !isAnnex && page.some((it) => /სასაქონლო ზედნადები\s*#/.test(it.str));
    const number = numberOn(page);
    const current = bills.at(-1);
    const startsNew = !current
      || pageNoOf(page) === 1
      || (hasTitle && number !== current.number)
      || (isAnnex && number && current.number && number !== current.number);
    if (startsNew) bills.push(coverOf(page, number));
    const bill = bills.at(-1);
    bill.items.push(...tableRows(page));
    const total = page.find((it) => /^\d+(\.\d+)? - /.test(it.str));
    if (total) bill.total = num(total.str.split(' - ')[0]);
  }
  for (const b of bills) {
    // A row printed on two pages is kept once.
    const seen = new Set();
    b.items = b.items.filter((it) => !seen.has(it.no) && seen.add(it.no));
    b.total ??= b.items.reduce((s, it) => s + it.total, 0);
  }
  return bills.filter((b) => b.items.length || b.number);
}

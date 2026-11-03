// Wydruk miesięczny wypłaty pracownika (Wypłaty → ikona drukarki) - ten sam szablon co w panelu
// (frontend/src/utils/payrollSheetHtml.js): nagłówek (miesiąc, pracownik), wiersz na dzień (punkt, od, do, czas,
// sztuki kurtek, za godziny, prowizja, suma), WOLNE w każdej komórce dnia wolnego, RAZEM, zaliczki/wypłaty/dopłata,
// do wypłaty, podpisy. Telefon pokazuje go w podglądzie (WebView); dane z GET /work-hours/payroll-sheet.
// Formatowanie liczb ręczne (bez Intl - Hermes na starszych buildach nie ma pl-PL).

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const groupThousands = (text) => text.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const money = (value) => {
  const number = Number(value || 0);
  const [int, dec] = Math.abs(number).toFixed(2).split('.');
  return `${number < 0 ? '-' : ''}${groupThousands(int)},${dec}`;
};
const hoursText = (value) => {
  const number = Math.round(Number(value || 0) * 100) / 100;
  return String(number).replace('.', ',');
};
const rateText = (rate) => (typeof rate === 'number' ? String(Math.round(rate * 10000) / 10000).replace('.', ',') : '');
const pad2 = (n) => String(n).padStart(2, '0');
const dateText = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const dateTimeText = (value) => {
  const d = new Date(value || Date.now());
  return `${dateText(d)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const WEEKEND = new Set(['sb', 'nd']);

const dayRows = (day) => {
  const cls = `${WEEKEND.has(day.weekday) ? 'weekend' : ''}${day.free ? ' free' : ''}`;
  const label = `<td class="day">${day.day}</td><td class="wd">${escapeHtml(day.weekday)}</td>`;
  if (day.free) {
    return `<tr class="${cls}">${label}${'<td class="free-cell">WOLNE</td>'.repeat(8)}</tr>`;
  }
  const shifts = day.shifts.length ? day.shifts : [{ sellingPoint: '', startTime: '', endTime: '', hours: 0 }];
  const span = shifts.length > 1 ? ` rowspan="${shifts.length}"` : '';
  const daily = `<td class="num"${span}>${day.pieces || ''}</td>`
    + `<td class="num"${span}>${day.hourlyPay ? money(day.hourlyPay) : ''}</td>`
    + `<td class="num"${span}>${day.commission ? money(day.commission) : ''}</td>`
    + `<td class="num strong"${span}>${day.total ? money(day.total) : ''}</td>`;
  return shifts.map((shift, index) => {
    const first = index === 0;
    return `<tr class="${cls}">`
      + (first ? label.replace('<td class="day">', `<td class="day"${span}>`).replace('<td class="wd">', `<td class="wd"${span}>`) : '')
      + `<td class="point">${escapeHtml(shift.sellingPoint)}</td>`
      + `<td class="time">${escapeHtml(shift.startTime)}</td><td class="time">${escapeHtml(shift.endTime)}</td>`
      + `<td class="num">${shift.hours ? hoursText(shift.hours) : ''}</td>`
      + (first ? daily : '')
      + '</tr>';
  }).join('');
};

const operationText = (r) => {
  const currency = String(r.currency || 'PLN').toUpperCase();
  let text = `${dateText(r.date)} - ${money(r.amount)} ${escapeHtml(currency)}`;
  if (currency !== 'PLN') {
    text += r.plnAmount === null || r.plnAmount === undefined
      ? ' (bez przeliczenia - brak kursu, nie odjęto)'
      : ` = ${money(r.plnAmount)} zł (kurs ${rateText(r.plnRate)})`;
  }
  if (r.bonus > 0) text += ` (w tym dopłata ${money(r.bonus)})`;
  return text;
};
const operationsList = (title, rows, total) => {
  if (!rows.length) return `<div class="ops"><strong>${title}:</strong> brak</div>`;
  return `<div class="ops"><strong>${title}:</strong> ${rows.map(operationText).join('; ')} <strong>(razem ${money(total)} zł)</strong></div>`;
};

export default function buildPayrollSheetHtml(sheet) {
  const employee = sheet.employee || {};
  const name = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  const title = `${String(sheet.monthName || '').toUpperCase()} ${sheet.year}`;
  const t = sheet.totals || {};
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=900, initial-scale=0.45, minimum-scale=0.3, maximum-scale=3, user-scalable=yes">
<title>Wypłata ${escapeHtml(name)} - ${escapeHtml(sheet.monthName)} ${escapeHtml(sheet.year)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; color: #000; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  .header h1 { margin: 0; font-size: 22px; letter-spacing: 1px; }
  .header .employee { text-align: right; font-size: 15px; }
  .header .employee strong { font-size: 18px; }
  .header .employee small { display: block; font-size: 11px; color: #333; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 2px 4px; font-size: 11px; height: 6.4mm; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  th { background: #e5e7eb; font-weight: 700; text-align: center; font-size: 10px; }
  col.c-day { width: 7%; } col.c-wd { width: 6%; } col.c-point { width: 15%; } col.c-time { width: 9%; } col.c-hours { width: 8%; }
  col.c-pieces { width: 8%; } col.c-money { width: 12%; } col.c-total { width: 14%; }
  td { text-align: center; }
  td.strong { font-weight: 700; }
  td.free-cell { text-align: center; color: #555; letter-spacing: 1px; font-size: 10px; }
  tr.weekend td.day, tr.weekend td.wd { background: #f3f4f6; }
  tr.free td { background: #fafafa; }
  tr.total td { background: #e5e7eb; font-weight: 700; font-size: 12px; }
  tr.total td.total-label { text-align: left; padding-left: 8px; }
  .footer { margin-top: 8px; font-size: 12px; }
  .ops { margin: 3px 0; }
  .topay { margin-top: 6px; font-size: 15px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 18px; font-size: 11px; }
  .signatures div { width: 45%; border-top: 1px solid #000; padding-top: 3px; text-align: center; }
  .printed { margin-top: 6px; font-size: 9px; color: #555; text-align: right; }
  @page { size: A4 portrait; margin: 8mm; }
  @media print {
    body { padding: 0; }
    th, tr.total td, tr.weekend td.day, tr.weekend td.wd { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style></head><body>
<div class="header">
  <h1>${escapeHtml(title)}</h1>
  <div class="employee"><strong>${escapeHtml(name)}</strong>${employee.position ? `<small>${escapeHtml(employee.position)}</small>` : ''}</div>
</div>
<table>
  <colgroup><col class="c-day"><col class="c-wd"><col class="c-point"><col class="c-time"><col class="c-time"><col class="c-hours"><col class="c-pieces"><col class="c-money"><col class="c-money"><col class="c-total"></colgroup>
  <thead><tr><th>Data</th><th>Dzień</th><th>Punkt</th><th>Rozp.</th><th>Zak.</th><th>Czas</th><th>Sztuki</th><th>Za godziny</th><th>Prowizja</th><th>Suma</th></tr></thead>
  <tbody>
    ${(sheet.days || []).map(dayRows).join('\n    ')}
    <tr class="total"><td colspan="5" class="total-label">RAZEM</td><td class="num">${hoursText(t.hours)}</td><td class="num">${t.pieces || 0}</td><td class="num">${money(t.hourlyPay)}</td><td class="num">${money(t.commission)}</td><td class="num">${money(t.total)}</td></tr>
  </tbody>
</table>
<div class="footer">
  <div class="ops">Dni pracy: <strong>${t.workDays || 0}</strong> · Godziny: <strong>${hoursText(t.hours)}</strong> · Sztuki (kurtki, kożuchy, futra): <strong>${t.pieces || 0}</strong></div>
  ${operationsList('Zaliczki', sheet.advances || [], sheet.totalAdvances)}
  ${sheet.unconvertedAdvances > 0 ? `<div class="ops" style="color:#b91c1c"><strong>Uwaga:</strong> ${sheet.unconvertedAdvances === 1 ? 'jedna zaliczka w obcej walucie nie ma kursu i nie została' : `${sheet.unconvertedAdvances} zaliczki w obcej walucie nie mają kursu i nie zostały`} odjęte od wypłaty.</div>` : ''}
  ${operationsList('Wypłacono', sheet.payments || [], sheet.totalPayments)}
  ${sheet.totalBonus > 0 ? `<div class="ops"><strong>Dopłata (zaokrąglenie wypłaty):</strong> +${money(sheet.totalBonus)} zł</div>` : ''}
  <div class="topay">Suma za miesiąc: <strong>${money(t.total)} zł</strong>${sheet.totalBonus > 0 ? ` &nbsp;+&nbsp; dopłata ${money(sheet.totalBonus)} zł` : ''} &nbsp;−&nbsp; zaliczki ${money(sheet.totalAdvances)} zł &nbsp;−&nbsp; wypłacono ${money(sheet.totalPayments)} zł &nbsp;=&nbsp; <strong>Do wypłaty: ${money(sheet.toPay)} zł</strong></div>
  <div class="signatures"><div>Podpis pracownika</div><div>Podpis wypłacającego</div></div>
  <div class="printed">Wydrukowano ${escapeHtml(dateTimeText(sheet.generatedAt))}</div>
</div>
</body></html>`;
}

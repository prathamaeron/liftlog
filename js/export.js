// JSON backup/import and PDF report export.
import { getData, replaceData, merge, normalize, finishedSessions, sortedBodyweights, get, getUnit, toDisplay, round1, isCountedSet, sortedExercises } from './store.js';
import { downloadBlob, dateStamp, fmtDate, fmtDuration } from './util.js';
import { summarizeSession, exerciseHistory, exercisePRs } from './stats.js';
import { setText } from './views/workout.js';

// ---------- JSON ----------

export function exportJSON() {
  const blob = new Blob([JSON.stringify({ app: 'liftlog', exportedAt: new Date().toISOString(), ...getData() }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `liftlog-backup-${dateStamp()}.json`);
}

export async function importJSON(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('sessions' in parsed || 'exercises' in parsed)) {
    throw new Error('Not a LiftLog backup file');
  }
  const incoming = normalize(parsed);
  replaceData(merge(getData(), incoming));
  return ['exercises', 'templates', 'sessions', 'bodyweights'].reduce((n, c) => n + Object.keys(incoming[c]).length, 0);
}

// ---------- PDF ----------

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function loadPdfLibs() {
  if (!window.jspdf) await loadScript('./vendor/jspdf.umd.min.js');
  if (!window.autoTable) await loadScript('./vendor/jspdf.plugin.autotable.min.js');
  return { jsPDF: window.jspdf.jsPDF, autoTable: window.autoTable };
}

// Built-in PDF fonts only cover Latin-1; replace anything else.
const clean = s => String(s ?? '').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');

const INK = [24, 24, 27], MUTED = [113, 113, 122], ACCENT = [101, 163, 13], LINE = [228, 228, 231];

export async function exportPDF({ days = 90 } = {}) {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const unit = getUnit();
  const since = days ? Date.now() - days * 86400000 : 0;
  const sessions = finishedSessions().filter(s => s.date >= since); // newest first
  const bws = sortedBodyweights().filter(b => b.date >= since);
  const rangeText = days ? `${fmtDate(since)} - ${fmtDate(Date.now())}` : 'All time';

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 42;
  let y = M;

  const ensure = h => { if (y + h > PH - M) { doc.addPage(); y = M; } };
  const h2 = text => {
    ensure(40);
    y += 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
    doc.text(clean(text), M, y); y += 6;
    doc.setDrawColor(...ACCENT); doc.setLineWidth(1.5); doc.line(M, y, M + 28, y); y += 14;
  };

  // Header
  doc.setFillColor(24, 24, 27); doc.rect(0, 0, PW, 86, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('LiftLog Training Report', M, 44);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(200);
  doc.text(clean(`${rangeText}   |   Units: ${unit}   |   Generated ${new Date().toLocaleString()}`), M, 64);
  doc.setFillColor(...ACCENT); doc.rect(0, 86, PW, 3, 'F');
  y = 116;

  // Summary
  let sets = 0, volume = 0;
  sessions.forEach(s => { const x = summarizeSession(s); sets += x.sets; volume += x.volume; });
  const weeks = Math.max(1, ((days ? days : (sessions.length ? (Date.now() - sessions.at(-1).date) / 86400000 : 7)) / 7));
  const bwChange = bws.length >= 2 ? toDisplay(bws.at(-1).weightKg - bws[0].weightKg, unit) : null;
  const boxes = [
    ['Workouts', String(sessions.length)],
    ['Per week', (sessions.length / weeks).toFixed(1)],
    ['Sets', String(sets)],
    [`Volume (${unit})`, Math.round(toDisplay(volume, unit)).toLocaleString()],
    ['Bodyweight', bws.length ? `${round1(toDisplay(bws.at(-1).weightKg, unit))}${bwChange != null ? ` (${bwChange >= 0 ? '+' : ''}${round1(bwChange)})` : ''}` : '-'],
  ];
  const bw = (PW - 2 * M - 4 * 8) / 5;
  boxes.forEach(([k, v], i) => {
    const x = M + i * (bw + 8);
    doc.setFillColor(244, 244, 245); doc.roundedRect(x, y, bw, 52, 6, 6, 'F');
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(k.toUpperCase(), x + 10, y + 17);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(clean(v), x + 10, y + 39);
    doc.setFont('helvetica', 'normal');
  });
  y += 72;

  // Exercise progress table
  const exRows = [];
  const chartData = [];
  for (const ex of sortedExercises()) {
    const all = exerciseHistory(ex.id);
    const h = all.filter(r => r.session.date >= since);
    if (!h.length) continue;
    const isBw = ex.type === 'bodyweight';
    const val = r => (isBw ? r.maxReps : toDisplay(r.bestE1rm, unit));
    const f = val(h[0]), l = val(h.at(-1));
    const pct = f ? ((l - f) / f) * 100 : 0;
    const pr = exercisePRs(all);
    exRows.push([
      clean(ex.name), String(h.length),
      isBw ? `${f} reps` : round1(f), isBw ? `${l} reps` : round1(l),
      h.length > 1 ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '-',
      isBw && !(pr.topWeight?.value > 0) ? `${pr.maxReps.value} reps` : pr.topWeight ? clean(setText(pr.topWeight.set, isBw, unit)) : '-',
    ]);
    if (h.length >= 2) chartData.push({ name: ex.name, n: h.length, isBw, points: h.map(r => ({ x: r.session.date, y: val(r) })) });
  }

  if (exRows.length) {
    h2('Exercise progress');
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [['Exercise', 'Sessions', `First (e1RM ${unit} / reps)`, `Latest (e1RM ${unit} / reps)`, 'Change', 'Best set (all time)']],
      body: exRows,
      styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      didParseCell: d => {
        if (d.section === 'body' && d.column.index === 4) {
          const v = String(d.cell.raw);
          if (v.startsWith('+')) d.cell.styles.textColor = ACCENT;
          else if (v.startsWith('-') && v !== '-') d.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text('e1RM = estimated one-rep max (Epley: weight x (1 + reps/30)). Bodyweight exercises show best-set reps.', M, y + 4);
    y += 14;
  }

  // Charts (most-trained exercises first)
  chartData.sort((a, b) => b.n - a.n);
  const charts = chartData.slice(0, 8);
  if (charts.length) {
    h2('Trends');
    const cw = (PW - 2 * M - 16) / 2, ch = 130;
    charts.forEach((c, i) => {
      if (i % 2 === 0) ensure(ch + 12);
      const x = M + (i % 2) * (cw + 16);
      drawChart(doc, x, y, cw, ch, c.points, c.name, c.isBw ? 'reps' : `e1RM ${unit}`);
      if (i % 2 === 1 || i === charts.length - 1) y += ch + 12;
    });
  }

  // Bodyweight
  if (bws.length) {
    h2('Bodyweight');
    ensure(150);
    drawChart(doc, M, y, PW - 2 * M, 140, bws.map(b => ({ x: b.date, y: toDisplay(b.weightKg, unit) })), 'Bodyweight', unit);
    y += 152;
  }

  // Workout log
  if (sessions.length) {
    h2('Workout log');
    for (const s of sessions) {
      const sum = summarizeSession(s);
      const rows = s.entries.filter(e => e.sets.some(isCountedSet)).map(e => {
        const ex = get('exercises', e.exerciseId);
        return [clean(ex?.name || 'Deleted exercise'), clean(e.sets.filter(isCountedSet).map(x => setText(x, ex?.type === 'bodyweight', unit)).join(',  '))];
      });
      ensure(60);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
      doc.text(clean(s.name), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text(clean(`${fmtDate(s.date)}  |  ${fmtDuration(sum.duration)}  |  ${sum.sets} sets  |  ${Math.round(toDisplay(sum.volume, unit)).toLocaleString()} ${unit}`), PW - M, y, { align: 'right' });
      y += 6;
      autoTable(doc, {
        startY: y, margin: { left: M, right: M },
        body: rows.length ? rows : [['No completed sets', '']],
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, textColor: INK },
        columnStyles: { 0: { cellWidth: 150, fontStyle: 'bold' } },
        didDrawCell: d => { if (d.row.index > 0 && d.column.index === 0) { doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, d.cell.y, PW - M, d.cell.y); } },
      });
      y = doc.lastAutoTable.finalY + 4;
      if (s.notes) {
        doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'italic');
        const lines = doc.splitTextToSize(clean('Notes: ' + s.notes), PW - 2 * M);
        ensure(lines.length * 11 + 4);
        doc.text(lines, M + 4, y + 8); y += lines.length * 11 + 4;
        doc.setFont('helvetica', 'normal');
      }
      y += 14;
    }
  }

  if (!sessions.length && !bws.length) {
    doc.setFontSize(11); doc.setTextColor(...MUTED);
    doc.text('No workouts or bodyweight entries in this period.', M, y + 10);
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`LiftLog  |  Page ${i} of ${pages}`, PW / 2, PH - 20, { align: 'center' });
  }

  const blob = doc.output('blob');
  downloadBlob(blob, `liftlog-report-${dateStamp()}.pdf`);
}

function drawChart(doc, x, y, w, h, points, title, suffix) {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.roundedRect(x, y, w, h, 5, 5, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(clean(title), x + 10, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text(clean(suffix), x + w - 10, y + 16, { align: 'right' });
  const pts = points.filter(p => p.y != null).sort((a, b) => a.x - b.x);
  if (!pts.length) return;
  const px = x + 34, py = y + 26, pw = w - 46, ph = h - 46;
  let minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const pad = (maxY - minY) * 0.1; minY -= pad; maxY += pad;
  let minX = pts[0].x, maxX = pts.at(-1).x;
  if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
  const sx = v => px + ((v - minX) / (maxX - minX)) * pw;
  const sy = v => py + (1 - (v - minY) / (maxY - minY)) * ph;
  // grid + labels
  for (let i = 0; i <= 3; i++) {
    const v = minY + ((maxY - minY) * i) / 3, yy = sy(v);
    doc.setDrawColor(240, 240, 242); doc.setLineWidth(0.5); doc.line(px, yy, px + pw, yy);
    doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(round1(v), px - 4, yy + 2, { align: 'right' });
  }
  doc.text(clean(fmtDate(pts[0].x, true)), px, y + h - 8);
  doc.text(clean(fmtDate(pts.at(-1).x, true)), px + pw, y + h - 8, { align: 'right' });
  // line
  doc.setDrawColor(...ACCENT); doc.setLineWidth(1.6);
  for (let i = 1; i < pts.length; i++) doc.line(sx(pts[i - 1].x), sy(pts[i - 1].y), sx(pts[i].x), sy(pts[i].y));
  doc.setFillColor(...ACCENT);
  if (pts.length <= 40) pts.forEach(p => doc.circle(sx(p.x), sy(p.y), 1.8, 'F'));
  const last = pts.at(-1);
  doc.circle(sx(last.x), sy(last.y), 3, 'F');
}

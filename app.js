let state = {
  openEntry: null,
  view: 'main',
  reportYear: new Date().getFullYear(),
  reportMonth: new Date().getMonth() + 1,
  timer: null
};

// ── Formatting ────────────────────────────────────────────────────────────────

function formatTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatMonthHebrew(year, month) {
  const names = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                 'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${names[month - 1]} ${year}`;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getLiveOpenMinutes() {
  return state.openEntry
    ? Math.round((Date.now() - new Date(state.openEntry.checkIn)) / 60000)
    : 0;
}

// ── Main view ─────────────────────────────────────────────────────────────────

async function renderMain() {
  const closed = await dbGetTodayClosedMinutes();
  const total  = closed + getLiveOpenMinutes();

  const totalEl = document.getElementById('today-total');
  const labelEl = document.getElementById('today-label');
  if (total > 0) {
    totalEl.textContent = formatDuration(total);
    labelEl.classList.remove('hidden');
  } else {
    totalEl.textContent = '';
    labelEl.classList.add('hidden');
  }

  if (state.openEntry) {
    document.getElementById('status-card').classList.remove('hidden');
    document.getElementById('btn-checkout').classList.remove('hidden');
    document.getElementById('checkin-area').classList.add('hidden');
    document.getElementById('status-location').textContent = state.openEntry.location;
    document.getElementById('status-since').textContent    = formatTime(state.openEntry.checkIn);
  } else {
    document.getElementById('status-card').classList.add('hidden');
    document.getElementById('btn-checkout').classList.add('hidden');
    document.getElementById('checkin-area').classList.remove('hidden');
    await renderChips();
  }
}

async function renderChips() {
  const recent = await dbGetRecentLocations();
  const chipsEl = document.getElementById('location-chips');
  const labelEl = document.getElementById('checkin-label');

  if (recent.length === 0) {
    chipsEl.innerHTML = '';
    labelEl.textContent = 'איפה אני?';
    showNewLocInput();
    return;
  }

  labelEl.textContent = 'בחר מיקום לכניסה';
  chipsEl.innerHTML = recent
    .map(loc => `<button class="chip" data-loc="${escapeHtml(loc)}">${escapeHtml(loc)}</button>`)
    .join('');

  chipsEl.querySelectorAll('.chip').forEach(btn =>
    btn.addEventListener('click', () => doCheckIn(btn.dataset.loc))
  );
}

// ── Check-in / Check-out ──────────────────────────────────────────────────────

async function doCheckIn(location) {
  const id = await dbAddCheckIn(location);
  state.openEntry = await dbGetEntry(id);
  resetNewLocInput();
  await renderMain();
  startTimer();
}

async function doCheckOut() {
  if (!state.openEntry) return;
  await dbCheckOut(state.openEntry.id);
  state.openEntry = null;
  stopTimer();
  await renderMain();
}

// ── New location input ────────────────────────────────────────────────────────

function showNewLocInput() {
  document.getElementById('btn-new-loc').classList.add('hidden');
  document.getElementById('new-loc-row').classList.remove('hidden');
  setTimeout(() => document.getElementById('input-new-loc').focus(), 120);
}

function resetNewLocInput() {
  document.getElementById('input-new-loc').value = '';
  document.getElementById('new-loc-row').classList.add('hidden');
  document.getElementById('btn-new-loc').classList.remove('hidden');
}

async function confirmNewLocation() {
  const val = document.getElementById('input-new-loc').value.trim();
  if (!val) { document.getElementById('input-new-loc').focus(); return; }
  await doCheckIn(val);
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  stopTimer();
  state.timer = setInterval(() => { if (state.view === 'main') renderMain(); }, 30000);
}

function stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

// ── Report view ───────────────────────────────────────────────────────────────

async function showMainView() {
  state.view = 'main';
  document.getElementById('view-main').classList.remove('hidden');
  document.getElementById('view-report').classList.add('hidden');
  await renderMain();
  if (state.openEntry) startTimer();
}

async function showReportView() {
  state.view = 'report';
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-report').classList.remove('hidden');
  stopTimer();
  await renderReport();
}

async function renderReport() {
  document.getElementById('month-title').textContent =
    formatMonthHebrew(state.reportYear, state.reportMonth);

  const entries = await dbGetEntriesForMonth(state.reportYear, state.reportMonth);
  const tbody   = document.getElementById('entries-tbody');
  const noEl    = document.getElementById('no-entries');

  if (!entries.length) {
    tbody.innerHTML = '';
    noEl.classList.remove('hidden');
    document.getElementById('month-total').textContent = '';
    return;
  }

  noEl.classList.add('hidden');
  const totalMin = entries.reduce((s, e) => s + (e.durationMinutes || 0), 0);
  document.getElementById('month-total').textContent = `סה"כ: ${formatDuration(totalMin)} שעות`;

  tbody.innerHTML = entries.map(e => `
    <tr>
      <td>${formatDateShort(e.date)}</td>
      <td class="td-location" title="${escapeHtml(e.location)}">${escapeHtml(e.location)}</td>
      <td>${formatTime(e.checkIn)}</td>
      <td>${formatTime(e.checkOut)}</td>
      <td class="td-hours">${formatDuration(e.durationMinutes)}</td>
    </tr>`).join('');
}

// ── CSV export ────────────────────────────────────────────────────────────────

async function exportCSV() {
  const entries = await dbGetEntriesForMonth(state.reportYear, state.reportMonth);
  if (!entries.length) return;
  const header = 'תאריך,מיקום,כניסה,יציאה,שעות\n';
  const rows   = entries.map(e =>
    `${e.date},"${e.location}",${formatTime(e.checkIn)},${formatTime(e.checkOut)},${formatDuration(e.durationMinutes)}`
  ).join('\n');
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `שעות-${state.reportYear}-${String(state.reportMonth).padStart(2,'0')}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Event wiring ──────────────────────────────────────────────────────────────

document.getElementById('btn-checkout').addEventListener('click', doCheckOut);

document.getElementById('btn-new-loc').addEventListener('click', showNewLocInput);

document.getElementById('btn-new-confirm').addEventListener('click', confirmNewLocation);

document.getElementById('input-new-loc').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmNewLocation();
});

document.getElementById('btn-report').addEventListener('click', showReportView);
document.getElementById('btn-back').addEventListener('click', showMainView);
document.getElementById('btn-export').addEventListener('click', exportCSV);

document.getElementById('btn-prev-month').addEventListener('click', async () => {
  if (--state.reportMonth < 1)  { state.reportMonth = 12; state.reportYear--; }
  await renderReport();
});

document.getElementById('btn-next-month').addEventListener('click', async () => {
  if (++state.reportMonth > 12) { state.reportMonth = 1;  state.reportYear++; }
  await renderReport();
});

// ── Service Worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  state.openEntry = await dbGetOpenEntry();
  await showMainView();
})();

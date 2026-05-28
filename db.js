const db = new Dexie('TimeTracker');

db.version(1).stores({
  entries: '++id, date, checkIn, checkOut, location, durationMinutes'
});

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function dbAddCheckIn(location) {
  const now = new Date();
  return await db.entries.add({
    date: formatDate(now),
    checkIn: now,
    checkOut: null,
    location: location.trim(),
    durationMinutes: null
  });
}

async function dbGetEntry(id) {
  return await db.entries.get(id);
}

async function dbCheckOut(id) {
  const now = new Date();
  const entry = await db.entries.get(id);
  const durationMinutes = Math.round((now - new Date(entry.checkIn)) / 60000);
  await db.entries.update(id, { checkOut: now, durationMinutes });
  return durationMinutes;
}

async function dbGetOpenEntry() {
  const all = await db.entries.toArray();
  return all.find(e => !e.checkOut) || null;
}

async function dbGetEntriesForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const all = await db.entries.toArray();
  return all
    .filter(e => e.date.startsWith(prefix))
    .sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
}

async function dbGetRecentLocations() {
  const all = await db.entries.orderBy('checkIn').reverse().limit(100).toArray();
  const seen = new Set();
  const result = [];
  for (const e of all) {
    if (e.location && !seen.has(e.location)) {
      seen.add(e.location);
      result.push(e.location);
      if (result.length >= 10) break;
    }
  }
  return result;
}

async function dbGetTodayClosedMinutes() {
  const today = formatDate(new Date());
  const all = await db.entries.toArray();
  return all
    .filter(e => e.date === today && e.checkOut !== null)
    .reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
}

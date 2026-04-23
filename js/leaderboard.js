// Leaderboard storage using localStorage. Entries are sorted by total race
// time (ascending). A small guard keeps the file useful even in environments
// where localStorage throws.

const Leaderboard = (() => {
  const KEY = "turbokarts.leaderboard.v1";
  const MAX = 10;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(entries) {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      // noop — storage unavailable (private browsing, etc.)
    }
  }

  function all() {
    return load().sort(sortByTime);
  }

  function sortByTime(a, b) {
    return a.time - b.time;
  }

  function qualifies(time) {
    const list = load();
    if (list.length < MAX) return true;
    return time < list.sort(sortByTime)[MAX - 1].time;
  }

  function add(entry) {
    const list = load();
    list.push({ ...entry, createdAt: Date.now() });
    list.sort(sortByTime);
    while (list.length > MAX) list.pop();
    save(list);
    return list;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  return { all, add, qualifies, clear };
})();

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

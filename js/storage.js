/* =========================================================
   storage.js — all localStorage reads/writes live here.
   Keeps the rest of the app free of raw localStorage calls.
   ========================================================= */

const STORAGE_KEYS = {
  settings: "readingapp_settings",
  session: "readingapp_session",
  history: "readingapp_wordHistory",
  cache: "readingapp_dictionaryCache",
};

const DEFAULT_SETTINGS = {
  translationEnabled: false,
  targetLang: "es",
};

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

const Storage = {
  // ---- settings ----
  getSettings() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.settings), { ...DEFAULT_SETTINGS });
  },
  saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  },

  // ---- session (current article + scroll position, for refresh protection) ----
  getSession() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.session), null);
  },
  saveSession(session) {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  },
  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  },

  // ---- word history ("specimens") ----
  getHistory() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.history), []);
  },
  saveHistory(list) {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(list));
  },
  isCrossed(key) {
    return this.getHistory().some((w) => w.key === key);
  },
  addWord(entry) {
    const list = this.getHistory();
    if (list.some((w) => w.key === entry.key)) return list;
    list.unshift(entry);
    this.saveHistory(list);
    return list;
  },
  removeWord(key) {
    const list = this.getHistory().filter((w) => w.key !== key);
    this.saveHistory(list);
    return list;
  },

  // ---- fallback dictionary cache (words looked up live, not in the curated set) ----
  getCache() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.cache), {});
  },
  cacheWord(key, entry) {
    const cache = this.getCache();
    cache[key] = entry;
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(cache));
  },
};

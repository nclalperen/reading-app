/* =========================================================
   dictionary.js — word lookups.
   1. Check the curated data/dictionary.json (best quality, has translations).
   2. Fall back to the free dictionaryapi.dev (no key required) for any
      word not yet curated, so every word in an article is clickable.
   3. Cache fallback results in localStorage so we don't re-fetch.
   ========================================================= */

const Dictionary = {
  _curated: null,

  async load() {
    if (this._curated) return this._curated;
    const res = await fetch("data/dictionary.json");
    this._curated = await res.json();
    return this._curated;
  },

  normalize(rawWord) {
    return rawWord.toLowerCase().replace(/[^a-zà-ÿ']/g, "");
  },

  /**
   * Returns { definition, examples: [..], translations: {lang: word}, source }
   * or null if nothing could be found anywhere.
   */
  async lookup(rawWord) {
    const key = this.normalize(rawWord);
    if (!key) return null;

    const curated = await this.load();
    if (curated[key]) {
      return { key, ...curated[key], source: "curated" };
    }

    const cache = Storage.getCache();
    if (cache[key]) {
      return { key, ...cache[key], source: "cached" };
    }

    // Fallback: free public dictionary API, no key needed.
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`
      );
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      const meaning = data?.[0]?.meanings?.[0];
      const definition = meaning?.definitions?.[0]?.definition || "No definition available.";
      const examples = meaning?.definitions
        ?.map((d) => d.example)
        .filter(Boolean)
        .slice(0, 2) || [];

      const entry = {
        definition,
        examples,
        translations: {}, // fallback source has no translations
      };
      Storage.cacheWord(key, entry);
      return { key, ...entry, source: "live" };
    } catch (e) {
      return {
        key,
        definition: "No definition available for this word yet.",
        examples: [],
        translations: {},
        source: "none",
      };
    }
  },
};

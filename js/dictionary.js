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
   * Generates likely base-word candidates for a curated-dictionary retry
   * (e.g. "colonizing" / "colonized" -> "colonize", "crevices" -> "crevice").
   * Order doesn't matter to the caller: every candidate is tried against
   * the curated dictionary before giving up on it.
   */
  stemCandidates(word) {
    const candidates = new Set();

    if (word.endsWith("ies") && word.length > 4) {
      candidates.add(word.slice(0, -3) + "y");
    }
    if (word.endsWith("es") && word.length > 3) {
      candidates.add(word.slice(0, -2));
      candidates.add(word.slice(0, -1));
    }
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
      candidates.add(word.slice(0, -1));
    }
    if (word.endsWith("ing") && word.length > 5) {
      const stripped = word.slice(0, -3);
      candidates.add(stripped);
      candidates.add(stripped + "e");
      if (stripped.length > 2 && stripped[stripped.length - 1] === stripped[stripped.length - 2]) {
        candidates.add(stripped.slice(0, -1));
      }
    }
    if (word.endsWith("ed") && word.length > 4) {
      const stripped = word.slice(0, -2);
      candidates.add(stripped);
      candidates.add(stripped + "e");
      if (stripped.length > 2 && stripped[stripped.length - 1] === stripped[stripped.length - 2]) {
        candidates.add(stripped.slice(0, -1));
      }
    }

    candidates.delete(word);
    return [...candidates];
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

    for (const candidate of this.stemCandidates(key)) {
      if (curated[candidate]) {
        return { key, ...curated[candidate], source: "curated" };
      }
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

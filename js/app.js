/* =========================================================
   app.js — wires together storage.js and dictionary.js to
   drive the whole UI. No build step, no framework: plain DOM.
   ========================================================= */

(function () {
  "use strict";

  let ARTICLES = [];
  let currentArticle = null;
  let currentWordKey = null;
  let popupTriggerEl = null;
  const practiceState = { pool: [], lastKey: null, sessionScore: 0, sessionRounds: 0, currentStreak: 0 };

  const el = (id) => document.getElementById(id);
  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  function cssEscape(str) {
    return window.CSS && CSS.escape ? CSS.escape(str) : str.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- Init ----------

  async function init() {
    wireNav();
    wirePopup();
    wireSettings();
    wireArticleActions();

    const res = await fetch("data/articles.json");
    ARTICLES = await res.json();

    updateWordsCount();

    const session = Storage.getSession();
    let article = session && session.articleId ? ARTICLES.find((a) => a.id === session.articleId) : null;
    if (!article) article = pickRandomArticle();

    loadArticle(article, session);

    window.addEventListener("scroll", debounce(saveScrollPosition, 400));
  }

  function pickRandomArticle(excludeId) {
    const pool = excludeId ? ARTICLES.filter((a) => a.id !== excludeId) : ARTICLES;
    const source = pool.length ? pool : ARTICLES;
    return source[Math.floor(Math.random() * source.length)];
  }

  // ---------- Navigation ----------

  function wireNav() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${name}`));
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));

    if (name !== "read") closeArticlePicker();
    if (name === "history") renderHistory();
    if (name === "practice") renderPractice();
    if (name === "settings") renderSettingsView();
  }

  // ---------- Article rendering ----------

  function loadArticle(article, session) {
    currentArticle = article;
    el("article-kicker").textContent = "Random article";
    el("article-title").textContent = article.title;

    const body = el("article-body");
    body.innerHTML = "";
    const crossed = new Set(Storage.getHistory().map((w) => w.key));

    article.paragraphs.forEach((paragraph) => {
      const p = document.createElement("p");
      paragraph.split(/(\s+)/).forEach((token) => {
        if (token === "" || /^\s+$/.test(token)) {
          p.appendChild(document.createTextNode(token));
          return;
        }
        const key = Dictionary.normalize(token);
        if (!key) {
          p.appendChild(document.createTextNode(token));
          return;
        }
        const span = document.createElement("span");
        span.className = "word" + (crossed.has(key) ? " crossed" : "");
        span.textContent = token;
        span.dataset.key = key;
        span.tabIndex = 0;
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", token);
        span.addEventListener("click", () => handleWordClick(token, span));
        span.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            handleWordClick(token, span);
          }
        });
        p.appendChild(span);
      });
      body.appendChild(p);
    });

    const quizBlock = el("quiz-block");
    quizBlock.hidden = true;
    quizBlock.innerHTML = "";
    el("btn-take-quiz").hidden = false;

    const restoring = session && session.articleId === article.id;
    Storage.saveSession({
      articleId: article.id,
      scrollY: restoring ? session.scrollY : 0,
      quizShown: restoring ? session.quizShown : false,
    });

    if (restoring && session.scrollY) {
      setTimeout(() => window.scrollTo(0, session.scrollY), 50);
    } else {
      window.scrollTo(0, 0);
    }

    if (restoring && session.quizShown) {
      renderQuiz();
    }
  }

  function saveScrollPosition() {
    if (!currentArticle) return;
    const session = Storage.getSession() || { articleId: currentArticle.id, quizShown: false };
    session.articleId = currentArticle.id;
    session.scrollY = window.scrollY;
    Storage.saveSession(session);
  }

  function wireArticleActions() {
    el("btn-new-article").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleArticlePicker();
    });
    el("btn-take-quiz").addEventListener("click", () => {
      renderQuiz();
      const session = Storage.getSession() || {};
      session.quizShown = true;
      Storage.saveSession(session);
    });
    document.addEventListener("click", (e) => {
      const picker = el("article-picker");
      if (!picker.hidden && !picker.contains(e.target) && e.target !== el("btn-new-article")) {
        closeArticlePicker();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeArticlePicker();
    });
  }

  function toggleArticlePicker() {
    if (el("article-picker").hidden) openArticlePicker();
    else closeArticlePicker();
  }

  function openArticlePicker() {
    const picker = el("article-picker");
    const progress = Storage.getArticleProgress();

    picker.innerHTML = "";
    ARTICLES.forEach((a) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "article-picker-item" + (currentArticle && a.id === currentArticle.id ? " current" : "");
      item.setAttribute("role", "option");

      const title = document.createElement("span");
      title.className = "article-picker-title";
      title.textContent = a.title;
      item.appendChild(title);

      const status = document.createElement("span");
      const p = progress[a.id];
      status.className = "article-picker-status" + (p ? "" : " unread");
      status.textContent = p ? `${p.score}/${p.total}` : "Unread";
      item.appendChild(status);

      item.addEventListener("click", () => {
        closeArticlePicker();
        loadArticle(a, null);
      });
      picker.appendChild(item);
    });

    picker.hidden = false;
    el("btn-new-article").setAttribute("aria-expanded", "true");
  }

  function closeArticlePicker() {
    el("article-picker").hidden = true;
    el("btn-new-article").setAttribute("aria-expanded", "false");
  }

  // ---------- Word click / popup ----------

  async function handleWordClick(rawToken, triggerEl) {
    const key = Dictionary.normalize(rawToken);
    if (!key) return;

    document.querySelectorAll(`.word[data-key="${cssEscape(key)}"]`).forEach((s) => s.classList.add("crossed"));
    openPopup(key, triggerEl);

    const entry = await Dictionary.lookup(rawToken);

    if (!Storage.isCrossed(key)) {
      Storage.addWord({
        key,
        word: key,
        definition: entry.definition,
        examples: entry.examples,
        translations: entry.translations || {},
        dateAdded: new Date().toISOString(),
        articleId: currentArticle ? currentArticle.id : null,
        articleTitle: currentArticle ? currentArticle.title : null,
      });
      updateWordsCount();
    }

    if (currentWordKey === key) fillPopup(entry, key);
  }

  function openPopup(key, triggerEl) {
    currentWordKey = key;
    popupTriggerEl = triggerEl || null;
    el("word-popup-word").textContent = capitalize(key);
    el("word-popup-loading").hidden = false;
    el("word-popup-content").hidden = true;
    el("word-popup-backdrop").hidden = false;
    el("word-popup").focus();
  }

  function fillPopup(entry, key) {
    if (currentWordKey !== key) return;
    el("word-popup-loading").hidden = true;
    el("word-popup-content").hidden = false;
    el("word-popup-def").textContent = entry.definition;

    const list = el("word-popup-examples");
    list.innerHTML = "";
    (entry.examples || []).slice(0, 2).forEach((ex) => {
      const li = document.createElement("li");
      li.textContent = ex;
      list.appendChild(li);
    });
    el("word-popup-examples-wrap").hidden = (entry.examples || []).length === 0;

    const settings = Storage.getSettings();
    const translation = entry.translations && entry.translations[settings.targetLang];
    const wrap = el("word-popup-translation-wrap");
    if (settings.translationEnabled && translation) {
      wrap.hidden = false;
      el("word-popup-translation").textContent = translation;
    } else {
      wrap.hidden = true;
    }
  }

  function wirePopup() {
    el("word-popup-close").addEventListener("click", closePopup);
    el("word-popup-backdrop").addEventListener("click", (e) => {
      if (e.target === el("word-popup-backdrop")) closePopup();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePopup();
    });
    el("word-popup-remove").addEventListener("click", () => {
      if (!currentWordKey) return;
      Storage.removeWord(currentWordKey);
      document.querySelectorAll(`.word[data-key="${cssEscape(currentWordKey)}"]`).forEach((s) => s.classList.remove("crossed"));
      updateWordsCount();
      closePopup();
    });
  }

  function closePopup() {
    el("word-popup-backdrop").hidden = true;
    currentWordKey = null;
    if (popupTriggerEl && document.contains(popupTriggerEl)) {
      popupTriggerEl.focus();
    }
    popupTriggerEl = null;
  }

  // ---------- Quiz ----------

  function renderQuiz() {
    const block = el("quiz-block");
    block.hidden = false;
    block.innerHTML = "";
    el("btn-take-quiz").hidden = true;

    const form = document.createElement("form");

    currentArticle.quiz.forEach((q, qi) => {
      const wrap = document.createElement("div");
      wrap.className = "quiz-question";

      const p = document.createElement("p");
      p.textContent = `${qi + 1}. ${q.question}`;
      wrap.appendChild(p);

      const optWrap = document.createElement("div");
      optWrap.className = "quiz-options";
      q.options.forEach((opt, oi) => {
        const label = document.createElement("label");
        label.className = "quiz-option";
        label.dataset.qi = qi;
        label.dataset.oi = oi;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `q${qi}`;
        input.value = oi;
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt));
        optWrap.appendChild(label);
      });
      wrap.appendChild(optWrap);
      form.appendChild(wrap);
    });

    const actions = document.createElement("div");
    actions.className = "quiz-actions";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn btn-primary";
    submitBtn.textContent = "Check my answers";
    actions.appendChild(submitBtn);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost";
    nextBtn.textContent = "Read another article";
    nextBtn.hidden = true;
    nextBtn.addEventListener("click", () => loadArticle(pickRandomArticle(currentArticle.id), null));
    actions.appendChild(nextBtn);

    form.appendChild(actions);

    const result = document.createElement("p");
    result.className = "quiz-result";
    result.hidden = true;
    form.appendChild(result);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let score = 0;
      currentArticle.quiz.forEach((q, qi) => {
        const selected = form.querySelector(`input[name="q${qi}"]:checked`);
        form.querySelectorAll(`.quiz-option[data-qi="${qi}"]`).forEach((o) => o.classList.remove("correct", "incorrect"));

        const correctLabel = form.querySelector(`.quiz-option[data-qi="${qi}"][data-oi="${q.correct}"]`);
        if (correctLabel) correctLabel.classList.add("correct");

        if (selected) {
          const chosenOi = Number(selected.value);
          if (chosenOi === q.correct) {
            score++;
          } else {
            const chosenLabel = form.querySelector(`.quiz-option[data-qi="${qi}"][data-oi="${chosenOi}"]`);
            if (chosenLabel) chosenLabel.classList.add("incorrect");
          }
        }
      });

      result.hidden = false;
      result.textContent = `You scored ${score} out of ${currentArticle.quiz.length}.`;
      submitBtn.hidden = true;
      nextBtn.hidden = false;
      form.querySelectorAll("input[type=radio]").forEach((i) => (i.disabled = true));

      Storage.saveArticleProgress(currentArticle.id, {
        score,
        total: currentArticle.quiz.length,
        completedAt: new Date().toISOString(),
      });
    });

    block.appendChild(form);
  }

  // ---------- History / specimen grid ----------

  function updateWordsCount() {
    el("words-count").textContent = String(Storage.getHistory().length);
  }

  function renderHistory() {
    const list = Storage.getHistory();
    updateWordsCount();
    el("history-count").textContent = `${list.length} word${list.length === 1 ? "" : "s"} collected`;

    const grid = el("history-grid");
    grid.innerHTML = "";
    el("history-empty").hidden = list.length > 0;

    list.forEach((w) => {
      const card = document.createElement("div");
      card.className = "specimen-card";

      const pin = document.createElement("div");
      pin.className = "specimen-pin";
      card.appendChild(pin);

      const word = document.createElement("div");
      word.className = "specimen-word";
      word.textContent = capitalize(w.word);
      card.appendChild(word);

      const def = document.createElement("p");
      def.className = "specimen-def";
      def.textContent = w.definition;
      card.appendChild(def);

      const meta = document.createElement("p");
      meta.className = "specimen-meta";
      const date = w.dateAdded ? new Date(w.dateAdded).toLocaleDateString() : "";
      meta.textContent = [date, w.articleTitle].filter(Boolean).join(" · ");
      card.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "specimen-actions";
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-small";
      delBtn.textContent = "Release";
      delBtn.addEventListener("click", () => {
        Storage.removeWord(w.key);
        document.querySelectorAll(`.word[data-key="${cssEscape(w.key)}"]`).forEach((s) => s.classList.remove("crossed"));
        renderHistory();
      });
      actions.appendChild(delBtn);
      card.appendChild(actions);

      grid.appendChild(card);
    });
  }

  // ---------- Practice / memory game ----------

  function renderPractice() {
    const area = el("practice-area");
    const history = Storage.getHistory();

    if (history.length < 4) {
      area.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = `Collect at least 4 words first — you have ${history.length}. Tap words while reading to add them.`;
      area.appendChild(empty);
      return;
    }

    practiceState.pool = history;
    area.innerHTML = "";
    area.appendChild(buildPracticeStatsBar());
    const slot = document.createElement("div");
    slot.id = "practice-card-slot";
    area.appendChild(slot);
    startPracticeRound();
  }

  function buildPracticeStatsBar() {
    const stats = Storage.getPracticeStats();
    const bar = document.createElement("p");
    bar.className = "practice-stats-bar";
    bar.id = "practice-stats-bar";
    bar.textContent = practiceStatsBarText(stats);
    return bar;
  }

  function practiceStatsBarText(stats) {
    const accuracy = stats.allTimeRounds > 0 ? Math.round((stats.allTimeScore / stats.allTimeRounds) * 100) : 0;
    return `All-time accuracy: ${accuracy}% (${stats.allTimeScore}/${stats.allTimeRounds}) · Best streak: ${stats.bestStreak} · Best session score: ${stats.bestSessionScore}`;
  }

  function startPracticeRound() {
    const slot = el("practice-card-slot");
    const pool = practiceState.pool;

    let candidates = pool.filter((w) => w.key !== practiceState.lastKey);
    if (candidates.length === 0) candidates = pool;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    practiceState.lastKey = target.key;

    const distractorPool = shuffle(pool.filter((w) => w.key !== target.key));
    const options = shuffle([target.definition, ...distractorPool.slice(0, 3).map((w) => w.definition)]);

    slot.innerHTML = "";

    const card = document.createElement("div");
    card.className = "practice-card";

    const score = document.createElement("p");
    score.className = "practice-score";
    score.id = "practice-score";
    score.textContent = `Score: ${practiceState.sessionScore} / ${practiceState.sessionRounds} this session · Streak: ${practiceState.currentStreak} · ${pool.length} words in rotation`;
    card.appendChild(score);

    const label = document.createElement("p");
    label.className = "practice-prompt-label";
    label.textContent = "What does this word mean?";
    card.appendChild(label);

    const word = document.createElement("p");
    word.className = "practice-word";
    word.textContent = capitalize(target.word);
    card.appendChild(word);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "practice-options";
    const feedback = document.createElement("p");
    feedback.className = "practice-feedback";

    options.forEach((optText) => {
      const btn = document.createElement("button");
      btn.className = "practice-option";
      btn.textContent = optText;
      btn.addEventListener("click", () => {
        const isCorrect = optText === target.definition;
        optionsWrap.querySelectorAll(".practice-option").forEach((b) => {
          b.disabled = true;
          if (b.textContent === target.definition) b.classList.add("correct");
        });
        if (!isCorrect) btn.classList.add("incorrect");

        practiceState.sessionRounds++;
        if (isCorrect) {
          practiceState.sessionScore++;
          practiceState.currentStreak++;
        } else {
          practiceState.currentStreak = 0;
        }

        const stats = Storage.getPracticeStats();
        stats.allTimeRounds++;
        if (isCorrect) stats.allTimeScore++;
        if (practiceState.sessionScore > stats.bestSessionScore) stats.bestSessionScore = practiceState.sessionScore;
        if (practiceState.currentStreak > stats.bestStreak) stats.bestStreak = practiceState.currentStreak;
        Storage.savePracticeStats(stats);

        const statsBar = el("practice-stats-bar");
        if (statsBar) statsBar.textContent = practiceStatsBarText(stats);
        score.textContent = `Score: ${practiceState.sessionScore} / ${practiceState.sessionRounds} this session · Streak: ${practiceState.currentStreak} · ${pool.length} words in rotation`;

        feedback.textContent = isCorrect ? "Correct." : "Not quite — the highlighted option was correct.";

        const nextBtn = document.createElement("button");
        nextBtn.className = "btn btn-primary practice-next-btn";
        nextBtn.textContent = "Next word";
        nextBtn.addEventListener("click", startPracticeRound);
        card.appendChild(nextBtn);
      });
      optionsWrap.appendChild(btn);
    });

    card.appendChild(optionsWrap);
    card.appendChild(feedback);
    slot.appendChild(card);
  }

  // ---------- Settings ----------

  function wireSettings() {
    el("settings-translation-toggle").addEventListener("change", (e) => {
      const settings = Storage.getSettings();
      settings.translationEnabled = e.target.checked;
      Storage.saveSettings(settings);
    });
    el("settings-lang-select").addEventListener("change", (e) => {
      const settings = Storage.getSettings();
      settings.targetLang = e.target.value;
      Storage.saveSettings(settings);
    });

    el("settings-export-btn").addEventListener("click", exportWordHistory);
    el("settings-import-btn").addEventListener("click", () => el("settings-import-input").click());
    el("settings-import-input").addEventListener("change", handleImportFile);
  }

  function showBackupStatus(message) {
    const status = el("settings-backup-status");
    status.textContent = message;
    status.hidden = false;
  }

  function exportWordHistory() {
    const history = Storage.getHistory();
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reading-app-word-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showBackupStatus(`Exported ${history.length} word${history.length === 1 ? "" : "s"}.`);
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        incoming = JSON.parse(reader.result);
      } catch (err) {
        showBackupStatus("Import failed: the file isn't valid JSON.");
        return;
      }
      if (!Array.isArray(incoming)) {
        showBackupStatus("Import failed: expected a list of words.");
        return;
      }

      const existing = Storage.getHistory();
      const existingKeys = new Set(existing.map((w) => w.key));
      let added = 0;
      let skipped = 0;
      incoming.forEach((w) => {
        if (w && typeof w.key === "string" && !existingKeys.has(w.key)) {
          existing.push(w);
          existingKeys.add(w.key);
          added++;
        } else {
          skipped++;
        }
      });
      Storage.saveHistory(existing);
      updateWordsCount();
      renderHistory();
      showBackupStatus(`Imported ${added} new word${added === 1 ? "" : "s"}, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.`);
    };
    reader.readAsText(file);
  }

  function renderSettingsView() {
    const settings = Storage.getSettings();
    el("settings-translation-toggle").checked = !!settings.translationEnabled;
    el("settings-lang-select").value = settings.targetLang || "es";
  }

  document.addEventListener("DOMContentLoaded", init);
})();

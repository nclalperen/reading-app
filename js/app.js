/* =========================================================
   app.js — wires together storage.js and dictionary.js to
   drive the whole UI. No build step, no framework: plain DOM.
   ========================================================= */

(function () {
  "use strict";

  let ARTICLES = [];
  let currentArticle = null;
  let currentWordKey = null;
  const practiceState = { pool: [], lastKey: null, score: 0, rounds: 0 };

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
        span.addEventListener("click", () => handleWordClick(token));
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
    el("btn-new-article").addEventListener("click", () => {
      loadArticle(pickRandomArticle(currentArticle ? currentArticle.id : null), null);
    });
    el("btn-take-quiz").addEventListener("click", () => {
      renderQuiz();
      const session = Storage.getSession() || {};
      session.quizShown = true;
      Storage.saveSession(session);
    });
  }

  // ---------- Word click / popup ----------

  async function handleWordClick(rawToken) {
    const key = Dictionary.normalize(rawToken);
    if (!key) return;

    document.querySelectorAll(`.word[data-key="${cssEscape(key)}"]`).forEach((s) => s.classList.add("crossed"));
    openPopup(key);

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

  function openPopup(key) {
    currentWordKey = key;
    el("word-popup-word").textContent = capitalize(key);
    el("word-popup-loading").hidden = false;
    el("word-popup-content").hidden = true;
    el("word-popup-backdrop").hidden = false;
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
    startPracticeRound();
  }

  function startPracticeRound() {
    const area = el("practice-area");
    const pool = practiceState.pool;

    let candidates = pool.filter((w) => w.key !== practiceState.lastKey);
    if (candidates.length === 0) candidates = pool;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    practiceState.lastKey = target.key;

    const distractorPool = shuffle(pool.filter((w) => w.key !== target.key));
    const options = shuffle([target.definition, ...distractorPool.slice(0, 3).map((w) => w.definition)]);

    area.innerHTML = "";

    const card = document.createElement("div");
    card.className = "practice-card";

    const score = document.createElement("p");
    score.className = "practice-score";
    score.textContent = `Score: ${practiceState.score} / ${practiceState.rounds} · ${pool.length} words in rotation`;
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

        practiceState.rounds++;
        if (isCorrect) practiceState.score++;
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
    area.appendChild(card);
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
  }

  function renderSettingsView() {
    const settings = Storage.getSettings();
    el("settings-translation-toggle").checked = !!settings.translationEnabled;
    el("settings-lang-select").value = settings.targetLang || "es";
  }

  document.addEventListener("DOMContentLoaded", init);
})();

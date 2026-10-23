/* =========================================================
   作品集 · 群友摄影
   无依赖，ES5 语法，兼容微信内置浏览器
   ========================================================= */
(function () {
  "use strict";

  var CFG = Object.assign(
    {
      passwordHint: "口令由群主在群里公布",
      storageKey: "gallery:pass",
      defaultTitle: "作品集",
      defaultSubtitle: "群友作品存档"
    },
    window.GALLERY_CONFIG || {}
  );

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var state = { q: "", authors: new Set(), tags: new Set(), sort: "date" };
  var data = null;
  var works = [];
  var view = [];
  var cards = {};
  var lbIndex = 0;
  var lastFocus = null;
  var searchTimer = 0;
  var swipe = { x: 0, y: 0, active: false };
  var gateComposing = false;
  var els = {};

  /* ---------- 工具 ---------- */
  function b64ToBytes(b64) {
    var bin = window.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function fmtDate(ym) {
    if (!ym) return "";
    var p = String(ym).split("-");
    return p[0] + "." + (p[1] || "") + (p[2] ? "." + p[2] : "");
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function lockScroll(on) {
    if (on) {
      var gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = gap > 0 ? gap + "px" : "";
      document.body.classList.add("is-locked");
    } else {
      document.body.style.paddingRight = "";
      document.body.classList.remove("is-locked");
    }
  }

  function trapFocus(e, root) {
    var f = $$(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      root
    ).filter(function (n) {
      return !n.disabled && n.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- 解密 ---------- */
  function decryptData(payload, password) {
    if (!payload || !payload.salt || !payload.iv || !payload.ciphertext) {
      return Promise.reject(new Error("bad-payload"));
    }
    var salt, iv, cipher;
    try {
      salt = b64ToBytes(payload.salt);
      iv = b64ToBytes(payload.iv);
      cipher = b64ToBytes(payload.ciphertext);
    } catch (e) {
      return Promise.reject(new Error("bad-payload"));
    }
    if (!salt.length || !iv.length || !cipher.length) {
      return Promise.reject(new Error("bad-payload"));
    }
    var enc = new TextEncoder();

    return window.crypto.subtle
      .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: salt,
            iterations: payload.iterations || 210000,
            hash: "SHA-256"
          },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
      })
      .then(function (key) {
        return window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipher);
      })
      .then(function (buf) {
        return JSON.parse(new TextDecoder().decode(buf));
      });
  }

  /* ---------- 口令面板 ---------- */
  function decryptErrorText(err) {
    if (err && err.message === "bad-payload") {
      return "数据文件不完整或版本不对，请重新上传 site/data/works.enc.js。";
    }
    if (err instanceof SyntaxError) {
      return "数据文件损坏，无法读取作品列表。";
    }
    if (err && err.name === "OperationError") {
      return "口令不对，或数据文件损坏/上传不完整。";
    }
    return "打开失败：" + (err && err.message ? err.message : "未知错误") + "。";
  }

  function showGateError(msg) {
    els.gateError.textContent = msg;
    els.gateError.hidden = false;
  }

  function resetGate() {
    els.gateBtn.disabled = false;
    els.gateBtn.textContent = "进入";
  }

  function shakeGate() {
    els.gatePanel.classList.remove("is-shake");
    void els.gatePanel.offsetWidth;
    els.gatePanel.classList.add("is-shake");
  }

  function fatal(msg) {
    els.gate.hidden = false;
    els.app.hidden = true;
    document.body.classList.add("is-gate");
    els.gateBtn.disabled = false;
    els.gateBtn.textContent = "进入";
    showGateError(msg);
  }

  function submitGate(e) {
    e.preventDefault();
    if (gateComposing) return;
    var payload = window.__GALLERY_DATA__;

    if (!payload) {
      showGateError("页面数据没有加载成功：请确认 index.html 和 data/works.enc.js 在同一个文件夹，并且是用浏览器直接打开。");
      shakeGate();
      return;
    }
    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
      showGateError("当前打开方式不支持解密：请用 Edge / Chrome 打开，或通过 https 网址访问。");
      shakeGate();
      return;
    }

    var pw = els.gateInput.value;
    if (!pw) {
      showGateError("请先输入口令。");
      shakeGate();
      els.gateInput.focus();
      return;
    }

    els.gateError.hidden = true;
    els.gateBtn.disabled = true;
    els.gateBtn.textContent = "正在打开…";
    els.gatePanel.classList.remove("is-shake");

    decryptData(payload, pw)
      .then(function (d) {
        if (els.gateRemember.checked) {
          try { window.sessionStorage.setItem(CFG.storageKey, pw); } catch (e) {}
        } else {
          try { window.sessionStorage.removeItem(CFG.storageKey); } catch (e) {}
        }
        enter(d);
      })
      .catch(function (err) {
        resetGate();
        showGateError(decryptErrorText(err));
        shakeGate();
        els.gateInput.select();
      });
  }

  function boot() {
    els = {
      gate: $("#gate"),
      gatePanel: $(".gate-panel"),
      gateForm: $("#gateForm"),
      gateInput: $("#gateInput"),
      gatePwToggle: $("#gatePwToggle"),
      gateError: $("#gateError"),
      gateBtn: $("#gateBtn"),
      gateRemember: $("#gateRemember"),
      gateHint: $("#gateHint"),
      gateDemoHint: $("#gateDemoHint"),
      gateTitle: $("#gateTitle"),
      gateSub: $("#gateSub"),
      app: $("#app"),
      masthead: $("#masthead"),
      siteTitle: $("#siteTitle"),
      siteSubtitle: $("#siteSubtitle"),
      siteIntro: $("#siteIntro"),
      brandCn: $("#brandCn"),
      updatedAt: $("#updatedAt"),
      topCount: $("#topCount"),
      aboutBtn: $("#aboutBtn"),
      searchInput: $("#searchInput"),
      sortSelect: $("#sortSelect"),
      resultCount: $("#resultCount"),
      clearBtn: $("#clearBtn"),
      authorChips: $("#authorChips"),
      tagChips: $("#tagChips"),
      authorRow: $("#authorRow"),
      tagRow: $("#tagRow"),
      grid: $("#grid"),
      empty: $("#empty"),
      emptyClear: $("#emptyClear"),
      notice: $("#notice"),
      contact: $("#contact"),
      year: $("#year"),
      lightbox: $("#lightbox"),
      lbClose: $("#lbClose"),
      lbPrev: $("#lbPrev"),
      lbNext: $("#lbNext"),
      lbImg: $("#lbImg"),
      lbTitle: $("#lbTitle"),
      lbAuthor: $("#lbAuthor"),
      lbDate: $("#lbDate"),
      lbDesc: $("#lbDesc"),
      lbTags: $("#lbTags"),
      lbCounter: $("#lbCounter"),
      lbStage: $(".lb-stage"),
      about: $("#about"),
      aboutClose: $("#aboutClose"),
      aboutNotice: $("#aboutNotice"),
      aboutContact: $("#aboutContact")
    };

    els.gateTitle.textContent = CFG.defaultTitle;
    els.gateSub.textContent = CFG.defaultSubtitle;
    els.gateHint.textContent = CFG.passwordHint;
    els.year.textContent = "© " + new Date().getFullYear();

    // 先绑定提交，保证无论数据是否加载，点「进入」都有反馈
    els.gateForm.addEventListener("submit", submitGate);
    els.gateInput.addEventListener("compositionstart", function () { gateComposing = true; });
    els.gateInput.addEventListener("compositionend", function () { gateComposing = false; });

    els.gatePwToggle.addEventListener("click", function () {
      var show = els.gateInput.type === "password";
      els.gateInput.type = show ? "text" : "password";
      els.gatePwToggle.textContent = show ? "隐藏" : "显示";
      els.gatePwToggle.setAttribute("aria-label", show ? "隐藏口令" : "显示口令");
      els.gateInput.focus();
    });

    if (window.__GALLERY_DATA__ && window.__GALLERY_DATA__.demo) {
      els.gateDemoHint.hidden = false;
    }

    if (!window.__GALLERY_DATA__) {
      fatal("页面数据没有加载成功：请确认 index.html 和 data/works.enc.js 在同一个文件夹，并且是用浏览器直接打开。");
      return;
    }

    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) {
      fatal("当前打开方式不支持解密：请用 Edge / Chrome 打开，或通过 https 网址访问。");
      return;
    }

    var saved = "";
    try { saved = window.sessionStorage.getItem(CFG.storageKey) || ""; } catch (e) { saved = ""; }

    if (saved) {
      els.gateBtn.disabled = true;
      els.gateBtn.textContent = "正在打开…";
      decryptData(window.__GALLERY_DATA__, saved)
        .then(function (d) { enter(d); })
        .catch(function (err) {
          try { window.sessionStorage.removeItem(CFG.storageKey); } catch (e) {}
          resetGate();
          showGateError(decryptErrorText(err));
          els.gateInput.focus();
        });
    } else {
      els.gateInput.focus();
    }
  }

  function enter(d) {
    if (!d || !Array.isArray(d.works)) {
      fatal("数据文件格式不对，请重新导出。");
      return;
    }

    data = d;
    applyMeta(d.meta || {});

    els.gate.hidden = true;
    els.app.hidden = false;
    document.body.classList.remove("is-gate");
    window.scrollTo(0, 0);

    initGallery();
    els.gateInput.value = "";
  }

  function applyMeta(meta) {
    var title = meta.title || CFG.defaultTitle;
    var sub = meta.subtitle || CFG.defaultSubtitle;
    document.title = title + " · " + sub;

    setText(els.siteTitle, title);
    setText(els.brandCn, title);
    setText(els.siteSubtitle, meta.subtitle || "");
    setText(els.siteIntro, meta.intro || "");
    setText(els.updatedAt, meta.updatedAt ? "更新于 " + meta.updatedAt : "");
    setText(els.notice, meta.notice || "");
    setText(els.contact, meta.contact || "");
    setText(els.aboutNotice, meta.notice || "");
    setText(els.aboutContact, meta.contact || "");
    if (!meta.updatedAt) els.updatedAt.hidden = true;
  }

  /* ---------- 画廊 ---------- */
  function initGallery() {
    works = (data.works || []).slice();
    if (works.some(function (w) { return !w.demo; })) {
      works = works.filter(function (w) { return !w.demo; });
    }

    var authors = countBy(works, "author");
    var tags = countBy(works, "tags");

    els.authorRow.hidden = authors.length <= 1;
    els.tagRow.hidden = tags.length === 0;

    setGridDensity();

    buildChips(els.authorChips, authors, state.authors);
    buildChips(els.tagChips, tags, state.tags);

    els.topCount.textContent =
      works.length + " 件作品 · " + authors.length + " 位作者";

    cards = {};
    works.forEach(function (w) {
      if (!w.id) w.id = "w" + Math.random().toString(36).slice(2, 9);
      cards[w.id] = buildCard(w);
    });

    bindGalleryEvents();
    render();
  }

  function setGridDensity() {
    var n = works.length;
    els.grid.classList.remove("cols-1", "cols-2", "cols-3");
    if (n <= 1) els.grid.classList.add("cols-1");
    else if (n === 2) els.grid.classList.add("cols-2");
    else if (n === 3) els.grid.classList.add("cols-3");
    else if (n === 4) els.grid.classList.add("cols-2");
    else if (n <= 6) els.grid.classList.add("cols-3");
  }

  function countBy(list, key) {
    var map = {};
    list.forEach(function (w) {
      var vals = key === "tags" ? w.tags || [] : [w[key]];
      vals.forEach(function (v) {
        if (!v) return;
        map[v] = (map[v] || 0) + 1;
      });
    });
    return Object.keys(map)
      .map(function (name) { return { name: name, count: map[name] }; })
      .sort(function (a, b) {
        return b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN");
      });
  }

  function buildChips(container, values, set) {
    container.innerHTML = "";

    var all = el("button", "chip", "全部");
    all.type = "button";
    all.dataset.value = "";
    all.setAttribute("aria-pressed", set.size === 0 ? "true" : "false");
    all.addEventListener("click", function () {
      set.clear();
      syncChips(container, set);
      render();
    });
    container.appendChild(all);

    values.forEach(function (v) {
      var b = el("button", "chip");
      b.type = "button";
      b.dataset.value = v.name;
      b.setAttribute("aria-pressed", set.has(v.name) ? "true" : "false");
      b.appendChild(el("span", "chip-name", v.name));
      b.appendChild(el("span", "chip-n", String(v.count)));
      b.addEventListener("click", function () {
        if (set.has(v.name)) set.delete(v.name);
        else set.add(v.name);
        syncChips(container, set);
        render();
      });
      container.appendChild(b);
    });
  }

  function syncChips(container, set) {
    $$(".chip", container).forEach(function (b) {
      var v = b.dataset.value;
      var on = v === "" ? set.size === 0 : set.has(v);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function buildCard(w) {
    var card = el("article", "card");
    var btn = el("button", "card-btn");
    btn.type = "button";
    btn.setAttribute(
      "aria-label",
      "查看作品《" + (w.title || "无题") + "》，作者 " + (w.author || "佚名")
    );

    var media = el("span", "card-media");
    media.style.setProperty("--ph", w.color || "#e3dccd");

    var img = document.createElement("img");
    img.alt = (w.title ? w.title + "，" : "") + (w.author || "") + " 作品";
    img.width = w.w || 1200;
    img.height = w.h || 800;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", function () {
      img.classList.add("is-loaded");
    }, { once: true });
    img.addEventListener("error", function () {
      media.classList.add("is-broken");
    }, { once: true });
    img.src = w.thumb || w.src;
    media.appendChild(img);

    if (w.featured) {
      media.appendChild(el("span", "card-flag", "精选"));
    }

    var body = el("span", "card-body");
    body.appendChild(el("span", "card-title", w.title || "无题"));

    var meta = el("span", "card-meta");
    meta.appendChild(document.createTextNode(w.author || "佚名"));
    if (w.date) {
      meta.appendChild(el("span", "dot", "·"));
      meta.appendChild(document.createTextNode(fmtDate(w.date)));
    }
    body.appendChild(meta);

    if (w.tags && w.tags.length) {
      var tagWrap = el("span", "card-tags");
      w.tags.forEach(function (t) {
        tagWrap.appendChild(el("span", "", t));
      });
      body.appendChild(tagWrap);
    }

    btn.appendChild(media);
    btn.appendChild(body);
    btn.addEventListener("click", function () { openLb(w.id); });

    card.appendChild(btn);
    return card;
  }

  function computeView() {
    var q = state.q.trim().toLowerCase();
    var list = works.filter(function (w) {
      if (state.authors.size && !state.authors.has(w.author)) return false;
      if (state.tags.size) {
        var hit = (w.tags || []).some(function (t) { return state.tags.has(t); });
        if (!hit) return false;
      }
      if (q) {
        var hay = [
          w.title || "",
          w.author || "",
          w.desc || "",
          (w.tags || []).join(" ")
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (state.sort === "title") {
      list.sort(function (a, b) {
        return (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
      });
    } else if (state.sort === "author") {
      list.sort(function (a, b) {
        return (a.author || "").localeCompare(b.author || "", "zh-Hans-CN") ||
          (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
      });
    } else {
      list.sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "") ||
          (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
      });
    }
    return list;
  }

  function isFiltering() {
    return Boolean(state.q || state.authors.size || state.tags.size);
  }

  function render() {
    view = computeView();

    Object.keys(cards).forEach(function (id) { cards[id].hidden = true; });

    var frag = document.createDocumentFragment();
    view.forEach(function (w) {
      var node = cards[w.id];
      if (!node) return;
      node.hidden = false;
      frag.appendChild(node);
    });
    els.grid.appendChild(frag);

    els.empty.hidden = view.length > 0;
    els.grid.hidden = view.length === 0;
    els.resultCount.textContent =
      view.length === works.length
        ? works.length + " 件"
        : view.length + " / " + works.length + " 件";
    els.clearBtn.hidden = !isFiltering();
    updateChipFade();
  }

  function updateChipFade() {
    [els.authorChips, els.tagChips].forEach(function (box) {
      if (!box) return;
      box.classList.toggle("is-fade", box.scrollWidth > box.clientWidth + 4);
    });
  }

  function clearAll() {
    state.q = "";
    state.authors.clear();
    state.tags.clear();
    els.searchInput.value = "";
    syncChips(els.authorChips, state.authors);
    syncChips(els.tagChips, state.tags);
    render();
  }

  function bindGalleryEvents() {
    els.searchInput.addEventListener("input", function () {
      var value = els.searchInput.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        state.q = value;
        render();
      }, 120);
    });

    els.sortSelect.addEventListener("change", function () {
      state.sort = els.sortSelect.value;
      render();
    });

    els.clearBtn.addEventListener("click", clearAll);
    els.emptyClear.addEventListener("click", clearAll);

    els.aboutBtn.addEventListener("click", openAbout);
    els.aboutClose.addEventListener("click", closeAbout);
    els.about.addEventListener("click", function (e) {
      if (e.target === els.about) closeAbout();
    });

    els.lbClose.addEventListener("click", closeLb);
    els.lbPrev.addEventListener("click", function () { showLb(lbIndex - 1); });
    els.lbNext.addEventListener("click", function () { showLb(lbIndex + 1); });
    els.lbImg.addEventListener("dragstart", function (e) { e.preventDefault(); });

    els.lbStage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") return;
      swipe.x = e.clientX;
      swipe.y = e.clientY;
      swipe.active = true;
    });
    els.lbStage.addEventListener("pointerup", function (e) {
      if (!swipe.active) return;
      swipe.active = false;
      var dx = e.clientX - swipe.x;
      var dy = e.clientY - swipe.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        showLb(dx < 0 ? lbIndex + 1 : lbIndex - 1);
      }
    });
    els.lbStage.addEventListener("pointercancel", function () { swipe.active = false; });

    document.addEventListener("keydown", function (e) {
      if (!els.lightbox.hidden) {
        if (e.key === "Escape") { e.preventDefault(); closeLb(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); showLb(lbIndex + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); showLb(lbIndex - 1); }
        else if (e.key === "Tab") trapFocus(e, els.lightbox);
      } else if (!els.about.hidden) {
        if (e.key === "Escape") { e.preventDefault(); closeAbout(); }
        else if (e.key === "Tab") trapFocus(e, els.about);
      }
    });

    window.addEventListener("scroll", function () {
      els.masthead.classList.toggle("is-scrolled", window.scrollY > 8);
    }, { passive: true });

    window.addEventListener("resize", updateChipFade);
  }

  /* ---------- 灯箱 ---------- */
  function openLb(id) {
    var idx = view.findIndex(function (w) { return w.id === id; });
    if (idx < 0) return;
    lastFocus = document.activeElement;
    els.lightbox.hidden = false;
    lockScroll(true);
    showLb(idx);
    els.lbClose.focus();
  }

  function showLb(i) {
    if (!view.length) return;
    lbIndex = mod(i, view.length);
    var w = view[lbIndex];

    var img = els.lbImg;
    img.classList.remove("is-on");
    img.onload = function () { img.classList.add("is-on"); };
    img.onerror = function () { img.classList.add("is-on"); };
    img.src = w.src;
    img.alt = (w.title || "作品") + "，" + (w.author || "") + " 作品";

    els.lbTitle.textContent = w.title || "无题";
    els.lbAuthor.textContent = w.author || "佚名";
    els.lbDate.textContent = fmtDate(w.date);
    els.lbDate.hidden = !w.date;
    els.lbDesc.textContent = w.desc || "";
    els.lbDesc.hidden = !w.desc;

    els.lbTags.innerHTML = "";
    (w.tags || []).forEach(function (t) {
      els.lbTags.appendChild(el("li", "", t));
    });
    els.lbTags.hidden = !(w.tags && w.tags.length);

    els.lbCounter.textContent = pad(lbIndex + 1) + " / " + pad(view.length);

    [view[(lbIndex + 1) % view.length], view[(lbIndex - 1 + view.length) % view.length]]
      .forEach(function (item) {
        if (item && item.src) {
          var pre = new Image();
          pre.src = item.src;
        }
      });
  }

  function closeLb() {
    els.lightbox.hidden = true;
    lockScroll(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openAbout() {
    lastFocus = document.activeElement;
    els.about.hidden = false;
    lockScroll(true);
    els.aboutClose.focus();
  }

  function closeAbout() {
    els.about.hidden = true;
    lockScroll(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

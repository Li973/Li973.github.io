/* ==========================================================================
   孤独林 · personal homepage
   - 固定外壳：顶栏 + 左栏静止，只有右栏 .content 可滚动
   - 博客文章：posts/index.json（清单） + posts/*.md（正文，Markdown）
   - 归档：读取同一份清单，按年份自动生成时间轴
   - 路由：#home 文章 / #archive 归档 / #post/<slug> 展开并定位文章
   - 公式：MathJax 3，支持 $...$（行内）与 $$...$$（独立）
   - 新增文章：把 .md 放进 posts/，再到 posts/index.json 的 posts 数组最前面加一条
   ========================================================================== */
(function () {
  'use strict';

  var MAX_WORKS = 3;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var contentEl = null;
  var allPosts = [];
  var cards = [];

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeMath(s) {
    // 公式里的 < > & 先转义，innerHTML 解析回文本节点后 MathJax 仍能读到原始 LaTeX
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function formatDate(d) {
    if (!d) return '';
    return String(d).trim().replace(/-/g, '.');
  }
  function shortDate(d) {
    return String(d || '').trim().slice(5).replace(/-/g, '.');
  }

  /* ---------- MathJax（主 CDN 失败时自动换备用源） ---------- */
  function loadMathJax() {
    return new Promise(function (resolve, reject) {
      function inject(url, onError) {
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = resolve;
        s.onerror = onError;
        document.head.appendChild(s);
      }
      inject('https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js', function () {
        inject('https://unpkg.com/mathjax@3/es5/tex-chtml.js', function () {
          reject(new Error('MathJax CDN unavailable'));
        });
      });
    });
  }

  var mathReady = loadMathJax()
    .then(function () {
      var MJ = window.MathJax;
      return MJ && MJ.startup && MJ.startup.promise ? MJ.startup.promise : null;
    })
    .catch(function () { return null; });

  function typesetMath(root) {
    return mathReady.then(function () {
      var MJ = window.MathJax;
      if (MJ && typeof MJ.typesetPromise === 'function') {
        return MJ.typesetPromise([root]).catch(function () { /* 公式渲染失败不阻塞页面 */ });
      }
    });
  }

  /* ---------- Markdown -> HTML，并保护公式不被 Markdown 解析破坏 ---------- */
  function protectSegment(text, push) {
    // 独立公式 $$...$$
    var src = text.replace(/\$\$([\s\S]*?)\$\$/g, function (m) {
      return '\n\n' + push(m, true) + '\n\n';
    });
    // 行内公式 $...$（跳过 \$ 转义，且不跨行）
    src = src.replace(/(^|[^\\])\$([^$\n]+?)\$/g, function (m, pre) {
      return pre + push(m.slice(pre.length), false);
    });
    return src;
  }

  function protectMath(md) {
    var store = [];
    function push(text, block) {
      store.push({ text: text, block: !!block });
      return 'MATHJAXTOKEN' + (store.length - 1) + 'END';
    }
    // 代码块 / 行内代码原样保留，避免把 shell 变量 $HOME、代码示例 $$...$$ 误判成公式
    var parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
    for (var i = 0; i < parts.length; i += 2) {
      parts[i] = protectSegment(parts[i], push);
    }
    return { src: parts.join(''), store: store };
  }

  function renderMarkdown(md) {
    if (typeof window.marked === 'undefined') {
      return '<pre>' + escapeHtml(md) + '</pre>';
    }
    var p = protectMath(md);
    var html = window.marked.parse(p.src, { gfm: true, breaks: false });
    // 独立公式提升为块级元素，避免 display math 被塞进 <p>
    html = html.replace(/<p>\s*MATHJAXTOKEN(\d+)END\s*<\/p>/g, function (m, i) {
      var item = p.store[Number(i)];
      return item && item.block
        ? '<div class="math-block">' + escapeMath(item.text) + '</div>'
        : m;
    });
    // 用函数式替换，避免公式中的 $& 被当成替换占位符
    html = html.replace(/MATHJAXTOKEN(\d+)END/g, function (_, i) {
      var item = p.store[Number(i)];
      return item ? escapeMath(item.text) : '';
    });
    return html;
  }

  /* ---------- 滚动渐显 ---------- */
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('in');
      io.unobserve(el);
      // 动画结束后移除 reveal 类，避免它的 transform 覆盖卡片 hover 效果
      var delay = Number(el.dataset.revealDelay || 0);
      setTimeout(function () {
        el.classList.remove('reveal', 'in');
        el.style.transitionDelay = '';
      }, 900 + delay);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }) : null;

  function observe(el, delay) {
    if (!el) return;
    if (!io || reduceMotion) return;
    el.classList.add('reveal');
    if (delay) {
      el.dataset.revealDelay = String(delay);
      el.style.transitionDelay = delay + 'ms';
    }
    io.observe(el);
  }

  /* ---------- 文章卡片 ---------- */
  function createCard(post, index) {
    var card = document.createElement('article');
    card.className = 'glass post';
    card.dataset.slug = post.slug || '';
    var tags = (post.tags || []).map(function (t) {
      return '<span class="tag">#' + escapeHtml(t) + '</span>';
    }).join('');

    card.innerHTML =
      '<h2 class="post-title" role="button" tabindex="0" aria-expanded="false">' + escapeHtml(post.title || '未命名') + '</h2>' +
      '<p class="summary">' + escapeHtml(post.summary || '') + '</p>' +
      '<div class="meta">' +
        '<span class="date"><svg class="ic"><use href="#i-clock"/></svg>' + escapeHtml(formatDate(post.date)) + '</span>' +
        '<span class="tags">' + tags + '</span>' +
        '<button class="toggle" type="button" aria-expanded="false" disabled>阅读全文 <span class="chev">↓</span></button>' +
      '</div>' +
      '<div class="post-body-wrap"><div class="post-body md"></div></div>';

    observe(card, Math.min(index, 4) * 70);
    return card;
  }

  function toggleCard(card) {
    if (!card) return;
    var open = card.classList.toggle('open');
    var btn = $('.toggle', card);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    var title = $('.post-title', card);
    if (title) title.setAttribute('aria-expanded', String(open));
    if (open) typesetMath($('.post-body', card));
  }

  function bindPostEvents(list) {
    list.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('.post-title, .toggle');
      if (!trigger || trigger.disabled) return;
      e.preventDefault();
      toggleCard(trigger.closest('.post'));
    });
    list.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('post-title')) {
        e.preventDefault();
        toggleCard(e.target.closest('.post'));
      }
    });
  }

  /* ---------- 归档：按年份从文章清单生成 ---------- */
  function renderArchive(posts) {
    var body = $('#archiveBody');
    var total = $('#archiveTotal');
    if (total) total.textContent = String(posts.length);
    if (!body) return;

    if (!posts.length) {
      body.innerHTML = '<p class="archive-empty">还没有文章，归档是空的。</p>';
      return;
    }

    var groups = {};
    posts.forEach(function (p) {
      var y = String(p.date || '').slice(0, 4) || '未标日期';
      (groups[y] = groups[y] || []).push(p);
    });
    var years = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });

    body.innerHTML = years.map(function (y) {
      var items = groups[y].slice().sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      var rows = items.map(function (p) {
        var tags = (p.tags || []).map(function (t) {
          return '<span class="tag">#' + escapeHtml(t) + '</span>';
        }).join('');
        return '<li class="archive-item">' +
          '<span class="archive-date">' + escapeHtml(shortDate(p.date) || '--') + '</span>' +
          '<a class="archive-title" href="#post/' + encodeURIComponent(p.slug || '') + '">' +
            escapeHtml(p.title || '未命名') + '</a>' +
          '<span class="archive-tags">' + tags + '</span>' +
        '</li>';
      }).join('');
      return '<section class="archive-year">' +
        '<h3 class="archive-year-title"><span>' + escapeHtml(y) + '</span><small>' + items.length + ' 篇</small></h3>' +
        '<ul class="archive-list">' + rows + '</ul>' +
      '</section>';
    }).join('');
  }

  /* ---------- 视图与路由 ---------- */
  function currentHash() {
    try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; }
  }

  // 宽屏时右栏是滚动容器；窄屏回退为整页滚动
  function isContentScroller() {
    return !!(contentEl && contentEl.scrollHeight > contentEl.clientHeight + 2);
  }

  function scrollToY(y, smooth) {
    y = Math.max(0, y);
    var behavior = smooth ? 'smooth' : 'auto';
    if (isContentScroller()) {
      try { contentEl.scrollTo({ top: y, behavior: behavior }); }
      catch (e) { contentEl.scrollTop = y; }
    } else {
      try { window.scrollTo({ top: y, behavior: behavior }); }
      catch (e) { window.scrollTo(0, y); }
    }
  }

  function openPost(slug) {
    var card = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.slug === slug) { card = cards[i]; break; }
    }
    if (!card) return;
    if (!card.classList.contains('open')) toggleCard(card);
    setTimeout(function () {
      // 深链接定位用瞬时滚动，直接落到文章上（回到顶部按钮仍保留平滑动画）
      if (isContentScroller()) {
        scrollToY(card.offsetTop - 12, false);
      } else {
        var r = card.getBoundingClientRect();
        scrollToY(r.top + (window.scrollY || 0) - 90, false);
      }
    }, 80);
  }

  function applyRoute() {
    var hash = currentHash();
    var isArchive = hash === 'archive';
    var m = /^post\/(.+)$/.exec(hash);

    var postsView = $('#viewPosts');
    var archiveView = $('#viewArchive');
    if (postsView) postsView.hidden = isArchive;
    if (archiveView) archiveView.hidden = !isArchive;

    var navArchive = $('#navArchive');
    var brand = $('#brandHome');
    if (navArchive) navArchive.classList.toggle('active', isArchive);
    if (brand) brand.classList.toggle('active', !isArchive);
    document.title = isArchive ? '归档 · 孤独林' : '孤独林 · 个人主页';

    // 切换视图时右栏回到顶部
    if (contentEl) contentEl.scrollTop = 0;

    if (isArchive) {
      scrollToY(0, false);
    } else if (m) {
      openPost(m[1]);
    }
    updateScrollUI();
  }

  function bindNav() {
    window.addEventListener('hashchange', applyRoute);
    // 点「孤独林」/「返回文章」时即使 hash 未变化也回到顶部
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-view="home"]')) {
        scrollToY(0, !reduceMotion);
      }
    });
  }

  /* ---------- 文章加载 ---------- */
  async function loadPosts() {
    var list = $('#postList');
    var counter = $('#postCount');
    try {
      var res = await fetch('posts/index.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('index.json HTTP ' + res.status);
      var data = await res.json();
      var posts = Array.isArray(data) ? data : (data.posts || []);
      allPosts = posts;
      if (counter) counter.textContent = allPosts.length + ' 篇';
      list.innerHTML = '';
      renderArchive(allPosts);

      if (!posts.length) {
        list.innerHTML = '<div class="glass post placeholder">还没有文章，空空如也。</div>';
        applyRoute();
        return;
      }

      cards = posts.map(createCard);
      cards.forEach(function (c) { list.appendChild(c); });
      bindPostEvents(list);

      await Promise.all(posts.map(async function (post, i) {
        var body = $('.post-body', cards[i]);
        var btn = $('.toggle', cards[i]);
        try {
          var r = await fetch(post.file, { cache: 'no-cache' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var md = await r.text();
          body.innerHTML = '<div class="md-inner">' + renderMarkdown(md) + '</div>';
          btn.disabled = false;
        } catch (err) {
          body.innerHTML = '<div class="md-inner"><p class="post-error">正文加载失败：' +
            escapeHtml(err.message) + '（' + escapeHtml(post.file) + '）</p></div>';
        }
      }));

      await typesetMath($('#viewPosts'));
      applyRoute();
      updateScrollUI();
    } catch (err) {
      if (counter) counter.textContent = '—';
      list.innerHTML = '<div class="glass post placeholder">文章列表加载失败。请通过 HTTP(S) 访问本页' +
        '（GitHub Pages，或本地执行 <code>python -m http.server</code>），' +
        '直接双击打开 index.html 时浏览器会拦截本地文件读取。</div>';
      renderArchive([]);
    }
  }

  /* ---------- 近期工作：只保留最近 3 条 ---------- */
  function limitWorks() {
    var items = Array.prototype.slice.call(document.querySelectorAll('#workList > li'));
    items.forEach(function (li, i) { if (i >= MAX_WORKS) li.hidden = true; });
    var badge = $('#workCount');
    if (badge) badge.textContent = String(Math.min(items.length, MAX_WORKS));
  }

  /* ---------- 滚动进度 / 回到顶部 ---------- */
  function updateScrollUI() {
    var bar = $('#scrollProgress');
    var hint = $('#scrollHint');
    var top = $('#toTop');
    var y, max;
    if (isContentScroller()) {
      y = contentEl.scrollTop;
      max = contentEl.scrollHeight - contentEl.clientHeight;
    } else {
      var doc = document.documentElement;
      y = window.scrollY || doc.scrollTop || 0;
      max = doc.scrollHeight - doc.clientHeight;
    }
    if (bar) bar.style.width = (max > 0 ? (y / max) * 100 : 0).toFixed(2) + '%';
    if (hint) hint.classList.toggle('hide', y > 60 || !(max > 1)); // 无需滚动时不显示提示
    if (top) top.classList.toggle('show', y > 360);
  }

  function initScroll() {
    contentEl = $('#content');
    if (contentEl) contentEl.addEventListener('scroll', updateScrollUI, { passive: true });
    window.addEventListener('scroll', updateScrollUI, { passive: true });
    window.addEventListener('resize', updateScrollUI, { passive: true });
    var top = $('#toTop');
    if (top) top.addEventListener('click', function () { scrollToY(0, !reduceMotion); });
    updateScrollUI();
  }

  /* ---------- 启动 ---------- */
  function init() {
    limitWorks();
    var y = $('#year');
    if (y) y.textContent = String(new Date().getFullYear());
    initScroll();
    observe($('.profile'), 0);
    observe($('.section-head'), 60);
    observe($('.end-note'), 0);
    bindNav();
    applyRoute();
    loadPosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

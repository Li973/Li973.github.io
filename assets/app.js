/* ==========================================================================
   Li973 · personal homepage
   - 博客文章：posts/index.json（清单） + posts/*.md（正文，Markdown）
   - 公式：MathJax 3，支持 $...$（行内）与 $$...$$（独立）
   - 新增文章：把 .md 放进 posts/，再到 posts/index.json 的 posts 数组最前面加一条
   ========================================================================== */
(function () {
  'use strict';

  var MAX_WORKS = 3;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, root) { return (root || document).querySelector(s); };

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

  async function loadPosts() {
    var list = $('#postList');
    var counter = $('#postCount');
    try {
      var res = await fetch('posts/index.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('index.json HTTP ' + res.status);
      var data = await res.json();
      var posts = Array.isArray(data) ? data : (data.posts || []);
      counter.textContent = posts.length + ' 篇';
      list.innerHTML = '';

      if (!posts.length) {
        list.innerHTML = '<div class="glass post placeholder">还没有文章，空空如也。</div>';
        return;
      }

      var cards = posts.map(createCard);
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

      typesetMath($('#blog'));

      // 深链接：/#文章slug 会自动展开并定位到该文章
      var hash = '';
      try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* 忽略非法 hash */ }
      if (hash) {
        for (var j = 0; j < posts.length; j++) {
          if ((posts[j].slug || '') === hash) {
            toggleCard(cards[j]);
            (function (card) {
              setTimeout(function () {
                // 临时关闭 CSS smooth scrolling，确保一次性定位、不产生滚动动画
                var html = document.documentElement;
                var prev = html.style.scrollBehavior;
                html.style.scrollBehavior = 'auto';
                card.scrollIntoView({ block: 'start', behavior: 'auto' });
                html.style.scrollBehavior = prev;
              }, 120);
            })(cards[j]);
            break;
          }
        }
      }
    } catch (err) {
      counter.textContent = '—';
      list.innerHTML = '<div class="glass post placeholder">文章列表加载失败。请通过 HTTP(S) 访问本页' +
        '（GitHub Pages，或本地执行 <code>python -m http.server</code>），' +
        '直接双击打开 index.html 时浏览器会拦截本地文件读取。</div>';
    }
  }

  /* ---------- 近期工作：只保留最近 3 条 ---------- */
  function limitWorks() {
    var items = Array.prototype.slice.call(document.querySelectorAll('#workList > li'));
    items.forEach(function (li, i) { if (i >= MAX_WORKS) li.hidden = true; });
    var badge = $('#workCount');
    if (badge) badge.textContent = String(Math.min(items.length, MAX_WORKS));
  }

  /* ---------- 滚动相关 ---------- */
  function initScroll() {
    var bar = $('#scrollProgress');
    var hint = $('#scrollHint');
    var top = $('#toTop');
    function update() {
      var doc = document.documentElement;
      var y = window.scrollY || doc.scrollTop || 0;
      var max = doc.scrollHeight - doc.clientHeight;
      bar.style.width = (max > 0 ? (y / max) * 100 : 0).toFixed(2) + '%';
      hint.classList.toggle('hide', y > 60);
      top.classList.toggle('show', y > 360);
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    update();
  }

  /* ---------- 启动 ---------- */
  function init() {
    limitWorks();
    var y = $('#year');
    if (y) y.textContent = String(new Date().getFullYear());
    observe($('.profile'), 0);
    observe($('.section-head'), 60);
    observe($('.end-note'), 0);
    initScroll();
    loadPosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

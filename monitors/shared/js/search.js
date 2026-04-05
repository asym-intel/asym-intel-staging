/* ============================================================
   search.js  v1.1  — Asymmetric Intelligence shared module
   Full-text search across all published issues and chatter of any monitor.
   Derives data path from window.location — no per-page config needed.
   v1.1: adds chatter files to corpus; result links to correct page.
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
    var corpus = [];
    var loaded = false;

    function esc(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function highlight(text, q) {
      var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&') + ')', 'gi');
      return esc(text).replace(re, '<mark>$1</mark>');
    }

    function flatten(obj, meta, items) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(function(i){ flatten(i, meta, items); }); return; }
      var text = '';
      ['title','headline','summary','body','detail','note','signal','significance','description'].forEach(function(k){
        if (obj[k] && typeof obj[k] === 'string') text += ' ' + obj[k];
      });
      if (text.trim()) items.push({ text: text.trim(), meta: meta });
      Object.keys(obj).forEach(function(k){
        if (k === '_meta') return;
        if (typeof obj[k] === 'object') flatten(obj[k], meta, items);
      });
    }

    function doSearch(q) {
      var statusEl  = document.getElementById('search-status');
      var resultsEl = document.getElementById('search-results');
      q = q.trim();
      if (!q) { resultsEl.innerHTML = ''; statusEl.textContent = corpus.length + ' searchable items across all issues and chatter.'; return; }
      if (!loaded) { statusEl.textContent = 'Loading corpus\u2026'; return; }
      var lower = q.toLowerCase();
      var matches = corpus.filter(function(item){
        return item.text.toLowerCase().indexOf(lower) > -1;
      });
      var seen = {}, deduped = [];
      matches.forEach(function(m){
        var k = (m.meta.label||'') + '|' + m.text.slice(0,80);
        if (!seen[k]) { seen[k] = true; deduped.push(m); }
      });
      statusEl.textContent = deduped.length
        ? deduped.length + ' result' + (deduped.length !== 1 ? 's' : '') + ' for "' + esc(q) + '"'
        : 'No results for "' + esc(q) + '"';
      if (!deduped.length) {
        resultsEl.innerHTML = '<p style="color:var(--color-text-muted);padding:var(--space-6) 0;font-size:var(--text-sm)">No results found. Try a different term.</p>';
        return;
      }
      resultsEl.innerHTML = deduped.slice(0,40).map(function(item){
        var preview = item.text.length > 200 ? item.text.slice(0,200) + '\u2026' : item.text;
        var label   = item.meta.label || '?';
        var link    = item.meta.type === 'chatter' ? 'chatter.html' : 'report.html';
        var typeTag = '<span style="font-size:var(--text-xs);background:var(--color-surface-raised);color:var(--color-text-muted);padding:1px 6px;border-radius:3px;margin-left:6px">'
          + (item.meta.type === 'chatter' ? 'Chatter' : 'Report') + '</span>';
        return '<div class="search-result">' +
          '<div class="search-result__meta">' + esc(label) + typeTag + '</div>' +
          '<div class="search-result__body">' + highlight(preview, q) + '</div>' +
          '<a class="search-result__link" href="' + link + '">View ' + (item.meta.type === 'chatter' ? 'chatter' : 'issue') + ' \u2192</a>' +
        '</div>';
      }).join('');
    }

    // Build list of chatter dates to try: last 26 weeks of Mondays/Thursdays
    // (chatter runs on monitor cadence — we probe and 404s are silently ignored)
    function chatterDatesToTry() {
      var dates = [];
      var d = new Date();
      for (var i = 0; i < 182; i++) {
        var iso = d.toISOString().slice(0,10);
        dates.push(iso);
        d.setDate(d.getDate() - 1);
      }
      return dates;
    }

    // Load reports from archive.json
    var reportPromise = fetch('data/archive.json')
      .then(function(r){ return r.json(); })
      .then(function(issues){
        issues = Array.isArray(issues) ? issues : (issues.issues || []);
        var promises = issues.map(function(issue){
          var url = issue.url || ('data/report-' + (issue.slug || issue.published) + '.json');
          var meta = {
            type:  'report',
            label: 'Issue ' + (issue.issue || issue.slug || issue.published || '?'),
            date:  issue.published || issue.slug || ''
          };
          return fetch(url).then(function(r){ return r.json(); })
            .then(function(d){ flatten(d, meta, corpus); })
            .catch(function(){});
        });
        return Promise.all(promises);
      })
      .catch(function(){});

    // Load chatter: try chatter-index.json first (Housekeeping-maintained),
    // fall back to probing dated filenames from the last 26 weeks.
    var chatterPromise = fetch('data/chatter-index.json')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(idx){
        var dates = idx ? idx.dates : chatterDatesToTry();
        var seen = {};
        var promises = dates.map(function(date){
          var url = 'data/chatter-' + date + '.json';
          if (seen[url]) return Promise.resolve();
          seen[url] = true;
          var meta = { type: 'chatter', label: 'Chatter \u00b7 ' + date, date: date };
          return fetch(url).then(function(r){ return r.ok ? r.json() : null; })
            .then(function(d){ if (d) flatten(d, meta, corpus); })
            .catch(function(){});
        });
        return Promise.all(promises);
      })
      .catch(function(){});

    Promise.all([reportPromise, chatterPromise]).then(function(){
      loaded = true;
      var statusEl = document.getElementById('search-status');
      if (statusEl) statusEl.textContent = corpus.length + ' searchable items across all issues and chatter.';
    });

    var input = document.getElementById('search-input');
    var timer;
    input.addEventListener('input', function(){
      clearTimeout(timer);
      timer = setTimeout(function(){ doSearch(input.value); }, 200);
    });
    input.focus();
  });
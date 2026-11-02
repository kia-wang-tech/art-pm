/* ============================================================
   甘特圖：拖曳移動、拉長縮短、拉線建立相依
   ============================================================ */
var GSCALE = { day: 28, week: 12, month: 4 };
var G = null; // 目前畫面的幾何資訊

function renderGantt(c) {
  var p = projById[S.route.project];
  projectHeader(p, 'gantt');
  var P = periodSel(); if (P && P.archived) { c.className = 'content'; return renderArchived(c, p, P); }
  c.className = 'content flush';
  var right = '<span class="seg">' + [['day', '日'], ['week', '週'], ['month', '月']].map(function (o) { return '<button data-sc="' + o[0] + '" class="' + (S.ganttScale === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</span><button class="btn" id="gToday">今天</button>';
  var list = filtered(projectTasks(p.id)).filter(function (t) { return t.start && t.end; }).sort(sortTasks);
  var groups = groupsOf(list), rows = [];
  groups.forEach(function (g) { rows.push({ g: g }); g.tasks.forEach(function (t) { rows.push({ t: t, color: g.color }); }); });
  var h = filterBar(p.id, right);
  h += '<div class="legend" style="padding:0 22px 10px">' +
    (p.canEdit ? '<span>拖曳色條改開始日・拖右緣改天數・從右側圓點拉到另一個工項建立相依・點兩下開啟</span>' : '<span>點工項看上下游相依，點兩下開啟</span>') +
    '<span style="margin-left:auto"><i style="background:var(--danger);transform:rotate(45deg);width:9px;height:9px"></i>出版日</span><span><i style="background:repeating-linear-gradient(45deg,#999 0 3px,transparent 3px 6px)"></i>平行</span></div>';
  if (!rows.length) { c.innerHTML = h + '<div class="card empty" style="margin:0 22px"><b>沒有可顯示的工項</b>試試清除篩選或取消「隱藏已完成」。</div>'; bindFilters(); bindGanttTools(); return; }
  var today = dn(S.data.today), min = Infinity, max = -Infinity;
  list.forEach(function (t) { min = Math.min(min, dn(t.start)); max = Math.max(max, dn(t.end), dn(t.release) || 0); });
  min = Math.min(min, today) - 7; max = Math.max(max, today) + 21;
  if (max - min > 1100) min = Math.max(min, today - 180);
  var W = GSCALE[S.ganttScale] || 28, RH = 34, width = (max - min + 1) * W, height = rows.length * RH;
  var x = function (n) { return (n - min) * W; };
  G = { min: min, W: W, RH: RH, rows: rows, pos: {} };

  h += '<div class="gwrap"><div class="gleft"><div class="ghead">工項</div><div class="glist" id="gList"><div style="height:' + (height + 30) + 'px">';
  rows.forEach(function (r) {
    if (r.g) h += '<div class="gname grp"><span class="dot" style="width:8px;height:8px;border-radius:2px;background:' + r.g.color + '"></span><span class="n">' + esc(r.g.name) + '</span></div>';
    else h += '<div class="gname" data-id="' + esc(r.t.id) + '" title="' + esc(r.t.title) + '"><span class="n">' + esc(r.t.title) + '</span>' + avatar(r.t.owner, true) + '</div>';
  });
  h += '</div></div></div><div class="gright" id="gRight"><div style="width:' + width + 'px;position:relative">';
  h += '<div class="gtime" style="width:' + width + 'px">';
  for (var n = min; n <= max; n++) {
    var s = ds(n), d = +s.slice(8);
    if (d === 1 || n === min) h += '<div class="m" style="left:' + (x(n) + 4) + 'px">' + s.slice(0, 4) + '/' + (+s.slice(5, 7)) + '</div>';
    if (S.ganttScale === 'day') h += '<div style="left:' + x(n) + 'px;top:26px;width:' + W + 'px;text-align:center;' + (isOff(n) ? 'color:var(--ink3)' : '') + (n === today ? ';color:var(--danger);font-weight:700' : '') + '">' + d + '</div>';
    else if (S.ganttScale === 'week' && wk(n) === 1) h += '<div style="left:' + x(n) + 'px;top:26px">' + md(s) + '</div>';
  }
  h += '</div><div class="gbody" id="gBody" style="height:' + height + 'px">';
  if (S.ganttScale !== 'month') for (n = min; n <= max; n++) if (isOff(n)) h += '<div class="goff" style="left:' + x(n) + 'px;width:' + W + 'px"></div>';
  h += '<div class="gtoday" style="left:' + (x(today) + W / 2 - 1) + 'px" title="今天"></div>';
  rows.forEach(function (r, i) {
    h += '<div class="grw' + (r.g ? ' g' : '') + '" style="top:' + (i * RH) + 'px"></div>';
    if (!r.t) return;
    var t = r.t, a = x(dn(t.start)), b = x(dn(t.end) + 1);
    G.pos[t.id] = { a: a, b: b, y: i * RH + RH / 2, row: i };
    var ed = canEdit(t), movable = ed && (t.status === '未開始' || t.status === '暫停'), sizable = ed && t.status !== '完成' && t.status !== '取消';
    var cls = 'gbar' + (t.mode === '平行' ? ' par' : '') + (worst(t) === 'd' ? ' bad' : '') + (t.status === '完成' ? ' done' : '') + (movable ? '' : ' ro');
    h += '<div class="' + cls + '" data-id="' + esc(t.id) + '" data-mv="' + (movable ? 1 : 0) + '" style="left:' + a + 'px;width:' + Math.max(b - a - 2, 8) + 'px;top:' + (i * RH + 6) + 'px;background-color:' + r.color + '" title="' + esc(t.title + '\n' + (t.owner || '未指派') + '｜' + t.start + ' ~ ' + t.end + '｜' + t.days + ' 天｜' + t.status + ((t.warns || []).length ? '\n⚠ ' + t.warns.join('\n⚠ ') : '')) + '">' +
      '<span class="lbl">' + (S.ganttScale !== 'month' ? esc(t.title) : '') + '</span>' + (sizable ? '<span class="rz"></span>' : '') + (ed ? '<span class="lk" title="拉到另一個工項：設定它要等這項完成"></span>' : '') + '</div>';
    if (t.release && dn(t.release) >= min && dn(t.release) <= max) h += '<div class="grel" style="left:' + (x(dn(t.release)) + W) + 'px;top:' + (i * RH + 12) + 'px" title="出版日 ' + esc(t.release) + '"></div>';
  });
  h += '<svg class="arrows" id="gSvg" width="' + width + '" height="' + height + '"><defs><marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="currentColor" stroke="none"/></marker></defs>' + arrowPaths(list) + '</svg>';
  h += '</div></div></div><div id="chainBox"></div></div>';
  c.innerHTML = h;
  bindFilters(); bindGanttTools();
  var gr = $('#gRight'), gl = $('#gList');
  gr.addEventListener('scroll', function () { if (gl.scrollTop !== gr.scrollTop) gl.scrollTop = gr.scrollTop; });
  gl.addEventListener('wheel', function (e) { gr.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  if (S._gScroll && S._gScroll.p === p.id && S._gScroll.sc === S.ganttScale) { gr.scrollLeft = S._gScroll.l; gr.scrollTop = S._gScroll.t; }
  else gr.scrollLeft = Math.max(0, x(today) - 160);
  gr.addEventListener('scroll', function () { S._gScroll = { p: p.id, sc: S.ganttScale, l: gr.scrollLeft, t: gr.scrollTop }; });
  $$('.gname[data-id]', c).forEach(function (el) {
    el.addEventListener('click', function () { S.sel = S.sel === el.dataset.id ? null : el.dataset.id; highlight(); });
    el.addEventListener('dblclick', function () { openTask(el.dataset.id); });
  });
  bindGanttDrag($('#gBody'));
  highlight();
}
function arrowPaths(list) {
  var out = '';
  list.forEach(function (t) {
    split(t.preds).forEach(function (pid) {
      var A = G.pos[pid], B = G.pos[t.id]; if (!A || !B) return;
      var x1 = A.b - 2, y1 = A.y, x2 = B.a, y2 = B.y, mx = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
      var d = x2 >= x1 + 12 ? 'M' + x1 + ',' + y1 + ' H' + mx + ' V' + y2 + ' H' + (x2 - 1) : 'M' + x1 + ',' + y1 + ' h8 V' + (y1 + (y2 > y1 ? 17 : -17)) + ' H' + (x2 - 10) + ' V' + y2 + ' H' + (x2 - 1);
      out += '<path data-f="' + esc(pid) + '" data-t="' + esc(t.id) + '" d="' + d + '" marker-end="url(#arr)" style="color:var(--ink3)"/>';
    });
  });
  return out;
}
function bindGanttTools() {
  $$('[data-sc]').forEach(function (b) { b.addEventListener('click', function () { S.ganttScale = b.dataset.sc; S._gScroll = null; remember(); render(); }); });
  var tb = $('#gToday');
  if (tb) tb.addEventListener('click', function () { var gr = $('#gRight'); if (gr && G) gr.scrollTo({ left: Math.max(0, (dn(S.data.today) - G.min) * G.W - 160), behavior: 'smooth' }); });
}

/* ---- 相依鏈 ---- */
function chainOf(id) {
  var up = {}, down = {};
  (function walkUp(x) { split((byId[x] || {}).preds).forEach(function (p) { if (!up[p]) { up[p] = 1; walkUp(p); } }); })(id);
  (function walkDown(x) { (succ[x] || []).forEach(function (s) { if (!down[s]) { down[s] = 1; walkDown(s); } }); })(id);
  return { up: up, down: down };
}
function highlight() {
  var box = $('#chainBox'); if (!box) return;
  $$('.gbar, .gname[data-id]').forEach(function (el) { el.classList.remove('dim', 'up', 'down', 'me', 'sel'); });
  $$('#gSvg path[data-f]').forEach(function (p) { p.classList.remove('dim', 'up', 'down'); });
  if (!S.sel || !byId[S.sel]) { box.innerHTML = ''; return; }
  var c = chainOf(S.sel);
  $$('.gbar, .gname[data-id]').forEach(function (el) {
    var id = el.dataset.id;
    if (id === S.sel) el.classList.add(el.classList.contains('gbar') ? 'me' : 'sel');
    else if (c.up[id]) el.classList.add('up'); else if (c.down[id]) el.classList.add('down'); else el.classList.add('dim');
  });
  $$('#gSvg path[data-f]').forEach(function (p) {
    var f = p.dataset.f, t = p.dataset.t;
    if ((c.up[f] || f === S.sel) && (c.up[t] || t === S.sel)) p.classList.add('up');
    else if (c.down[t] && (c.down[f] || f === S.sel)) p.classList.add('down'); else p.classList.add('dim');
  });
  var t = byId[S.sel], ed = canEdit(t);
  var item = function (id, rm) { var x = byId[id]; return '<div class="pl"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:' + (x ? ST_HEX[x.status] : '#999') + '"></span><span>' + esc(x ? x.title : id) + ' <span class="faint">' + esc(x ? (x.owner || '未指派') + '・' + md(x.end) : '') + '</span></span>' + (rm && ed ? '<button data-unlink="' + esc(id) + '" title="移除這個前置">✕</button>' : '') + '</div>'; };
  var direct = split(t.preds), downs = Object.keys(c.down);
  box.innerHTML = '<div class="card chain"><h4>' + esc(t.title) + '</h4><div class="muted" style="font-size:12px;margin-bottom:10px">' + esc(t.owner || '未指派') + '｜' + md(t.start) + ' – ' + md(t.end) + '｜' + esc(t.status) + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:#d38b0b">要先完成（直接前置 ' + direct.length + ' 項）</div>' + (direct.map(function (id) { return item(id, true); }).join('') || '<div class="hint" style="padding:4px 0">沒有前置</div>') +
    '<div style="font-size:13px;font-weight:600;color:var(--accent);margin-top:10px">這項延誤會影響（下游 ' + downs.length + ' 項）</div>' + (downs.slice(0, 30).map(function (id) { return item(id, false); }).join('') || '<div class="hint" style="padding:4px 0">沒有下游</div>') +
    '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm primary" id="chainOpen">開啟工項</button><button class="btn sm" id="chainClose">關閉</button></div></div>';
  $('#chainOpen').addEventListener('click', function () { openTask(S.sel); });
  $('#chainClose').addEventListener('click', function () { S.sel = null; highlight(); });
  $$('[data-unlink]', box).forEach(function (b) {
    b.addEventListener('click', function () {
      var keep = split(t.preds).filter(function (x) { return x !== b.dataset.unlink; });
      patchTask(t.id, { preds: keep.join(', ') }, '已移除前置，排程已重算');
    });
  });
}

/* ---- 拖曳 ---- */
function workdaysInclusive(a, b) { var n = 0; for (var d = a; d <= b; d++) if (!isOff(d)) n++; return n; }
/* opt（人員排程用）：{ W: 每天寬度, onTap: 點一下工項時 } */
function bindGanttDrag(body, opt) {
  opt = opt || {};
  var st = null, tip = null, GW = function () { return opt.W || G.W; };
  var showTip = function (e, text) { if (!tip) { tip = document.createElement('div'); tip.className = 'gtip'; document.body.appendChild(tip); } tip.textContent = text; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; };
  var hideTip = function () { if (tip) { tip.remove(); tip = null; } };
  body.addEventListener('pointerdown', function (e) {
    var bar = e.target.closest('.gbar');
    if (!bar) { if (!opt.onTap && S.sel) { S.sel = null; highlight(); } return; }
    var t = byId[bar.dataset.id];
    var mode = e.target.classList.contains('lk') ? 'link' : e.target.classList.contains('rz') ? 'resize' : 'move';
    st = { bar: bar, t: t, mode: mode, x0: e.clientX, y0: e.clientY, left: parseFloat(bar.style.left), width: parseFloat(bar.style.width), moved: false, delta: 0 };
    bar.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  body.addEventListener('pointermove', function (e) {
    if (!st) return;
    var dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    st.moved = true;
    if (st.mode === 'link') {
      var rect = body.getBoundingClientRect(), p = G.pos[st.t.id];
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      var tmp = $('#gTmp');
      if (!tmp) { tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.id = 'gTmp'; tmp.setAttribute('class', 'tmp'); $('#gSvg').appendChild(tmp); }
      tmp.setAttribute('d', 'M' + (p.b - 2) + ',' + p.y + ' L' + px + ',' + py);
      $$('.gbar.linktarget').forEach(function (x) { x.classList.remove('linktarget'); });
      var over = document.elementsFromPoint(e.clientX, e.clientY).filter(function (el) { return el.classList && el.classList.contains('gbar') && el !== st.bar; })[0];
      if (over) { over.classList.add('linktarget'); showTip(e, '「' + byId[over.dataset.id].title + '」要等這項完成'); } else showTip(e, '拉到要等這項完成的工項上');
      return;
    }
    if (st.bar.classList.contains('ro') && st.mode === 'move') { showTip(e, canEdit(st.t) ? '已開始或完成的工項不能拖曳，請改實際日期' : '你沒有修改這個專案的權限'); return; }
    var dd = Math.round(dx / GW());
    st.delta = dd;
    st.bar.classList.add('drag');
    if (st.mode === 'move') {
      st.bar.style.left = (st.left + dd * GW()) + 'px';
      showTip(e, dd ? '開始日 ' + md(ds(dn(st.t.start) + dd)) + '（' + (dd > 0 ? '+' : '') + dd + ' 天）' : '拖到新的開始日');
    } else {
      var newEnd = Math.max(dn(st.t.start), dn(st.t.end) + dd);
      st.bar.style.width = Math.max(8, st.width + dd * GW()) + 'px';
      var oe = dn(st.t.end), nd = Math.max(0.5, Number(st.t.days) + (newEnd > oe ? workdaysInclusive(oe + 1, newEnd) : -workdaysInclusive(newEnd + 1, oe)));
      showTip(e, '完成日 ' + md(ds(newEnd)) + '，天數 ' + st.t.days + ' → ' + nd + ' 天');
    }
  });
  var end = function (e) {
    if (!st) return;
    var s0 = st; st = null; hideTip();
    s0.bar.classList.remove('drag');
    var tmp = $('#gTmp'); if (tmp) tmp.remove();
    $$('.gbar.linktarget').forEach(function (x) { x.classList.remove('linktarget'); });
    if (!s0.moved) { if (e.type === 'pointerup') { if (opt.onTap) opt.onTap(s0.t); else { S.sel = S.sel === s0.t.id ? null : s0.t.id; highlight(); } } return; }
    var t = s0.t;
    if (s0.mode === 'link') {
      var over = document.elementsFromPoint(e.clientX, e.clientY).filter(function (el) { return el.classList && el.classList.contains('gbar') && el !== s0.bar; })[0];
      if (!over) return;
      var target = byId[over.dataset.id];
      if (!canEdit(target)) { toast('你沒有修改「' + target.title + '」的權限', true); return; }
      var preds = split(target.preds);
      if (preds.indexOf(t.id) >= 0) { toast('已經設定過了'); return; }
      call('previewTask', { id: target.id, preds: preds.concat(t.id).join(', ') }).then(function (r) {
        if (r.error) { toast(r.error, true); return; }
        patchTask(target.id, { preds: preds.concat(t.id).join(', ') }, '「' + target.title + '」會等「' + t.title + '」完成才開始' + (r.total ? '，' + r.total + ' 個工項已重排' : ''));
      });
      return;
    }
    if (s0.bar.classList.contains('ro') && s0.mode === 'move') { render(); return; }
    if (!s0.delta) { render(); return; }
    if (s0.mode === 'move') {
      var want = ds(dn(t.start) + s0.delta);
      patchTask(t.id, { earliest: want }, function () {
        var now = byId[t.id];
        return now && now.start > want ? '已設定最早 ' + md(want) + ' 開始；實際排在 ' + md(now.start) + '（前置還沒完成，或負責人前面還有工作）' : '已改到 ' + md(want) + ' 開始，後面的工項已重算';
      });
    } else {
      var oldEnd = dn(t.end), newEnd = Math.max(dn(t.start), oldEnd + s0.delta);
      // 只加減拉動的那幾個工作天，避免把休假、跨日的空檔算進天數
      var days = Number(t.days) + (newEnd > oldEnd ? workdaysInclusive(oldEnd + 1, newEnd) : -workdaysInclusive(newEnd + 1, oldEnd));
      days = Math.max(0.5, days);
      if (days === Number(t.days)) { render(); return; }
      patchTask(t.id, { days: days }, '天數改為 ' + days + ' 天，後面的工項已重算');
    }
  };
  body.addEventListener('pointerup', end);
  body.addEventListener('pointercancel', end);
  if (!opt.onTap) body.addEventListener('dblclick', function (e) { var bar = e.target.closest('.gbar'); if (bar) openTask(bar.dataset.id); });
}

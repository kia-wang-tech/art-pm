/* ============================================================
   我的工作、人員排程、工項詳細、對話框、設定、啟動
   ============================================================ */

/* ---------------- 我的工作 ---------------- */
function renderMine(c) {
  var d = S.data;
  if (S.route.person && S.data.people.some(function (p) { return p.name === S.route.person; })) S.minePerson = S.route.person;
  var who = S.minePerson || d.me.name, self = who === d.me.name;
  setTitle('<span class="t">' + (self ? '我的工作' : esc(who) + ' 的工作') + '</span>');
  if (isPM()) setActions('<select class="field" id="mWho">' + d.people.map(function (p) { return '<option' + (p.name === who ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>');
  var today = dn(d.today);
  var mine = d.tasks.filter(function (t) { return t.owner === who && t.status !== '完成' && t.status !== '取消'; }).sort(function (a, b) { return (a.prio || 0) - (b.prio || 0) || sortTasks(a, b); });
  var predsDone = function (t) { return split(t.preds).every(function (p) { var x = byId[p]; return !x || x.status === '完成' || x.status === '待驗收'; }); };
  var doing = mine.filter(function (t) { return t.status === '進行中'; });
  var ready = mine.filter(function (t) { return (t.status === '未開始' || t.status === '暫停') && predsDone(t); });
  var waiting = mine.filter(function (t) { return (t.status === '未開始' || t.status === '暫停') && !predsDone(t); });
  var review = mine.filter(function (t) { return t.status === '待驗收'; });
  var dueWeek = mine.filter(function (t) { return t.status !== '待驗收' && t.end && dn(t.end) <= today + 7; }).length;
  var lanes = [
    ['進行中', doing, ST_HEX['進行中'], '現在沒有進行中的工作，可以從「可以開始」挑一項。'],
    ['可以開始', ready, ST_HEX['未開始'], '前置都完成、排到你的工作會出現在這裡。'],
    ['等待前置', waiting, '#a25ddc', '沒有在等別人的工作。'],
    ['已送驗收', review, ST_HEX['待驗收'], 'PM 確認後會標成完成。']
  ];
  var pmReview = isPM() ? d.tasks.filter(function (t) { return t.status === '待驗收' && canEdit(t); }) : [];
  if (pmReview.length) lanes.unshift(['等你驗收', pmReview, ST_HEX['完成'], '']);
  var h = '<div class="mine-h"><div class="stats">' +
    '<div class="stat"><b>' + doing.length + '</b><span>進行中</span></div><div class="stat"><b>' + ready.length + '</b><span>可以開始</span></div>' +
    '<div class="stat"><b>' + waiting.length + '</b><span>等待前置</span></div><div class="stat"><b' + (dueWeek ? ' style="color:var(--warn)"' : '') + '>' + dueWeek + '</b><span>七天內要完成</span></div>' +
    (pmReview.length ? '<div class="stat"><b style="color:var(--accent)">' + pmReview.length + '</b><span>等你驗收</span></div>' : '') + '</div></div>';
  h += '<div class="lanes">';
  lanes.forEach(function (L) {
    h += '<div class="lane"><h3><span class="bar" style="background:' + L[2] + '"></span>' + L[0] + '<span class="c">' + L[1].length + '</span>' +
      (L[0] === '等你驗收' && L[1].length > 1 ? '<button class="btn sm" id="confirmAll" style="margin-left:auto">全部確認完成</button>' : '') + '</h3>';
    if (!L[1].length) h += '<div class="card empty" style="padding:18px;font-size:13px">' + L[3] + '</div>';
    L[1].slice(0, 60).forEach(function (t) { h += mineCard(t, L[0]); });
    h += '</div>';
  });
  h += '</div>';
  c.innerHTML = h;
  var w = $('#mWho'); if (w) w.addEventListener('change', function (e) { go('mine/' + encodeURIComponent(e.target.value)); });
  $$('[data-act]', c).forEach(function (b) {
    b.addEventListener('click', function () {
      var t = byId[b.dataset.id], st = b.dataset.act;
      patchTask(t.id, { status: st }, { '進行中': '已開始：', '待驗收': '已送驗收：', '完成': '已確認完成：' }[st] + t.title);
    });
  });
  $$('[data-step]', c).forEach(function (b) {
    b.addEventListener('click', function () {
      var t = byId[b.dataset.id], v = Math.max(0, Math.min(Number(t.qty) || 1, (Number(t.doneQty) || 0) + Number(b.dataset.step)));
      if (v !== Number(t.doneQty)) patchTask(t.id, { doneQty: v });
    });
  });
  $$('[data-open]', c).forEach(function (b) { b.addEventListener('click', function () { openTask(b.dataset.open); }); });
  var ca = $('#confirmAll');
  if (ca) ca.addEventListener('click', function () {
    if (!confirm('把 ' + pmReview.length + ' 個待驗收的工項全部標為完成？')) return;
    busy(true);
    call('bulkStatus', pmReview.map(function (t) { return t.id; }), '完成').then(function (r) { busy(false); r.tasks.forEach(upsert); applyComputed(r.computed); toast('已確認 ' + r.tasks.length + ' 項'); render(); }).catch(fail);
  });
}
function mineCard(t, lane) {
  var up = canUpdate(t), qty = Number(t.qty) || 1, done = Number(t.doneQty) || 0;
  var h = '<div class="tcard" style="border-left-color:' + pcolor(t.project) + '"><div class="t">' + esc(t.title) + '</div>' +
    '<div class="m"><span>' + esc(projName(t.project)) + (t.group ? '・' + esc(t.group) : '') + '</span><span>' + esc(t.days) + ' 天</span><span>預計 ' + md(t.start) + ' – ' + md(t.end) + '</span>' + (lane === '等你驗收' ? person(t.owner) : '') + '</div>';
  (t.warns || []).slice(0, 2).forEach(function (w) { h += '<div style="margin-top:6px"><span class="wtag ' + sev(w) + '">' + esc(w) + '</span></div>'; });
  if (lane === '等待前置') split(t.preds).forEach(function (p) { var x = byId[p]; if (x && x.status !== '完成' && x.status !== '待驗收') h += '<div class="wait">等 <b>' + esc(x.owner || '未指派') + '</b> 的「' + esc(x.title) + '」，預計 ' + md(x.end) + ' 完成</div>'; });
  h += '<div class="acts">';
  if (lane === '進行中' && up && qty > 1) h += '<span class="stepper"><button data-step="-1" data-id="' + esc(t.id) + '">−</button><span>' + done + ' / ' + qty + '</span><button data-step="1" data-id="' + esc(t.id) + '">＋</button></span>';
  if (lane === '可以開始' && up) h += '<button class="btn primary" data-act="進行中" data-id="' + esc(t.id) + '">開始</button>';
  if (lane === '進行中' && up) h += '<button class="btn primary" data-act="待驗收" data-id="' + esc(t.id) + '">送驗收</button>';
  if (lane === '等你驗收') h += '<button class="btn primary" data-act="完成" data-id="' + esc(t.id) + '">確認完成</button><button class="btn" data-act="進行中" data-id="' + esc(t.id) + '">退回修改</button>';
  h += '<button class="btn ghost" data-open="' + esc(t.id) + '">詳細</button></div></div>';
  return h;
}

/* ---------------- 人員排程 ---------------- */
function renderPeople(c) {
  var d = S.data, today = dn(d.today), q = S.q.trim().toLowerCase();
  setTitle('<span class="t">人員排程</span>');
  if (isPM()) setActions('<button class="btn" id="leaveBtn">登記休假</button> <button class="btn" id="exportBtn">下載個人排程表</button>');
  c.className = 'content flush';
  var h = '<div class="toolbar"><span class="search">' + IC.search + '<input type="search" class="field" id="pQ" placeholder="搜尋人名" value="' + esc(S.q) + '"></span>' +
    '<select class="field" id="pProj"><option value="">所有專案</option>' + d.projects.filter(function (p) { return p.status !== '封存'; }).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === S.peopleProject ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
    '<span class="seg">' + [[30, '1 個月'], [90, '3 個月'], [180, '半年']].map(function (o) { return '<button data-rg="' + o[0] + '" class="' + (S.peopleRange == o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</span>' +
    '<span class="grow"></span><span class="legend hide-m">' + d.projects.filter(function (p) { return p.status !== '封存'; }).map(function (p) { return '<span><i style="background:' + pcolor(p.id) + '"></i>' + esc(p.name) + '</span>'; }).join('') + '<span><i style="background:repeating-linear-gradient(135deg,var(--ok) 0 3px,transparent 3px 6px)"></i>休假</span></span></div>';
  var min = today - 7, max = today + Number(S.peopleRange);
  var W = S.peopleRange > 120 ? 6 : S.peopleRange > 45 ? 13 : 28, LH = 26;
  var x = function (n) { return (n - min) * W; };
  var by = {};
  d.tasks.forEach(function (t) {
    if (!t.owner || !t.start || t.status === '取消') return;
    if (S.peopleProject && t.project !== S.peopleProject) return;
    if (dn(t.end) < min || dn(t.start) > max) return;
    (by[t.owner] = by[t.owner] || []).push(t);
  });
  var people = d.people.filter(function (p) { return (by[p.name] || []).length && (!q || (p.name + ' ' + (p.alias || '')).toLowerCase().indexOf(q) >= 0); })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hant'); });
  var layout = people.map(function (p) {
    var ts = by[p.name].sort(sortTasks), lanes = [];
    ts.forEach(function (t) { var a = dn(t.start), k = 0; while (lanes[k] !== undefined && lanes[k] >= a) k++; lanes[k] = dn(t.end); t._lane = k; });
    var cap = 0, used = 0;
    for (var n = today; n < today + 30; n++) if (!isOff(n)) cap++;
    ts.forEach(function (t) {
      if (t.mode === '平行' || t.status === '完成') return;
      var all = 0, inw = 0;
      for (var n = dn(t.start); n <= dn(t.end); n++) if (!isOff(n)) { all++; if (n >= today && n < today + 30) inw++; }
      used += all ? Number(t.days) * inw / all : 0;
    });
    return { p: p, ts: ts, lanes: Math.max(1, lanes.length), cap: cap, used: used };
  });
  var top = 0; layout.forEach(function (L) { L.top = top; L.h = Math.max(48, L.lanes * LH + 10); top += L.h; });
  if (!layout.length) { c.innerHTML = h + '<div class="card empty" style="margin:0 22px"><b>這段期間沒有排程</b>換個時間範圍或專案試試。</div>'; bindPeople(); return; }
  var width = (max - min + 1) * W;
  h += '<div class="gwrap"><div class="gleft" style="width:210px"><div class="ghead">人員（點名字調整工作順序）</div><div class="glist" id="gList"><div style="height:' + (top + 30) + 'px">';
  layout.forEach(function (L) {
    var pct = L.cap ? L.used / L.cap * 100 : 0;
    h += '<div class="pname" data-p="' + esc(L.p.name) + '" style="height:' + L.h + 'px">' + avatar(L.p.name) + '<div class="who"><b>' + esc(L.p.name) + '</b><span class="hint">未來 30 天 ' + Math.round(L.used * 10) / 10 + ' / ' + L.cap + ' 天</span><div class="load"><i class="' + (pct > 100 ? 'over' : '') + '" style="width:' + Math.min(100, pct) + '%"></i></div></div></div>';
  });
  h += '</div></div></div><div class="gright" id="gRight"><div style="width:' + width + 'px;position:relative"><div class="gtime" style="width:' + width + 'px">';
  for (var n = min; n <= max; n++) {
    var s = ds(n), dd = +s.slice(8);
    if (dd === 1 || n === min) h += '<div class="m" style="left:' + (x(n) + 4) + 'px">' + s.slice(0, 4) + '/' + (+s.slice(5, 7)) + '</div>';
    if (W >= 20) h += '<div style="left:' + x(n) + 'px;top:26px;width:' + W + 'px;text-align:center;' + (isOff(n) ? 'color:var(--ink3)' : '') + '">' + dd + '</div>';
    else if (wk(n) === 1) h += '<div style="left:' + x(n) + 'px;top:26px">' + md(s) + '</div>';
  }
  h += '</div><div class="gbody" style="height:' + top + 'px">';
  for (n = min; n <= max; n++) if (isOff(n)) h += '<div class="goff" style="left:' + x(n) + 'px;width:' + W + 'px"></div>';
  h += '<div class="gtoday" style="left:' + (x(today) + W / 2 - 1) + 'px"></div>';
  layout.forEach(function (L) {
    h += '<div class="prow" style="top:' + L.top + 'px;height:' + L.h + 'px"></div>';
    d.leaves.forEach(function (l) {
      if (l.person !== L.p.name) return;
      var a = Math.max(dn(l.start), min), b = Math.min(dn(l.end) || dn(l.start), max);
      if (b >= a) h += '<div class="leave" style="left:' + x(a) + 'px;width:' + ((b - a + 1) * W) + 'px;top:' + L.top + 'px;height:' + L.h + 'px" title="' + esc((l.type || '休假') + ' ' + l.start + '~' + l.end + ' ' + (l.note || '')) + '"></div>';
    });
    L.ts.forEach(function (t) {
      var a = x(Math.max(dn(t.start), min)), b = x(Math.min(dn(t.end), max) + 1);
      h += '<div class="gbar ro' + (t.mode === '平行' ? ' par' : '') + (worst(t) === 'd' ? ' bad' : '') + (t.status === '完成' ? ' done' : '') + '" data-id="' + esc(t.id) + '" style="left:' + a + 'px;width:' + Math.max(b - a - 2, 6) + 'px;top:' + (L.top + 6 + t._lane * LH) + 'px;background-color:' + pcolor(t.project) + '" title="' + esc(projName(t.project) + '｜' + t.title + '\n' + t.status + '｜' + t.start + ' ~ ' + t.end + '｜' + t.days + ' 天') + '"><span class="lbl">' + (W >= 13 ? esc(t.title) : '') + '</span></div>';
    });
  });
  h += '</div></div></div></div>';
  c.innerHTML = h;
  bindPeople();
  var gr = $('#gRight'), gl = $('#gList');
  gr.addEventListener('scroll', function () { if (gl.scrollTop !== gr.scrollTop) gl.scrollTop = gr.scrollTop; });
  gl.addEventListener('scroll', function () { if (gr.scrollTop !== gl.scrollTop) gr.scrollTop = gl.scrollTop; });
  gl.addEventListener('wheel', function (e) { gr.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
  $$('.gbar', c).forEach(function (el) { el.addEventListener('click', function () { openTask(el.dataset.id); }); });
  $$('.pname', c).forEach(function (el) { el.addEventListener('click', function () { openQueue(el.dataset.p); }); });
}
function bindPeople() {
  var on = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };
  on('#pQ', 'input', debounce(function (e) { S.q = e.target.value; render(); var n = $('#pQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250));
  on('#pProj', 'change', function (e) { S.peopleProject = e.target.value; render(); });
  $$('[data-rg]').forEach(function (b) { b.addEventListener('click', function () { S.peopleRange = Number(b.dataset.rg); remember(); render(); }); });
  on('#leaveBtn', 'click', function () { openLeave(''); });
  on('#exportBtn', 'click', openExport);
}

/* ---------------- 工項詳細 ---------------- */
var D = { cur: null, preds: [], full: false, isNew: false };
function ensureDrawer() {
  if ($('#drawer')) return;
  var dr = document.createElement('div'); dr.className = 'drawer'; dr.id = 'drawer';
  dr.innerHTML = '<div class="hd"></div><div class="tabs2"><button data-dt="info" class="on">內容</button><button data-dt="log">修改紀錄</button></div><div class="bd" id="dBody"></div><div class="ft" id="dFoot"></div>';
  document.body.appendChild(dr);
  $$('[data-dt]', dr).forEach(function (b) { b.addEventListener('click', function () { $$('[data-dt]', dr).forEach(function (x) { x.classList.toggle('on', x === b); }); if (b.dataset.dt === 'log') showTaskLog(); else drawerBody(); }); });
}
function closeDrawer() { var d = $('#drawer'); if (d && d.classList.contains('open')) { d.classList.remove('open'); D.cur = null; render(); } }
function openTask(id, preset) {
  ensureDrawer(); closePop();
  var t = id ? byId[id] : null;
  D.isNew = !t;
  if (!t) {
    t = { id: '', project: (preset && preset.project) || S.route.project || (S.data.projects.filter(function (p) { return p.canEdit && p.status !== '封存'; })[0] || {}).id, group: '', title: '', detail: '', owner: '', helper: '', mode: '排隊', days: 1, preds: '', lag: 0, earliest: '', release: '', status: '未開始', doneQty: 0, qty: 1, astart: '', aend: '', note: '', tag: '', code: '', warns: [] };
    Object.keys(preset || {}).forEach(function (k) { t[k] = preset[k]; });
  }
  D.cur = t; D.preds = split(t.preds);
  D.full = D.isNew ? !!(projById[t.project] || {}).canEdit : canEdit(t);
  D.upd = D.full || canUpdate(t);
  var dr = $('#drawer');
  $$('[data-dt]', dr).forEach(function (x) { x.classList.toggle('on', x.dataset.dt === 'info'); });
  $('[data-dt=log]', dr).classList.toggle('hidden', D.isNew);
  $('.hd', dr).innerHTML = '<div class="r1"><span class="dot" style="width:10px;height:10px;border-radius:3px;background:' + pcolor(t.project) + '"></span><span class="muted" style="font-size:13px">' + esc(projName(t.project)) + '</span><span class="id">' + esc(t.id || '新工項') + '</span><span style="flex:1"></span><button class="btn ghost icon" id="dClose" title="關閉（Esc）">✕</button></div>' +
    '<input class="ttl" id="dTitle" value="' + esc(t.title) + '" placeholder="工項名稱"' + (D.full ? '' : ' readonly') + '>';
  $('#dClose').addEventListener('click', closeDrawer);
  drawerBody();
  dr.classList.add('open');
  if (D.isNew) setTimeout(function () { $('#dTitle').focus(); }, 60);
}
function drawerBody() {
  var t = D.cur, full = D.full, isNew = D.isNew;
  var mine = !isNew && t.owner === S.data.me.name;
  // 進度（狀態、完成數量、實際日期）由製作人員回報；PM 只做驗收（完成、退回、暫停、取消）
  var progEdit = !isNew && (mine || isAdmin());
  var statusEdit = !isNew && (mine || full);
  var inp = function (k, type, en, extra) { return '<input class="field" name="' + k + '" type="' + (type || 'text') + '" value="' + esc(t[k]) + '"' + (en ? '' : ' disabled') + (type === 'number' ? ' step="0.5" min="0"' : '') + (extra || '') + '>'; };
  var sel = function (k, opts, en) { return '<select class="field" name="' + k + '"' + (en ? '' : ' disabled') + '>' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(t[k]) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>'; };
  var h = '';
  if (!isNew) {
    (t.warns || []).forEach(function (w) { h += '<div class="box ' + sev(w) + '">' + esc(w) + '</div>'; });
    if (t.info) h += '<div class="box">' + esc(t.info) + '</div>';
  }
  h += '<div id="impact"></div>';

  /* ---- 規劃（PM） ---- */
  h += '<div class="sect"><div class="sect-h">' + (isNew ? '' : '規劃') + (!full && !isNew ? '<span class="faint">由 PM 設定</span>' : '') + '</div><div class="props">';
  h += '<label>負責</label><div>' + sel('owner', [['', '未指派']].concat(S.data.people.map(function (p) { return [p.name, p.name + (p.role !== '美術' ? '（' + p.role + '）' : '')]; })), full) + '</div>';
  h += '<label>天數</label><div>' + inp('days', 'number', full, ' style="max-width:120px"') + '<span class="hint">工作天，可以有小數</span></div>';
  h += '<label>前置工項</label><div class="ac" style="display:block"><div id="predChips"></div>' + (full ? '<input class="field" id="predInput" placeholder="要先完成哪些工作？搜尋名稱或 ID" autocomplete="off" style="margin-top:4px"><div class="list2 hidden" id="predList"></div>' : '') + '</div>';
  h += '<label>出版日／期限</label><div>' + inp('release', 'date', full, ' style="max-width:180px"') + '</div>';
  h += '<label>群組</label><div>' + inp('group', 'text', full, ' list="grpList" placeholder="例如角色名稱或版本"') + '<datalist id="grpList">' + Object.keys(S.data.tasks.reduce(function (m, x) { if (x.project === t.project && x.group) m[x.group] = 1; return m; }, {})).map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></div>';
  if (!isNew) h += '<label>系統預計</label><div><b>' + md(t.start) + ' – ' + md(t.end) + '</b>' + (t.baseline ? '<span class="faint">基準 ' + md(t.baseline) + '</span>' : '') + (t.slip > 0 ? '<span class="wtag w">晚 ' + t.slip + ' 天</span>' : '') + '</div>';
  h += '</div>';
  h += '<details class="more"' + (D.moreOpen ? ' open' : '') + '><summary>更多設定</summary><div class="props">';
  h += '<label>說明</label><div><textarea class="field" name="detail" rows="2"' + (full ? '' : ' disabled') + '>' + esc(t.detail) + '</textarea></div>';
  h += '<label>最早開始</label><div>' + inp('earliest', 'date', full, ' style="max-width:180px"') + '<span class="hint">不早於這天開始</span></div>';
  h += '<label>等前置完成後</label><div>' + inp('lag', 'number', full, ' style="max-width:120px"') + '<span class="hint">再等幾個工作天（例如審核）</span></div>';
  h += '<label>排程方式</label><div>' + sel('mode', [['排隊', '排隊：佔用負責人時間'], ['平行', '平行：不佔用（監修外包）']], full) + '</div>';
  h += '<label>協力（外包）</label><div>' + inp('helper', 'text', full) + '</div>';
  h += '<label>標籤</label><div>' + inp('tag', 'text', full, ' placeholder="版本、階段"') + '</div>';
  h += '<label>編號</label><div>' + inp('code', 'text', full) + '</div>';
  h += '<label>數量</label><div>' + inp('qty', 'number', full, ' style="max-width:120px"') + '<span class="hint">有多張圖時填總數，方便回報進度</span></div>';
  h += '<label>專案</label><div>' + sel('project', S.data.projects.filter(function (p) { return p.canEdit || p.id === t.project; }).map(function (p) { return [p.id, p.name]; }), full) + '</div>';
  h += '</div></details></div>';

  /* ---- 進度（製作人員） ---- */
  if (!isNew) {
    var stOpts = full && !mine ? STATUSES : full ? STATUSES : ['未開始', '進行中', '待驗收'].concat(['未開始', '進行中', '待驗收'].indexOf(t.status) < 0 ? [t.status] : []);
    h += '<div class="sect"><div class="sect-h">進度' + (progEdit ? '' : '<span class="faint">由 ' + esc(t.owner || '負責人') + ' 回報</span>') + '</div><div class="props">';
    h += '<label>狀態</label><div>' + sel('status', stOpts, statusEdit) + (full && !mine ? '<span class="hint">驗收時改成「完成」或退回「進行中」</span>' : '') + '</div>';
    h += '<label>完成數量</label><div>' + inp('doneQty', 'number', progEdit, ' style="max-width:100px"') + '<span class="faint">/ ' + esc(t.qty || 1) + '</span></div>';
    h += '<label>實際開始</label><div>' + inp('astart', 'date', progEdit, ' style="max-width:180px"') + (progEdit ? '<span class="hint">按「開始」會自動填今天</span>' : '') + '</div>';
    h += '<label>實際完成</label><div>' + inp('aend', 'date', progEdit, ' style="max-width:180px"') + '</div>';
    h += '<label>備註</label><div><textarea class="field" name="note" rows="2"' + (mine || full ? '' : ' disabled') + '>' + esc(t.note) + '</textarea></div>';
    h += '</div></div>';
  }
  var downs = succ[t.id] || [];
  if (downs.length) h += '<div style="margin-top:4px;font-size:13px"><b>下游工項</b> <span class="faint">這項延誤會影響</span><div style="margin-top:6px">' + downs.map(function (s) { var x = byId[s]; return '<span class="chip" data-jump="' + esc(s) + '" style="cursor:pointer;margin-bottom:4px"><span class="d" style="background:' + (x ? ST_HEX[x.status] : '#999') + '"></span>' + esc(x ? x.title : s) + '</span>'; }).join('') + '</div></div>';
  if (!isNew && t.by) h += '<div class="hint" style="margin-top:14px">最後修改：' + esc(t.by) + ' ' + esc(t.updatedAt || '') + '</div>';
  $('#dBody').innerHTML = h;
  var canSave = full || mine || isAdmin();
  var f = '';
  if (canSave) f += '<button class="btn primary" id="dSave">' + (isNew ? '建立工項' : '儲存') + '</button>';
  if (isNew) f += '<button class="btn" id="dSaveNext">建立並繼續新增</button>';
  if (full && !isNew) f += '<button class="btn" id="dNext">' + IC.plus + '新增下一步</button><button class="btn" id="dDup">複製</button><span style="flex:1"></span><button class="btn danger" id="dDel">刪除</button>';
  $('#dFoot').innerHTML = f;
  renderPredChips();
  var body = $('#dBody');
  var more = $('details.more', body); if (more) more.addEventListener('toggle', function () { D.moreOpen = more.open; });
  $$('[data-jump]', body).forEach(function (el) { el.addEventListener('click', function () { openTask(el.dataset.jump); }); });
  $$('.field', body).forEach(function (el) { el.addEventListener('change', previewSoon); });
  if (full) bindPredInput();
  var on = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
  on('#dSave', function () { saveDrawer(false); });
  on('#dSaveNext', function () { saveDrawer(true); });
  on('#dDel', function () {
    if (!confirm('刪除「' + t.title + '」？刪除後無法復原。若只是不做了，建議把狀態改成「取消」。')) return;
    busy(true);
    call('deleteTask', t.id).then(function (r) { removeTask(t.id); applyComputed(r.computed); busy(false); closeDrawer(); toast('已刪除'); }).catch(fail);
  });
  on('#dDup', function () { var c = Object.assign({}, t, { id: '', status: '未開始', astart: '', aend: '', doneQty: 0, title: t.title + '（複製）', warns: [] }); openTask(null, c); });
  on('#dNext', function () { openTask(null, { project: t.project, group: t.group, preds: t.id, release: t.release, tag: t.tag }); });
}
function showTaskLog() {
  var b = $('#dBody'); b.innerHTML = '<div class="muted">載入中…</div>'; $('#dFoot').innerHTML = '';
  call('getTaskLog', D.cur.id).then(function (rows) {
    b.innerHTML = rows.length ? rows.map(function (r) { var t = new Date(new Date(r.at).getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' '); return '<div class="log-i"><div class="w">' + t + '　' + esc(r.email) + '　' + esc(r.action) + '</div>' + esc(r.content.replace(/^【[^】]*】；?/, '')) + '</div>'; }).join('') : '<div class="empty">還沒有修改紀錄。</div>';
  }).catch(function (e) { b.innerHTML = '<div class="box d">' + esc(e.message) + '</div>'; });
}
function renderPredChips() {
  var box = $('#predChips'); if (!box) return;
  box.innerHTML = D.preds.length ? D.preds.map(function (p) {
    var x = byId[p];
    return '<span class="chip" style="margin-bottom:4px"><span class="d" style="background:' + (x ? ST_HEX[x.status] : '#999') + '"></span>' + esc(x ? x.title : p) + (x ? ' <span class="faint">' + esc(x.owner || '未指派') + '・' + md(x.end) + '</span>' : '') + (D.full ? ' <a href="javascript:void 0" data-rm="' + esc(p) + '" style="color:var(--ink3);text-decoration:none">✕</a>' : '') + '</span>';
  }).join('') : '<span class="faint" style="font-size:13px">沒有前置，可以直接開始</span>';
  $$('[data-rm]', box).forEach(function (b) { b.addEventListener('click', function () { D.preds = D.preds.filter(function (x) { return x !== b.dataset.rm; }); renderPredChips(); previewSoon(); }); });
}
function bindPredInput() {
  var inp = $('#predInput'), list = $('#predList'), hits = [], hi = 0;
  var draw = function () {
    list.innerHTML = hits.map(function (t, i) { return '<div data-i="' + i + '" class="' + (i === hi ? 'hi' : '') + '">' + esc(t.title) + ' <span class="faint">' + esc(t.id) + '・' + esc(t.owner || '未指派') + '・' + esc(projName(t.project)) + '</span></div>'; }).join('');
    list.classList.toggle('hidden', !hits.length);
    $$('div', list).forEach(function (el) { el.addEventListener('mousedown', function (e) { e.preventDefault(); add(hits[+el.dataset.i]); }); });
  };
  var add = function (t) { if (!t) return; if (D.preds.indexOf(t.id) < 0) D.preds.push(t.id); inp.value = ''; hits = []; draw(); renderPredChips(); previewSoon(); };
  inp.addEventListener('input', function () {
    var q = inp.value.trim().toLowerCase(), proj = $('[name=project]').value;
    hits = !q ? [] : S.data.tasks.filter(function (t) { return t.id !== D.cur.id && D.preds.indexOf(t.id) < 0 && t.status !== '取消' && (t.id.toLowerCase().indexOf(q) >= 0 || (t.title + ' ' + t.group + ' ' + t.owner).toLowerCase().indexOf(q) >= 0); })
      .sort(function (a, b) { return (b.project === proj) - (a.project === proj) || (a.status === '完成') - (b.status === '完成') || sortTasks(a, b); }).slice(0, 30);
    hi = 0; draw();
  });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, hits.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); add(hits[hi]); }
  });
  inp.addEventListener('blur', function () { setTimeout(function () { hits = []; draw(); }, 150); });
}
function formValues() {
  var o = {};
  $$('[name]', $('#dBody')).forEach(function (el) { if (!el.disabled) o[el.name] = el.value; });
  var tt = $('#dTitle'); if (tt && !tt.readOnly) o.title = tt.value.trim();
  if (D.full) o.preds = D.preds.join(', ');
  ['days', 'lag', 'doneQty', 'qty'].forEach(function (k) { if (k in o && o[k] !== '') o[k] = Number(o[k]); });
  return o;
}
var previewSoon = debounce(function () {
  if (!D.cur || !D.full) return;
  var box = $('#impact'); if (!box) return;
  var o = formValues(); o.id = D.cur.id;
  call('previewTask', o).then(function (r) {
    if (!D.cur || !$('#impact')) return;
    if (r.error) { box.innerHTML = '<div class="box d">' + esc(r.error) + '</div>'; return; }
    var later = r.items.filter(function (x) { return x.delta > 0; }), earlier = r.items.filter(function (x) { return x.delta < 0; }), late = r.items.filter(function (x) { return x.late; });
    var h = '<div class="box' + (late.length ? ' d' : (later.length ? ' w' : '')) + '"><b>儲存後</b>這項預計 ' + md(r.self.start) + ' – ' + md(r.self.end);
    if (!r.total) h += '，不會影響其他工項。';
    else {
      h += '；' + (later.length ? later.length + ' 個工項延後' : '') + (later.length && earlier.length ? '、' : '') + (earlier.length ? earlier.length + ' 個提前' : '') + (late.length ? '，<b>' + late.length + ' 個會超過出版日</b>' : '') + '<ul>';
      r.items.slice(0, 8).forEach(function (x) { h += '<li>' + esc(x.title) + ' <span class="faint">' + esc(x.owner) + '</span>　' + md(x.from) + ' → <b>' + md(x.to) + '</b>（' + (x.delta > 0 ? '+' : '') + x.delta + ' 天）' + (x.late ? ' <span class="late">超過出版日</span>' : '') + '</li>'; });
      if (r.total > 8) h += '<li class="faint">還有 ' + (r.total - 8) + ' 項</li>';
      h += '</ul>';
    }
    box.innerHTML = h + '</div>';
  }).catch(function (e) { if ($('#impact')) box.innerHTML = '<div class="box d">' + esc(e.message) + '</div>'; });
}, 400);
function saveDrawer(again) {
  var o = formValues();
  if (D.full && !o.title) { toast('請填工項名稱', true); $('#dTitle').focus(); return; }
  if (!D.isNew) {
    var id = D.cur.id, patch = {};
    Object.keys(o).forEach(function (k) { if (k in D.cur) patch[k] = o[k]; });
    $('#drawer').classList.remove('open'); D.cur = null;
    saveLater(id, patch, function (cur) { o.id = cur.id; o.at = cur.at; return call('saveTask', o); }, '已儲存');
    return;
  }
  busy(true);
  call('saveTask', o).then(function (r) {
    upsert(r.task); applyComputed(r.computed); busy(false); toast('已建立「' + r.task.title + '」');
    if (again) { openTask(null, { project: o.project, group: o.group, release: o.release, preds: '' }); render(); return; }
    $('#drawer').classList.remove('open'); D.cur = null; render();
  }).catch(fail);
}
document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'dTitle' && D.full) { e.preventDefault(); saveDrawer(false); } });

/* ---------------- 對話框 ---------------- */
function modal(html) {
  closeModal();
  var mk = document.createElement('div'); mk.className = 'mask'; mk.addEventListener('click', closeModal);
  var m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.innerHTML = html;
  document.body.appendChild(mk); document.body.appendChild(m);
  var f = m.querySelector('input:not([type=file]),select,textarea'); if (f) setTimeout(function () { f.focus(); }, 30);
  return m;
}
function closeModal() { $$('.mask, .modal').forEach(function (e) { e.remove(); }); }
function peopleOptions(sel) { return '<option value="">未指派</option>' + S.data.people.map(function (p) { return '<option' + (p.name === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); }

function openTemplate() {
  var tpls = S.data.templates, pid = S.route.project;
  if (!tpls.length) { toast('還沒有範本，請到「設定 → 範本」建立。', true); return; }
  var h = '<h3>套用範本</h3><div class="form">';
  h += '<label>範本<select class="field" id="tName">' + tpls.map(function (t) { return '<option>' + esc(t.name) + '</option>'; }).join('') + '</select></label>';
  h += '<label>名稱前綴（例如角色名）<input class="field" id="tPrefix" placeholder="cr120 新角色"></label>';
  h += '<label>群組<input class="field" id="tGroup" placeholder="預設用範本裡的群組"></label>';
  h += '<label>出版日（選填）<input class="field" id="tRelease" type="date"></label>';
  h += '<label>接在哪個工項之後（選填，填 ID）<input class="field" id="tAfter" placeholder="T00123"></label>';
  h += '<label>最早開始（選填）<input class="field" id="tEarliest" type="date"></label></div>';
  h += '<div id="tSteps" style="margin-top:16px"></div><div class="mfoot"><button class="btn" id="tCancel">取消</button><button class="btn primary" id="tGo">建立工項</button></div>';
  var m = modal(h);
  var draw = function () {
    var t = tpls.filter(function (x) { return x.name === $('#tName').value; })[0];
    $('#tSteps').innerHTML = '<table><thead><tr><th>步驟</th><th>工項</th><th>要等</th><th>負責</th><th>天數</th></tr></thead><tbody>' + t.steps.map(function (s) {
      return '<tr><td>' + s.step + '</td><td>' + esc(s.title) + (s.mode === '平行' ? ' <span class="chip">平行</span>' : '') + '</td><td>' + esc(s.preds ? '步驟 ' + s.preds : '—') + '</td><td><select class="field" data-o="' + s.step + '">' + peopleOptions('') + '</select></td><td><input class="field" style="width:76px" type="number" step="0.5" data-d="' + s.step + '" value="' + esc(s.days) + '"></td></tr>';
    }).join('') + '</tbody></table><div class="hint" style="margin-top:6px">建立後會自動串好相依：前一步完成，下一步才會排進負責人的時程。</div>';
  };
  $('#tName').addEventListener('change', draw); draw();
  $('#tCancel').addEventListener('click', closeModal);
  $('#tGo').addEventListener('click', function () {
    var owners = {}, days = {};
    $$('[data-o]', m).forEach(function (e) { owners[e.dataset.o] = e.value; });
    $$('[data-d]', m).forEach(function (e) { days[e.dataset.d] = e.value === '' ? '' : Number(e.value); });
    busy(true);
    call('applyTemplate', { project: pid, template: $('#tName').value, prefix: $('#tPrefix').value.trim(), group: $('#tGroup').value.trim(), release: $('#tRelease').value, after: $('#tAfter').value.trim(), earliest: $('#tEarliest').value, owners: owners, days: days })
      .then(function (r) { r.tasks.forEach(upsert); applyComputed(r.computed); busy(false); closeModal(); toast('已建立 ' + r.created.length + ' 個工項並串好相依'); render(); }).catch(fail);
  });
}

var BULK_COLS = [
  ['group', '群組', 140, '例如 新角色A'], ['title', '工項名稱', 200, '必填'], ['owner', '負責', 110, '人員姓名'], ['days', '天數', 70, '1'],
  ['preds', '前置', 110, '#1 或 T00123'], ['release', '出版日', 120, '2026-12-01'], ['detail', '說明', 200, '']
];
var BULK_HELP = '前置可以填工項 ID，或用 #1、#2 表示這次的第幾列（例如第 2 列要等第 1 列完成就填 #1）。';
function openBulk() {
  var pid = S.route.project;
  var h = '<h3>批次新增工項</h3><div class="hint">直接在表格裡填，或從 Excel 複製多列後，點第一格貼上（Ctrl+V）。' + BULK_HELP + '</div>';
  h += '<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap"><button class="btn" id="bTpl">下載空白範本</button><label class="btn" style="cursor:pointer">匯入 Excel 檔<input type="file" id="bFile" accept=".xlsx,.xls,.csv" hidden></label><span class="grow" style="flex:1"></span><button class="btn ghost" id="bClear">清空</button></div>';
  h += '<div class="tablewrap" style="max-height:52vh"><table class="sheet"><thead><tr><th class="rn">#</th>' + BULK_COLS.map(function (c) { return '<th style="min-width:' + c[2] + 'px">' + c[1] + (c[0] === 'title' ? ' <span style="color:var(--danger)">*</span>' : '') + '</th>'; }).join('') + '<th class="msg"></th></tr></thead><tbody id="bBody"></tbody></table></div>';
  h += '<button class="btn ghost sm" id="bAddRow" style="margin-top:6px">' + IC.plus + '加 5 列</button>';
  h += '<datalist id="bPeople">' + S.data.people.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>';
  h += '<div class="mfoot"><span id="bSum" class="muted" style="margin-right:auto;align-self:center"></span><button class="btn" id="bCancel">取消</button><button class="btn primary" id="bGo" disabled>新增</button></div>';
  var m = modal(h);
  m.style.width = 'min(1100px, calc(100vw - 24px))';
  var rows = [];
  for (var i = 0; i < 8; i++) rows.push({});
  var names = {}; S.data.people.forEach(function (p) { names[p.name] = 1; });
  var normDate = function (v) {
    v = String(v || '').trim().replace(/\//g, '-'); if (!v) return '';
    var mm = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v); return mm ? mm[1] + '-' + ('0' + mm[2]).slice(-2) + '-' + ('0' + mm[3]).slice(-2) : v;
  };
  var check = function (r) {
    if (!r.title) return Object.keys(r).some(function (k) { return String(r[k] || '').trim(); }) ? '缺工項名稱' : '';
    if (r.owner && !names[r.owner]) return '名單裡沒有「' + r.owner + '」';
    if (r.days !== '' && r.days !== undefined && (isNaN(Number(r.days)) || Number(r.days) < 0)) return '天數要是數字';
    if (r.release && !/^\d{4}-\d{2}-\d{2}$/.test(normDate(r.release))) return '日期格式：2026-12-01';
    return '';
  };
  var draw = function () {
    $('#bBody').innerHTML = rows.map(function (r, i) {
      var e = check(r);
      return '<tr' + (e ? ' class="bad"' : '') + '><td class="rn">' + (i + 1) + '</td>' + BULK_COLS.map(function (c, j) {
        return '<td><input data-r="' + i + '" data-c="' + j + '" value="' + esc(r[c[0]] || '') + '" placeholder="' + (i === 0 ? esc(c[3]) : '') + '"' + (c[0] === 'owner' ? ' list="bPeople"' : '') + '></td>';
      }).join('') + '<td class="msg">' + esc(e) + '</td></tr>';
    }).join('');
    bindCells(); summary();
  };
  var summary = function () {
    var filled = rows.filter(function (r) { return r.title; }), bad = rows.filter(function (r) { return check(r); });
    $('#bSum').textContent = filled.length ? filled.length + ' 個工項' + (bad.length ? '，' + bad.length + ' 列需要修正' : '') : '';
    $('#bGo').disabled = !filled.length || bad.length > 0;
    $('#bGo').textContent = filled.length ? '新增 ' + filled.length + ' 個工項' : '新增';
  };
  var bindCells = function () {
    $$('#bBody input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var r = rows[+inp.dataset.r]; r[BULK_COLS[+inp.dataset.c][0]] = inp.value;
        var tr = inp.closest('tr'), e = check(r); tr.classList.toggle('bad', !!e); $('.msg', tr).textContent = e; summary();
      });
      inp.addEventListener('paste', function (ev) {
        var text = (ev.clipboardData || window.clipboardData).getData('text');
        if (!/[\t\n]/.test(text)) return;
        ev.preventDefault();
        fill(parseTsv(text), +inp.dataset.r, +inp.dataset.c);
      });
      inp.addEventListener('keydown', function (ev) {
        var r = +inp.dataset.r, c = +inp.dataset.c, go2 = null;
        if (ev.key === 'Enter' || ev.key === 'ArrowDown') go2 = [r + 1, c];
        if (ev.key === 'ArrowUp') go2 = [r - 1, c];
        if (go2) { ev.preventDefault(); if (go2[0] >= rows.length) { rows.push({}); draw(); } var n = $('#bBody input[data-r="' + go2[0] + '"][data-c="' + go2[1] + '"]'); if (n) n.focus(); }
      });
    });
  };
  var parseTsv = function (text) {
    return text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
  };
  var isHeader = function (cells) { return cells.some(function (v) { return /工項名稱|群組|負責/.test(String(v)); }); };
  var fill = function (grid, r0, c0) {
    if (grid.length && isHeader(grid[0])) grid = grid.slice(1);
    grid.forEach(function (cells, i) {
      var r = r0 + i; while (rows.length <= r) rows.push({});
      cells.forEach(function (v, j) { var col = BULK_COLS[c0 + j]; if (col) rows[r][col[0]] = col[0] === 'release' ? normDate(v) : String(v).trim(); });
    });
    draw(); toast('已貼上 ' + grid.length + ' 列');
  };
  draw();
  $('#bAddRow').addEventListener('click', function () { for (var i = 0; i < 5; i++) rows.push({}); draw(); });
  $('#bClear').addEventListener('click', function () { rows = []; for (var i = 0; i < 8; i++) rows.push({}); draw(); });
  $('#bCancel').addEventListener('click', closeModal);
  $('#bTpl').addEventListener('click', function () { busy(true); need('ExcelJS').then(downloadBulkTemplate).then(function () { busy(false); }).catch(fail); });
  $('#bFile').addEventListener('change', function (ev) {
    var file = ev.target.files[0]; if (!file) return;
    busy(true);
    need('XLSX').then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets['工項'] || wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd' });
      var hi = aoa.findIndex(isHeader);
      if (hi < 0) throw new Error('找不到標題列，請用「下載空白範本」的格式。');
      var head = aoa[hi].map(function (x) { return String(x).replace(/\s|\*/g, ''); });
      var idx = BULK_COLS.map(function (c) { return head.indexOf(c[1]); });
      var data = aoa.slice(hi + 1).filter(function (r) { return r.some(function (v) { return String(v).trim(); }); })
        .filter(function (r) { return !/^範例/.test(String(r[idx[0]] || '')); });
      rows = data.map(function (r) { var o = {}; BULK_COLS.forEach(function (c, j) { if (idx[j] >= 0) o[c[0]] = c[0] === 'release' ? normDate(r[idx[j]]) : String(r[idx[j]]).trim(); }); return o; });
      if (!rows.length) rows.push({});
      busy(false); draw(); toast('已讀入 ' + data.length + ' 列，確認後按「新增」');
    }).catch(fail);
    ev.target.value = '';
  });
  $('#bGo').addEventListener('click', function () {
    var list = rows.filter(function (r) { return r.title; }).map(function (r) { return { group: r.group || '', title: r.title, owner: r.owner || '', days: r.days === '' || r.days === undefined ? 1 : Number(r.days), preds: r.preds || '', release: normDate(r.release), detail: r.detail || '' }; });
    // #n 指的是表格裡的列號；空白列會被略過，所以重新對應
    var map = {}, k = 0; rows.forEach(function (r, i) { if (r.title) map[i + 1] = ++k; });
    list.forEach(function (r) { r.preds = split(r.preds).map(function (x) { var mm = /^#(\d+)$/.exec(x); return mm ? (map[mm[1]] ? '#' + map[mm[1]] : x) : x; }).join(', '); });
    busy(true);
    call('bulkAdd', pid, list).then(function (r) { r.tasks.forEach(upsert); applyComputed(r.computed); busy(false); closeModal(); toast('已新增 ' + r.created.length + ' 個工項'); render(); }).catch(fail);
  });
}
function downloadBulkTemplate() {
  var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('工項'), ps = wb.addWorksheet('人員名單');
  ws.columns = BULK_COLS.map(function (c) { return { header: c[1] + (c[0] === 'title' ? ' *' : ''), key: c[0], width: Math.round(c[2] / 7) }; });
  var hr = ws.getRow(1);
  hr.eachCell(function (c) { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B5BD6' } }; c.alignment = { vertical: 'middle' }; });
  hr.height = 22;
  [['範例：新角色A', '角色設定', S.data.people[0] ? S.data.people[0].name : '', 5, '', '', '這兩列範例匯入時會自動略過，可以刪掉'],
   ['範例：新角色A', '立繪', '', 5, '#1', '2026-12-01', '前置 #1 = 要等第 1 列完成']].forEach(function (r) {
    var row = ws.addRow(r); row.eachCell(function (c) { c.font = { italic: true, color: { argb: 'FF9396AA' } }; });
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ps.columns = [{ header: '姓名', key: 'n', width: 16 }, { header: '角色', key: 'r', width: 10 }];
  ps.getRow(1).font = { bold: true };
  S.data.people.forEach(function (p) { ps.addRow([p.name, p.role]); });
  var n = S.data.people.length + 1;
  for (var r = 2; r <= 500; r++) {
    ws.getCell('C' + r).dataValidation = { type: 'list', allowBlank: true, formulae: ['人員名單!$A$2:$A$' + n], showErrorMessage: true, errorTitle: '名單裡沒有這個人', error: '請從下拉選單選擇，或先請管理員新增人員。' };
    ws.getCell('D' + r).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: '天數要是 0 以上的數字' };
  }
  var note = wb.addWorksheet('說明');
  [['欄位', '說明'], ['群組', '工項表上的分組，例如角色名稱或版本'], ['工項名稱', '必填'], ['負責', '從下拉選單選人員；可以空白之後再指派'], ['天數', '工作天，可以有小數（0.5）；空白 = 1'],
   ['前置', '要先完成的工作：填工項 ID（例如 T00123），或 #1、#2 表示這份檔案的第幾個工項；多個用逗號分隔'], ['出版日', '期限，格式 2026-12-01'], ['說明', '選填']].forEach(function (r, i) { var row = note.addRow(r); if (!i) row.font = { bold: true }; });
  note.getColumn(1).width = 12; note.getColumn(2).width = 90;
  return wb.xlsx.writeBuffer().then(function (buf) {
    var url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = document.createElement('a'); a.href = url; a.download = '批次新增工項_範本.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  });
}

function openQueue(name) {
  var list = S.data.tasks.filter(function (t) { return t.owner === name && t.mode !== '平行' && (t.status === '未開始' || t.status === '暫停'); }).sort(function (a, b) { return (a.prio || 0) - (b.prio || 0); });
  var editable = list.length && list.every(canEdit);
  var h = '<h3 style="display:flex;align-items:center;gap:10px">' + avatar(name) + esc(name) + ' 的工作順序</h3><div class="hint">由上到下依序進行（進行中的工作不在這裡）。' + (editable ? '用 ↑ ↓ 調整，儲存後會重算所有人的時程。' : '你沒有調整權限，只能檢視。') + '</div>';
  h += '<table style="margin-top:12px"><thead><tr><th>#</th><th>工項</th><th>專案</th><th>天數</th><th>預計</th><th></th></tr></thead><tbody id="qBody"></tbody></table>';
  h += '<div class="mfoot"><a class="btn ghost" href="#/mine/' + encodeURIComponent(name) + '" id="qMine">看他的工作</a>' + (isPM() ? '<button class="btn" id="qLeave">登記休假</button>' : '') + '<span style="flex:1"></span><button class="btn" id="qClose">關閉</button>' + (editable ? '<button class="btn primary" id="qSave">儲存順序</button>' : '') + '</div>';
  modal(h);
  var order = list.map(function (t) { return t.id; });
  var draw = function () {
    $('#qBody').innerHTML = order.map(function (id, i) {
      var t = byId[id];
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(t.title) + ((t.warns || []).length ? ' <span class="wdot ' + worst(t) + '" title="' + esc(t.warns.join('\n')) + '">!</span>' : '') + '<div class="faint" style="font-size:12px">' + (split(t.preds).length ? '要等 ' + split(t.preds).map(function (p) { return byId[p] ? byId[p].title : p; }).join('、') : '') + '</div></td><td>' + esc(projName(t.project)) + '</td><td>' + esc(t.days) + '</td><td style="white-space:nowrap">' + md(t.start) + ' – ' + md(t.end) + '</td><td style="white-space:nowrap">' + (editable ? '<button class="btn sm" data-u="' + i + '">↑</button> <button class="btn sm" data-dn="' + i + '">↓</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">沒有排隊中的工作</td></tr>';
    $$('[data-u]').forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.u; if (i > 0) { var x = order[i]; order[i] = order[i - 1]; order[i - 1] = x; draw(); } }); });
    $$('[data-dn]').forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.dn; if (i < order.length - 1) { var x = order[i]; order[i] = order[i + 1]; order[i + 1] = x; draw(); } }); });
  };
  draw();
  $('#qClose').addEventListener('click', closeModal);
  $('#qMine').addEventListener('click', closeModal);
  var ql = $('#qLeave'); if (ql) ql.addEventListener('click', function () { openLeave(name); });
  var qs = $('#qSave');
  if (qs) qs.addEventListener('click', function () {
    busy(true);
    call('reorderQueue', name, order).then(function (r) { applyComputed(r.computed); busy(false); closeModal(); toast('已更新順序並重算時程'); render(); }).catch(fail);
  });
}

function openLeave(name) {
  var h = '<h3>登記休假</h3><div class="form"><label>人員<select class="field" id="lP">' + peopleOptions(name) + '</select></label><label>類型<select class="field" id="lT"><option>排休</option><option>病假</option><option>公司活動</option><option>教育訓練</option><option>其他</option></select></label>';
  h += '<label>開始日<input class="field" type="date" id="lS"></label><label>結束日<input class="field" type="date" id="lE"></label><label>天數（半天填 0.5，空白＝整段）<input class="field" type="number" step="0.5" id="lD"></label><label>說明<input class="field" id="lN"></label></div>';
  h += '<div class="hint" style="margin-top:10px">休假期間不會排工作，這個人後面的工作會自動延後。</div><div class="mfoot"><button class="btn" id="lC">取消</button><button class="btn primary" id="lGo">登記</button></div>';
  modal(h);
  $('#lC').addEventListener('click', closeModal);
  $('#lGo').addEventListener('click', function () {
    var o = { person: $('#lP').value, type: $('#lT').value, start: $('#lS').value, end: $('#lE').value || $('#lS').value, days: $('#lD').value === '' ? '' : Number($('#lD').value), note: $('#lN').value };
    busy(true);
    call('saveLeave', o).then(function (r) { S.data.leaves = r.leaves; applyComputed(r.computed); busy(false); closeModal(); toast('已登記休假，時程已重算'); render(); }).catch(fail);
  });
}

function openExport() {
  var t = S.data.today;
  var h = '<h3>下載個人排程表</h3><div class="hint">照舊表格式下載成 Excel：每人一個分頁、按月分段、跨月的工作標「跨日」，並算出每月可執行工天與空檔。</div>';
  h += '<div class="form" style="margin-top:12px"><label>從<input class="field" type="date" id="eF" value="' + t.slice(0, 7) + '-01"></label><label>到<input class="field" type="date" id="eT" value="' + ds(dn(t) + 180) + '"></label></div>';
  h += '<div id="eRes" style="margin-top:10px"></div><div class="mfoot"><button class="btn" id="eC">關閉</button><button class="btn primary" id="eGo">下載 Excel</button></div>';
  modal(h);
  $('#eC').addEventListener('click', closeModal);
  $('#eGo').addEventListener('click', function () {
    busy(true);
    need('ExcelJS').then(function () { return call('exportPersonal', $('#eF').value, $('#eT').value); })
      .then(function (r) { busy(false); $('#eRes').innerHTML = '<div class="box">已下載 ' + r.count + ' 人的排程表。</div>'; }).catch(fail);
  });
}

function openProject(p) {
  var isNew = !p; p = p || { name: '', code: '', status: '進行中', pm: '', start: '', target: '', color: GROUP_COLORS[S.data.projects.length % GROUP_COLORS.length], note: '' };
  var admin = isAdmin();
  var h = '<h3>' + (isNew ? '新增專案' : '專案設定') + '</h3><div class="form">';
  h += '<label>專案名稱<input class="field" id="pjName" value="' + esc(p.name) + '"></label><label>代碼<input class="field" id="pjCode" value="' + esc(p.code) + '"></label>';
  h += '<label>狀態<select class="field" id="pjStatus">' + ['進行中', '暫停', '封存'].map(function (s) { return '<option' + (s === p.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>';
  h += '<label>顏色<input class="field" type="color" id="pjColor" value="' + esc(p.color || pcolor(p.id || '')) + '" style="padding:2px;height:32px"></label>';
  h += '<label class="full">負責的 PM（姓名，多位用逗號；空白＝所有 PM 都能改）<input class="field" id="pjPm" value="' + esc(p.pm) + '"' + (admin ? '' : ' disabled title="只有管理員能改"') + '></label>';
  h += '<label>開始日<input class="field" type="date" id="pjStart" value="' + esc(p.start) + '"></label><label>目標日<input class="field" type="date" id="pjTarget" value="' + esc(p.target) + '"></label>';
  h += '<label class="full">備註<input class="field" id="pjNote" value="' + esc(p.note) + '"></label></div>';
  if (!isNew) h += '<div class="box" style="margin-top:14px"><b>重設基準</b>：把目前的預計完成日存成基準，之後延誤會顯示「比基準晚 N 天」。建議在專案計畫確定、或每個版本開始時做一次。<div style="margin-top:8px"><button class="btn sm" id="pjBase">重設基準</button></div></div>';
  h += '<div class="mfoot"><button class="btn" id="pjC">取消</button><button class="btn primary" id="pjGo">' + (isNew ? '建立專案' : '儲存') + '</button></div>';
  modal(h);
  $('#pjC').addEventListener('click', closeModal);
  $('#pjGo').addEventListener('click', function () {
    var o = { id: p.id, name: $('#pjName').value.trim(), code: $('#pjCode').value.trim(), status: $('#pjStatus').value, start: $('#pjStart').value, target: $('#pjTarget').value, color: $('#pjColor').value, note: $('#pjNote').value };
    if (admin) o.pm = $('#pjPm').value.trim();
    busy(true);
    call('saveProject', o).then(function (r) {
      var i = S.data.projects.findIndex(function (x) { return x.id === r.id; });
      if (i >= 0) S.data.projects[i] = r; else S.data.projects.push(r);
      index(); busy(false); closeModal(); toast(isNew ? '已建立專案「' + r.name + '」' : '已儲存');
      if (isNew) go('p/' + encodeURIComponent(r.id)); else render();
    }).catch(fail);
  });
  var b = $('#pjBase');
  if (b) b.addEventListener('click', function () {
    if (!confirm('把「' + p.name + '」所有未完成工項的基準，改成目前的預計完成日？')) return;
    busy(true);
    call('resetBaseline', p.id).then(function (r) { applyComputed(r.computed); busy(false); closeModal(); toast('已重設 ' + r.count + ' 個工項的基準'); render(); }).catch(fail);
  });
}

/* ---------------- 設定 ---------------- */
var SET_TABS = [['general', '一般設定', true], ['people', '人員', false], ['calendar', '行事曆', false], ['templates', '範本', false], ['leaves', '休假', false], ['import', '匯入與還原', true], ['log', '修改紀錄', false]];
function adminRefresh() { S.data = API.refresh(S.data.history); index(); }
function renderSettings(c) {
  setTitle('<span class="t">設定</span>');
  if (S.data.sheetUrl) setActions('<a class="btn ghost hide-m" target="_blank" href="' + esc(S.data.sheetUrl) + '">資料庫後台</a>');
  var tabs = SET_TABS.filter(function (t) { return !t[2] || isAdmin(); });
  var tab = S.route.tab && tabs.some(function (t) { return t[0] === S.route.tab; }) ? S.route.tab : tabs[0][0];
  c.innerHTML = '<div class="subtabs">' + tabs.map(function (t) { return '<button data-at="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="adminBody" style="max-width:1200px"></div>';
  $$('[data-at]', c).forEach(function (b) { b.addEventListener('click', function () { go('settings/' + b.dataset.at); }); });
  ({ general: setGeneral, people: setPeople, calendar: setCalendar, templates: setTemplates, leaves: setLeaves, import: setImport, log: setLog })[tab]($('#adminBody'));
}
function ro() { return isAdmin() ? '' : '<div class="box">只有管理員能修改這裡的資料，你目前只能檢視。</div>'; }

function setGeneral(box) {
  var d = API.adminData(), get = function (k) { var r = d.settings.filter(function (x) { return x.key === k; })[0]; return r ? r.value : ''; };
  var known = { '管理員': 1, '美術可見範圍': 1 };
  var h = '<div class="card pad" style="max-width:720px"><div class="form" style="grid-template-columns:1fr">';
  h += '<label>管理員 Email<textarea class="field" id="sgAdmins" rows="3" placeholder="一行一個">' + esc(get('管理員').split(/[\s,，;；]+/).filter(Boolean).join('\n')) + '</textarea><span class="hint">這些人擁有全部權限。也可以在「人員」把某人的角色設成「管理員」。</span></label>';
  h += '<label>美術可以看到哪些工項<select class="field" id="sgScope" style="max-width:320px">' + [['全部', '全部專案'], ['參與的專案', '自己有工項的專案'], ['自己的工項', '只有自己的工項']].map(function (o) { return '<option value="' + o[0] + '"' + (get('美術可見範圍') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><span class="hint">PM 和管理員一律看得到全部。</span></label>';
  h += '</div><div class="mfoot" style="justify-content:flex-start"><button class="btn primary" id="sgSave">儲存設定</button></div></div>';
  var others = d.settings.filter(function (x) { return !known[x.key]; });
  if (others.length) h += '<div class="card pad" style="max-width:720px;margin-top:14px"><b>其他設定</b><table class="grid2" style="margin-top:8px"><tbody>' + others.map(function (r, i) { return '<tr><td style="width:160px">' + esc(r.key) + '</td><td><input class="field" data-ok="' + i + '" value="' + esc(r.value) + '"></td><td style="width:80px"><button class="btn sm" data-osave="' + i + '">儲存</button></td></tr>'; }).join('') + '</tbody></table></div>';
  box.innerHTML = h;
  $('#sgSave').addEventListener('click', function () {
    var list = $('#sgAdmins').value.split(/[\s,，;；]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    var bad = list.filter(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (bad.length) { toast('Email 格式不正確：' + bad.join('、'), true); return; }
    var mp = d.people.filter(function (p) { return p.email === S.data.me.email; })[0];
    if (list.indexOf(S.data.me.email) < 0 && !(mp && mp.role === '管理員') && !confirm('名單裡沒有你自己（' + S.data.me.email + '），儲存後你會失去管理員權限。確定嗎？')) return;
    busy(true);
    call('saveSetting', '管理員', list.join(', ')).then(function () { return call('saveSetting', '美術可見範圍', $('#sgScope').value); })
      .then(function () { busy(false); adminRefresh(); toast('已儲存設定'); }).catch(fail);
  });
  $$('[data-osave]', box).forEach(function (b) {
    b.addEventListener('click', function () { var r = others[+b.dataset.osave]; busy(true); call('saveSetting', r.key, $('[data-ok="' + b.dataset.osave + '"]', box).value).then(function () { busy(false); adminRefresh(); toast('已儲存'); }).catch(fail); });
  });
}

function roleSel(id, v, dis) { return '<select class="field"' + (id ? ' id="' + id + '"' : '') + (dis || '') + '>' + ['美術', 'PM', '管理員'].map(function (r) { return '<option' + (r === v ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>'; }
function setPeople(box) {
  var d = API.adminData(), admin = isAdmin(), q = (S.peopleQ || '').toLowerCase(), showOff = !!S.peopleOff;
  var list = d.people.filter(function (p) { return (showOff || p.active) && (!q || (p.name + ' ' + p.email + ' ' + p.alias).toLowerCase().indexOf(q) >= 0); });
  var noEmail = d.people.filter(function (p) { return p.active && !p.email; }).length;
  var h = ro() + '<div class="toolbar" style="padding:0 0 12px"><span class="search">' + IC.search + '<input type="search" class="field" id="ppQ" placeholder="搜尋姓名、Email" value="' + esc(S.peopleQ || '') + '"></span><label class="chk"><input type="checkbox" id="ppOff"' + (showOff ? ' checked' : '') + '>顯示已離職</label><span class="grow"></span>' +
    (noEmail ? '<span class="wtag w">' + noEmail + ' 位在職人員還沒填 Email，還不能登入</span>' : '') + '</div>';
  h += '<div class="tablewrap" style="max-height:calc(100vh - 250px)"><table class="grid2" style="min-width:880px"><thead><tr><th>姓名</th><th>Email（公司 Google 帳號）</th><th style="width:110px">角色</th><th>別名</th><th style="width:50px">在職</th><th>備註</th><th style="width:56px">工項</th><th style="width:130px"></th></tr></thead><tbody>';
  if (admin) h += '<tr style="background:var(--accent-soft)"><td><input class="field" id="npName" placeholder="新人員姓名"></td><td><input class="field" id="npEmail" placeholder="name@公司網域"></td><td>' + roleSel('npRole', '美術') + '</td><td><input class="field" id="npAlias"></td><td></td><td><input class="field" id="npNote"></td><td></td><td><button class="btn sm primary" id="npAdd">新增</button></td></tr>';
  list.forEach(function (p, i) {
    var dis = admin ? '' : ' disabled';
    h += '<tr data-pi="' + i + '"' + (p.active ? '' : ' style="opacity:.6"') + '><td><span class="person">' + avatar(p.name, true) + '<b>' + esc(p.name) + '</b></span></td><td><input class="field" data-f="email" value="' + esc(p.email) + '"' + dis + '></td><td>' + roleSel('', p.role, dis) + '</td>' +
      '<td><input class="field" data-f="alias" value="' + esc(p.alias) + '"' + dis + '></td><td style="text-align:center"><input type="checkbox" data-f="active"' + (p.active ? ' checked' : '') + dis + '></td>' +
      '<td><input class="field" data-f="note" value="' + esc(p.note) + '"' + dis + '></td><td style="text-align:right">' + (d.usage[p.name] || 0) + '</td>' +
      '<td style="white-space:nowrap">' + (admin ? '<button class="btn sm" data-psave="' + i + '" disabled>儲存</button> ' + (d.usage[p.name] ? '' : '<button class="btn sm danger" data-pdel="' + i + '">刪除</button>') : '') + '</td></tr>';
  });
  h += '</tbody></table></div><div class="hint" style="margin-top:8px">姓名建立後不能改（工項用姓名對應負責人）。離職請取消勾選「在職」，歷史工項會保留。</div>';
  box.innerHTML = h;
  $('#ppQ').addEventListener('input', debounce(function (e) { S.peopleQ = e.target.value; setPeople(box); var n = $('#ppQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250));
  $('#ppOff').addEventListener('change', function (e) { S.peopleOff = e.target.checked; setPeople(box); });
  if (!admin) return;
  $$('tr[data-pi]', box).forEach(function (tr) { var btn = $('[data-psave]', tr); $$('input,select', tr).forEach(function (el) { ['input', 'change'].forEach(function (ev) { el.addEventListener(ev, function () { btn.disabled = false; btn.classList.add('primary'); }); }); }); });
  $$('[data-psave]', box).forEach(function (b) {
    b.addEventListener('click', function () {
      var p = list[+b.dataset.psave], tr = b.closest('tr');
      var o = { email: $('[data-f=email]', tr).value, role: $('select', tr).value, alias: $('[data-f=alias]', tr).value, active: $('[data-f=active]', tr).checked, note: $('[data-f=note]', tr).value };
      busy(true); call('savePerson', p.name, o).then(function () { busy(false); adminRefresh(); toast('已儲存：' + p.name); setPeople(box); }).catch(fail);
    });
  });
  $$('[data-pdel]', box).forEach(function (b) {
    b.addEventListener('click', function () {
      var p = list[+b.dataset.pdel]; if (!confirm('刪除人員「' + p.name + '」？')) return;
      busy(true); call('deletePerson', p.name).then(function () { busy(false); adminRefresh(); toast('已刪除'); setPeople(box); }).catch(fail);
    });
  });
  $('#npAdd').addEventListener('click', function () {
    var o = { name: $('#npName').value, email: $('#npEmail').value, role: $('#npRole').value, alias: $('#npAlias').value, note: $('#npNote').value, active: true };
    busy(true); call('savePerson', null, o).then(function () { busy(false); adminRefresh(); toast('已新增：' + o.name); setPeople(box); }).catch(fail);
  });
}

function setCalendar(box) {
  var d = API.adminData(), admin = isAdmin(), years = {};
  d.calendar.forEach(function (c) { years[c.day.slice(0, 4)] = 1; });
  var yNow = S.data.today.slice(0, 4); years[yNow] = 1;
  var y = S.calYear || yNow, list = d.calendar.filter(function (c) { return c.day.slice(0, 4) === y; }), WD = '日一二三四五六';
  var h = ro() + '<div class="toolbar" style="padding:0 0 12px"><span class="seg">' + Object.keys(years).sort().map(function (k) { return '<button data-y="' + k + '" class="' + (k === y ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</span><span class="muted">' + list.filter(function (c) { return c.type === '假日'; }).length + ' 天假日、' + list.filter(function (c) { return c.type === '補班'; }).length + ' 天補班</span></div>';
  if (admin) h += '<div class="card pad" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="field" type="date" id="cDay" title="開始日"><span class="faint">到</span><input class="field" type="date" id="cDay2" title="結束日（選填）"><select class="field" id="cType"><option>假日</option><option>補班</option></select><input class="field" id="cName" placeholder="名稱，例如 中秋節" style="flex:1;min-width:160px"><button class="btn primary" id="cAdd">新增</button></div><div class="hint" style="margin-top:6px">週六、週日本來就不排工作，不用加。連假可以填結束日，會自動跳過週末。</div></div>';
  h += '<div class="tablewrap" style="max-height:calc(100vh - 330px);max-width:720px"><table class="grid2"><thead><tr><th>日期</th><th>星期</th><th>類型</th><th>名稱</th><th></th></tr></thead><tbody>' +
    (list.length ? list.map(function (c, i) { return '<tr><td>' + c.day + '</td><td>' + WD[new Date(c.day + 'T00:00:00Z').getUTCDay()] + '</td><td>' + (c.type === '補班' ? '<span class="wtag w">補班</span>' : '假日') + '</td><td>' + esc(c.name) + '</td><td style="width:70px">' + (admin ? '<button class="btn sm danger" data-cdel="' + i + '">刪除</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="empty">這一年還沒有設定假日。</td></tr>') + '</tbody></table></div>';
  box.innerHTML = h;
  $$('[data-y]', box).forEach(function (b) { b.addEventListener('click', function () { S.calYear = b.dataset.y; setCalendar(box); }); });
  if (!admin) return;
  $('#cAdd').addEventListener('click', function () {
    var a = $('#cDay').value, b = $('#cDay2').value || a, type = $('#cType').value, name = $('#cName').value.trim();
    if (!a) { toast('請選日期', true); return; }
    var days = [];
    for (var n = dn(a); n <= dn(b) && days.length < 60; n++) { var w = wk(n); if (type === '補班' || (w !== 0 && w !== 6)) days.push(ds(n)); }
    if (!days.length) { toast('選的日期都是週末，不用加。', true); return; }
    busy(true);
    days.reduce(function (p, day) { return p.then(function () { return call('saveDay', { day: day, type: type, name: name }); }); }, Promise.resolve())
      .then(function () { busy(false); S.calYear = a.slice(0, 4); adminRefresh(); toast('已新增 ' + days.length + ' 天，時程已重算'); setCalendar(box); }).catch(fail);
  });
  $$('[data-cdel]', box).forEach(function (b) { b.addEventListener('click', function () { var c = list[+b.dataset.cdel]; busy(true); call('deleteDay', c.day).then(function () { busy(false); adminRefresh(); toast('已刪除 ' + c.day); setCalendar(box); }).catch(fail); }); });
}

function setTemplates(box) {
  var d = API.adminData(), names = [];
  d.templates.forEach(function (t) { if (names.indexOf(t.tpl) < 0) names.push(t.tpl); });
  if (S.tplSel === undefined || (S.tplSel !== '' && names.indexOf(S.tplSel) < 0)) S.tplSel = names[0] || '';
  var editing = S.tplSel;
  var steps = S.tplDraft && S.tplDraft.name === editing ? S.tplDraft.steps : d.templates.filter(function (t) { return t.tpl === editing; }).map(function (t) { return { title: t.title, grp: t.grp, days: t.days, preds: t.preds, mode: t.mode }; });
  if (!editing && !steps.length) steps = [{ title: '', grp: '', days: 1, preds: '', mode: '排隊' }];
  var shown = S.tplDraft && S.tplDraft.name === editing && S.tplDraft.title !== undefined ? S.tplDraft.title : editing;
  S.tplDraft = { name: editing, steps: steps, title: shown };
  var h = '<div style="display:grid;grid-template-columns:minmax(160px,220px) 1fr;gap:14px;align-items:start" class="tplgrid">';
  h += '<div class="card" style="padding:8px">' + names.map(function (n) { return '<div class="tplitem' + (n === editing ? ' on' : '') + '" data-tn="' + esc(n) + '">' + esc(n) + ' <span class="faint">' + d.templates.filter(function (t) { return t.tpl === n; }).length + ' 步</span></div>'; }).join('') + '<div class="tplitem' + (editing === '' ? ' on' : '') + '" data-tn="">＋ 新範本</div></div>';
  h += '<div class="card pad"><div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><input class="field" id="tnName" value="' + esc(shown) + '" placeholder="範本名稱，例如 角色標準流程" style="flex:1;font-weight:600">' + (editing ? '<button class="btn danger" id="tnDel">刪除範本</button>' : '') + '</div>';
  h += '<table class="grid2"><thead><tr><th style="width:40px">步驟</th><th>工項名稱</th><th>群組</th><th style="width:76px">天數</th><th style="width:100px">要等步驟</th><th style="width:96px">方式</th><th style="width:116px"></th></tr></thead><tbody>' +
    steps.map(function (s, i) {
      return '<tr data-si="' + i + '"><td style="text-align:center">' + (i + 1) + '</td><td><input class="field" data-k="title" value="' + esc(s.title) + '"></td><td><input class="field" data-k="grp" value="' + esc(s.grp) + '"></td><td><input class="field" type="number" step="0.5" min="0" data-k="days" value="' + esc(s.days) + '"></td><td><input class="field" data-k="preds" value="' + esc(s.preds) + '" placeholder="' + (i ? i : '') + '"></td><td><select class="field" data-k="mode"><option' + (s.mode !== '平行' ? ' selected' : '') + '>排隊</option><option' + (s.mode === '平行' ? ' selected' : '') + '>平行</option></select></td><td style="white-space:nowrap"><button class="btn sm" data-mv="-1">↑</button> <button class="btn sm" data-mv="1">↓</button> <button class="btn sm danger" data-rm="1">✕</button></td></tr>';
    }).join('') + '</tbody></table>';
  h += '<div class="mfoot" style="justify-content:space-between"><button class="btn" id="tnAdd">' + IC.plus + '加一步</button><button class="btn primary" id="tnSave">儲存範本</button></div>';
  h += '<div class="hint" style="margin-top:8px">「要等步驟」填前面步驟的編號，多個用逗號，例如「1」或「2,3」。「平行」表示不佔用負責人的時間（例如監修外包）。</div></div></div>';
  box.innerHTML = h;
  var sync = function () { S.tplDraft.title = $('#tnName').value; $$('tr[data-si]', box).forEach(function (tr) { var s = steps[+tr.dataset.si]; $$('[data-k]', tr).forEach(function (el) { s[el.dataset.k] = el.value; }); }); };
  $$('[data-tn]', box).forEach(function (el) { el.addEventListener('click', function () { S.tplSel = el.dataset.tn; S.tplDraft = null; setTemplates(box); }); });
  $$('tr[data-si] button', box).forEach(function (b) {
    b.addEventListener('click', function () {
      sync(); var i = +b.closest('tr').dataset.si;
      if (b.dataset.rm) steps.splice(i, 1);
      else { var j = i + Number(b.dataset.mv); if (j < 0 || j >= steps.length) return; var t = steps[i]; steps[i] = steps[j]; steps[j] = t; }
      setTemplates(box);
    });
  });
  $('#tnAdd').addEventListener('click', function () { sync(); steps.push({ title: '', grp: steps.length ? steps[steps.length - 1].grp : '', days: 1, preds: String(steps.length || ''), mode: '排隊' }); setTemplates(box); });
  $('#tnSave').addEventListener('click', function () {
    sync(); var name = $('#tnName').value.trim(); busy(true);
    call('saveTemplate', editing || null, name, steps).then(function () { busy(false); S.tplSel = name; S.tplDraft = null; adminRefresh(); toast('已儲存範本「' + name + '」'); setTemplates(box); }).catch(fail);
  });
  var del = $('#tnDel');
  if (del) del.addEventListener('click', function () {
    if (!confirm('刪除範本「' + editing + '」？已經用這個範本建立的工項不受影響。')) return;
    busy(true); call('deleteTemplate', editing).then(function () { busy(false); S.tplSel = undefined; S.tplDraft = null; adminRefresh(); toast('已刪除範本'); setTemplates(box); }).catch(fail);
  });
}

function setLeaves(box) {
  var d = API.adminData(), who = S.leaveWho || '', past = !!S.leavePast, today = S.data.today, names = {};
  var list = d.leaves.filter(function (l) { return (!who || l.person === who) && (past || l.end_date >= today); });
  d.leaves.forEach(function (l) { names[l.person] = 1; });
  var h = '<div class="toolbar" style="padding:0 0 12px"><select class="field" id="lvWho"><option value="">所有人員</option>' + Object.keys(names).sort().map(function (n) { return '<option' + (n === who ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select><label class="chk"><input type="checkbox" id="lvPast"' + (past ? ' checked' : '') + '>包含已結束的</label><span class="grow"></span><button class="btn primary" id="lvAdd">' + IC.plus + '登記休假</button></div>';
  h += '<div class="tablewrap" style="max-height:calc(100vh - 250px)"><table class="grid2" style="min-width:640px"><thead><tr><th>人員</th><th>開始</th><th>結束</th><th>天數</th><th>類型</th><th>說明</th><th></th></tr></thead><tbody>' +
    (list.length ? list.map(function (l, i) { return '<tr><td>' + person(l.person) + '</td><td>' + l.start_date + '</td><td>' + l.end_date + '</td><td>' + esc(l.days === null ? '整段' : l.days) + '</td><td>' + esc(l.type) + '</td><td>' + esc(l.note) + '</td><td style="width:70px"><button class="btn sm danger" data-ldel="' + i + '">刪除</button></td></tr>'; }).join('') : '<tr><td colspan="7" class="empty">沒有休假紀錄。</td></tr>') + '</tbody></table></div>';
  box.innerHTML = h;
  $('#lvWho').addEventListener('change', function (e) { S.leaveWho = e.target.value; setLeaves(box); });
  $('#lvPast').addEventListener('change', function (e) { S.leavePast = e.target.checked; setLeaves(box); });
  $('#lvAdd').addEventListener('click', function () { openLeave(who); });
  $$('[data-ldel]', box).forEach(function (b) {
    b.addEventListener('click', function () {
      var l = list[+b.dataset.ldel]; if (!confirm('刪除 ' + l.person + ' ' + l.start_date + '~' + l.end_date + ' 的休假？')) return;
      busy(true); call('deleteLeave', l.id).then(function () { busy(false); adminRefresh(); toast('已刪除，時程已重算'); setLeaves(box); }).catch(fail);
    });
  });
}

function setImport(box) {
  box.innerHTML = '<div class="card pad" style="max-width:760px"><b style="font-size:15px">匯入資料或還原備份</b><p class="muted" style="margin:6px 0 0;font-size:13px">可以選「美術專案管理DB.xlsx」、每日備份的 xlsx，或從 Google 試算表下載的 Excel 檔。</p>' +
    '<div class="box d" style="margin-top:12px">匯入會清空並取代資料庫裡現有的全部工項、專案、人員、行事曆、休假和範本。</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="impFile" accept=".xlsx"><button class="btn primary" id="impGo" disabled>匯入</button></div><div id="impRes" style="margin-top:10px;font-size:13px"></div></div>';
  var f = $('#impFile'), parsed = null;
  f.addEventListener('change', function () {
    parsed = null; $('#impGo').disabled = true; $('#impRes').textContent = '讀取中…';
    var file = f.files[0]; if (!file) return;
    need('XLSX').then(function () { return file.arrayBuffer(); }).then(function (buf) {
      parsed = API.parseWorkbook(buf); var c = parsed.counts;
      $('#impRes').innerHTML = '讀到：工項 <b>' + c.tasks + '</b>、專案 ' + c.projects + '、人員 ' + c.people + '、行事曆 ' + c.calendar + '、休假 ' + c.leaves + '、範本步驟 ' + c.templates + (parsed.warn.length ? '<div class="box w" style="margin-top:8px">' + parsed.warn.map(esc).join('<br>') + '</div>' : '');
      $('#impGo').disabled = false;
    }).catch(function (e) { $('#impRes').innerHTML = '<span class="late">' + esc(e.message) + '</span>'; });
  });
  $('#impGo').addEventListener('click', function () {
    if (!parsed || !confirm('確定要清空資料庫並匯入這個檔案？')) return;
    busy(true); call('importPayload', parsed.payload).then(function (r) { busy(false); toast('已匯入 ' + r.tasks + ' 個工項'); load(false); }).catch(fail);
  });
}

function setLog(box) {
  box.innerHTML = '<div class="muted">載入中…</div>';
  call('getLog', 300).then(function (rows) {
    box.innerHTML = rows.length ? '<div class="tablewrap" style="max-height:calc(100vh - 220px)"><table class="grid2" style="min-width:760px"><thead><tr><th style="width:130px">時間</th><th>使用者</th><th>動作</th><th>對象</th><th>內容</th></tr></thead><tbody>' + rows.map(function (r) {
      var t = new Date(new Date(r.at).getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
      var link = r.kind === '工項' && byId[r.ref] ? '<a href="javascript:void 0" data-open="' + esc(r.ref) + '">' + esc(r.ref) + '</a>' : esc(r.ref);
      return '<tr><td>' + t + '</td><td>' + esc(r.email) + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.kind) + ' ' + link + '</td><td style="white-space:pre-wrap">' + esc(r.content) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">還沒有修改紀錄。</div>';
    $$('[data-open]', box).forEach(function (a) { a.addEventListener('click', function () { openTask(a.dataset.open); }); });
  }).catch(function (e) { box.innerHTML = '<div class="box d">' + esc(e.message) + '</div>'; });
}

/* ---------------- 其他人修改時自動更新 ---------------- */
API.onChange(function (ev) {
  if (!S.data) return;
  if (ev.reload || S.preview) { if (!isEditing()) load(S.data.history); return; }
  ev.removed.forEach(function (id) { S.data.tasks = S.data.tasks.filter(function (t) { return t.id !== id; }); });
  ev.tasks.forEach(upsert);
  index(); applyComputed(ev.computed);
  if (syncCount || isEditing()) return;
  render();
});

/* ---------------- 啟動 ---------------- */
function gate(html) {
  $('#root').innerHTML = '<div class="gate"><div class="card"><div class="brand" style="padding:0"><span class="mark">' + IC.gantt + '</span>美術專案管理</div>' + html + '</div></div>';
}
API.init().then(function (r) {
  if (r.state === 'config') return gate('<h2>還沒設定資料庫</h2><p class="muted">請在 <code>js/config.js</code> 填入 Supabase 的網址和金鑰。</p>');
  if (r.state === 'login') {
    gate('<h2>登入</h2><p class="muted">請用公司的 Google 帳號登入。</p><button class="btn primary" id="loginBtn" style="width:100%;height:42px;margin-top:8px">使用 Google 帳號登入</button>');
    $('#loginBtn').addEventListener('click', function () { API.signIn(); });
    return;
  }
  if (r.state === 'denied') {
    gate('<h2>還沒有使用權限</h2><p class="muted">你的帳號（' + esc(r.email) + '）不在人員名單上，或名單裡還沒填這個 Email。請聯絡管理員把你加入。</p><button class="btn" id="outBtn" style="margin-top:8px">換一個帳號</button>');
    $('#outBtn').addEventListener('click', function () { API.signOut(); });
    return;
  }
  S.route = parseRoute();
  load(false);
}).catch(function (e) { gate('<h2>連線失敗</h2><p class="muted">' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">重新整理</button>'); });

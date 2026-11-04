/* ============================================================
   美術專案管理 — 核心：狀態、外框、首頁、主表格
   ============================================================ */

/* ---------------- 工具 ---------------- */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function dn(s) { if (!s) return null; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; }
function ds(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
function md(s) { return s ? (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) : ''; }
function wk(n) { return new Date(n * 864e5).getUTCDay(); }
function isOff(n) { var s = ds(n); if (S.data.makeup[s]) return false; var w = wk(n); return w === 0 || w === 6 || !!S.data.holidays[s]; }
function split(s) { return String(s || '').split(/[\s,，、;；]+/).filter(Boolean); }
function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); var run = function () { if (COMPOSING) { t = setTimeout(run, 150); return; } fn.apply(self, a); }; t = setTimeout(run, ms); }; }
/* 中文輸入法（注音、倉頡、拼音）組字中：快捷鍵一律不處理、畫面也不重畫，避免選字被打斷 */
var COMPOSING = false;
document.addEventListener('compositionstart', function () { COMPOSING = true; }, true);
document.addEventListener('compositionend', function () { COMPOSING = false; setTimeout(function () { if (typeof flushSync === 'function') flushSync(); }, 0); }, true);
window.addEventListener('keydown', function (e) { if (e.isComposing || e.keyCode === 229) e.stopImmediatePropagation(); }, true);
window.addEventListener('keyup', function (e) { if (e.isComposing || e.keyCode === 229) e.stopImmediatePropagation(); }, true);
/* 訊息：一般訊息會留著，按 ✕ 或重新整理才消失；最多 5 則，超過時最舊的先消失。
   很短的確認（例如「已儲存」）幾秒後自動消失，避免堆滿畫面。 */
function toast(msg, err) {
  var box = $('#toasts'); if (!box) return;
  msg = String(msg);
  var quick = !err && msg.length <= 8;
  var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : '') + (quick ? ' quick' : '');
  t.innerHTML = '<span class="tm"></span>' + (quick ? '' : '<button class="tx" title="關閉" aria-label="關閉">✕</button>');
  $('.tm', t).textContent = msg;
  var x = $('.tx', t); if (x) x.addEventListener('click', function () { t.remove(); });
  box.appendChild(t);
  if (quick) setTimeout(function () { t.remove(); }, 2500);
  var all = $$('.toast:not(.quick)', box);
  while (all.length > 5) all.shift().remove();
}
var busyN = 0;
function busy(on) { busyN = Math.max(0, busyN + (on ? 1 : -1)); $('#loading').classList.toggle('hidden', !busyN); }
function fail(e) { busyN = 1; busy(false); toast(e && e.message ? e.message : String(e), true); }
var WRITE_FNS = { saveVendor: 1, deleteVendor: 1, ensureTags: 1, setManagedProjects: 1, saveTask: 1, setStatus: 1, deleteTask: 1, reorderQueue: 1, applyTemplate: 1, bulkAdd: 1, bulkStatus: 1, saveProject: 1, resetBaseline: 1, saveLeave: 1,
  archivePeriod: 1, unarchivePeriod: 1, saveSetting: 1, savePerson: 1, deletePerson: 1, saveDay: 1, saveDays: 1, deleteDay: 1, saveTemplate: 1, deleteTemplate: 1, deleteLeave: 1, importPayload: 1 };
var PREVIEW_MSG = '預覽模式只能看，不能修改。按上方「結束預覽」回到自己的身分。';
function call(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (S.preview && WRITE_FNS[fn]) return Promise.reject(new Error(PREVIEW_MSG));
  try { return Promise.resolve(API[fn].apply(API, args)); } catch (e) { return Promise.reject(e); }
}
var LIBS = { ExcelJS: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', XLSX: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' };
function need(name) {
  if (window[name]) return Promise.resolve();
  return new Promise(function (ok, no) {
    var sc = document.createElement('script'); sc.src = LIBS[name];
    sc.onload = function () { ok(); }; sc.onerror = function () { no(new Error('元件載入失敗，請檢查網路。')); };
    document.head.appendChild(sc);
  });
}

var IC = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  brand: '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round"><path d="M5 6.5h7.5" stroke="currentColor"/><path d="M9.5 12h9" stroke="currentColor"/><path d="M6.5 17.5h5.5" stroke="#ffd166"/></svg>',
  gantt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h8M8 12h10M6 18h7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>'
};

/* ---------------- 狀態 ---------------- */
var STATUSES = ['未開始', '進行中', '待驗收', '完成', '暫停', '取消'];
var ST_HEX = { '未開始': '#c4c6d0', '進行中': '#fdab3d', '待驗收': '#579bfc', '完成': '#00c875', '暫停': '#a25ddc', '取消': '#7f8293' };
var GROUP_COLORS = ['#579bfc', '#a25ddc', '#00a35c', '#fdab3d', '#e2445c', '#0086c0', '#ff642e', '#9cd326', '#bb3354', '#784bd1', '#00c7a7', '#cab641'];
var S = {
  data: null, route: { view: 'home' }, q: '', owner: '', status: '', group: '', tag: '', hideDone: true, onlyWarn: false,
  collapsed: {}, picked: {}, sel: null, ganttScale: 'day', peopleRange: 90, peopleProject: '', minePerson: '', year: ''
};
var byId = {}, succ = {}, projById = {};
try { var _ui = JSON.parse(localStorage.getItem('pm-ui2') || '{}'); ['hideDone', 'ganttScale', 'peopleRange', 'collapsed'].forEach(function (k) { if (k in _ui) S[k] = _ui[k]; }); } catch (e) {}
function remember() { try { localStorage.setItem('pm-ui2', JSON.stringify({ hideDone: S.hideDone, ganttScale: S.ganttScale, peopleRange: S.peopleRange, collapsed: S.collapsed })); } catch (e) {} }

function index() {
  byId = {}; succ = {}; projById = {};
  S.data.projects.forEach(function (p) { projById[p.id] = p; });
  S.data.tasks.forEach(function (t) { byId[t.id] = t; });
  S.data.tasks.forEach(function (t) { split(t.preds).forEach(function (p) { (succ[p] = succ[p] || []).push(t.id); }); });
}
function applyComputed(m) {
  Object.keys(m || {}).forEach(function (id) {
    var t = byId[id]; if (!t) return; var c = m[id];
    t.start = c[0]; t.end = c[1]; t.warns = c[2]; t.slip = c[3]; t.info = c[4]; t.prio = c[5]; t.baseline = c[6]; t.expect = c[7]; t.rank = c[9]; t.why = c[10] || null;
  });
}
function upsert(t) { if (byId[t.id]) Object.assign(byId[t.id], t); else { S.data.tasks.push(t); byId[t.id] = t; } index(); }
function removeTask(id) { S.data.tasks = S.data.tasks.filter(function (t) { return t.id !== id; }); index(); }

/* ---------------- 權限與顯示 ---------------- */
function isPM() { return S.data.me.role !== '美術'; }
function isAdmin() { return S.data.me.role === '管理員'; }
function canEdit(t) { var p = projById[t.project]; return !!(p && p.canEdit); }
/* 完成度：有填百分比用百分比；否則用數量；完成／待驗收算 100% */
function progOf(t) {
  if (t.status === '完成' || t.status === '待驗收') return 100;
  if (t.pct !== '' && t.pct !== null && t.pct !== undefined) return Math.max(0, Math.min(100, Number(t.pct)));
  var q = Number(t.qty) || 1;
  if (q > 1 && Number(t.doneQty)) return Math.round(Number(t.doneQty) / q * 100);
  return t.status === '未開始' ? 0 : null;
}
/* 進度條：實際完成度＋應有進度的刻度；落後 15% 以上變紅 */
function progBar(t, wide) {
  var p = progOf(t), ex = t.status === '進行中' && t.expect !== undefined && t.expect !== null ? t.expect : null;
  var behind = p !== null && ex !== null && ex - p >= 15;
  var tip = (p === null ? '還沒回報完成度' : '完成 ' + p + '%') + (ex !== null ? '，照計畫應有 ' + ex + '%' : '');
  return '<span class="prog' + (wide ? ' wide' : '') + (behind ? ' behind' : '') + '" title="' + tip + '"><span class="pbar"><i style="width:' + (p || 0) + '%"></i>' + (ex !== null ? '<b style="left:' + ex + '%"></b>' : '') + '</span><span class="pnum">' + (p === null ? '未回報' : p + '%') + '</span></span>';
}
/* 回報完成度的小視窗 */
function popPct(anchor, t, done) {
  var cur = progOf(t) || 0;
  var p = openPop(anchor, '<div class="lab">「' + esc(t.title) + '」完成度</div><div style="display:flex;gap:8px;align-items:center;padding:4px 6px"><input type="range" min="0" max="100" step="5" id="pctR" value="' + cur + '" style="flex:1"><input class="field" type="number" min="0" max="100" step="5" id="pctN" value="' + cur + '" style="width:64px;margin:0">%</div>' +
    '<div style="display:flex;gap:4px;padding:2px 6px">' + [25, 50, 75, 90].map(function (v) { return '<button class="btn sm" data-pv="' + v + '">' + v + '%</button>'; }).join('') + '</div><div style="display:flex;gap:6px;padding:6px"><button class="btn sm primary" id="pctOk">儲存</button><span class="hint">做完請按「送驗收」</span></div>', 290);
  var r = $('#pctR', p), n = $('#pctN', p);
  r.addEventListener('input', function () { n.value = r.value; });
  n.addEventListener('input', function () { r.value = n.value; });
  $$('[data-pv]', p).forEach(function (b) { b.addEventListener('click', function () { r.value = n.value = b.dataset.pv; }); });
  var save = function () {
    var v = Math.max(0, Math.min(100, Math.round(Number(n.value) || 0)));
    closePop();
    if (v !== Number(t.pct)) patchTask(t.id, { pct: v }, '已更新完成度 ' + v + '%');
    if (done) done(v);
  };
  $('#pctOk', p).addEventListener('click', save);
  n.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
  n.focus(); n.select();
}
/* 標籤 */
function splitTags(s) { return String(s || '').split(/\s*[,，、;；]\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
function tagColorOf(name) {
  var m = API.tagColors(); if (m[name] !== undefined) return m[name];
  return hash(name) % 12;
}
function tagChip(name, extra) { return '<span class="tagc tg' + tagColorOf(name) + '">' + esc(name) + (extra ? ' ' + extra : '') + '</span>'; }
function pmList(p) { return String((p && p.pm) || '').split(/\s*[,，、;；]\s*/).filter(Boolean); }
function managedBy(name) { return S.data.projects.filter(function (p) { return pmList(p).indexOf(name) >= 0; }).map(function (p) { return p.id; }); }
/* 等你驗收：有設定管理專案的人只收到那些專案；沒設定的照權限收到全部 */
function isMyReview(t) {
  if (t.status !== '待驗收' || !canEdit(t)) return false;
  var mine = managedBy(S.data.me.name);
  return !mine.length || mine.indexOf(t.project) >= 0;
}
function canUpdate(t) { return canEdit(t) || t.owner === S.data.me.name; }
function statusChoices(t) { return canEdit(t) ? STATUSES : ['未開始', '進行中', '待驗收']; }
function projName(id) { return (projById[id] || {}).name || id; }
/* 專案圖示：上傳的圖片 > emoji > 專案顏色＋名稱第一個字 */
function picon(pOrId, size) {
  var p = typeof pOrId === 'string' ? projById[pOrId] : pOrId; size = size || 18;
  var st = 'width:' + size + 'px;height:' + size + 'px;';
  if (!p) return '<span class="picon" style="' + st + '"></span>';
  var ic = p.icon || '';
  if (/^data:image\//.test(ic)) return '<img class="picon img" src="' + esc(ic) + '" alt="" style="' + st + '">';
  if (ic) return '<span class="picon emo" style="' + st + 'font-size:' + Math.round(size * 0.82) + 'px">' + esc(ic) + '</span>';
  return '<span class="picon" style="' + st + 'font-size:' + Math.max(9, Math.round(size * 0.58)) + 'px;background:' + pcolor(p.id) + '">' + esc((p.name || '?').trim().charAt(0)) + '</span>';
}
function pcolor(id) { var p = projById[id]; if (p && p.color) return p.color; var i = S.data.projects.findIndex(function (x) { return x.id === id; }); return GROUP_COLORS[(i < 0 ? 0 : i) % GROUP_COLORS.length]; }
function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function avatar(name, sm) {
  if (!name) return '<span class="av none' + (sm ? ' sm' : '') + '" title="未指派"></span>';
  return '<span class="av' + (sm ? ' sm' : '') + '" style="background:' + GROUP_COLORS[hash(name) % GROUP_COLORS.length] + '" title="' + esc(name) + '">' + esc(name.slice(0, 1)) + '</span>';
}
function person(name) { return '<span class="person">' + avatar(name, true) + '<span>' + esc(name || '未指派') + '</span></span>'; }
function sev(w) { return /^(循環|超過出版日|找不到前置|前置不能)/.test(w) ? 'd' : 'w'; }
function worst(t) { var s = ''; (t.warns || []).forEach(function (w) { if (sev(w) === 'd') s = 'd'; else if (!s) s = 'w'; }); return s; }
function pill(st) { return '<span class="pill st-' + esc(st) + '">' + esc(st) + '</span>'; }
function sortTasks(a, b) { return (a.start || '9999').localeCompare(b.start || '9999') || a.id.localeCompare(b.id); }
function battery(ts) {
  var n = ts.length || 1, c = {};
  ts.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; });
  return '<span class="battery" title="' + esc(STATUSES.filter(function (s) { return c[s]; }).map(function (s) { return s + ' ' + c[s]; }).join('、')) + '">' +
    ['完成', '待驗收', '進行中', '暫停', '未開始'].map(function (s) { return c[s] ? '<i class="st-' + s + '" style="width:' + (c[s] / n * 100) + '%"></i>' : ''; }).join('') + '</span>';
}

/* ---------------- 背景存檔（先改畫面，再依序送出） ---------------- */
var syncChain = Promise.resolve(), syncCount = 0;
function syncUi() { var el = $('#sync'); if (el) el.classList.toggle('hidden', !syncCount); }
function saveLater(id, patch, fn, okMsg) {
  if (S.preview) { toast(PREVIEW_MSG, true); return; }
  var t = byId[id], backup = {};
  Object.keys(patch).forEach(function (k) { backup[k] = t[k]; t[k] = patch[k]; });
  syncCount++; syncUi(); render();
  syncChain = syncChain.then(function () { return fn(byId[id]); }).then(function (r) {
    if (r && r.task) upsert(r.task);
    if (r) applyComputed(r.computed);
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
  }).catch(function (e) {
    var cur = byId[id];
    if (cur) Object.keys(backup).forEach(function (k) { cur[k] = backup[k]; });
    toast('沒有存成功，已還原：' + (e.message || e), true);
  }).then(function () { syncCount--; syncUi(); if (!isEditing()) render(); });
}
/** 只改某幾個欄位（格內編輯用） */
function patchTask(id, patch, okMsg) {
  saveLater(id, patch, function (cur) { var o = Object.assign({ id: cur.id, at: cur.at }, patch); return call('saveTask', o); }, okMsg);
}
function isEditing() {
  if (COMPOSING) return true;
  var a = document.activeElement;
  if ($('#drawer') && $('#drawer').classList.contains('open') || $('.modal') || $('.pop')) return true;
  if (!a || !/INPUT|TEXTAREA|SELECT/.test(a.tagName)) return false;
  // 篩選列的搜尋框、下拉選單不算編輯：重畫後會把游標放回原位
  if (a.id && a.closest('.toolbar') && (a.type === 'search' || a.tagName === 'SELECT')) return false;
  return true;
}
/* 背景重新讀取資料（別人改了專案、人員、行事曆等）：不顯示轉圈，畫面一次換掉 */
function refreshData() {
  return call('getData', { history: true }).then(function (d) {
    S.realData = d;
    S.data = S.preview ? previewData(d, S.preview) : d; index();
    render();
  }).catch(function (e) { console.warn('背景更新失敗', e); });
}

/* ---------------- 路由 ---------------- */
function parseRoute() {
  var h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'p' && h[1]) return { view: h[2] === 'gantt' ? 'gantt' : 'board', project: decodeURIComponent(h[1]) };
  if (h[0] === 'mine') return { view: 'mine', person: h[1] ? decodeURIComponent(h[1]) : '' };
  if (h[0] === 'people') return { view: 'people' };
  if (h[0] === 'settings') return { view: 'settings', tab: h[1] || '' };
  if (h[0] === 'help') return { view: 'help', tab: h[1] ? decodeURIComponent(h[1]) : '' };
  return { view: 'home' };
}
function go(path) { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; }
window.addEventListener('hashchange', function () { S.route = parseRoute(); S.sel = null; S.picked = {}; closePop(); if (S.data) render(); var a = $('.app'); if (a) a.classList.remove('nav-open'); });

/* ---------------- 主題 ---------------- */
function sideMini() { try { return localStorage.getItem('pm-side') === 'mini'; } catch (e) { return false; } }
function theme() { try { return localStorage.getItem('pm-theme') || 'auto'; } catch (e) { return 'auto'; } }
function cycleTheme() {
  var next = { auto: 'light', light: 'dark', dark: 'auto' }[theme()];
  try { localStorage.setItem('pm-theme', next); } catch (e) {}
  if (next === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', next);
  var b = $('#themeBtn'); if (b) { b.innerHTML = IC[next === 'auto' ? 'auto' : next === 'light' ? 'sun' : 'moon']; b.title = { auto: '主題：跟隨系統', light: '主題：淺色', dark: '主題：深色' }[next]; }
}

/* ---------------- 載入 ---------------- */
function load(history) {
  busy(true);
  return call('getData', { history: !!history }).then(function (d) {
    S.realData = d;
    S.data = S.preview ? previewData(d, S.preview) : d; index();
    var names = d.people.map(function (p) { return p.name; });
    if (!S.minePerson || names.indexOf(S.minePerson) < 0) S.minePerson = names.indexOf(d.me.name) >= 0 ? d.me.name : (names[0] || '');
    busy(false); renderShell(); render();
  }).catch(fail);
}

/* ---------------- 以其他人的視角預覽（管理員） ---------------- */
function previewData(d, who) {
  var scope = (API.adminData().settings.filter(function (x) { return x.key === '美術可見範圍'; })[0] || {}).value || '全部';
  var me = { name: who.name, role: who.role, email: who.email || '' };
  var canEditP = function (p) {
    if (me.role === '管理員') return true;
    if (me.role !== 'PM' || p.status === '封存') return false;
    var pms = String(p.pm || '').split(/\s*[,，、;；]\s*/).filter(Boolean);
    return !pms.length || pms.indexOf(me.name) >= 0 || (me.email && pms.map(function (x) { return x.toLowerCase(); }).indexOf(me.email) >= 0);
  };
  var tasks = d.tasks, projects = d.projects;
  if (me.role === '美術' && scope !== '全部') {
    var mine = {}; tasks.forEach(function (t) { if (t.owner === me.name) mine[t.project] = 1; });
    projects = projects.filter(function (p) { return mine[p.id]; });
    tasks = scope === '自己的工項' ? tasks.filter(function (t) { return t.owner === me.name; }) : tasks.filter(function (t) { return mine[t.project]; });
  }
  return Object.assign({}, d, {
    me: me, tasks: tasks, sheetUrl: '',
    projects: projects.map(function (p) { return Object.assign({}, p, { canEdit: canEditP(p) }); }),
    people: d.people.map(function (p) { return { name: p.name, role: p.role, alias: p.alias }; })
  });
}
function startPreview(who) {
  S.preview = who; S.minePerson = who.name; S.picked = {};
  S.data = previewData(S.realData, who); index(); renderShell(); go('mine');

}
function endPreview() {
  S.preview = null; S.data = S.realData; index(); S.minePerson = S.data.me.name; renderShell(); render();
}
function openPreviewPicker() {
  var people = API.adminData().people.filter(function (p) { return p.active; });
  var h = '<h3>以其他人的視角預覽</h3><p class="muted" style="margin:0 0 12px;font-size:13px">看看某位同仁登入後看到的畫面和能做的操作。預覽時只能看，不會修改任何資料。</p>';
  h += '<div class="form"><label class="full">人員<select class="field" id="pvWho" style="max-width:none">' + ['美術', 'PM'].map(function (r) {
    return '<optgroup label="' + r + '">' + people.filter(function (p) { return p.role === r; }).map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + (p.email ? '' : '（還沒填 Email）') + '</option>'; }).join('') + '</optgroup>';
  }).join('') + '</select></label></div>';
  h += '<div class="mfoot"><button class="btn" id="pvC">取消</button><button class="btn primary" id="pvGo">開始預覽</button></div>';
  modal(h);
  $('#pvC').addEventListener('click', closeModal);
  $('#pvGo').addEventListener('click', function () {
    var p = people.filter(function (x) { return x.name === $('#pvWho').value; })[0];
    if (!p) return;
    closeModal(); startPreview({ name: p.name, role: p.role, email: p.email });
  });
}

/* ---------------- 外框 ---------------- */
function renderShell() {
  var d = S.data;
  $('#root').innerHTML =
    '<div class="app' + (sideMini() ? ' side-mini' : '') + '">' +
    '<aside class="side"><div class="brand"><span class="mark">' + IC.brand + '</span><span class="lb">美術專案管理</span><button class="side-tg" id="sideBtn" title="收合側邊欄">' + IC.chevL + '</button></div><nav class="nav" id="nav"></nav>' +
    '<div class="side-foot">' + avatar(d.me.name) + '<div class="who"><b>' + esc(d.me.name) + '</b><span>' + esc(d.me.role) + '</span></div>' +
    ((S.realData && S.realData.me.role === '管理員' && !S.preview) ? '<button class="btn ghost icon" id="pvBtn" title="以其他人的視角預覽">' + IC.eye + '</button>' : '') +
    '<button class="btn ghost icon" id="themeBtn"></button><button class="btn ghost icon" id="logoutBtn" title="登出">' + IC.logout + '</button></div></aside>' +
    '<section class="main">' + (S.preview ? '<div class="pvbar"><span>' + IC.eye + '正在以「<b>' + esc(d.me.name) + '</b>（' + esc(d.me.role) + '）」的視角預覽，只能看不能改。</span><span class="grow"></span><button class="btn sm" id="pvSwitch">換一個人</button><button class="btn sm primary" id="pvEnd">結束預覽</button></div>' : '') + '<div class="top"><button class="btn ghost icon menu-btn" id="menuBtn" title="選單">' + IC.menu + '</button><h1 id="title"></h1><span class="grow"></span>' +
    '<span class="sync hidden" id="sync">同步中</span><button class="btn ghost icon" id="reloadBtn" title="重新整理">' + IC.refresh + '</button><span id="topActions"></span></div>' +
    '<div class="views hidden" id="views"></div><div class="content" id="content"></div></section></div>';
  var t = theme(); $('#themeBtn').innerHTML = IC[t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon'];
  $('#themeBtn').title = { auto: '主題：跟隨系統', light: '主題：淺色', dark: '主題：深色' }[t];
  $('#themeBtn').addEventListener('click', cycleTheme);
  var pv = $('#pvBtn'); if (pv) pv.addEventListener('click', openPreviewPicker);
  var pe = $('#pvEnd'); if (pe) pe.addEventListener('click', endPreview);
  var ps = $('#pvSwitch'); if (ps) ps.addEventListener('click', openPreviewPicker);
  $('#logoutBtn').addEventListener('click', function () { API.signOut(); });
  $('#reloadBtn').addEventListener('click', function () { load(S.data.history); });
  $('#menuBtn').addEventListener('click', function () { $('.app').classList.toggle('nav-open'); });
  $('#sideBtn').addEventListener('click', function () {
    var on = !$('.app').classList.contains('side-mini');
    $('.app').classList.toggle('side-mini', on);
    try { localStorage.setItem('pm-side', on ? 'mini' : ''); } catch (e) {}
    $('#sideBtn').title = on ? '展開側邊欄' : '收合側邊欄';
  });
  $('#sideBtn').title = sideMini() ? '展開側邊欄' : '收合側邊欄';
  $('#content').addEventListener('click', function (e) { if (window.innerWidth <= 860 && !e.target.closest('.side')) $('.app').classList.remove('nav-open'); });
}
function renderNav() {
  var d = S.data, r = S.route;
  var mineCount = d.tasks.filter(function (t) { return t.owner === d.me.name && (t.status === '進行中' || t.status === '未開始'); }).length;
  var review = isPM() ? d.tasks.filter(isMyReview).length : 0;
  var h = '<a href="#/" title="首頁" class="' + (r.view === 'home' ? 'on' : '') + '"><span class="ic">' + IC.home + '</span><span class="lb">首頁</span></a>';
  h += '<a href="#/mine" title="我的工作" class="' + (r.view === 'mine' ? 'on' : '') + '"><span class="ic">' + IC.mine + '</span><span class="lb">我的工作</span>' + (review ? '<span class="badge" title="等你驗收">' + review + '</span>' : (mineCount ? '<span class="badge" style="background:var(--line);color:var(--ink2)">' + mineCount + '</span>' : '')) + '</a>';
  h += '<a href="#/people" title="人員排程" class="' + (r.view === 'people' ? 'on' : '') + '"><span class="ic">' + IC.people + '</span><span class="lb">人員排程</span></a>';
  h += '<div class="sec"><span>專案</span>' + (isPM() ? '<button id="navNewProj" title="新增專案">＋</button>' : '') + '</div>';
  var ps = d.projects.slice().sort(function (a, b) { return (a.status === '封存') - (b.status === '封存') || a.name.localeCompare(b.name, 'zh-Hant'); });
  ps.forEach(function (p) {
    var on = (r.view === 'board' || r.view === 'gantt') && r.project === p.id;
    h += '<a href="#/p/' + encodeURIComponent(p.id) + '" title="' + esc(p.name) + '" class="' + (on ? 'on ' : '') + (p.status === '封存' ? 'archived' : '') + '">' + picon(p, 20) + '<span class="pnm">' + esc(p.name) + '</span></a>';
  });
  h += '<div class="sec"><span>' + (isPM() ? '管理' : '其他') + '</span></div>';
  if (isPM()) h += '<a href="#/settings" title="設定" class="' + (r.view === 'settings' ? 'on' : '') + '"><span class="ic">' + IC.settings + '</span><span class="lb">設定</span></a>';
  h += '<a href="#/help" title="使用說明" class="' + (r.view === 'help' ? 'on' : '') + '"><span class="ic">' + IC.help + '</span><span class="lb">使用說明</span></a>';
  $('#nav').innerHTML = h;
  var np = $('#navNewProj'); if (np) np.addEventListener('click', function () { openProject(null); });
}
function setTitle(html) { $('#title').innerHTML = html; }
function setActions(html) { $('#topActions').innerHTML = html || ''; }
function setViews(html) { var v = $('#views'); v.innerHTML = html || ''; v.classList.toggle('hidden', !html); }

function render() {
  if (!S.data) return;
  if (COMPOSING) { S.needRender = true; return; }
  var ct = $('#content'), sameView = S._lastHash === location.hash, st = ct ? ct.scrollTop : 0;
  S._lastHash = location.hash;
  var fa = document.activeElement, keep = fa && fa.id && fa.closest && fa.closest('.toolbar') ? { id: fa.id, s: fa.selectionStart, e: fa.selectionEnd } : null;
  renderInner();
  if (sameView && ct && st && ct.scrollTop !== st) ct.scrollTop = st;
  if (keep) { var n = document.getElementById(keep.id); if (n && n !== document.activeElement) { n.focus(); try { if (keep.s !== null && keep.s !== undefined) n.setSelectionRange(keep.s, keep.e); } catch (x) {} } }
}
function renderInner() {
  S.route = parseRoute();
  renderNav();
  var c = $('#content');
  c.className = 'content';
  setActions(''); setViews('');
  var r = S.route;
  if ((r.view === 'board' || r.view === 'gantt') && !projById[r.project]) { r.view = 'home'; }
  if (r.view === 'settings' && !isPM()) r.view = 'home';
  ({ home: renderHome, board: renderBoard, gantt: renderGantt, people: renderPeople, mine: renderMine, settings: renderSettings, help: renderHelp })[r.view](c);
  syncUi();
}

/* ---------------- 首頁 ---------------- */
function renderHome(c) {
  var d = S.data;
  setTitle('<span class="t">首頁</span>');
  var act = d.projects.filter(function (p) { return p.status !== '封存'; });
  // 一般美術：只看自己的工項，以及和自己的工項有前後關係的工項
  var artist = !isPM(), pool = d.tasks, me = d.me.name;
  S._rel = null;
  if (artist) {
    var rel = {};
    d.tasks.forEach(function (t) {
      if (t.owner !== me) return;
      rel[t.id] = '';
      split(t.preds).forEach(function (x) { if (byId[x] && byId[x].owner !== me) rel[x] = '你在等這項'; });
      (succ[t.id] || []).forEach(function (x) { if (byId[x] && byId[x].owner !== me && rel[x] === undefined) rel[x] = '在等你完成'; });
    });
    S._rel = rel;
    pool = d.tasks.filter(function (t) { return rel[t.id] !== undefined; });
    act = act.filter(function (p) { return d.tasks.some(function (t) { return t.project === p.id && t.owner === me; }); });
  }
  // PM：有設定管理專案時，提醒列表只列這些專案的工項（沒設定的照舊看全部）
  var mgIds = d.me.role === 'PM' ? managedBy(me) : [];
  if (mgIds.length) {
    pool = d.tasks.filter(function (t) { return mgIds.indexOf(t.project) >= 0; });
    act = act.filter(function (p) { return mgIds.indexOf(p.id) >= 0; });
  }
  var h = '<div class="home-h"><h2>' + greet() + '，' + esc(d.me.name) + '</h2><span class="muted">今天是 ' + d.today.replace(/-/g, '/') + '（' + '日一二三四五六'[wk(dn(d.today))] + '）</span></div>';
  h += '<div class="cards">';
  act.forEach(function (p) {
    var ts = d.tasks.filter(function (t) { return t.project === p.id && t.status !== '取消'; });
    var open = ts.filter(function (t) { return t.status !== '完成'; });
    var w = 0, wd = 0; ts.forEach(function (t) { var x = Number(t.days) || 0; w += x; if (t.status === '完成') wd += x; });
    var late = open.filter(function (t) { return (t.warns || []).some(function (x) { return /^(進度落後|比基準晚)/.test(x); }); }).length;
    var over = open.filter(function (t) { return (t.warns || []).some(function (x) { return /^超過出版日/.test(x); }); }).length;
    var lastEnd = open.reduce(function (a, t) { return t.end > a ? t.end : a; }, '');
    h += '<div class="card pcard" data-p="' + esc(p.id) + '"><div class="hd">' + picon(p, 22) + '<b>' + esc(p.name) + '</b>' + (p.status !== '進行中' ? '<span class="pill st-暫停">' + esc(p.status) + '</span>' : '') + '</div>' +
      '<div style="display:flex;align-items:flex-end;gap:10px"><span class="big">' + (w ? Math.round(wd / w * 100) : 0) + '%</span><span class="muted" style="font-size:12px;padding-bottom:3px">完成（依工作天）' + (lastEnd ? '・預計 ' + md(lastEnd) + ' 全部完成' : '') + '</span></div>' +
      battery(ts) +
      '<div class="row3"><span><b>' + open.filter(function (t) { return t.status === '進行中'; }).length + '</b>進行中</span><span><b>' + open.filter(function (t) { return t.status === '待驗收'; }).length + '</b>待驗收</span>' +
      '<span class="' + (late ? 'meh' : '') + '"><b>' + late + '</b>落後</span><span class="' + (over ? 'bad' : '') + '"><b>' + over + '</b>超過出版日</span></div></div>';
  });
  if (!act.length) h += '<div class="card empty"><b>' + (artist ? '你目前沒有負責的專案' : '還沒有專案') + '</b>' + (isPM() ? '從左側「專案」旁的 ＋ 新增第一個專案。' : '有工項指派給你之後，專案會出現在這裡。') + '</div>';
  h += '</div>';
  var issues = pool.filter(function (t) { return (t.warns || []).length && t.status !== '完成' && t.status !== '取消' && projById[t.project] && projById[t.project].status !== '封存'; });
  var order = function (t) { var w = t.warns.join(' '); return /循環/.test(w) ? 0 : /超過出版日/.test(w) ? 1 : /進度落後|未回報/.test(w) ? 2 : /排序衝突/.test(w) ? 3 : 4; };
  issues.sort(function (a, b) { return order(a) - order(b) || (a.end || '').localeCompare(b.end || ''); });
  if (artist) h += '<div class="hint" style="margin:18px 0 -6px">下面只列出你的工項，以及你在等的、在等你完成的工項。</div>';
  else if (mgIds.length) h += '<div class="hint" style="margin:18px 0 -6px">首頁只列出你管理的專案：' + esc(mgIds.map(projName).join('、')) + '。</div>';
  h += '<div class="home2"><section>';
  h += '<div class="sec-h"><h3>需要注意</h3><span class="faint">' + issues.length + ' 項</span></div>';
  h += issues.length ? homeList('issues', issues) : '<div class="list empty"><b>目前沒有警示</b>所有工項都在出版日前、照基準進行。</div>';
  var today = dn(d.today), wkEnd = today + 7;
  var due = pool.filter(function (t) { return t.status !== '完成' && t.status !== '取消' && t.end && dn(t.end) >= today && dn(t.end) <= wkEnd; }).sort(sortTasks);
  h += '</section><section><div class="sec-h"><h3>七天內預計完成</h3><span class="faint">' + due.length + ' 項</span></div>';
  h += due.length ? homeList('due', due) : '<div class="list empty">七天內沒有預計完成的工項。</div>';
  h += '</section></div>';
  c.innerHTML = h;
  $$('.pcard', c).forEach(function (el) { el.addEventListener('click', function () { go('p/' + encodeURIComponent(el.dataset.p)); }); });
  $$('[data-more]', c).forEach(function (b) { b.addEventListener('click', function () { S.homeAll = S.homeAll || {}; S.homeAll[b.dataset.more] = !S.homeAll[b.dataset.more]; render(); }); });
  $$('.li', c).forEach(function (el) { el.addEventListener('click', function () { openTask(el.dataset.id); }); });
}
/* 首頁列表：先列 15 項，其餘按「顯示全部」展開 */
function homeList(key, list) {
  var N = 15, all = S.homeAll && S.homeAll[key], show = all ? list : list.slice(0, N);
  return '<div class="list">' + show.map(listItem).join('') + '</div>' +
    (list.length > N ? '<button class="btn ghost" data-more="' + key + '" style="width:100%;margin-top:6px">' + (all ? '收起，只看前 ' + N + ' 項' : '顯示全部 ' + list.length + ' 項（還有 ' + (list.length - N) + ' 項）') + '</button>' : '');
}
function greet() { var h = new Date(Date.now() + 8 * 3600000).getUTCHours(); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; }
function listItem(t) {
  return '<div class="li" data-id="' + esc(t.id) + '"><span class="dot" style="width:10px;height:10px;border-radius:3px;background:' + pcolor(t.project) + '"></span>' +
    '<div class="t"><b>' + esc(t.title) + '</b><span>' + esc(projName(t.project)) + (t.group ? '・' + esc(t.group) : '') + '</span></div>' +
    '<div class="who">' + person(t.owner) + '</div>' +
    '<div class="meta">' + (S._rel && S._rel[t.id] ? '<span class="wtag ' + (S._rel[t.id] === '在等你完成' ? 'w' : 'ok') + '">' + S._rel[t.id] + '</span>' : '') + pill(t.status) + '<span class="faint">預計 ' + md(t.end) + '</span>' + progBar(t) +
    (t.warns || []).slice(0, 2).map(function (w) { return '<span class="wtag ' + sev(w) + '">' + esc(w) + '</span>'; }).join('') + '</div></div>';
}

/* ---------------- 專案共用：標題、檢視切換、篩選 ---------------- */
function projectHeader(p, view) {
  fixFilters(p.id);
  setTitle(picon(p, 26) + '<span class="t">' + esc(p.name) + '</span>' + (p.status !== '進行中' ? ' <span class="pill st-暫停" style="font-size:11px">' + esc(p.status) + '</span>' : ''));
  setViews('<a href="#/p/' + encodeURIComponent(p.id) + '" class="' + (view === 'board' ? 'on' : '') + '">' + '<span style="width:16px;height:16px;display:inline-flex">' + IC.board + '</span>主表格</a>' +
    '<a href="#/p/' + encodeURIComponent(p.id) + '/gantt" class="' + (view === 'gantt' ? 'on' : '') + '"><span style="width:16px;height:16px;display:inline-flex">' + IC.gantt + '</span>甘特圖</a>');
  var acts = '';
  if (p.canEdit) acts += '<button class="btn" id="tplBtn">套用範本</button> <button class="btn hide-m" id="bulkBtn">批次新增</button> <button class="btn ghost icon" id="projBtn" title="專案設定">' + IC.settings + '</button> <button class="btn primary" id="addTask">' + IC.plus + '新增工項</button>';
  setActions(acts);
  var on = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
  on('#addTask', function () { openTask(null, { project: p.id }); });
  on('#tplBtn', openTemplate); on('#bulkBtn', openBulk); on('#projBtn', function () { openProject(p); });
}
function projectTasks(pid) { return S.data.tasks.filter(function (t) { return t.project === pid; }); }
/* 考核年度：S.year 空白 = 本年度；'*' = 全部（未封存） */
function periodSel() {
  if (S.year === '*') return null;
  var ps = API.periods();
  return (S.year && ps.list.filter(function (x) { return x.label === S.year; })[0]) || ps.current;
}
function inPeriod(t, P) {
  if (!P) return true;
  var open = t.status !== '完成' && t.status !== '取消';
  if (P.current && open) return true;
  var a = t.start, b = t.end;
  if (t.status === '取消' || !a) { a = b = t.aend || t.astart || (t.updatedAt || '').slice(0, 10); }
  return !!a && a <= P.to && b >= P.from;
}
function yearSelect() {
  var ps = API.periods(), cur = S.year || (ps.current ? ps.current.label : '*');
  return '<select class="field" id="fYear" title="考核年度">' + ps.list.map(function (x) {
    return '<option value="' + esc(x.label) + '"' + (x.label === cur ? ' selected' : '') + '>' + esc(x.label) + (x.current ? '（本年度）' : x.archived ? '（已封存）' : '') + '</option>';
  }).join('') + '<option value="*"' + (cur === '*' ? ' selected' : '') + '>全部年度（未封存）</option></select>';
}
function filtered(list) {
  var q = S.q.trim().toLowerCase(), P = periodSel();
  return list.filter(function (t) {
    if (!inPeriod(t, P)) return false;
    if (S.hideDone && (t.status === '完成' || t.status === '取消')) return false;
    if (S.owner && t.owner !== S.owner && Engine.splitNames(t.helper).indexOf(S.owner) < 0) return false;
    if (S.status && t.status !== S.status) return false;
    if (S.group && t.group !== S.group) return false;
    if (S.tag && splitTags(t.tag).indexOf(S.tag) < 0) return false;
    if (S.onlyWarn && !(t.warns || []).length) return false;
    if (q && (t.id + ' ' + t.title + ' ' + t.detail + ' ' + t.group + ' ' + t.owner + ' ' + t.helper + ' ' + t.tag + ' ' + t.code).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
/* 切換專案或資料變動後，篩選值如果在這個專案已經不存在就清掉（否則下拉選單顯示「所有…」卻篩不出東西） */
function filterOptions(pid) {
  var owners = {}, groups = {}, tags = {};
  projectTasks(pid).forEach(function (t) {
    if (t.owner) owners[t.owner] = 1;
    Engine.splitNames(t.helper).forEach(function (n) { owners[n] = owners[n] || 2; });
    if (t.group) groups[t.group] = 1;
    splitTags(t.tag).forEach(function (x) { tags[x] = 1; });
  });
  return { owners: owners, groups: groups, tags: tags };
}
function fixFilters(pid) {
  var o = filterOptions(pid);
  if (S.owner && !o.owners[S.owner]) S.owner = '';
  if (S.group && !o.groups[S.group]) S.group = '';
  if (S.tag && !o.tags[S.tag]) S.tag = '';
  if (S.status && STATUSES.indexOf(S.status) < 0) S.status = '';
  return o;
}
function filterBar(pid, right) {
  var fo = fixFilters(pid), owners = fo.owners, groups = fo.groups, tags = fo.tags;
  var opt = function (list, v, all) { return '<option value="">' + all + '</option>' + list.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); };
  return '<div class="toolbar">' + yearSelect() + '<span class="search">' + IC.search + '<input type="search" class="field" id="fQ" placeholder="搜尋工項、人名、ID" value="' + esc(S.q) + '"></span>' +
    '<select class="field" id="fOwner" title="負責人（含協力）">' + opt(Object.keys(owners).sort(function (a, b) { return a.localeCompare(b, 'zh-Hant'); }), S.owner, '所有負責人') + '</select>' +
    '<select class="field hide-m" id="fGroup">' + opt(Object.keys(groups).sort(), S.group, '所有群組') + '</select>' +
    (Object.keys(tags).length ? '<select class="field hide-m" id="fTag">' + opt(Object.keys(tags).sort(function (a, b) { return a.localeCompare(b, 'zh-Hant'); }), S.tag, '所有標籤') + '</select>' : '') +
    '<select class="field hide-m" id="fStatus">' + opt(STATUSES, S.status, '所有狀態') + '</select>' +
    '<button class="btn filter-btn' + (S.hideDone ? ' on' : '') + '" id="fHide">隱藏已完成</button>' +
    '<button class="btn filter-btn' + (S.onlyWarn ? ' on' : '') + '" id="fWarn">只看有警示</button>' +
    (S.q || S.owner || S.group || S.tag || S.status || S.onlyWarn ? '<button class="btn ghost" id="fClear">清除篩選</button>' : '') +
    '<span class="grow"></span>' + (right || '') + '</div>';
}
function bindFilters() {
  var on = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };
  on('#fQ', 'input', debounce(function (e) { S.q = e.target.value; var pos = e.target.selectionStart; render(); var n = $('#fQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }, 250));
  on('#fOwner', 'change', function (e) { S.owner = e.target.value; render(); });
  on('#colBtn', 'click', function (e) { openColPop(e.currentTarget); });
  on('#fYear', 'change', function (e) { var ps = API.periods(); S.year = (ps.current && e.target.value === ps.current.label) ? '' : e.target.value; S.picked = {}; render(); });
  on('#fGroup', 'change', function (e) { S.group = e.target.value; render(); });
  on('#fTag', 'change', function (e) { S.tag = e.target.value; render(); });
  on('#fStatus', 'change', function (e) { S.status = e.target.value; if (S.status === '完成') S.hideDone = false; render(); });
  on('#fHide', 'click', function () { S.hideDone = !S.hideDone; remember(); render(); });
  on('#fWarn', 'click', function () { S.onlyWarn = !S.onlyWarn; render(); });
  on('#fClear', 'click', function () { S.q = ''; S.owner = ''; S.group = ''; S.tag = ''; S.status = ''; S.onlyWarn = false; render(); });
}
function groupsOf(list) {
  var g = {}, order = [];
  list.forEach(function (t) { var k = t.group || '未分群組'; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(t); });
  return order.map(function (k, i) { return { name: k, tasks: g[k], color: GROUP_COLORS[hash(k) % GROUP_COLORS.length] }; });
}

/* ---------------- 主表格欄位：順序、寬度（%）、顯示，記在這台電腦的瀏覽器 ---------------- */
var COL_DEFS = [
  { k: 'title', label: '工項', w: 30, l: true, fixed: true },
  { k: 'owner', label: '負責', w: 11, l: true },
  { k: 'status', label: '狀態', w: 9 },
  { k: 'timeline', label: '時程', w: 14 },
  { k: 'days', label: '天數', w: 5 },
  { k: 'preds', label: '前置', w: 12, l: true },
  { k: 'release', label: '出版日', w: 7 },
  { k: 'tags', label: '標籤', w: 10, l: true, off: true }
];
function boardCols() {
  var saved = []; try { saved = JSON.parse(localStorage.getItem('pm-cols') || '[]'); } catch (e) {}
  var byK = {}; COL_DEFS.forEach(function (d) { byK[d.k] = d; });
  var out = [], seen = {};
  (Array.isArray(saved) ? saved : []).forEach(function (c) { var d = byK[c.k]; if (!d || seen[c.k]) return; seen[c.k] = 1; out.push({ k: d.k, label: d.label, l: d.l, fixed: d.fixed, w: Math.max(3, Math.min(80, Number(c.w) || d.w)), hide: !!c.hide && !d.fixed }); });
  COL_DEFS.forEach(function (d) { if (!seen[d.k]) out.push({ k: d.k, label: d.label, l: d.l, fixed: d.fixed, w: d.w, hide: !!d.off }); });
  S._allCols = out;
  return out.filter(function (c) { return !c.hide; });
}
function saveCols(all) { try { localStorage.setItem('pm-cols', JSON.stringify(all.map(function (c) { return { k: c.k, w: Math.round(c.w * 10) / 10, hide: !!c.hide }; }))); } catch (e) {} }
function colgroup(cols) { return '<colgroup><col style="width:6px"><col style="width:34px">' + cols.map(function (c) { return '<col data-cw="' + c.k + '" style="width:' + c.w + '%">'; }).join('') + '<col style="width:44px"></colgroup>'; }
function openColPop(anchor) {
  boardCols(); var all = S._allCols;
  var draw = function () {
    var sum = all.filter(function (c) { return !c.hide; }).reduce(function (s, c) { return s + c.w; }, 0);
    return '<div class="lab">表格欄位（只影響你這台電腦）</div>' + all.map(function (c, i) {
      return '<div class="opt" style="cursor:default"><input type="checkbox" data-ch="' + i + '"' + (c.hide ? '' : ' checked') + (c.fixed ? ' disabled' : '') + '><span style="flex:1">' + c.label + '</span>' +
        '<input class="field" type="number" min="3" max="80" step="1" data-cw2="' + i + '" value="' + Math.round(c.w) + '" style="width:58px;margin:0;height:28px">%' +
        '<button class="btn sm ghost" data-up="' + i + '"' + (i ? '' : ' disabled') + '>↑</button><button class="btn sm ghost" data-dn="' + i + '"' + (i < all.length - 1 ? '' : ' disabled') + '>↓</button></div>';
    }).join('') + '<div class="hint" style="padding:4px 8px">目前合計 ' + Math.round(sum) + '%（不用剛好 100，會依比例分配）。也可以直接在表頭拖曳欄位、拉欄位右邊緣調整寬度。</div><div style="padding:4px"><button class="btn sm" id="colReset">恢復預設</button></div>';
  };
  var p = openPop(anchor, draw(), 330);
  var bind = function () {
    var apply = function () { saveCols(all); render(); p.innerHTML = draw(); bind(); };
    $$('[data-ch]', p).forEach(function (x) { x.addEventListener('change', function () { all[+x.dataset.ch].hide = !x.checked; apply(); }); });
    $$('[data-cw2]', p).forEach(function (x) { x.addEventListener('change', function () { all[+x.dataset.cw2].w = Math.max(3, Math.min(80, Number(x.value) || 5)); apply(); }); });
    $$('[data-up]', p).forEach(function (x) { x.addEventListener('click', function () { var i = +x.dataset.up; all.splice(i - 1, 0, all.splice(i, 1)[0]); apply(); }); });
    $$('[data-dn]', p).forEach(function (x) { x.addEventListener('click', function () { var i = +x.dataset.dn; all.splice(i + 1, 0, all.splice(i, 1)[0]); apply(); }); });
    $('#colReset', p).addEventListener('click', function () { try { localStorage.removeItem('pm-cols'); } catch (e) {} boardCols(); all = S._allCols; render(); p.innerHTML = draw(); bind(); });
  };
  bind();
}
/* 表頭：拖曳換順序、拉右邊緣調寬度 */
function bindColHeaders(c) {
  var dragK = null;
  $$('th.cth', c).forEach(function (th) {
    th.addEventListener('dragstart', function (e) { if (e.target.classList.contains('rsz')) { e.preventDefault(); return; } dragK = th.dataset.col; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragK); } catch (x) {} });
    th.addEventListener('dragover', function (e) { if (dragK && dragK !== th.dataset.col) { e.preventDefault(); th.classList.add('dropto'); } });
    th.addEventListener('dragleave', function () { th.classList.remove('dropto'); });
    th.addEventListener('drop', function (e) {
      e.preventDefault(); th.classList.remove('dropto');
      if (!dragK || dragK === th.dataset.col) return;
      boardCols(); var all = S._allCols, from = all.findIndex(function (x) { return x.k === dragK; }), to = all.findIndex(function (x) { return x.k === th.dataset.col; });
      var m = all.splice(from, 1)[0]; all.splice(to, 0, m); saveCols(all); dragK = null; render();
    });
    th.addEventListener('dragend', function () { dragK = null; });
  });
  $$('[data-rsz]', c).forEach(function (h) {
    h.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var k = h.dataset.rsz, table = h.closest('table'), tw = table.getBoundingClientRect().width, x0 = e.clientX;
      boardCols(); var all = S._allCols, col = all.filter(function (x) { return x.k === k; })[0], w0 = col.w;
      var shown = all.filter(function (x) { return !x.hide; }), sum = shown.reduce(function (s, x) { return s + x.w; }, 0);
      var avail = tw - 84;   // 扣掉固定寬的欄
      var move = function (ev) {
        col.w = Math.max(3, Math.min(80, w0 + (ev.clientX - x0) / avail * sum));
        $$('col[data-cw="' + k + '"]', c).forEach(function (cl) { cl.style.width = col.w + '%'; });
      };
      var up = function () { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('colresize'); saveCols(all); };
      document.body.classList.add('colresize');
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  });
}
/* 滑鼠停在工項名稱上：顯示說明 */
var HTIP = null, HTIP_T = null;
function hideHtip() { clearTimeout(HTIP_T); if (HTIP) { HTIP.remove(); HTIP = null; } }
function bindTitleTips(c) {
  $$('tr.row td.title', c).forEach(function (td) {
    var t = byId[td.parentNode.dataset.id]; if (!t) return;
    var show = function (e) {
      hideHtip();
      if (!t.detail && !t.note) return;
      var x = e.clientX, y = e.clientY;
      HTIP_T = setTimeout(function () {
        HTIP = document.createElement('div'); HTIP.className = 'htip';
        HTIP.innerHTML = '<b>' + esc(t.title) + '</b>' + (t.detail ? '<div>' + esc(t.detail) + '</div>' : '') + (t.note ? '<div class="nt">備註：' + esc(t.note) + '</div>' : '');
        document.body.appendChild(HTIP);
        var r = HTIP.getBoundingClientRect();
        HTIP.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - r.width - 8)) + 'px';
        HTIP.style.top = (y + 18 + r.height > window.innerHeight ? y - r.height - 10 : y + 18) + 'px';
      }, 450);
    };
    td.addEventListener('mouseenter', show);
    td.addEventListener('mousemove', function (e) { if (!HTIP) show(e); });
    td.addEventListener('mouseleave', hideHtip);
  });
}

/* ---------------- 主表格 ---------------- */
function renderBoard(c) {
  var p = projById[S.route.project];
  projectHeader(p, 'board');
  var P = periodSel(); if (P && P.archived) return renderArchived(c, p, P);
  var list = filtered(projectTasks(p.id)).sort(sortTasks);
  var groups = groupsOf(list);
  var h = filterBar(p.id, '<button class="btn ghost hide-m" id="colBtn" title="調整表格欄位的順序與寬度">欄位</button>') + '<div class="board">';
  if (!list.length) {
    h += '<div class="card empty"><b>' + (projectTasks(p.id).length ? '沒有符合篩選的工項' : '這個專案還沒有工項') + '</b>' +
      (projectTasks(p.id).length ? (S.hideDone ? '已完成的工項被隱藏了，可以點「隱藏已完成」顯示。' : '試試清除篩選。') : (p.canEdit ? '按右上角「新增工項」，或用「套用範本」一次建立一整串。' : '')) + '</div>';
  }
  var tmin = Infinity, tmax = -Infinity;
  list.forEach(function (t) { if (t.start) { tmin = Math.min(tmin, dn(t.start)); tmax = Math.max(tmax, dn(t.end)); } });
  groups.forEach(function (g) {
    var key = p.id + '|' + g.name, closed = !!S.collapsed[key];
    var gdays = g.tasks.reduce(function (s, t) { return s + (Number(t.days) || 0); }, 0);
    var allPicked = g.tasks.every(function (t) { return S.picked[t.id]; });
    h += '<div class="bgrp' + (closed ? ' closed' : '') + '" data-g="' + esc(g.name) + '"><div class="grp-h"><button class="tg" data-tg="' + esc(key) + '" style="color:' + g.color + '">' + IC.chev + '</button>' +
      '<span class="name" style="color:' + g.color + '">' + esc(g.name) + '</span><span class="cnt">' + g.tasks.length + ' 項・' + Math.round(gdays * 10) / 10 + ' 天</span>' + battery(g.tasks) + '</div>';
    if (closed) { h += '</div>'; return; }
    var cols = boardCols();
    h += '<div style="overflow-x:auto"><table class="tbl cfg">' + colgroup(cols) + '<thead><tr><th></th><th><input type="checkbox" data-gpick="' + esc(g.name) + '"' + (allPicked ? ' checked' : '') + '></th>' +
      cols.map(function (cd) { return '<th class="' + (cd.l ? 'l ' : '') + 'cth" draggable="true" data-col="' + cd.k + '" title="拖曳可以調整順序；拉右邊緣可以調整寬度">' + cd.label + '<span class="rsz" data-rsz="' + cd.k + '"></span></th>'; }).join('') + '<th></th></tr></thead><tbody>';
    g.tasks.forEach(function (t) { h += rowHtml(t, g.color, tmin, tmax, cols); });
    if (p.canEdit) h += '<tr class="add"><td class="edge" style="background:' + g.color + ';opacity:.45"></td><td></td><td colspan="' + (cols.length + 1) + '"><input placeholder="＋ 新增工項（輸入名稱後按 Enter）" data-addg="' + esc(g.name === '未分群組' ? '' : g.name) + '"></td></tr>';
    h += '</tbody></table></div></div>';
  });
  if (p.canEdit && list.length) h += '<button class="btn" id="addGroup">' + IC.plus + '新增群組</button>';
  h += '</div>';
  c.innerHTML = h;
  hideHtip();
  bindFilters();
  bindBoard(c, p);
  bindColHeaders(c);
  bindTitleTips(c);
  renderBulkBar();
}
/* 已封存年度：唯讀清單 */
function renderArchived(c, p, P) {
  var token = (S.archTok = (S.archTok || 0) + 1), cached = API.archivedCached(P.label);
  if (cached) return draw(cached);
  c.innerHTML = '<div class="toolbar">' + yearSelect() + '</div><div class="card empty"><b>讀取 ' + esc(P.label) + ' 的封存資料…</b></div>';
  bindFilters();
  API.loadArchived(P.label).then(function (rows) { if (token === S.archTok) draw(rows); }).catch(fail);
  function draw(rows) {
    var all = rows.filter(function (t) { return t.project === p.id; }), owners = {}, q = S.q.trim().toLowerCase();
    all.forEach(function (t) { if (t.owner) owners[t.owner] = 1; });
    var list = all.filter(function (t) {
      if (S.owner && t.owner !== S.owner) return false;
      return !q || (t.id + ' ' + t.title + ' ' + t.detail + ' ' + t.group + ' ' + t.owner + ' ' + t.tag).toLowerCase().indexOf(q) >= 0;
    }).sort(function (x, y) { return (x.aend || '') < (y.aend || '') ? -1 : (x.aend || '') > (y.aend || '') ? 1 : 0; });
    var h = '<div class="toolbar">' + yearSelect() + '<span class="search">' + IC.search + '<input type="search" class="field" id="fQ" placeholder="搜尋工項、人名、ID" value="' + esc(S.q) + '"></span>' +
      '<select class="field" id="fOwner"><option value="">所有負責人</option>' + Object.keys(owners).sort().map(function (o) { return '<option' + (o === S.owner ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      '<span class="grow"></span><span class="muted">' + esc(P.from) + ' ～ ' + esc(P.to) + '・已封存 ' + list.length + ' 項</span><button class="btn" id="archDl">下載 Excel</button></div>';
    if (!list.length) h += '<div class="card empty"><b>' + (all.length ? '沒有符合篩選的工項' : '這個專案在 ' + esc(P.label) + ' 沒有封存的工項') + '</b></div>';
    else {
      h += '<div class="card" style="overflow:auto"><table class="grid2"><thead><tr><th>群組</th><th>工項</th><th>負責</th><th>天數</th><th>實際開始</th><th>實際完成</th><th>狀態</th><th>ID</th></tr></thead><tbody>' +
        list.map(function (t) { return '<tr><td>' + esc(t.group) + '</td><td><b>' + esc(t.title) + '</b>' + (t.detail ? '<div class="faint" style="font-size:12px">' + esc(t.detail) + '</div>' : '') + '</td><td>' + person(t.owner) + '</td><td style="text-align:right">' + esc(t.days) + '</td><td>' + esc(t.astart) + '</td><td>' + esc(t.aend) + '</td><td>' + pill(t.status) + '</td><td class="faint">' + esc(t.id) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    h += '<div class="hint" style="margin-top:8px">已封存的工項只能檢視。需要修改請管理員到「設定 → 年度封存」解除封存。</div>';
    c.innerHTML = h;
    bindFilters();
    $('#archDl').addEventListener('click', function () { downloadTaskList(list, p.name + '_' + P.label); });
  }
}
function downloadTaskList(list, file) {
  busy(true);
  need('XLSX').then(function () {
    var rows = list.map(function (t) { return { '專案': projName(t.project), '群組': t.group, '工項': t.title, '說明': t.detail, '負責': t.owner, '天數': t.days, '實際開始': t.astart, '實際完成': t.aend, '狀態': t.status, '工項ID': t.id, '封存年度': t.archived }; });
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [12, 14, 30, 40, 10, 6, 11, 11, 8, 9, 10].map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, '工項');
    XLSX.writeFile(wb, file.replace(/[\\\/\?\*\[\]:]/g, '_') + '.xlsx');
    busy(false);
  }).catch(fail);
}
function rowHtml(t, color, tmin, tmax, cols) {
  cols = cols || boardCols();
  var ed = canEdit(t), up = canUpdate(t), w = worst(t);
  var over = t.release && t.end && t.end > t.release && t.status !== '完成';
  var preds = split(t.preds).map(function (pid) { var x = byId[pid]; return '<span class="chip" title="' + esc(x ? x.title + '（' + (x.owner || '未指派') + '，' + x.status + '，預計 ' + md(x.end) + '）' : pid) + '"><span class="d" style="background:' + (x ? ST_HEX[x.status] : '#999') + '"></span>' + esc(x ? (x.title.length > 8 ? x.title.slice(0, 8) + '…' : x.title) : pid) + '</span>'; }).join('');
  var tl = '';
  if (t.start) {
    var a = dn(t.start), b = dn(t.end), today = dn(S.data.today);
    var pg = progOf(t), pct = t.status === '完成' ? 100 : (t.status === '進行中' && pg !== null) ? pg : Math.max(0, Math.min(100, (today - a + 1) / (b - a + 1) * 100));
    tl = '<div class="tl' + (over ? ' bad' : '') + '" title="' + esc(t.start + ' ~ ' + t.end + (t.status === '進行中' && pg !== null ? '｜完成 ' + pg + '%' + (t.expect != null ? '（應有 ' + t.expect + '%）' : '') : '')) + '"><i style="width:' + pct + '%;background:' + color + ';opacity:.85"></i><span' + (pct > 55 ? ' style="color:#fff"' : '') + '>' + md(t.start) + ' – ' + md(t.end) + '</span></div>';
  }
  var hl = Engine.splitNames(t.helper);
  var cell = {
    title: '<td class="title" data-open="1"><div class="tt"><span class="n">' + esc(t.title) + '</span>' + (t.mode === '平行' ? '<span class="chip" title="不佔用負責人時間">平行</span>' : '') + (cols.some(function (c) { return c.k === 'tags'; }) ? '' : splitTags(t.tag).map(function (x) { return tagChip(x); }).join('')) + '<span class="id">' + esc(t.id) + '</span><button class="open">開啟</button></div></td>',
    owner: '<td class="owner cell' + (ed ? '' : ' ro') + '" data-ed="owner">' + person(t.owner) + (hl.length ? '<span class="hlp" title="協力：' + esc(hl.join('、')) + '">+' + hl.length + '</span>' : '') + '</td>',
    status: '<td class="status cell' + (up ? '' : ' ro') + '" data-ed="status"><div class="st-' + esc(t.status) + '">' + esc(t.status) + '</div></td>',
    timeline: '<td class="timeline cell ro">' + tl + '</td>',
    days: '<td class="num cell' + (ed ? '' : ' ro') + '" data-ed="days">' + esc(t.days) + '</td>',
    preds: '<td class="preds cell' + (ed ? '' : ' ro') + '" data-ed="preds">' + (preds || '<span class="faint">—</span>') + '</td>',
    release: '<td class="date cell' + (ed ? '' : ' ro') + (over ? ' late' : '') + '" data-ed="release">' + (t.release ? md(t.release) : '<span class="faint">—</span>') + '</td>',
    tags: '<td class="tagcell">' + (splitTags(t.tag).map(function (x) { return tagChip(x); }).join('') || '<span class="faint">—</span>') + '</td>'
  };
  return '<tr class="row' + (S.picked[t.id] ? ' sel' : '') + '" data-id="' + esc(t.id) + '"><td class="edge" style="background:' + color + '"></td>' +
    '<td class="ck"><input type="checkbox" data-pick="' + esc(t.id) + '"' + (S.picked[t.id] ? ' checked' : '') + '></td>' +
    cols.map(function (c) { return cell[c.k]; }).join('') +
    '<td class="warn">' + ((t.warns || []).length ? '<span class="wdot ' + w + '" title="' + esc(t.warns.join('\n')) + '">' + t.warns.length + '</span>' : (t.slip > 0 ? '<span class="wdot w" title="比基準晚 ' + t.slip + ' 天">+' + t.slip + '</span>' : '')) + '</td></tr>';
}
function bindBoard(c, p) {
  $$('[data-tg]', c).forEach(function (b) { b.addEventListener('click', function () { var k = b.dataset.tg; S.collapsed[k] = !S.collapsed[k]; remember(); render(); }); });
  $$('tr.row', c).forEach(function (tr) {
    var id = tr.dataset.id;
    $('td.title', tr).addEventListener('click', function () { openTask(id); });
    $$('td.cell:not(.ro)', tr).forEach(function (td) { td.addEventListener('click', function (e) { e.stopPropagation(); editCell(td, byId[id], td.dataset.ed); }); });
  });
  // 勾選：按住 Shift 點第二個，會把兩個之間（畫面上看得到的）工項一起勾選或取消
  var picks = $$('[data-pick]', c);
  var setPick = function (x, on) { x.checked = on; if (on) S.picked[x.dataset.pick] = true; else delete S.picked[x.dataset.pick]; x.closest('tr').classList.toggle('sel', on); };
  picks.forEach(function (cb, i) {
    cb.addEventListener('mousedown', function (e) { if (e.shiftKey) e.preventDefault(); });   // 避免 Shift 點擊時選到一整段文字
    cb.addEventListener('click', function (e) {
      e.stopPropagation();
      var j = S.lastPick ? picks.findIndex(function (x) { return x.dataset.pick === S.lastPick; }) : -1;
      if (e.shiftKey && j >= 0 && j !== i) {
        for (var k = Math.min(i, j); k <= Math.max(i, j); k++) setPick(picks[k], cb.checked);
      } else setPick(cb, cb.checked);
      S.lastPick = cb.dataset.pick;
      renderBulkBar();
    });
  });
  $$('[data-gpick]', c).forEach(function (cb) {
    cb.addEventListener('click', function () {
      var g = cb.dataset.gpick;
      $$('.bgrp[data-g="' + CSS.escape(g) + '"] [data-pick]', c).forEach(function (x) { x.checked = cb.checked; if (cb.checked) S.picked[x.dataset.pick] = true; else delete S.picked[x.dataset.pick]; x.closest('tr').classList.toggle('sel', cb.checked); });
      renderBulkBar();
    });
  });
  $$('[data-addg]', c).forEach(function (inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      var title = inp.value.trim(), grp = inp.dataset.addg; inp.value = ''; inp.disabled = true;
      call('saveTask', { project: p.id, group: grp, title: title, days: 1 }).then(function (r) {
        upsert(r.task); applyComputed(r.computed); toast('已新增「' + title + '」，點格子可以設定負責人和天數'); render();
        var again = $('.bgrp[data-g="' + CSS.escape(grp || '未分群組') + '"] [data-addg]'); if (again) again.focus();
      }).catch(function (er) { inp.disabled = false; inp.value = title; fail(er); });
    });
  });
  var ag = $('#addGroup');
  if (ag) ag.addEventListener('click', function () {
    var name = prompt('新群組名稱（例如角色名稱或版本）');
    if (!name || !name.trim()) return;
    openTask(null, { project: p.id, group: name.trim() });
  });
}

/* ---------------- 格內編輯 ---------------- */
var POP = null;
function closePop() { if (POP) { POP.remove(); POP = null; } SEL_POP = null; }
document.addEventListener('mousedown', function (e) { if (POP && !POP.contains(e.target)) closePop(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (POP) closePop(); else if ($('.modal')) closeModal(); else closeDrawer(); } });
function openPop(anchor, html, width) {
  closePop();
  var p = document.createElement('div'); p.className = 'pop'; p.innerHTML = html;
  if (width) p.style.width = width + 'px';
  document.body.appendChild(p); POP = p;
  var r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
  var x = Math.min(r.left, window.innerWidth - pw - 8), y = r.bottom + 4;
  if (y + ph > window.innerHeight - 8) y = Math.max(8, r.top - ph - 4);
  p.style.left = Math.max(8, x) + 'px'; p.style.top = y + 'px';
  return p;
}
/* 可搜尋的下拉選單：電腦上點開任何 <select>，都改成可以打字篩選的選單（手機維持原生選單） */
var SEL_POP = null;
document.addEventListener('mousedown', function (e) {
  var sel = e.target && e.target.closest ? e.target.closest('select') : null;
  if (!sel || sel.multiple || sel.disabled || sel.hasAttribute('data-native')) return;
  if (!(window.matchMedia && matchMedia('(pointer: fine)').matches)) return;
  e.preventDefault(); e.stopPropagation();
  if (POP && SEL_POP === sel) { closePop(); return; }
  sel.focus(); openSelectPop(sel);
}, true);
function openSelectPop(sel) {
  var items = [].map.call(sel.options, function (o, i) { return { i: i, v: o.value, t: o.textContent, dis: o.disabled, grp: o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : '' }; });
  var many = items.length > 6;
  var p = openPop(sel, (many ? '<input class="field" placeholder="輸入關鍵字篩選" id="spQ" autocomplete="off">' : '') + '<div id="spL"></div>', Math.max(sel.offsetWidth, 200));
  SEL_POP = sel;
  var hi = 0, shown = [];
  function draw() {
    var q = many ? $('#spQ', p).value.trim().toLowerCase() : '';
    shown = items.filter(function (x) { return !q || (x.t + ' ' + x.grp).toLowerCase().indexOf(q) >= 0; });
    if (hi >= shown.length) hi = Math.max(0, shown.length - 1);
    var lastG = null;
    $('#spL', p).innerHTML = shown.map(function (x, k) {
      var g = x.grp && x.grp !== lastG ? '<div class="lab">' + esc(x.grp) + '</div>' : ''; lastG = x.grp;
      return g + '<div class="opt' + (x.i === sel.selectedIndex ? ' on' : '') + (k === hi ? ' hi' : '') + '" data-k="' + k + '"' + (x.dis ? ' style="opacity:.4;pointer-events:none"' : '') + '>' + (esc(x.t) || '&nbsp;') + '</div>';
    }).join('') || '<div class="lab">找不到符合的選項</div>';
    var h = $('.opt.hi', p); if (h && h.scrollIntoView) h.scrollIntoView({ block: 'nearest' });
  }
  function pick(x) {
    closePop(); SEL_POP = null;
    if (!x || x.dis) return;
    if (sel.selectedIndex !== x.i) {
      sel.selectedIndex = x.i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sel.focus();
  }
  hi = Math.max(0, items.findIndex(function (x) { return x.i === sel.selectedIndex; }));
  draw();
  $('#spL', p).addEventListener('mousedown', function (e) { var o = e.target.closest('.opt'); if (o) { e.preventDefault(); pick(shown[+o.dataset.k]); } });
  var key = function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(shown.length - 1, hi + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === 'Tab') { closePop(); SEL_POP = null; }
  };
  if (many) { var q = $('#spQ', p); q.addEventListener('input', function () { hi = 0; draw(); }); q.addEventListener('keydown', key); q.focus(); }
  else { p.tabIndex = -1; p.addEventListener('keydown', key); p.focus(); }
}
function editCell(td, t, field) {
  if (field === 'status') return popStatus(td, t, function (st) { patchTask(t.id, { status: st }); });
  if (field === 'owner') return popOwner(td, t.owner, function (name) { patchTask(t.id, { owner: name }, name ? '已指派給 ' + name + '，排到他的工作最後' : ''); });
  if (field === 'days') return popNumber(td, t.days, '天數（工作天）', function (v) { patchTask(t.id, { days: v }, impactMsg); });
  if (field === 'release') return popDate(td, t.release, '出版日／期限', function (v) { patchTask(t.id, { release: v }); });
  if (field === 'preds') return popPreds(td, t);
}
function impactMsg() { return '已更新，後面的工項已自動重算'; }
function popStatus(anchor, t, cb) {
  var ok = statusChoices(t);
  var p = openPop(anchor, STATUSES.filter(function (s) { return s !== '取消' || canEdit(t); }).map(function (s) {
    return '<div class="sopt st-' + s + (ok.indexOf(s) < 0 ? ' dis' : '') + '" data-s="' + s + '" title="' + (ok.indexOf(s) < 0 ? '要由 PM 確認' : '') + '">' + s + '</div>';
  }).join(''), 170);
  $$('.sopt', p).forEach(function (el) { el.addEventListener('click', function () { if (el.classList.contains('dis')) return; closePop(); if (el.dataset.s !== t.status) cb(el.dataset.s); }); });
}
function popOwner(anchor, current, cb) {
  var people = S.data.people;
  var p = openPop(anchor, '<input class="field" placeholder="搜尋人員" id="popQ"><div id="popL"></div>', 240);
  var hi = 0, list = [];
  var draw = function () {
    var q = $('#popQ').value.trim().toLowerCase();
    list = [{ name: '' }].concat(people.filter(function (x) { return !q || (x.name + ' ' + (x.alias || '')).toLowerCase().indexOf(q) >= 0; }));
    if (q) list = list.slice(1);
    hi = Math.min(hi, list.length - 1);
    $('#popL').innerHTML = list.slice(0, 60).map(function (x, i) { return '<div class="opt' + (x.name === current ? ' on' : '') + (i === hi ? ' hi' : '') + '" data-i="' + i + '">' + (x.name ? avatar(x.name, true) + esc(x.name) + (x.role !== '美術' ? ' <span class="faint">' + esc(x.role) + '</span>' : '') : '<span class="av sm none"></span>未指派') + '</div>'; }).join('') || '<div class="lab">找不到</div>';
    $$('.opt', p).forEach(function (el) { el.addEventListener('click', function () { pick(list[+el.dataset.i]); }); });
  };
  var pick = function (x) { if (!x) return; closePop(); if (x.name !== current) cb(x.name); };
  $('#popQ').addEventListener('input', function () { hi = 0; draw(); });
  $('#popQ').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, list.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') { pick(list[hi]); }
  });
  draw(); $('#popQ').focus();
}
function popNumber(anchor, v, label, cb) {
  var p = openPop(anchor, '<div class="lab">' + esc(label) + '</div><input class="field" type="number" step="0.5" min="0" id="popN" value="' + esc(v) + '"><div class="hint" style="padding:0 4px">可以有小數，例如 0.5。按 Enter 儲存。</div>', 200);
  var inp = $('#popN'); inp.focus(); inp.select();
  var done = function () { var n = Number(inp.value); closePop(); if (inp.value === '' || isNaN(n) || n < 0) { toast('天數要是 0 以上的數字', true); return; } if (n !== Number(v)) cb(n); };
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
}
function popDate(anchor, v, label, cb) {
  var p = openPop(anchor, '<div class="lab">' + esc(label) + '</div><input class="field" type="date" id="popD" value="' + esc(v) + '"><div style="display:flex;gap:6px;margin-top:4px"><button class="btn sm primary" id="popOk">儲存</button>' + (v ? '<button class="btn sm ghost" id="popClr">清除</button>' : '') + '</div>', 220);
  var inp = $('#popD'); inp.focus();
  $('#popOk').addEventListener('click', function () { closePop(); if (inp.value !== (v || '')) cb(inp.value); });
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { closePop(); if (inp.value !== (v || '')) cb(inp.value); } });
  var c = $('#popClr'); if (c) c.addEventListener('click', function () { closePop(); cb(''); });
}
function popPreds(anchor, t) {
  var cur = split(t.preds);
  var p = openPop(anchor, '<div class="lab">前置工項（要先完成的工作）</div><div id="popCur"></div><div class="sep"></div><input class="field" placeholder="搜尋工項名稱或 ID 加入" id="popQ"><div id="popL"></div>', 320);
  var drawCur = function () {
    // 點工項本身＝打開那個工項；只有按右邊的 ✕（再確認一次）才會移除
    $('#popCur').innerHTML = cur.length ? cur.map(function (id) { var x = byId[id]; return '<div class="opt" data-go="' + esc(id) + '" title="打開這個工項"><span class="chip"><span class="d" style="background:' + (x ? ST_HEX[x.status] : '#999') + '"></span>' + esc(id) + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x ? x.title : '') + '</span><button class="btn sm ghost xrm" data-rm="' + esc(id) + '" title="移除這個前置">✕</button></div>'; }).join('') : '<div class="lab">沒有前置，可以直接開始</div>';
    $$('[data-go]', p).forEach(function (el) { el.addEventListener('click', function () { var id = el.dataset.go; if (!byId[id]) { toast('找不到 ' + id + '（可能已封存）', true); return; } closePop(); openTask(id); }); });
    $$('[data-rm]', p).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = '確定移除？'; el.classList.add('danger'); setTimeout(function () { if (el.isConnected) { el.dataset.sure = ''; el.textContent = '✕'; el.classList.remove('danger'); } }, 3000); return; }
        cur = cur.filter(function (x) { return x !== el.dataset.rm; }); save();
      });
    });
  };
  var save = function () { closePop(); patchTask(t.id, { preds: cur.join(', ') }, '已更新前置，排程已重算'); };
  var draw = function () {
    var q = $('#popQ').value.trim().toLowerCase();
    if (!q) { $('#popL').innerHTML = ''; return; }
    var hits = S.data.tasks.filter(function (x) { return x.id !== t.id && cur.indexOf(x.id) < 0 && x.status !== '取消' && (x.id.toLowerCase().indexOf(q) >= 0 || (x.title + ' ' + x.group + ' ' + x.owner).toLowerCase().indexOf(q) >= 0); })
      .sort(function (a, b) { return (b.project === t.project) - (a.project === t.project) || sortTasks(a, b); }).slice(0, 20);
    $('#popL').innerHTML = hits.map(function (x) { return '<div class="opt" data-add="' + esc(x.id) + '"><span class="chip"><span class="d" style="background:' + ST_HEX[x.status] + '"></span>' + esc(x.id) + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.title) + '</span><span class="faint">' + esc(x.owner) + '</span></div>'; }).join('') || '<div class="lab">找不到</div>';
    $$('[data-add]', p).forEach(function (el) { el.addEventListener('click', function () { cur.push(el.dataset.add); save(); }); });
  };
  drawCur(); $('#popQ').addEventListener('input', draw); $('#popQ').focus();
}

/* ---------------- 多選的批次操作 ---------------- */
function renderBulkBar() {
  var old = $('.bulkbar'); if (old) old.remove();
  var ids = Object.keys(S.picked).filter(function (id) { return byId[id]; });
  if (!ids.length || S.route.view !== 'board') return;
  var bar = document.createElement('div'); bar.className = 'bulkbar';
  bar.innerHTML = '已選 <b>' + ids.length + '</b> 項 <button class="btn sm" id="bkSt">改狀態</button><button class="btn sm" id="bkOw">指派給</button><button class="btn sm danger" id="bkDel">刪除</button><button class="btn sm ghost" id="bkX">取消選取</button>';
  document.body.appendChild(bar);
  var tasks = ids.map(function (id) { return byId[id]; });
  var editable = tasks.filter(canEdit);
  $('#bkX').addEventListener('click', function () { S.picked = {}; render(); });
  $('#bkSt').addEventListener('click', function (e) {
    popStatus(e.currentTarget, editable[0] || tasks[0], function (st) {
      busy(true);
      call('bulkStatus', editable.map(function (t) { return t.id; }), st).then(function (r) { busy(false); r.tasks.forEach(upsert); applyComputed(r.computed); S.picked = {}; toast('已把 ' + r.tasks.length + ' 項改成「' + st + '」'); render(); }).catch(fail);
    });
  });
  $('#bkOw').addEventListener('click', function (e) {
    popOwner(e.currentTarget, null, function (name) {
      editable.forEach(function (t) { patchTask(t.id, { owner: name }); });
      S.picked = {}; toast('已指派 ' + editable.length + ' 項給 ' + (name || '未指派'));
    });
  });
  $('#bkDel').addEventListener('click', function () {
    if (!confirm('刪除選取的 ' + editable.length + ' 個工項？刪除後無法復原。若只是不做了，建議改成「取消」狀態。')) return;
    busy(true);
    editable.reduce(function (pr, t) { return pr.then(function () { return call('deleteTask', t.id).then(function (r) { removeTask(t.id); applyComputed(r.computed); }); }); }, Promise.resolve())
      .then(function () { busy(false); S.picked = {}; toast('已刪除'); render(); }).catch(function (e) { S.picked = {}; fail(e); render(); });
  });
}

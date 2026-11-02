/**
 * 資料層：Supabase（資料庫、登入、即時同步）＋ 排程引擎（在瀏覽器計算）。
 * 對網頁介面提供跟原本 Apps Script 後端相同的函式名稱與回傳格式。
 */
var API = (function () {
  var C = window.PM_CONFIG || {};
  var sb = null, me = null, listeners = [];
  var cache = { tasks: [], byId: {}, projects: [], people: [], calendar: [], leaves: [], templates: [], settings: {}, out: null };
  var HISTORY_DAYS = 120;
  var STATUSES = ['未開始', '進行中', '待驗收', '完成', '暫停', '取消'];
  var lastSync = null;

  /* ---------------- 工具 ---------------- */
  function today() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
  function num(v, d) { if (v === '' || v === null || v === undefined) return d; var n = Number(v); return isNaN(n) ? d : n; }
  function dOrNull(v) { return v ? String(v).slice(0, 10) : null; }
  function split(s) { return Engine.splitIds(s); }
  function err(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || String(e);
    if (/row-level security|permission denied/i.test(m)) m = '你沒有這個操作的權限。';
    if (/JWT expired|invalid JWT/i.test(m)) m = '登入已過期，請重新整理頁面再登入一次。';
    if (/Failed to fetch|NetworkError/i.test(m)) m = '連不到資料庫，請檢查網路後再試一次。';
    if (/people_email_key/.test(m)) m = '這個 Email 已經有人使用。';
    if (/people_pkey/.test(m)) m = '已經有同名的人員。';
    if (/calendar_pkey/.test(m)) m = '這一天已經在行事曆裡。';
    return new Error(m);
  }
  function chk(res) { if (res.error) throw err(res.error); return res.data; }

  var T_MAP = { id: 'id', project: 'project', group: 'grp', code: 'code', tag: 'tag', title: 'title', detail: 'detail', owner: 'owner',
    helper: 'helper', mode: 'mode', prio: 'prio', days: 'days', preds: 'preds', lag: 'lag', earliest: 'earliest', release: 'release',
    status: 'status', doneQty: 'done_qty', qty: 'qty', pct: 'pct', astart: 'astart', aend: 'aend', baseline: 'baseline', note: 'note' };
  var T_DATES = { earliest: 1, release: 1, astart: 1, aend: 1, baseline: 1 };
  var T_NUMS = { prio: 1, days: 1, lag: 1, doneQty: 1, qty: 1, pct: 1 };

  function fromDb(r) {
    return {
      id: r.id, project: r.project, group: r.grp || '', code: r.code || '', tag: r.tag || '', title: r.title, detail: r.detail || '',
      owner: r.owner || '', helper: r.helper || '', mode: r.mode, prio: num(r.prio, ''), days: num(r.days, 0), preds: r.preds || '',
      lag: num(r.lag, 0), earliest: r.earliest || '', release: r.release || '', status: r.status, doneQty: num(r.done_qty, 0),
      qty: num(r.qty, 1), pct: r.pct === null || r.pct === undefined ? '' : Number(r.pct), astart: r.astart || '', aend: r.aend || '', baseline: r.baseline || '', note: r.note || '', src: r.src || '',
      by: r.updated_by || '', updatedAt: r.updated_at ? new Date(new Date(r.updated_at).getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '',
      at: r.version, version: r.version, archived: r.archived || ''
    };
  }
  function toDb(o) {
    var r = {};
    Object.keys(T_MAP).forEach(function (k) {
      if (!(k in o) || k === 'id') return;
      var v = o[k];
      if (T_DATES[k]) v = dOrNull(v);
      else if (T_NUMS[k]) v = (v === '' || v === null || v === undefined) ? ((k === 'prio' || k === 'pct') ? null : 0) : Number(v);
      else v = v === null || v === undefined ? '' : String(v);
      r[T_MAP[k]] = v;
    });
    return r;
  }

  /* ---------------- 權限（跟資料庫規則一致，只用來決定畫面上能不能按） ---------------- */
  function canEditProject(p) {
    if (!p || !me) return false;
    if (me.role === '管理員') return true;
    if (me.role !== 'PM' || p.status === '封存') return false;
    var pms = String(p.pm || '').split(/\s*[,，、;；]\s*/).filter(Boolean);
    if (!pms.length) return true;
    return pms.some(function (x) { return x === me.name || x.toLowerCase() === me.email; });
  }
  function projectById(id) { for (var i = 0; i < cache.projects.length; i++) if (cache.projects[i].id === id) return cache.projects[i]; return null; }

  /* ---------------- 排程 ---------------- */
  function engineInput(tasks) {
    var hol = {}, mk = {};
    cache.calendar.forEach(function (c) { if (c.type === '補班') mk[c.day] = 1; else hol[c.day] = c.name || '假日'; });
    return {
      tasks: tasks, holidays: hol, makeup: mk, today: today(), lenientPreds: true,
      leaves: cache.leaves.map(function (l) { return { person: l.person, start: l.start_date, end: l.end_date, days: l.days }; })
    };
  }
  function compute() {
    cache.out = Engine.schedule(engineInput(cache.tasks));
    return cache.out;
  }
  function decorate(t) {
    var r = cache.out && cache.out.result[t.id];
    if (r) { t.start = r.start; t.end = r.end; t.warns = r.warn; t.slip = r.slip; t.info = r.info || ''; t.expect = r.expect; }
    else { t.start = ''; t.end = ''; t.warns = []; t.slip = 0; t.info = ''; t.expect = undefined; }
    return t;
  }
  /** 給畫面用的複本：畫面上的樂觀更新不會動到這裡的資料，存檔時才比得出差異 */
  function view(t) { return decorate(copyTask(t)); }
  function computedMap() {
    var m = {};
    cache.tasks.forEach(function (t) { var r = cache.out.result[t.id]; m[t.id] = [r.start, r.end, r.warn, r.slip, r.info || '', t.prio, t.baseline || '', r.expect]; });
    return m;
  }
  function putTask(t) {
    if (t.archived) { dropTask(t.id); return; }
    if (cache.byId[t.id]) { var i = cache.tasks.indexOf(cache.byId[t.id]); cache.tasks[i] = t; }
    else cache.tasks.push(t);
    cache.byId[t.id] = t;
  }
  function dropTask(id) { var t = cache.byId[id]; if (!t) return; cache.tasks.splice(cache.tasks.indexOf(t), 1); delete cache.byId[id]; }
  function copyTask(t) { var o = {}; Object.keys(t).forEach(function (k) { o[k] = t[k]; }); return o; }

  /* ---------------- 讀取 ---------------- */
  function fetchAll(table, order, where) {
    where = where || function (q) { return q; };
    return where(sb.from(table).select('*', { count: 'exact', head: true })).then(function (res) {
      chk(res);
      var n = res.count || 0, size = 1000, jobs = [];
      for (var i = 0; i < Math.max(n, 1); i += size) jobs.push(where(sb.from(table).select('*')).order(order).range(i, i + size - 1).then(chk));
      return Promise.all(jobs).then(function (parts) { return [].concat.apply([], parts); });
    });
  }
  function loadAll() {
    return Promise.all([
      fetchAll('tasks', 'id', function (q) { return q.is('archived', null); }), fetchAll('projects', 'id'), fetchAll('people', 'name'), fetchAll('calendar', 'day'),
      fetchAll('leaves', 'id'), fetchAll('templates', 'id'), fetchAll('settings', 'key')
    ]).then(function (r) {
      cache.tasks = r[0].map(fromDb); cache.byId = {};
      cache.tasks.forEach(function (t) { cache.byId[t.id] = t; });
      cache.projects = r[1]; cache.people = r[2]; cache.calendar = r[3]; cache.leaves = r[4]; cache.templates = r[5];
      cache.settings = {}; cache.settingsRows = r[6]; r[6].forEach(function (s) { cache.settings[s.key] = s.value; });
      lastSync = r[0].reduce(function (a, x) { return x.updated_at > a ? x.updated_at : a; }, '1970-01-01');
      compute();
    });
  }
  function clientProject(p) {
    return { id: p.id, name: p.name, code: p.code, status: p.status, pm: p.pm, start: p.start || '', target: p.target || '', color: p.color, note: p.note, canEdit: canEditProject(p) };
  }
  function snapshot(history) {
    var cutoff = Engine.dn(today()) - HISTORY_DAYS;
    var tasks = cache.tasks.filter(function (t) {
      if (true || history || t.status !== '完成') return true; // 舊資料改用「年度封存」管理，這裡全部載入
      var r = cache.out.result[t.id];
      return (Engine.dn(r.end) || 0) >= cutoff;
    }).map(view);
    var tpl = {};
    cache.templates.forEach(function (s) { (tpl[s.tpl] = tpl[s.tpl] || []).push({ step: s.step, title: s.title, group: s.grp, days: s.days, preds: s.preds || '', mode: s.mode }); });
    var hol = {}, mk = {};
    cache.calendar.forEach(function (c) { if (c.type === '補班') mk[c.day] = 1; else hol[c.day] = c.name || '假日'; });
    return {
      me: me, today: today(),
      projects: cache.projects.map(clientProject),
      people: cache.people.filter(function (p) { return p.active; }).map(function (p) { return { name: p.name, role: p.role, alias: p.alias, email: me.role === '管理員' ? p.email : undefined }; }),
      tasks: tasks,
      templates: Object.keys(tpl).map(function (k) { return { name: k, steps: tpl[k].sort(function (a, b) { return a.step - b.step; }) }; }),
      holidays: hol, makeup: mk,
      leaves: cache.leaves.map(function (l) { return { person: l.person, start: l.start_date, end: l.end_date, days: l.days, type: l.type, note: l.note }; }),
      history: !!history,
      sheetUrl: me.role === '管理員' && C.dashboardUrl ? C.dashboardUrl : '',
      exportUrl: ''
    };
  }

  /* ---------------- 登入 ---------------- */
  function init() {
    if (!C.supabaseUrl || !C.supabaseAnonKey || /請填/.test(C.supabaseUrl)) return Promise.resolve({ state: 'config' });
    var opts = { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } };
    if (C.testToken) opts = { accessToken: function () { return Promise.resolve(C.testToken); } };
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, opts);
    var getEmail = C.testToken
      ? Promise.resolve(JSON.parse(atob(C.testToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email)
      : sb.auth.getSession().then(function (r) { var s = r.data && r.data.session; return s && s.user ? s.user.email : null; });
    return getEmail.then(function (email) {
      if (!email) return { state: 'login' };
      return Promise.all([sb.rpc('my_role'), sb.rpc('my_name')]).then(function (r) {
        var role = chk(r[0]), name = chk(r[1]);
        if (!role) return { state: 'denied', email: email };
        me = { email: String(email).toLowerCase(), name: name || String(email).split('@')[0], role: role };
        startSync();
        return { state: 'ok', me: me };
      });
    }).catch(function (e) { throw err(e); });
  }
  function signIn() {
    var q = { prompt: 'select_account' };
    if (C.companyDomain) q.hd = C.companyDomain;
    return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: q } });
  }
  function signOut() { return (C.testToken ? Promise.resolve() : sb.auth.signOut()).then(function () { location.reload(); }); }

  /* ---------------- 即時同步 ---------------- */
  var notifyTimer = null, pending = { tasks: {}, removed: {}, reload: false };
  function notify() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(function () {
      var p = pending; pending = { tasks: {}, removed: {}, reload: false };
      var go = p.reload ? loadAll() : Promise.resolve(compute());
      go.then(function () {
        var ev = { reload: p.reload, tasks: Object.keys(p.tasks).filter(function (id) { return cache.byId[id]; }).map(function (id) { return view(cache.byId[id]); }), removed: Object.keys(p.removed), computed: computedMap() };
        listeners.forEach(function (fn) { try { fn(ev); } catch (e) { console.error(e); } });
      }).catch(function (e) { console.error(e); });
    }, 400);
  }
  function startSync() {
    try {
      sb.channel('pm-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, function (msg) {
          if (msg.eventType === 'DELETE') { var id = msg.old && msg.old.id; if (id) { dropTask(id); pending.removed[id] = 1; } }
          else {
            var t = fromDb(msg.new), cur = cache.byId[t.id];
            if (t.archived) { if (cur) { dropTask(t.id); pending.removed[t.id] = 1; } }
            else if (!cur || cur.version <= t.version) { putTask(t); pending.tasks[t.id] = 1; }
            if (msg.new.updated_at > lastSync) lastSync = msg.new.updated_at;
          }
          notify();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, function () { pending.reload = true; notify(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leaves' }, function () { pending.reload = true; notify(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'people' }, function () { pending.reload = true; notify(); })
        .subscribe();
    } catch (e) { console.warn('即時同步無法啟動', e); }
    // 保險：每分鐘抓一次別人改過的工項（即時同步斷線時也不會漏）
    setInterval(function () {
      if (document.hidden || !lastSync) return;
      sb.from('tasks').select('*').gt('updated_at', lastSync).then(function (res) {
        if (res.error || !res.data.length) return;
        res.data.forEach(function (r) {
          var t = fromDb(r), cur = cache.byId[t.id];
          if (t.archived) { if (cur) { dropTask(t.id); pending.removed[t.id] = 1; } }
          else if (!cur || cur.version < t.version) { putTask(t); pending.tasks[t.id] = 1; }
          if (r.updated_at > lastSync) lastSync = r.updated_at;
        });
        notify();
      });
    }, C.pollMs || 60000);
  }
  function onChange(fn) { listeners.push(fn); }

  /* ---------------- 寫入：工項 ---------------- */
  function afterWrite(rows, extra) {
    rows.forEach(function (r) { var t = fromDb(r); putTask(t); if (r.updated_at > lastSync) lastSync = r.updated_at; });
    compute();
    var o = { computed: computedMap() };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function cycleError(tasks, id, preds) {
    var cyc = Engine.wouldCycle(tasks, id, preds);
    return cyc ? new Error('這樣設定會形成循環相依：' + cyc.join(' → ')) : null;
  }
  /** 新工項的基準完成日 = 加入後第一次算出的完成日 */
  function baselinesFor(newTasks) {
    var all = cache.tasks.concat(newTasks);
    var out = Engine.schedule(engineInput(all));
    newTasks.forEach(function (t) { if (!t.baseline) t.baseline = out.result[t.id].end || ''; });
  }
  function validate(o) {
    if ('title' in o && !String(o.title || '').trim()) throw new Error('請填工項名稱。');
    if ('days' in o && (o.days === '' || isNaN(Number(o.days)) || Number(o.days) < 0)) throw new Error('請填天數（可以有小數，例如 0.5）。');
    if (o.status && STATUSES.indexOf(o.status) < 0) throw new Error('狀態不正確。');
  }

  function saveTask(obj) {
    validate(obj);
    if (!obj.id) return insertTasks([obj]).then(function (r) { return { task: r.tasks[0], computed: r.computed, changes: ['（新增）'] }; });
    var cur = cache.byId[obj.id];
    if (!cur) return Promise.reject(new Error('找不到工項 ' + obj.id + '，可能已被刪除，請重新整理。'));
    var patch = {}, changes = [];
    Object.keys(T_MAP).forEach(function (k) {
      if (k === 'id' || !(k in obj)) return;
      var a = cur[k] === null || cur[k] === undefined ? '' : String(cur[k]), b = obj[k] === null || obj[k] === undefined ? '' : String(obj[k]);
      if (k === 'preds') { a = split(a).join(', '); b = split(b).join(', '); }
      if (a !== b) { patch[k] = obj[k]; changes.push(k); }
    });
    if (!changes.length) return Promise.resolve({ task: view(cur), computed: computedMap(), changes: [] });
    if ('preds' in patch) { var ce = cycleError(cache.tasks, cur.id, split(patch.preds)); if (ce) return Promise.reject(ce); }
    var version = obj.at !== undefined && obj.at !== '' ? obj.at : cur.version;
    return sb.from('tasks').update(toDb(patch)).eq('id', cur.id).eq('version', version).select().then(function (res) {
      var rows = chk(res);
      if (!rows.length) {
        return sb.from('tasks').select('*').eq('id', cur.id).then(function (r2) {
          var now = chk(r2)[0];
          if (!now) throw new Error('這個工項已被刪除，請重新整理。');
          if (now.version !== version) { putTask(fromDb(now)); pending.tasks[now.id] = 1; notify(); throw new Error('這筆工項剛被「' + (now.updated_by || '其他人') + '」修改過，畫面已更新，請再改一次。'); }
          throw new Error('你沒有修改這個工項的權限。');
        });
      }
      var o = afterWrite(rows);
      o.task = view(cache.byId[cur.id]); o.changes = changes;
      return o;
    }).catch(function (e) { throw err(e); });
  }
  function setStatus(id, status, at) { return saveTask({ id: id, status: status, at: at }); }

  /** rows: 用戶端格式；preds 可用「#序號」或「$key」指同一批 */
  function insertTasks(rows) {
    return sb.rpc('reserve_task_ids', { n: rows.length }).then(function (res) {
      var ids = chk(res);
      var full = rows.map(function (o, i) {
        var t = {
          id: ids[i], project: o.project, group: o.group || '', code: o.code || '', tag: o.tag || '', title: String(o.title || '').trim(),
          detail: o.detail || '', owner: o.owner || '', helper: o.helper || '', mode: o.mode || '排隊', prio: o.prio === undefined ? '' : o.prio,
          days: num(o.days, 1), preds: o.preds || '', lag: num(o.lag, 0), earliest: o.earliest || '', release: o.release || '',
          status: o.status || '未開始', doneQty: num(o.doneQty, 0), qty: num(o.qty, 1), astart: o.astart || '', aend: o.aend || '', baseline: '', note: o.note || ''
        };
        validate(t);
        return t;
      });
      full.forEach(function (t, i) {
        t.preds = split(t.preds).map(function (p) {
          var m = /^#(\d+)$/.exec(p);
          if (!m) return p;
          var k = Number(m[1]) - 1;
          if (!(k >= 0 && k < i)) throw new Error('第 ' + (i + 1) + ' 列的前置 ' + p + ' 必須是前面的列。');
          return full[k].id;
        }).join(', ');
      });
      // 同一人的新工項排到隊伍最後
      var maxPrio = {};
      cache.tasks.forEach(function (t) { if (Number(t.prio) > (maxPrio[t.owner] || 0)) maxPrio[t.owner] = Number(t.prio); });
      full.forEach(function (t) { if (t.prio === '' || t.prio === null) { maxPrio[t.owner] = (maxPrio[t.owner] || 0) + 10; t.prio = maxPrio[t.owner]; } });
      var tmp = cache.tasks.concat(full);
      full.forEach(function (t) { var ce = cycleError(tmp, t.id, split(t.preds)); if (ce) throw ce; });
      baselinesFor(full);
      var payload = full.map(function (t) { var r = toDb(t); r.id = t.id; r.src = '網頁'; return r; });
      return sb.from('tasks').insert(payload).select().then(function (res2) {
        var rows2 = chk(res2);
        var o = afterWrite(rows2);
        o.tasks = full.map(function (t) { return view(cache.byId[t.id]); });
        o.created = full.map(function (t) { return t.id; });
        return o;
      });
    }).catch(function (e) { throw err(e); });
  }

  function previewTask(obj) {
    try {
      var id = obj.id || '（新工項）', orig = obj.id ? cache.byId[obj.id] : null;
      var t2 = orig ? copyTask(orig) : { id: id, status: '未開始', mode: '排隊', qty: 1, doneQty: 0, prio: '' };
      Object.keys(obj).forEach(function (k) { if (k in T_MAP) t2[k] = obj[k]; });
      t2.id = id;
      if (!orig && (t2.prio === '' || t2.prio === undefined)) {
        var mx = 0; cache.tasks.forEach(function (t) { if (t.owner === t2.owner && Number(t.prio) > mx) mx = Number(t.prio); }); t2.prio = mx + 10;
      }
      var list = orig ? cache.tasks.map(function (t) { return t.id === id ? t2 : t; }) : cache.tasks.concat([t2]);
      var ce = cycleError(list, id, split(t2.preds));
      if (ce) return Promise.resolve({ error: ce.message, items: [] });
      var before = cache.out, after = Engine.schedule(engineInput(list)), items = [];
      list.forEach(function (t) {
        if (t.id === id) return;
        var a = before.result[t.id], b = after.result[t.id];
        if (!a || !b || a.end === b.end) return;
        var delta = after.cal.workdaysBetween(Engine.dn(a.end), Engine.dn(b.end));
        if (!delta) return;
        var p = projectById(t.project) || {};
        var lateA = a.warn.some(function (w) { return w.indexOf('超過出版日') === 0; }), lateB = b.warn.some(function (w) { return w.indexOf('超過出版日') === 0; });
        items.push({ id: t.id, title: t.title, owner: t.owner, project: p.name || '', from: a.end, to: b.end, delta: delta, late: lateB && !lateA });
      });
      items.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta); });
      var s = after.result[id];
      return Promise.resolve({ self: { start: s.start, end: s.end, warns: s.warn }, items: items.slice(0, 200), total: items.length });
    } catch (e) { return Promise.reject(err(e)); }
  }

  function deleteTask(id) {
    var users = cache.tasks.filter(function (x) { return split(x.preds).indexOf(id) >= 0; });
    if (users.length) return Promise.reject(new Error('還有 ' + users.length + ' 個工項把它當前置（' + users.slice(0, 5).map(function (x) { return x.id; }).join('、') + '）。請先移除相依，或把狀態改成「取消」。'));
    return sb.from('tasks').delete().eq('id', id).select('id').then(function (res) {
      if (!chk(res).length) throw new Error('你沒有刪除這個工項的權限。');
      dropTask(id); compute();
      return { id: id, computed: computedMap() };
    }).catch(function (e) { throw err(e); });
  }

  function reorderQueue(owner, ids) {
    return sb.rpc('reorder_queue', { p_owner: owner, p_ids: ids }).then(function (res) {
      chk(res);
      return sb.from('tasks').select('*').in('id', ids).then(function (r2) { return afterWrite(chk(r2)); });
    }).catch(function (e) { throw err(e); });
  }

  function bulkStatus(ids, status) {
    var jobs = [];
    for (var i = 0; i < ids.length; i += 200) jobs.push(sb.from('tasks').update({ status: status }).in('id', ids.slice(i, i + 200)).select().then(chk));
    return Promise.all(jobs).then(function (parts) {
      var rows = [].concat.apply([], parts);
      var o = afterWrite(rows);
      o.tasks = rows.map(function (r) { return view(cache.byId[r.id]); });
      return o;
    }).catch(function (e) { throw err(e); });
  }

  function applyTemplate(spec) {
    var steps = cache.templates.filter(function (s) { return s.tpl === spec.template; }).sort(function (a, b) { return a.step - b.step; });
    if (!steps.length) return Promise.reject(new Error('找不到範本「' + spec.template + '」。'));
    var index = {};
    steps.forEach(function (s, i) { index[String(s.step)] = i + 1; });
    var rows = steps.map(function (s) {
      var key = String(s.step);
      var preds = split(s.preds).map(function (k) { return index[k] ? '#' + index[k] : ''; }).filter(Boolean);
      if (!preds.length && spec.after) preds = split(spec.after);
      return {
        project: spec.project, group: spec.group || s.grp, title: ((spec.prefix ? spec.prefix + ' ' : '') + s.title).trim(),
        owner: (spec.owners && spec.owners[key]) || '', days: (spec.days && spec.days[key] !== undefined && spec.days[key] !== '') ? spec.days[key] : s.days,
        mode: s.mode || '排隊', preds: preds.join(', '), earliest: preds.length ? '' : (spec.earliest || ''), release: spec.release || '', tag: spec.tag || ''
      };
    });
    return insertTasks(rows);
  }

  function bulkAdd(projectId, rows) {
    var names = {};
    cache.people.forEach(function (p) { names[p.name] = 1; });
    try {
      rows.forEach(function (r, i) {
        if (r.owner && !names[r.owner]) throw new Error('第 ' + (i + 1) + ' 列：「人員」名單裡沒有「' + r.owner + '」。');
        split(r.preds).forEach(function (p) { if (!/^#\d+$/.test(p) && !cache.byId[p]) throw new Error('第 ' + (i + 1) + ' 列：前置 ' + p + ' 不存在。'); });
      });
    } catch (e) { return Promise.reject(e); }
    return insertTasks(rows.map(function (r) { var o = copyTask(r); o.project = projectId; return o; }));
  }

  function resetBaseline(projectId) {
    var items = [];
    cache.tasks.forEach(function (t) {
      if (t.project !== projectId || t.status === '完成' || t.status === '取消') return;
      var e = cache.out.result[t.id].end;
      if (e && e !== t.baseline) items.push({ id: t.id, baseline: e });
    });
    return sb.rpc('set_baselines', { items: items }).then(function (res) {
      var n = chk(res);
      return sb.from('tasks').select('*').in('id', items.map(function (x) { return x.id; }).slice(0, 1000)).then(function (r2) {
        var o = afterWrite(chk(r2)); o.count = n; return o;
      });
    }).catch(function (e) { throw err(e); });
  }

  /* ---------------- 寫入：專案、休假 ---------------- */
  function saveProject(obj) {
    if (!obj.name) return Promise.reject(new Error('請填專案名稱。'));
    var row = { name: obj.name, code: obj.code || '', status: obj.status || '進行中', start: dOrNull(obj.start), target: dOrNull(obj.target), color: obj.color || '', note: obj.note || '' };
    if (obj.pm !== undefined) row.pm = obj.pm;
    var q = obj.id ? sb.from('projects').update(row).eq('id', obj.id).select() : sb.from('projects').insert(Object.assign({ id: '' }, row)).select();
    return q.then(function (res) {
      var rows = chk(res);
      if (!rows.length) throw new Error('你沒有修改這個專案的權限。');
      var p = rows[0], i = cache.projects.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) cache.projects[i] = p; else cache.projects.push(p);
      return clientProject(p);
    }).catch(function (e) { throw err(e); });
  }

  /* 設定某位 PM 管理哪些專案（寫回各專案的 PM 欄） */
  function setManagedProjects(name, ids) {
    var jobs = [];
    cache.projects.forEach(function (p) {
      var pms = String(p.pm || '').split(/\s*[,，、;；]\s*/).filter(Boolean);
      var has = pms.indexOf(name) >= 0, want = ids.indexOf(p.id) >= 0;
      if (has === want) return;
      pms = want ? pms.concat(name) : pms.filter(function (x) { return x !== name; });
      jobs.push(sb.from('projects').update({ pm: pms.join(', ') }).eq('id', p.id).select().then(function (res) {
        var r = chk(res)[0]; if (!r) throw new Error('你沒有修改專案 PM 的權限。');
        var i = cache.projects.findIndex(function (x) { return x.id === r.id; }); if (i >= 0) cache.projects[i] = r;
      }));
    });
    return Promise.all(jobs).then(function () { return { count: jobs.length }; }).catch(function (e) { throw err(e); });
  }

  function saveLeave(obj) {
    if (!obj.person) return Promise.reject(new Error('請選擇人員。'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(obj.start || '')) return Promise.reject(new Error('請填開始日。'));
    var row = { person: obj.person, start_date: obj.start, end_date: obj.end || obj.start, days: obj.days === '' ? null : obj.days, type: obj.type || '排休', note: obj.note || '' };
    return sb.from('leaves').insert(row).select().then(function (res) {
      cache.leaves.push(chk(res)[0]);
      compute();
      return { computed: computedMap(), leaves: snapshot(false).leaves };
    }).catch(function (e) { throw err(e); });
  }


  /* ---------------- 設定後台（管理員／PM） ---------------- */
  function adminData() {
    return {
      settings: (cache.settingsRows || []).map(function (r) { return { key: r.key, value: r.value, note: r.note }; }),
      people: cache.people.map(function (p) { return { name: p.name, email: p.email || '', role: p.role, alias: p.alias, active: p.active, note: p.note }; })
        .sort(function (a, b) { return (b.active - a.active) || a.name.localeCompare(b.name, 'zh-Hant'); }),
      calendar: cache.calendar.slice().sort(function (a, b) { return a.day < b.day ? -1 : 1; }),
      templates: cache.templates.slice().sort(function (a, b) { return a.tpl === b.tpl ? a.step - b.step : (a.tpl < b.tpl ? -1 : 1); }),
      leaves: cache.leaves.slice().sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; }),
      usage: (function () { var u = {}; cache.tasks.forEach(function (t) { if (t.owner) u[t.owner] = (u[t.owner] || 0) + 1; }); return u; })()
    };
  }
  function refresh(history) { compute(); return snapshot(history); }

  function saveSetting(key, value) {
    key = String(key || '').trim();
    if (!key) return Promise.reject(new Error('請填項目名稱。'));
    return sb.from('settings').upsert({ key: key, value: value || '' }, { onConflict: 'key' }).select().then(function (res) {
      var row = chk(res)[0];
      if (!row) throw new Error('你沒有修改設定的權限。');
      var i = (cache.settingsRows || []).findIndex(function (x) { return x.key === key; });
      if (i >= 0) cache.settingsRows[i] = row; else cache.settingsRows.push(row);
      cache.settings[key] = row.value;
      return row;
    }).catch(function (e) { throw err(e); });
  }

  function savePerson(origName, o) {
    var row = { email: o.email ? String(o.email).trim().toLowerCase() : null, role: o.role || '美術', alias: o.alias || '', active: o.active !== false, note: o.note || '' };
    if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return Promise.reject(new Error('Email 格式不正確。'));
    var q;
    if (origName) q = sb.from('people').update(row).eq('name', origName).select();
    else {
      var name = String(o.name || '').trim();
      if (!name) return Promise.reject(new Error('請填姓名。'));
      row.name = name;
      q = sb.from('people').insert(row).select();
    }
    return q.then(function (res) {
      var p = chk(res)[0];
      if (!p) throw new Error('你沒有修改人員的權限。');
      var i = cache.people.findIndex(function (x) { return x.name === p.name; });
      if (i >= 0) cache.people[i] = p; else cache.people.push(p);
      return p;
    }).catch(function (e) { throw err(e); });
  }
  function deletePerson(name) {
    var n = cache.tasks.filter(function (t) { return t.owner === name; }).length;
    if (n) return Promise.reject(new Error('「' + name + '」還有 ' + n + ' 個工項，不能刪除。離職的話請取消勾選「在職」。'));
    return sb.from('people').delete().eq('name', name).select('name').then(function (res) {
      if (!chk(res).length) throw new Error('你沒有刪除人員的權限。');
      cache.people = cache.people.filter(function (p) { return p.name !== name; });
    }).catch(function (e) { throw err(e); });
  }

  function saveDay(o) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.day || '')) return Promise.reject(new Error('請選日期。'));
    var row = { day: o.day, type: o.type === '補班' ? '補班' : '假日', name: o.name || '' };
    return sb.from('calendar').upsert(row, { onConflict: 'day' }).select().then(function (res) {
      var c = chk(res)[0];
      if (!c) throw new Error('你沒有修改行事曆的權限。');
      cache.calendar = cache.calendar.filter(function (x) { return x.day !== c.day; }).concat([c]);
      return c;
    }).catch(function (e) { throw err(e); });
  }
  function deleteDay(day) {
    return sb.from('calendar').delete().eq('day', day).select('day').then(function (res) {
      if (!chk(res).length) throw new Error('你沒有修改行事曆的權限。');
      cache.calendar = cache.calendar.filter(function (x) { return x.day !== day; });
    }).catch(function (e) { throw err(e); });
  }

  /** 整個範本一次存：先刪掉舊的步驟再寫入。oldName 用於改名 */
  function saveTemplate(oldName, name, steps) {
    name = String(name || '').trim();
    if (!name) return Promise.reject(new Error('請填範本名稱。'));
    if (!steps.length) return Promise.reject(new Error('範本至少要有一個步驟。'));
    var nums = {};
    try {
      steps.forEach(function (s, i) {
        if (!String(s.title || '').trim()) throw new Error('第 ' + (i + 1) + ' 步缺工項名稱。');
        nums[i + 1] = 1;
      });
      steps.forEach(function (s, i) {
        split(s.preds).forEach(function (p) { if (!nums[p] || Number(p) >= i + 1) throw new Error('第 ' + (i + 1) + ' 步的前置步驟「' + p + '」必須是前面的步驟編號。'); });
      });
    } catch (e) { return Promise.reject(e); }
    if (name !== oldName && cache.templates.some(function (t) { return t.tpl === name; })) return Promise.reject(new Error('已經有叫「' + name + '」的範本。'));
    var rows = steps.map(function (s, i) {
      return { tpl: name, step: i + 1, title: String(s.title).trim(), grp: s.grp || '', days: num(s.days, 1), preds: split(s.preds).join(','), mode: s.mode === '平行' ? '平行' : '排隊' };
    });
    var del = oldName ? sb.from('templates').delete().eq('tpl', oldName).then(chk) : Promise.resolve();
    return del.then(function () { return sb.from('templates').insert(rows).select(); }).then(function (res) {
      var saved = chk(res);
      cache.templates = cache.templates.filter(function (t) { return t.tpl !== oldName && t.tpl !== name; }).concat(saved);
      return saved;
    }).catch(function (e) { throw err(e); });
  }
  function deleteTemplate(name) {
    return sb.from('templates').delete().eq('tpl', name).select('id').then(function (res) {
      if (!chk(res).length) throw new Error('你沒有刪除範本的權限。');
      cache.templates = cache.templates.filter(function (t) { return t.tpl !== name; });
    }).catch(function (e) { throw err(e); });
  }

  function deleteLeave(id) {
    return sb.from('leaves').delete().eq('id', id).select('id').then(function (res) {
      if (!chk(res).length) throw new Error('你沒有刪除休假的權限。');
      cache.leaves = cache.leaves.filter(function (l) { return l.id !== id; });
    }).catch(function (e) { throw err(e); });
  }

  /* ---------------- 異動紀錄 ---------------- */
  function getTaskLog(id) {
    return sb.from('audit_log').select('*').eq('ref', id).order('at', { ascending: false }).limit(100).then(chk).catch(function (e) { throw err(e); });
  }
  function getLog(limit) {
    return sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit || 300).then(chk).catch(function (e) { throw err(e); });
  }

  /* ---------------- 個人排程表（下載 Excel，沿用舊格式） ---------------- */
  /* opts = { names: [只匯出這些人], file: 檔名 }；會一併讀取期間內已封存的工項 */
  function exportPersonal(from, to, opts) {
    if (!window.ExcelJS) return Promise.reject(new Error('Excel 元件還沒載入，請稍後再試。'));
    opts = opts || {};
    if (!from || !to || from > to) return Promise.reject(new Error('請選擇正確的日期區間。'));
    var q = sb.from('tasks').select('*').not('archived', 'is', null).or('aend.gte.' + from + ',aend.is.null');
    if (opts.names) q = q.in('owner', opts.names);
    return q.limit(20000).then(chk).then(function (rows) {
      return buildPersonal(from, to, opts, rows.map(fromDb));
    }).catch(function (e) { throw err(e); });
  }
  function buildPersonal(from, to, opts, extra) {
    var a = Engine.dn(from), b = Engine.dn(to);
    var allTasks = extra.length ? cache.tasks.concat(extra.filter(function (t) { return !cache.byId[t.id]; })) : cache.tasks;
    var out = allTasks === cache.tasks ? cache.out : Engine.schedule(engineInput(allTasks));
    var people = opts.names || cache.people.filter(function (p) { return p.active; }).map(function (p) { return p.name; });
    var load = Engine.monthlyLoad(out, engineInput(allTasks), people, from, to);
    var wb = new ExcelJS.Workbook();
    var KIND = { '工作': 'FFFFF2CC', '跨日': 'FFFFF2CC', '監制': 'FFFFF2CC', '放假': 'FFF4CCCC', '排休': 'FFD9EAD3' };
    var ST = { '完成': 'FFB6D7A8', '待驗收': 'FFCFE2F3', '進行中': 'FFFFE599', '未開始': 'FFFFFFFF', '暫停': 'FFD9D9D9' };
    var hol = engineInput([]).holidays, made = 0;
    var fill = function (c, argb) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; };
    people.forEach(function (name) {
      var mine = allTasks.filter(function (t) { return t.owner === name && t.status !== '取消'; });
      var blocks = [];
      Object.keys(load[name]).sort().forEach(function (mk) {
        var items = [];
        mine.forEach(function (t) {
          var r = out.result[t.id];
          var al = (r.alloc || []).filter(function (x) { return Engine.ds(x[0]).slice(0, 7) === mk && x[0] >= a && x[0] <= b; });
          if (!al.length) return;
          var used = al.reduce(function (s, x) { return s + x[1]; }, 0);
          var kind = t.mode === '平行' ? '監制' : (Engine.ds(r.alloc[0][0]).slice(0, 7) < mk ? '跨日' : '工作');
          var p = projectById(t.project) || {};
          items.push({ s: al[0][0], kind: kind, status: t.status, row: [p.code || p.name || '', kind, t.tag, t.group, t.title + (t.detail ? '\n' + t.detail : ''), Math.round(used * 100) / 100, Engine.ds(al[0][0]), Engine.ds(al[al.length - 1][0]), t.status, t.id] });
        });
        cache.leaves.forEach(function (l) {
          if (l.person !== name || l.start_date.slice(0, 7) > mk || l.end_date.slice(0, 7) < mk) return;
          items.push({ s: Engine.dn(l.start_date), kind: '排休', row: ['', '排休', '', l.type, l.note, l.days, l.start_date, l.end_date, '', ''] });
        });
        Object.keys(hol).forEach(function (d) {
          if (d.slice(0, 7) !== mk) return;
          var w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w === 0 || w === 6) return;
          items.push({ s: Engine.dn(d), kind: '放假', row: ['', '放假', '', hol[d], '', 1, d, d, '', ''] });
        });
        if (!items.some(function (x) { return x.kind !== '放假'; })) return;
        items.sort(function (p, q) { return p.s - q.s; });
        blocks.push({ mk: mk, items: items, L: load[name][mk] });
      });
      if (!blocks.length) return;
      made++;
      var ws = wb.addWorksheet(name.replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31));
      ws.columns = [{ width: 12 }, { width: 8 }, { width: 12 }, { width: 22 }, { width: 46 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 9 }, { width: 10 }];
      ws.addRow([name + '　（' + today() + ' 由系統產生）']);
      var h = ws.addRow(['專案', '類型', '標籤', '工項', '執行內容說明', '天數', '開始日', '完成日', '狀態', '工項ID']);
      h.eachCell(function (c) { fill(c, 'FF1F2937'); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
      blocks.forEach(function (bk) {
        var y = bk.mk.slice(0, 4), m = Number(bk.mk.slice(5, 7));
        var r1 = ws.addRow([y + '年', '', '', m + '月', '可執行工天（扣除假日、休假）', Math.round(bk.L.cap * 100) / 100]);
        for (var i = 1; i <= 10; i++) { fill(r1.getCell(i), 'FF434343'); r1.getCell(i).font = { bold: true, color: { argb: 'FFFFFFFF' } }; }
        bk.items.forEach(function (x) {
          var r = ws.addRow(x.row);
          for (var i = 1; i <= 10; i++) fill(r.getCell(i), KIND[x.kind] || 'FFFFFFFF');
          if (x.status) fill(r.getCell(9), ST[x.status] || 'FFFFFFFF');
          r.alignment = { vertical: 'top', wrapText: true };
        });
        var r2 = ws.addRow(['', '', '', m + '月', '還未分配的空檔天數（負數：超過可執行工天；正數：還有空檔）', Math.round((bk.L.cap - bk.L.used) * 100) / 100]);
        for (var j = 1; j <= 10; j++) fill(r2.getCell(j), 'FFEFEFEF');
      });
      ws.views = [{ state: 'frozen', ySplit: 2 }];
    });
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = (opts.file || '美術個人排程_' + from + '_' + to) + '.xlsx';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      return { count: made, url: '' };
    });
  }

  /* ---------------- 匯入（管理員）：讀「美術專案管理DB.xlsx」或從 Google 試算表下載的 xlsx ---------------- */
  var SHEETS = {
    tasks: ['工項', { id: '工項ID', project: '專案ID', grp: '群組', code: '編號', tag: '標籤', title: '工項名稱', detail: '說明', owner: '負責', helper: '協力',
      mode: '排程方式', prio: '優先序', days: '天數', preds: '前置工項', lag: '前置後間隔', earliest: '最早開始', release: '出版日', status: '狀態',
      done_qty: '完成數量', qty: '數量', pct: '完成度', astart: '實際開始', aend: '實際完成', baseline: '基準完成', note: '備註', src: '來源', archived: '封存年度' }],
    projects: ['專案', { id: '專案ID', name: '專案名稱', code: '代碼', status: '狀態', pm: 'PM', start: '開始日', target: '目標日', color: '顏色', note: '備註' }],
    people: ['人員', { name: '姓名', email: 'Email', role: '角色', alias: '別名', active: '在職', note: '備註' }],
    calendar: ['行事曆', { day: '日期', type: '類型', name: '名稱' }],
    leaves: ['休假', { person: '人員', start_date: '開始日', end_date: '結束日', days: '天數', type: '類型', note: '說明' }],
    templates: ['範本', { tpl: '範本名稱', step: '步驟', title: '工項名稱', grp: '群組', days: '天數', preds: '前置步驟', mode: '排程方式' }],
    settings: ['設定', { key: '項目', value: '值', note: '說明' }]
  };
  var DATE_COLS = { earliest: 1, release: 1, astart: 1, aend: 1, baseline: 1, start: 1, target: 1, day: 1, start_date: 1, end_date: 1 };
  var NUM_COLS = { prio: 1, days: 1, lag: 1, done_qty: 1, qty: 1, pct: 1, step: 1 };
  function cellDate(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    var m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(String(v).trim());
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null;
  }
  function parseWorkbook(buf) {
    if (!window.XLSX) throw new Error('Excel 讀取元件還沒載入，請稍後再試。');
    var wb = XLSX.read(buf, { type: 'array' });
    var out = {}, warn = [];
    Object.keys(SHEETS).forEach(function (key) {
      var name = SHEETS[key][0], map = SHEETS[key][1], ws = wb.Sheets[name];
      if (!ws) { if (key !== 'settings') throw new Error('找不到「' + name + '」分頁。'); return; }
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      var head = (rows[0] || []).map(function (h) { return String(h).trim(); });
      var idx = {};
      Object.keys(map).forEach(function (col) { idx[col] = head.indexOf(map[col]); });
      out[key] = [];
      rows.slice(1).forEach(function (r) {
        var o = {}, empty = true;
        Object.keys(map).forEach(function (col) {
          var v = idx[col] >= 0 ? r[idx[col]] : '';
          if (v !== '' && v !== null && v !== undefined) empty = false;
          if (DATE_COLS[col]) v = cellDate(v);
          else if (NUM_COLS[col]) v = v === '' || v === null ? null : Number(v);
          else v = v === null || v === undefined ? '' : String(v).trim();
          o[col] = v;
        });
        if (!empty) out[key].push(o);
      });
    });
    var now = new Date().toISOString();
    out.tasks = out.tasks.filter(function (t) { return t.id; }).map(function (t) {
      t.mode = t.mode || '排隊'; t.status = t.status || '未開始';
      ['grp', 'code', 'tag', 'detail', 'owner', 'helper', 'preds', 'note', 'src'].forEach(function (k) { t[k] = t[k] || ''; });
      t.title = t.title || '（未命名）';
      if (t.days === null || isNaN(t.days)) t.days = 0;
      if (t.lag === null || isNaN(t.lag)) t.lag = 0;
      if (t.done_qty === null || isNaN(t.done_qty)) t.done_qty = 0;
      if (t.qty === null || isNaN(t.qty)) t.qty = 1;
      t.archived = t.archived || null;
      t.updated_by = '匯入'; t.updated_at = now; t.version = 1;
      return t;
    });
    out.projects = out.projects.filter(function (p) { return p.id; }).map(function (p) {
      ['code', 'pm', 'color', 'note'].forEach(function (k) { p[k] = p[k] || ''; });
      p.status = p.status || '進行中'; p.name = p.name || p.id; return p;
    });
    out.people = out.people.filter(function (p) { return p.name; }).map(function (p) {
      p.email = p.email ? p.email.toLowerCase() : null; p.role = p.role || '美術'; p.alias = p.alias || ''; p.note = p.note || '';
      p.active = !(p.active === '否' || p.active === 'false' || p.active === 'FALSE'); return p;
    });
    var seen = {};
    out.people = out.people.filter(function (p) { if (!p.email) return true; if (seen[p.email]) { warn.push('Email 重複：' + p.email + '（' + p.name + '）'); return false; } seen[p.email] = 1; return true; });
    out.calendar = out.calendar.filter(function (c) { return c.day; }).map(function (c) { c.type = c.type === '補班' ? '補班' : '假日'; return c; });
    out.leaves = out.leaves.filter(function (l) { return l.person && l.start_date; }).map(function (l) { l.end_date = l.end_date || l.start_date; l.type = l.type || '排休'; l.note = l.note || ''; return l; });
    out.templates = out.templates.filter(function (s) { return s.tpl && s.title; }).map(function (s) { s.grp = s.grp || ''; s.preds = String(s.preds || ''); s.mode = s.mode || '排隊'; s.days = s.days || 1; return s; });
    if (out.settings) out.settings = out.settings.filter(function (s) { return s.key && s.key !== '個人排程輸出試算表ID' && s.key !== '今天'; }).map(function (s) { s.value = s.value || ''; s.note = s.note || ''; return s; });
    // 檢查：工項的專案存在、負責人在名單上
    var pids = {}, names = {};
    out.projects.forEach(function (p) { pids[p.id] = 1; });
    out.people.forEach(function (p) { names[p.name] = 1; });
    var badP = out.tasks.filter(function (t) { return !pids[t.project]; });
    if (badP.length) throw new Error(badP.length + ' 個工項的專案ID不在「專案」分頁（例如 ' + badP[0].id + '）。');
    var badO = {};
    out.tasks.forEach(function (t) { if (t.owner && !names[t.owner]) badO[t.owner] = 1; });
    Object.keys(badO).forEach(function (n) { out.people.push({ name: n, email: null, role: '美術', alias: '', active: false, note: '匯入時自動補上' }); warn.push('負責人「' + n + '」不在人員名單，已自動補上（標為不在職）'); });
    return { payload: out, warn: warn, counts: { tasks: out.tasks.length, projects: out.projects.length, people: out.people.length, calendar: out.calendar.length, leaves: out.leaves.length, templates: out.templates.length } };
  }
  function importPayload(payload) {
    return sb.rpc('admin_import', { payload: payload }).then(chk).then(function (r) { return loadAll().then(function () { return r; }); }).catch(function (e) { throw err(e); });
  }

  /* ---------------- 考核年度與封存 ---------------- */
  function archiveRecs() {
    try { var v = JSON.parse(cache.settings['封存紀錄'] || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function startMonth() { var m = parseInt(cache.settings['考核年度起始月'], 10); return m >= 1 && m <= 12 ? m : 11; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // 年度 Y（以結束那年命名）在目前設定下的起訖日
  function rangeOf(Y, m) {
    if (m === 1) return { from: Y + '-01-01', to: Y + '-12-31' };
    return { from: (Y - 1) + '-' + pad2(m) + '-01', to: Engine.ds(Engine.dn(Y + '-' + pad2(m) + '-01') - 1) };
  }
  function yearOf(day, m) { var y = +day.slice(0, 4), mo = +day.slice(5, 7); return m === 1 || mo < m ? y : y + 1; }
  /* 回傳 { startMonth, current, list:[{label, from, to, archived, current, count}] }，新的在前 */
  /* 回傳 { startMonth, current, list:[{label, from, to, archived, current, count}] }，新的在前
     規則：已封存的年度固定不動；最後一次封存之後的第一個年度「接續」上一次封存的結束日，
     結束日照新的起始月計算。例如上次封存到 10/31、改成 12 月起算 → 下一年度 11/1 ～ 隔年 11/30（13 個月）；
     上次封存到 11/30、改成 11 月起算 → 12/1 ～ 隔年 10/31（11 個月）。 */
  function periods() {
    var m = startMonth(), recs = archiveRecs().slice().sort(function (x, y) { return x.to < y.to ? -1 : 1; });
    var t0 = today(), days = [t0];
    cache.tasks.forEach(function (t) {
      var r = cache.out && cache.out.result[t.id];
      var e = t.aend || (r && r.end), st = t.astart || (r && r.start);
      if (e) days.push(e); if (st) days.push(st);
    });
    var maxDay = days.reduce(function (a, b) { return b > a ? b : a; }, t0);
    var minDay = days.reduce(function (a, b) { return b < a ? b : a; }, t0);
    var taken = {}; recs.forEach(function (r) { taken[r.label] = 1; });
    var list = [];
    function add(Y, from, to) {
      if (from > to) return;
      var label = Y + '年度'; while (taken[label]) label += '（續）';
      taken[label] = 1;
      list.push({ label: label, from: from, to: to, archived: false, current: from <= t0 && t0 <= to });
    }
    function next(d) { return Engine.ds(Engine.dn(d) + 1); }
    // 1) 已封存年度之間（例如解除封存中間某一年）的空檔、以及最早一次封存之前：照起始月切，只列有資料的
    var bounds = [{ to: Engine.ds(Engine.dn(minDay) - 1) }].concat(recs);
    for (var k = 0; k + 1 < bounds.length; k++) {
      var gFrom = k === 0 ? minDay : next(bounds[k].to), gTo = Engine.ds(Engine.dn(bounds[k + 1].from) - 1);
      if (gFrom > gTo) continue;
      for (var Y = yearOf(gFrom, m); Y <= yearOf(gTo, m); Y++) {
        var r = rangeOf(Y, m), f = k > 0 && r.from < gFrom ? gFrom : r.from, t = r.to > gTo ? gTo : r.to;
        if (days.some(function (d) { return d >= f && d <= t; })) add(Y, f, t);
      }
    }
    // 2) 最後一次封存之後：第一個年度接續封存結束日，之後照起始月
    var from = recs.length ? next(recs[recs.length - 1].to) : minDay;
    var Y = recs.length ? Number(recs[recs.length - 1].to.slice(0, 4)) + 1 : yearOf(from, m);
    while (rangeOf(Y, m).to < from) Y++;
    if (!recs.length) from = rangeOf(Y, m).from;
    for (; ; Y++) {
      var rr = rangeOf(Y, m);
      add(Y, from, rr.to);
      from = next(rr.to);
      if (rr.to >= maxDay) break;
    }
    recs.forEach(function (r) { list.push({ label: r.label, from: r.from, to: r.to, archived: true, count: r.count, at: r.at, by: r.by }); });
    list.sort(function (x, y) { return x.from < y.from ? 1 : -1; });
    return { startMonth: m, current: list.filter(function (x) { return x.current; })[0] || null, list: list };
  }
  var archCache = {};
  function loadArchived(label) {
    if (archCache[label]) return Promise.resolve(archCache[label]);
    return fetchAll('tasks', 'id', function (q) { return q.eq('archived', label); }).then(function (rows) {
      archCache[label] = rows.map(function (r) { var t = fromDb(r); t.start = t.astart || t.aend; t.end = t.aend || t.astart; t.warns = []; return t; });
      return archCache[label];
    }).catch(function (e) { throw err(e); });
  }
  function archivePeriod(label, from, to) {
    return sb.rpc('archive_period', { p_label: label, p_from: from, p_to: to }).then(chk)
      .then(function (n) { archCache = {}; return loadAll().then(function () { return n; }); }).catch(function (e) { throw err(e); });
  }
  function unarchivePeriod(label) {
    return sb.rpc('unarchive_period', { p_label: label }).then(chk)
      .then(function (n) { archCache = {}; return loadAll().then(function () { return n; }); }).catch(function (e) { throw err(e); });
  }

  /* ---------------- 對外 ---------------- */
  return {
    init: init, signIn: signIn, signOut: signOut, onChange: onChange,
    getData: function (opts) { return loadAll().then(function () { return snapshot(opts && opts.history); }).catch(function (e) { throw err(e); }); },
    saveTask: saveTask, setStatus: setStatus, previewTask: previewTask, deleteTask: deleteTask, reorderQueue: reorderQueue,
    applyTemplate: applyTemplate, bulkAdd: bulkAdd, bulkStatus: bulkStatus, saveProject: saveProject, resetBaseline: resetBaseline,
    saveLeave: saveLeave, exportPersonal: exportPersonal, getLog: getLog, getTaskLog: getTaskLog, parseWorkbook: parseWorkbook, importPayload: importPayload,
    adminData: adminData, refresh: refresh, saveSetting: saveSetting, savePerson: savePerson, deletePerson: deletePerson,
    saveDay: saveDay, deleteDay: deleteDay, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate, deleteLeave: deleteLeave,
    setManagedProjects: setManagedProjects, periods: periods, loadArchived: loadArchived, archivedCached: function (l) { return archCache[l] || null; }, archivePeriod: archivePeriod, unarchivePeriod: unarchivePeriod,
    me: function () { return me; }
  };
})();

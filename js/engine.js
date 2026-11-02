/**
 * 排程引擎（純計算，不碰試算表）。
 *
 * 規則：
 *  - 時間單位是「工作天」，可以有小數（0.5 天）。週末、行事曆的假日不算；行事曆的「補班」算。
 *  - 個人休假會扣掉那個人那幾天的可用時間（半天假 = 該天只剩 0.5）。
 *  - 排程方式「排隊」：佔用負責人的時間。同一人的排隊工項依「優先序」一個接一個做。
 *  - 排程方式「平行」：不佔用負責人的時間（例如監修外包），只看前置與最早開始。
 *  - 開始時間 = 下列最晚者：今天、最早開始、所有前置完成（+前置後間隔）、負責人手上前一項排隊工作做完。
 *  - 完成 / 待驗收：用實際日期，不再移動。
 *  - 進行中：從實際開始日起算；如果原本應完成的日子已過，就以「今天起做完剩下的量」推算，後面的工項跟著順延。
 */
var Engine = (function () {
  var EPS = 1e-6;
  var MS_DAY = 86400000;

  function dn(s) {
    if (!s) return null;
    if (typeof s === 'number') return s;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_DAY);
  }
  function ds(n) {
    if (n === null || n === undefined) return '';
    var d = new Date(n * MS_DAY);
    var mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function weekday(n) { return (new Date(n * MS_DAY)).getUTCDay(); } // 0 = 週日

  function splitIds(s) {
    if (!s) return [];
    return String(s).split(/[\s,，、;；]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function Calendar(holidays, makeup, leaves) {
    this.hol = {}; this.mk = {}; this.leave = {};
    var self = this;
    Object.keys(holidays || {}).forEach(function (k) { var n = dn(k); if (n !== null) self.hol[n] = holidays[k] || '假日'; });
    Object.keys(makeup || {}).forEach(function (k) { var n = dn(k); if (n !== null) self.mk[n] = 1; });
    (leaves || []).forEach(function (l) {
      var a = dn(l.start), b = dn(l.end) || a;
      if (a === null || !l.person) return;
      if (b < a) { var t = a; a = b; b = t; }
      var wd = [];
      for (var x = a; x <= b; x++) if (self.isWorkday(x)) wd.push(x);
      if (!wd.length) return;
      var days = Number(l.days);
      var per = (days > 0 && days < wd.length) ? days / wd.length : 1;
      var m = self.leave[l.person] || (self.leave[l.person] = {});
      wd.forEach(function (x) { m[x] = Math.min(1, (m[x] || 0) + per); });
    });
  }
  Calendar.prototype.isWorkday = function (n) {
    if (this.mk[n]) return true;
    var w = weekday(n);
    if (w === 0 || w === 6) return false;
    return !this.hol[n];
  };
  Calendar.prototype.cap = function (person, n) {
    if (!this.isWorkday(n)) return 0;
    var m = person && this.leave[person];
    return m && m[n] ? Math.max(0, 1 - m[n]) : 1;
  };
  /** 從位置 x（天號 + 當天已用比例）開始做 dur 天，回傳 {start, end, alloc:[[天號, 量], ...]} */
  Calendar.prototype.advance = function (person, x, dur) {
    var d = Math.floor(x + EPS), u = Math.max(0, x - d);
    var guard = 0;
    while (u >= this.cap(person, d) - EPS) { d++; u = 0; if (++guard > 4000) break; }
    var start = d + u, alloc = [];
    var rem = dur;
    if (rem <= EPS) return { start: start, end: start, alloc: [], first: d, last: d };
    guard = 0;
    while (rem > EPS && guard++ < 6000) {
      var c = this.cap(person, d), avail = c - u;
      if (avail > EPS) {
        var take = Math.min(avail, rem);
        alloc.push([d, take]);
        rem -= take; u += take;
        if (rem <= EPS) break;
      }
      d++; u = 0;
    }
    return { start: start, end: d + u, alloc: alloc, first: alloc[0][0], last: alloc[alloc.length - 1][0] };
  };
  /** a 到 b（不含 b）之間的工作天數，b < a 時回傳負數 */
  Calendar.prototype.workdaysBetween = function (a, b) {
    var sign = 1;
    if (b < a) { var t = a; a = b; b = t; sign = -1; }
    var n = 0;
    for (var x = a; x < b; x++) if (this.isWorkday(x)) n++;
    return n * sign;
  };

  function num(v, def) { var n = Number(v); return (v === '' || v === null || v === undefined || isNaN(n)) ? def : n; }

  /**
   * input = { tasks, holidays:{日期:名稱}, makeup:{日期:1}, leaves:[{person,start,end,days}], today:'yyyy-mm-dd' }
   * task  = { id, owner, mode, prio, days, preds, lag, earliest, release, status, doneQty, qty, pct（完成度 0～100，可空白）, astart, aend, baseline }
   */
  function schedule(input) {
    var cal = new Calendar(input.holidays, input.makeup, input.leaves);
    var today = dn(input.today);
    var all = {}, list = [];
    (input.tasks || []).forEach(function (t) { if (t && t.id) { all[t.id] = t; list.push(t); } });

    var R = {};      // id → 結果
    var succ = {};   // id → [後續工項]
    list.forEach(function (t) {
      R[t.id] = { start: null, end: null, endPos: null, alloc: [], warn: [], slip: 0, idle: 0 };
      if (t.status === '取消') return;
      t._preds = [];
      splitIds(t.preds).forEach(function (p) {
        if (p === t.id) { R[t.id].warn.push('前置不能是自己'); return; }
        var pt = all[p];
        if (!pt) { if (!input.lenientPreds) R[t.id].warn.push('找不到前置 ' + p); return; }
        if (pt.status === '取消') return;
        if (t._preds.indexOf(p) < 0) t._preds.push(p);
        (succ[p] = succ[p] || []).push(t.id);
      });
    });

    function finish(t, res, extraWarn) {
      var r = R[t.id];
      r.start = ds(res.first);
      r.end = ds(res.last);
      r.startPos = res.start;
      r.endPos = res.end;
      r.alloc = res.alloc;
      if (extraWarn) r.warn.push(extraWarn);
    }
    function fixedDone(t) {
      var a = dn(t.astart), b = dn(t.aend);
      if (b === null) b = (t.status === '待驗收') ? today : (dn(t.baseline) || a || today);
      if (a === null || a > b) a = b;
      var wd = [];
      for (var x = a; x <= b; x++) if (cal.isWorkday(x)) wd.push(x);
      if (!wd.length) wd = [b];
      var dur = Math.max(num(t.days, 0), 0), per = dur / wd.length;
      return { start: a, end: b + 1, first: a, last: b, alloc: wd.map(function (x) { return [x, per]; }) };
    }

    // ---- 第一階段：完成 / 待驗收 / 進行中 ----
    var cursor = {}; // 人員 → 排隊游標
    list.forEach(function (t) {
      if (t.status === '取消') return;
      var dur = Math.max(num(t.days, 0), 0);
      if (t.status === '完成' || (t.status === '待驗收' && t.aend)) {
        finish(t, fixedDone(t));
      } else if (t.status === '待驗收') {
        finish(t, fixedDone(t));
      } else if (t.status === '進行中') {
        var who = t.mode === '平行' ? null : t.owner;
        var a = dn(t.astart);
        if (a === null) a = today;
        var plan = cal.advance(who, a, dur);
        var qty = num(t.qty, 1) || 1, done = Math.min(num(t.doneQty, 0), qty);
        var pct = num(t.pct, null), hasPct = pct !== null;
        var remain = hasPct ? dur * (1 - Math.max(0, Math.min(100, pct)) / 100) : dur * (1 - done / qty);
        var res = plan, before = plan.alloc.filter(function (x) { return x[0] < today; });
        // 應有進度：照原計畫，到昨天為止應該完成的比例
        var expect = dur > EPS ? Math.min(100, before.reduce(function (s, x) { return s + x[1]; }, 0) / dur * 100) : 0;
        if (hasPct && a <= today) {
          // 有填完成度：用剩下的量從今天往後推算完成日
          var fc = remain > EPS ? cal.advance(who, today, remain) : null;
          var lastDay = fc ? fc.last : Math.max(today, before.length ? before[before.length - 1][0] : today);
          if (fc) res = { start: plan.start, first: plan.first, end: fc.end, last: fc.last, alloc: before.concat(fc.alloc) };
          else res = { start: plan.start, first: plan.first, end: lastDay + 1, last: lastDay, alloc: before.length ? before : [[today, 0]] };
          if (lastDay > plan.last) R[t.id].warn.push('進度落後：原訂 ' + ds(plan.last) + ' 完成，照目前進度約 ' + ds(lastDay));
        } else if (plan.last < today && remain > EPS) {
          var late = cal.advance(who, today, remain);
          res = { start: plan.start, first: plan.first, end: late.end, last: late.last, alloc: before.concat(late.alloc) };
          R[t.id].warn.push('進度落後：原訂 ' + ds(plan.last) + ' 完成');
        }
        finish(t, res);
        R[t.id].expect = Math.round(expect);
        R[t.id].planEnd = plan.last;
        var notDone = t._preds.filter(function (p) { var s = all[p].status; return s !== '完成' && s !== '待驗收'; });
        if (notDone.length) R[t.id].warn.push('已開始，但前置還沒完成：' + notDone.join('、'));
        if (who) cursor[who] = Math.max(cursor[who] || 0, res.end);
      }
    });

    // ---- 第二階段：未開始 / 暫停 ----
    var queues = {}, parallel = [], left = 0;
    list.forEach(function (t) {
      if (R[t.id].start !== null || t.status === '取消') return;
      left++;
      if (!t.owner) R[t.id].warn.push('未指派負責人');
      if (t.mode === '平行' || !t.owner) parallel.push(t);
      else (queues[t.owner] = queues[t.owner] || []).push(t);
    });
    Object.keys(queues).forEach(function (o) {
      queues[o].sort(function (a, b) {
        return (num(a.prio, 1e9) - num(b.prio, 1e9)) || ((dn(a.earliest) || 0) - (dn(b.earliest) || 0)) || (a.id < b.id ? -1 : 1);
      });
    });
    var head = {};
    Object.keys(queues).forEach(function (o) { head[o] = 0; });
    var done = {};
    function predsReady(t) {
      for (var i = 0; i < t._preds.length; i++) if (R[t._preds[i]].endPos === null || R[t._preds[i]].endPos === undefined) return false;
      return true;
    }
    function readyPos(t) {
      var x = today, e = dn(t.earliest);
      if (e !== null && e > x) x = e;
      var lag = Math.max(num(t.lag, 0), 0);
      t._preds.forEach(function (p) {
        var r = R[p];
        if (r.endPos === null || r.endPos === undefined) return;
        var px = r.endPos;
        if (lag > 0) px = cal.advance(null, px, lag).end;
        if (px > x) x = px;
        var ps = all[p].status;
        if (ps === '暫停') R[t.id].warn.indexOf('前置暫停中：' + p) < 0 && R[t.id].warn.push('前置暫停中：' + p);
      });
      return x;
    }
    function place(t, ignorePreds) {
      if (ignorePreds) t._preds = t._preds.filter(function (p) { return R[p].endPos !== null && R[p].endPos !== undefined; });
      var dur = Math.max(num(t.days, 0), 0);
      var x = readyPos(t), res;
      if (t.mode === '平行' || !t.owner) {
        res = cal.advance(null, x, dur);
      } else {
        var c = Math.max(cursor[t.owner] || today, today);
        if (x > c + EPS) {
          var idle = cal.workdaysBetween(Math.floor(c + EPS), Math.floor(x + EPS));
          if (idle >= 1) R[t.id].idle = idle;
        }
        res = cal.advance(t.owner, Math.max(x, c), dur);
        cursor[t.owner] = res.end;
      }
      finish(t, res);
      if (t.status === '暫停') R[t.id].warn.push('暫停中（以目前排程估算）');
      done[t.id] = 1; left--;
    }

    var guard = 0;
    while (left > 0 && guard++ < 200000) {
      var progress = false;
      Object.keys(queues).forEach(function (o) {
        var q = queues[o];
        while (head[o] < q.length) {
          var t = q[head[o]];
          if (done[t.id]) { head[o]++; continue; }
          if (!predsReady(t)) break;
          place(t); head[o]++; progress = true;
        }
      });
      for (var i = 0; i < parallel.length; i++) {
        var p = parallel[i];
        if (!done[p.id] && predsReady(p)) { place(p); progress = true; }
      }
      if (progress) continue;
      // 卡住了：先找前置都排好、只是排隊順序在後面的工項
      var jumped = null;
      Object.keys(queues).some(function (o) {
        var q = queues[o];
        for (var k = head[o] + 1; k < q.length; k++) {
          if (!done[q[k].id] && predsReady(q[k])) { jumped = q[k]; return true; }
        }
        return false;
      });
      if (jumped) {
        var blocker = queues[jumped.owner][head[jumped.owner]];
        R[jumped.id].warn.push('排序衝突：已提前到 ' + blocker.id + ' 之前（' + blocker.id + ' 在等的前置要靠這項之後的工作）');
        place(jumped);
        continue;
      }
      // 還是卡住 → 循環相依
      var victim = null;
      list.forEach(function (t) { if (!victim && R[t.id].start === null && t.status !== '取消' && !done[t.id]) victim = t; });
      if (!victim) break;
      var cyc = findCycle(victim.id, all, R);
      cyc.forEach(function (id) { if (!R[id].warn.some(function (w) { return w.indexOf('循環相依') === 0; })) R[id].warn.push('循環相依：' + cyc.join(' → ')); });
      place(victim, true);
    }

    // ---- 檢查與統計 ----
    list.forEach(function (t) {
      var r = R[t.id];
      if (t.status === '取消' || r.end === '') return;
      var rel = dn(t.release), end = dn(r.end);
      if (rel !== null && end !== null && end > rel && t.status !== '完成') r.warn.push('超過出版日 ' + ds(rel) + '（晚 ' + cal.workdaysBetween(rel, end) + ' 個工作天）');
      var base = dn(t.baseline);
      if (base !== null && end !== null && t.status !== '完成') {
        r.slip = cal.workdaysBetween(base, end);
        if (r.slip > 0) r.warn.push('比基準晚 ' + r.slip + ' 個工作天');
      }
      if (r.idle > 0) r.info = '負責人在此之前空等 ' + r.idle + ' 個工作天（等前置）';
    });

    // ---- 逾期未回報（提醒用）：r.stale = { kind, since, text } ----
    var md = function (n) { var x = ds(n); return (+x.slice(5, 7)) + '/' + (+x.slice(8)); };
    var touched = function (t) { return dn(String(t.updatedAt || '').slice(0, 10)); };
    var busy = {}, firstReady = {};
    list.forEach(function (t) { if (t.status === '進行中' && t.mode !== '平行' && t.owner) busy[t.owner] = 1; });
    list.forEach(function (t) {
      var r = R[t.id];
      if (!t.owner) return;
      if (t.status === '進行中' && r.planEnd !== undefined && r.planEnd !== null) {
        var up = touched(t);
        if (cal.workdaysBetween(r.planEnd + 1, today) >= 1 && (up === null || up <= r.planEnd)) {
          r.stale = { kind: '未送驗收', since: ds(r.planEnd), text: '逾期未回報：原訂 ' + md(r.planEnd) + ' 完成，之後沒有更新' };
          r.warn = r.warn.filter(function (w) { return w.indexOf('進度落後') !== 0; });
          r.warn.unshift(r.stale.text);
        }
        return;
      }
      if (t.status !== '未開始' || (t.mode !== '平行' && busy[t.owner])) return;
      var since = null, ok = true;
      (t._preds || []).forEach(function (p) {
        var pt = all[p], e = pt && dn(pt.aend);
        if (!pt || (pt.status !== '完成' && pt.status !== '待驗收') || e === null) ok = false; else if (since === null || e > since) since = e;
      });
      var ea = dn(t.earliest);
      if (ea !== null && (since === null || ea > since)) since = ea;
      if (!ok || since === null || cal.workdaysBetween(since + 1, today) < 2) return;
      var up2 = touched(t);
      if (up2 !== null && up2 > since) return;
      if (t.mode !== '平行') { var f = firstReady[t.owner]; if (f && R[f.id].startPos <= r.startPos) return; if (f) delete R[f.id].stale; firstReady[t.owner] = t; }
      r.stale = { kind: '未開始', since: ds(since), text: '可能已開始未回報：' + ((t._preds || []).length ? '前置 ' + md(since) + ' 已完成' : '預定 ' + md(since) + ' 開始') + '，還沒按開始' };
    });
    list.forEach(function (t) { var r = R[t.id]; if (r.stale && r.stale.kind === '未開始') r.warn.unshift(r.stale.text); });

    return { result: R, succ: succ, cal: cal };
  }

  function findCycle(start, all, R) {
    var path = [], onPath = {}, seen = {}, found = null;
    function dfs(id) {
      if (found) return;
      if (onPath[id]) { found = path.slice(path.indexOf(id)).concat(id); return; }
      if (seen[id]) return;
      seen[id] = 1; onPath[id] = 1; path.push(id);
      (all[id]._preds || []).forEach(function (p) { if (R[p] && (R[p].endPos === null || R[p].endPos === undefined)) dfs(p); });
      path.pop(); onPath[id] = 0;
    }
    dfs(start);
    return found || [start];
  }

  /** 檢查加入這些前置後會不會形成循環：回傳循環路徑或 null */
  function wouldCycle(tasks, id, preds) {
    var map = {};
    tasks.forEach(function (t) { map[t.id] = splitIds(t.preds); });
    map[id] = preds;
    var seen = {}, path = [id], found = null;
    function dfs(x) {
      if (found) return;
      var ps = map[x] || [];
      for (var i = 0; i < ps.length && !found; i++) {
        var p = ps[i];
        if (p === id) { found = path.concat(id); return; }
        if (seen[p]) continue;
        seen[p] = 1; path.push(p); dfs(p); path.pop();
      }
    }
    dfs(id);
    return found;
  }

  /** 每人每月：可用工作天、已排工作天 */
  function monthlyLoad(out, input, people, fromStr, toStr) {
    var cal = out.cal, a = dn(fromStr), b = dn(toStr), res = {};
    people.forEach(function (p) {
      var m = {};
      for (var x = a; x <= b; x++) {
        var key = ds(x).slice(0, 7);
        var o = m[key] || (m[key] = { cap: 0, used: 0 });
        o.cap += cal.cap(p, x);
      }
      res[p] = m;
    });
    (input.tasks || []).forEach(function (t) {
      if (!t.owner || !res[t.owner] || t.mode === '平行' || t.status === '取消') return;
      var r = out.result[t.id];
      (r.alloc || []).forEach(function (al) {
        if (al[0] < a || al[0] > b) return;
        var key = ds(al[0]).slice(0, 7);
        res[t.owner][key].used += al[1];
      });
    });
    return res;
  }

  return { schedule: schedule, wouldCycle: wouldCycle, monthlyLoad: monthlyLoad, dn: dn, ds: ds, splitIds: splitIds, Calendar: Calendar };
})();

if (typeof module !== 'undefined') module.exports = Engine;

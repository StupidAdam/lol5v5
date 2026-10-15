/* LOL 5v5 位置分配 —— 玩家自选蓝队/红队，只为每队随机分配位置。纯前端，无后端、无登录 */
(function () {
  'use strict';

  var POSITIONS = ['上单', '中单', '打野', '射手', '辅助'];
  var TEAM_SIZE = 5;
  var SLOT_COUNT = TEAM_SIZE * 2;      // 蓝 5 + 红 5
  var STORE_KEY = 'lol-randomizer-v2';
  var MAX_HISTORY = 5;

  var $ = function (sel) { return document.querySelector(sel); };

  // ---------------- 状态 ----------------
  // players: 长度 10，下标 0-4 属于蓝队，5-9 属于红队；'' 表示空位
  var state = {
    players: new Array(SLOT_COUNT).fill(''),
    teamNames: ['蓝队', '红队'],
    me: -1,                 // 「我」所在的槽位下标，-1 表示未加入
    room: '',               // 上次加入的房间码（刷新后自动重连）
    history: []             // [{ at: number, text: string }]
  };

  var current = null;   // 当前结果 { teams: [[{position,name}...], [...]], at }
  var rolling = false;  // 动画进行中
  var animTimer = null; // 动画计时器，便于打断

  // ---------------- 协作状态（Supabase Realtime） ----------------
  var collab = {
    on: false,        // 是否处于房间模式
    code: '',         // 6 位房间码
    version: 0,       // 已知的服务端版本号，用于乐观锁
    client: null,
    channel: null,
    dirty: {},        // 待上传的字段：p0..p9 / players / t0 / t1 / result
    pushTimer: null,
    pollTimer: null,
    applying: false   // 正在应用远端数据，避免回环上传
  };

  // ---------------- 随机工具（均匀分布，无取模偏差） ----------------
  var buf = new Uint32Array(1);
  function randInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    crypto.getRandomValues(buf);
    return Math.floor((buf[0] / 4294967296) * maxExclusive);
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------------- 队伍切片 ----------------
  function teamRange(t) { return { from: t * TEAM_SIZE, to: t * TEAM_SIZE + TEAM_SIZE }; }
  function teamLabel(t) { return $('#' + (t === 0 ? 'teamA' : 'teamB')).value.trim() || (t === 0 ? '蓝队' : '红队'); }
  function defaultLabel(t) { return t === 0 ? '蓝队' : '红队'; }

  /** 某队的槽位数组（可能含空字符串） */
  function teamSlots(t) {
    var r = teamRange(t);
    return state.players.slice(r.from, r.to);
  }

  /** 最终名单：空位用「蓝队空位 N」/「红队空位 N」占位 */
  function roster() {
    return state.players.map(function (name, i) {
      if (name.trim() !== '') return name.trim();
      var t = i < TEAM_SIZE ? 0 : 1;
      return teamLabel(t) + '空位' + ((i % TEAM_SIZE) + 1);
    });
  }

  function filledIn(t) {
    return teamSlots(t).filter(function (s) { return s.trim() !== ''; }).length;
  }

  // ---------------- 渲染名单 ----------------
  function updateCounts() {
    [0, 1].forEach(function (t) {
      $('#' + (t === 0 ? 'countBlue' : 'countRed')).textContent = filledIn(t) + ' / ' + TEAM_SIZE;
    });
    $('#countHint').textContent = (filledIn(0) + filledIn(1)) + ' / ' + SLOT_COUNT;
  }

  function renderRosters() {
    [0, 1].forEach(function (t) {
      var host = $('#' + (t === 0 ? 'gridBlue' : 'gridRed'));
      host.innerHTML = '';
      var r = teamRange(t);
      for (var i = r.from; i < r.to; i++) {
        host.appendChild(buildSlot(i, t));
      }
    });
    updateCounts();
  }

  function buildSlot(index, team) {
    var wrap = document.createElement('div');
    wrap.className = 'slot';

    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.dataset.index = String(index);
    input.dataset.team = String(team);
    input.autocomplete = 'off';
    input.placeholder = defaultLabel(team) + '空位' + ((index % TEAM_SIZE) + 1);
    input.value = state.players[index] || '';
    // 注意：输入过程中不能重建 DOM，否则输入框失焦、没法连续打字
    input.addEventListener('input', function () {
      state.players[index] = input.value;
      updateCounts();
      save();
      syncUrl();
      markDirty('p' + index);
    });
    input.addEventListener('blur', function () { renderRosters(); });

    if (state.me === index) {
      input.classList.add('is-me');
      var tag = document.createElement('span');
      tag.className = 'me-tag';
      tag.textContent = '我';
      wrap.appendChild(tag);
    }

    wrap.appendChild(input);

    if ((state.players[index] || '').trim() !== '') {
      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.title = '移出该队';
      del.setAttribute('aria-label', '移出该队');
      del.textContent = '×';
      del.addEventListener('click', function () {
        state.players[index] = '';
        if (state.me === index) state.me = -1;
        renderRosters();
        save();
        syncUrl();
        markDirty('p' + index);
        toast('已移出' + teamLabel(team));
      });
      wrap.appendChild(del);
    }

    return wrap;
  }

  // ---------------- 本地存储 ----------------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        players: state.players,
        teamNames: [teamLabel(0), teamLabel(1)],
        me: state.me,
        history: state.history,
        room: collab.on ? collab.code : ''
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      if (Array.isArray(d.players) && d.players.length === SLOT_COUNT) state.players = d.players;
      if (Array.isArray(d.teamNames) && d.teamNames.length === 2) state.teamNames = d.teamNames;
      if (typeof d.me === 'number') state.me = d.me;
      if (typeof d.room === 'string') state.room = d.room;
      if (Array.isArray(d.history)) state.history = d.history.slice(0, MAX_HISTORY);
      return true;
    } catch (e) { return false; }
  }

  // ---------------- URL 同步（邀请链接的载体） ----------------
  function parseNames(raw) {
    if (!raw) return [];
    return raw.split(',').slice(0, TEAM_SIZE).map(function (s) {
      return decodeURIComponent(s).trim().slice(0, 12);
    });
  }

  function readUrlTeams() {
    var qs = new URLSearchParams(location.search);
    var blue = parseNames(qs.get('blue'));
    var red = parseNames(qs.get('red'));
    var legacy = parseNames(qs.get('names'));   // 兼容旧版 ?names=（前 5 蓝，其余红）
    if (!blue.length && !red.length && !legacy.length) return null;
    if (!blue.length && !red.length) return { blue: legacy.slice(0, 5), red: legacy.slice(5, 10) };
    return { blue: blue, red: red };
  }

  function buildUrl() {
    var params = new URLSearchParams();
    [0, 1].forEach(function (t) {
      var filled = teamSlots(t).filter(function (s) { return s.trim() !== ''; });
      if (filled.length) params.set(t === 0 ? 'blue' : 'red', filled.join(','));
    });
    if (collab.on) params.set('room', collab.code);   // 房间模式下链接自带房间码
    var qs = params.toString();
    return location.origin + location.pathname + (qs ? '?' + qs : '');
  }

  var urlTimer = null;
  function syncUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try { history.replaceState(null, '', buildUrl()); } catch (e) { /* file:// 下忽略 */ }
    }, 200);
  }

  // ---------------- 位置分配算法（队伍不动，只洗位置） ----------------
  function makeAssign(names) {
    var teams = [0, 1].map(function (t) {
      var r = teamRange(t);
      var members = names.slice(r.from, r.to);
      var pos = shuffle(POSITIONS);              // 每队独立洗一次位置
      return members.map(function (name, i) {
        return { position: pos[i], name: name };
      });
    });
    return { teams: teams, at: Date.now() };
  }

  function fingerprint(r) {
    return r.teams.map(function (team) {
      return team.map(function (s) { return s.position + ':' + s.name; }).join('|');
    }).join('//');
  }

  function draw() {
    if (rolling) { clearInterval(animTimer); rolling = false; }   // 连点时打断上一次动画
    var names = roster();
    var prev = current ? fingerprint(current) : null;
    var result = makeAssign(names);
    // 抽到与上一次完全相同的结果时重抽，避免「点了没反应」
    for (var i = 0; i < 20 && fingerprint(result) === prev; i++) {
      result = makeAssign(names);
    }
    result.by = state.me >= 0 ? (state.players[state.me] || '').trim() : '';
    current = result;
    pushHistory(result);
    save();
    reveal(result);
    markDirty('result');        // 房间里所有人看到同一份结果
  }

  // ---------------- 结果渲染（带短动画） ----------------
  function reveal(result, withAnim) {
    var body = $('#resultBody');
    $('#resultCard').classList.remove('hidden');

    var nameEls = [];
    body.innerHTML = '';
    result.teams.forEach(function (team, ti) {
      var box = document.createElement('div');
      box.className = 'team' + (ti === 1 ? ' red' : '');

      var title = document.createElement('div');
      title.className = 'team-title';
      title.textContent = teamLabel(ti);
      box.appendChild(title);

      var ul = document.createElement('ul');
      ul.className = 'slots';
      team.forEach(function (slot) {
        var li = document.createElement('li');
        var p = document.createElement('span');
        p.className = 'pos';
        p.textContent = slot.position;
        var n = document.createElement('span');
        n.className = 'name';
        n.textContent = slot.name;
        li.appendChild(p);
        li.appendChild(n);
        ul.appendChild(li);
        nameEls.push({ el: n, final: slot.name });
      });

      box.appendChild(ul);
      body.appendChild(box);
    });

    if (withAnim === false) return;   // 改队名等场景：只刷新文案，不放动画
    animate(nameEls, result);
  }

  function animate(nameEls, result) {
    rolling = true;
    var pool = roster();
    var ticks = 0;
    var timer = animTimer = setInterval(function () {
      ticks++;
      var spinning = ticks <= 8;
      nameEls.forEach(function (item) {
        if (spinning) {
          item.el.classList.add('rolling');
          item.el.textContent = pool[randInt(pool.length)];
        } else {
          item.el.classList.remove('rolling');
          item.el.textContent = item.final;
        }
      });
      if (!spinning) {
        clearInterval(timer);
        rolling = false;
        renderHistory();
      }
    }, 60);
  }

  // ---------------- 结果文本 ----------------
  function resultText(result) {
    var d = new Date(result.at);
    var stamp = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

    var lines = ['【LOL 5v5 位置分配】' + stamp];
    result.teams.forEach(function (team, ti) {
      lines.push('');
      lines.push('[' + teamLabel(ti) + ']');
      team.forEach(function (s) {
        lines.push(s.position + '：' + s.name);
      });
    });
    if (result.by) lines.push('', '（由 ' + result.by + ' 抽取）');
    return lines.join('\n');
  }

  // ---------------- 历史 ----------------
  function pushHistory(result) {
    state.history.unshift({ at: result.at, text: resultText(result) });
    state.history = state.history.slice(0, MAX_HISTORY);
  }

  function renderHistory() {
    var card = $('#historyCard');
    var list = $('#historyList');
    if (!state.history.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    list.innerHTML = '';
    state.history.forEach(function (h) {
      var d = new Date(h.at);
      var li = document.createElement('li');
      var t = document.createElement('span');
      t.className = 't';
      t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      var s = document.createElement('span');
      s.className = 's';
      s.textContent = h.text.split('\n').filter(Boolean).slice(1).join(' ');
      var b = document.createElement('button');
      b.className = 'btn small ghost';
      b.type = 'button';
      b.textContent = '复制';
      b.addEventListener('click', function () { copy(h.text, '已复制该次结果'); });
      li.appendChild(t);
      li.appendChild(s);
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  // ---------------- 复制 / 提示 ----------------
  function copy(text, okMsg) {
    var done = function () { toast(okMsg || '已复制'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('复制失败，请手动选中文本'); }
      document.body.removeChild(ta);
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  // ---------------- 加入 / 移出 ----------------
  function join(team) {
    var el = $('#joinInput');
    var name = el.value.trim();
    if (!name) { toast('先输入你的名字'); el.focus(); return; }

    var r = teamRange(team);
    var idx = -1;

    // 已经在目标队里 → 视为改名；已在另一队 → 先移出，再入新队（换队）
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (state.players[i].trim() === name) { idx = i; break; }
    }
    if (idx !== -1 && (idx < r.from || idx >= r.to)) {
      state.players[idx] = '';      // 换队：清掉原队槽位
      markDirty('p' + idx);
      idx = -1;
    }
    if (idx !== -1) { renderRosters(); save(); syncUrl(); toast('你已在' + teamLabel(team)); return; }

    // 占该队第一个空位
    var target = -1;
    for (var j = r.from; j < r.to; j++) {
      if ((state.players[j] || '').trim() === '') { target = j; break; }
    }
    if (target === -1) { toast(teamLabel(team) + '已满 5 人，换另一队吧'); return; }

    state.players[target] = name;
    state.me = target;
    el.value = '';
    renderRosters();
    save();
    syncUrl();
    markDirty('p' + target);
    toast('已加入' + teamLabel(team) + '：' + name);
  }

  // ---------------- 协作：Supabase 房间 ----------------
  function collabConfigured() {
    var cfg = window.LOL_CONFIG || {};
    return !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  function ensureClient() {
    if (collab.client) return collab.client;
    var cfg = window.LOL_CONFIG;
    collab.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return collab.client;
  }

  function snapshot() {
    return {
      players: state.players.slice(),
      teamNames: [teamLabel(0), teamLabel(1)],
      result: current || null
    };
  }

  /** 标记某个字段被本地改动，300ms 后批量上传（字段级，避免整包覆盖别人的改动） */
  function markDirty(key) {
    if (!collab.on || collab.applying) return;
    collab.dirty[key] = true;
    clearTimeout(collab.pushTimer);
    collab.pushTimer = setTimeout(push, 300);
  }

  function readKey(obj, key) {
    if (key === 'result') return obj.result;
    if (key === 'players') return obj.players;
    if (key === 'teamNames') return obj.teamNames;
    if (key.charAt(0) === 't') return obj.teamNames[Number(key.slice(1))];
    return obj.players[Number(key.slice(1))];
  }

  function writeKey(obj, key, val) {
    if (key === 'result') { obj.result = val; return; }
    if (key === 'players') { obj.players = val; return; }
    if (key === 'teamNames') { obj.teamNames = val; return; }
    if (key.charAt(0) === 't') { obj.teamNames[Number(key.slice(1))] = val; return; }
    obj.players[Number(key.slice(1))] = val;
  }

  /** 以远端数据为底，只把本地改过的字段盖上去 */
  function mergeDirty(base, local) {
    var out = JSON.parse(JSON.stringify(base || {}));
    if (!out.players) out.players = new Array(SLOT_COUNT).fill('');
    if (!out.teamNames) out.teamNames = ['蓝队', '红队'];
    Object.keys(collab.dirty).forEach(function (key) {
      writeKey(out, key, readKey(local, key));
    });
    return out;
  }

  function setStatus(text, kind) {
    var el = $('#syncStatus');
    if (!el) return;
    el.innerHTML = '<i class="dot ' + (kind || '') + '"></i>' + text;
  }

  function renderCollabUI() {
    if (collab.on) {
      $('#collabOn').classList.remove('hidden');
      $('#collabOff').classList.add('hidden');
      $('#roomCode').textContent = collab.code;
    } else {
      $('#collabOn').classList.add('hidden');
      $('#collabOff').classList.remove('hidden');
    }
  }

  function genCode() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 去掉 0/O/1/I 等易混淆字符
    var s = '';
    for (var i = 0; i < 6; i++) s += chars[randInt(chars.length)];
    return s;
  }

  function roomUrl() {
    return location.origin + location.pathname + '?room=' + collab.code;
  }

  async function createRoom() {
    if (!collabConfigured()) { toast('还没配置 Supabase，见 README「多人协作」一节'); return; }
    setStatus('创建中…', 'warn');
    var client = ensureClient();
    var code = '';
    for (var i = 0; i < 8; i++) {
      var cand = genCode();
      var hit = await client.from('rooms').select('code').eq('code', cand).maybeSingle();
      if (!hit.data) { code = cand; break; }
    }
    if (!code) { setStatus('本地模式', ''); toast('房间码生成失败，再点一次'); return; }

    var ins = await client.from('rooms').insert({ code: code, data: snapshot(), version: 1 });
    if (ins.error) { setStatus('本地模式', ''); toast('创建失败：' + ins.error.message); return; }

    collab.on = true; collab.code = code; collab.version = 1; collab.dirty = {};
    renderCollabUI(); subscribe(); startPoll(); save(); syncUrl();
    setStatus('已连接', 'on');
    toast('房间已创建：' + code);
  }

  async function joinRoom(input, silent) {
    var code = String(input || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast('房间码是 6 位字母数字'); return false; }
    if (!collabConfigured()) { toast('还没配置 Supabase，见 README「多人协作」一节'); return false; }
    setStatus('连接中…', 'warn');

    var res = await ensureClient().from('rooms').select('data,version').eq('code', code).maybeSingle();
    if (res.error || !res.data) { setStatus('本地模式', ''); toast('找不到房间 ' + code); return false; }

    collab.on = true; collab.code = code; collab.version = res.data.version; collab.dirty = {};
    applyRemote(res.data.data, res.data.version, true);
    renderCollabUI(); subscribe(); startPoll(); save(); syncUrl();
    setStatus('已连接', 'on');
    if (!silent) toast('已加入房间 ' + code);
    return true;
  }

  function leaveRoom() {
    unsubscribe();
    clearInterval(collab.pollTimer);
    clearTimeout(collab.pushTimer);
    collab.on = false; collab.code = ''; collab.dirty = {};
    renderCollabUI(); setStatus('本地模式', '');
    syncUrl(); save();
    toast('已退出协作，回到本地模式');
  }

  async function push() {
    if (!collab.on) return;
    var client = ensureClient();
    setStatus('同步中…', 'warn');
    var local = snapshot();

    for (var attempt = 0; attempt < 3; attempt++) {
      var res = await client.from('rooms').select('data,version').eq('code', collab.code).maybeSingle();
      if (res.error) { setStatus('同步失败', 'warn'); return; }

      if (!res.data) {   // 房间被清理过，重建
        await client.from('rooms').insert({ code: collab.code, data: local, version: 1 });
        collab.version = 1; collab.dirty = {}; setStatus('已连接', 'on'); return;
      }

      var merged = mergeDirty(res.data.data, local);
      var upd = await client.from('rooms')
        .update({ data: merged, version: res.data.version + 1, updated_at: new Date().toISOString() })
        .eq('code', collab.code)
        .eq('version', res.data.version)      // 乐观锁：版本没变才写入
        .select('version');

      if (upd.data && upd.data.length) {
        collab.version = upd.data[0].version;
        collab.dirty = {};
        setStatus('已连接', 'on');
        return;
      }
      // 版本被别人抢先了 -> 重新拉取、重新合并，再试
    }
    setStatus('同步冲突', 'warn');
    toast('有人的改动和你的冲突了，已重试多次');
  }

  function applyRemote(data, version, force) {
    if (!data) return;
    if (!force && version <= collab.version) return;
    collab.version = version;

    collab.applying = true;
    if (Array.isArray(data.players) && data.players.length === SLOT_COUNT) {
      state.players = data.players.slice();
    }
    if (Array.isArray(data.teamNames) && data.teamNames.length === 2) {
      state.teamNames = data.teamNames;
      if ($('#teamA')) $('#teamA').value = data.teamNames[0] || '蓝队';
      if ($('#teamB')) $('#teamB').value = data.teamNames[1] || '红队';
    }
    renderRosters();

    if (data.result && (!current || data.result.at > current.at)) {
      current = data.result;
      reveal(current, false);        // 别人抽的签，直接展示不放动画
    }
    collab.applying = false;

    if (Object.keys(collab.dirty).length) {
      clearTimeout(collab.pushTimer);
      collab.pushTimer = setTimeout(push, 200);
    }
  }

  function subscribe() {
    if (!collab.on) return;
    unsubscribe();
    collab.channel = ensureClient().channel('room-' + collab.code)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.' + collab.code
      }, function (payload) {
        var row = payload.new;
        if (row) applyRemote(row.data, row.version);
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') setStatus('已连接', 'on');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setStatus('实时断开，轮询兜底中', 'warn');
        }
      });
  }

  function unsubscribe() {
    if (collab.channel) {
      try { ensureClient().removeChannel(collab.channel); } catch (e) { /* 忽略 */ }
      collab.channel = null;
    }
  }

  function startPoll() {
    clearInterval(collab.pollTimer);
    collab.pollTimer = setInterval(async function () {
      if (!collab.on || document.hidden) return;
      var res = await ensureClient().from('rooms').select('data,version').eq('code', collab.code).maybeSingle();
      if (res.data && res.data.version > collab.version) applyRemote(res.data.data, res.data.version);
    }, 8000);
  }

  // ---------------- 事件 ----------------
  function bindEvents() {
    $('#btnDraw').addEventListener('click', draw);
    $('#btnRedraw').addEventListener('click', draw);

    $('#btnCopyResult').addEventListener('click', function () {
      if (!current) return;
      copy(resultText(current), '结果已复制，去群里粘贴吧');
    });

    $('#btnJoinBlue').addEventListener('click', function () { join(0); });
    $('#btnJoinRed').addEventListener('click', function () { join(1); });
    $('#joinInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') join(0);
    });

    $('#btnDemo').addEventListener('click', function () {
      state.players = ['疾风剑豪', '暗夜猎手', '无双剑姬', '暴走萝莉', '影流之主',
                       '寒冰射手', '熔岩巨兽', '盲僧', '九尾妖狐', '德玛西亚'];
      renderRosters();
      save();
      syncUrl();
      markDirty('players');
      toast('已填入示例：蓝队 5 人 / 红队 5 人');
    });

    $('#btnClear').addEventListener('click', function () {
      state.players = new Array(SLOT_COUNT).fill('');
      state.me = -1;
      renderRosters();
      save();
      syncUrl();
      markDirty('players');
      toast('名单已清空');
    });

    $('#btnInvite').addEventListener('click', function () {
      var link = buildUrl();
      $('#inviteLink').value = link;
      $('#inviteBox').classList.remove('hidden');
      if (link.indexOf('?') === -1) toast('先让几个人选好队伍再生成，链接才会带名单');
    });

    $('#btnCopyLink').addEventListener('click', function () {
      copy($('#inviteLink').value || buildUrl(), '邀请链接已复制');
    });

    $('#btnClearHistory').addEventListener('click', function () {
      state.history = [];
      renderHistory();
      save();
    });

    ['#teamA', '#teamB'].forEach(function (sel) {
      var key = sel === '#teamA' ? 't0' : 't1';
      $(sel).addEventListener('input', function () {
        state.teamNames = [$('#teamA').value, $('#teamB').value];
        renderRosters();
        if (current) reveal(current, false);   // 只换标题文案，不重放抽签动画
        save();
        markDirty(key);
      });
    });

    // 协作
    $('#btnCreateRoom').addEventListener('click', createRoom);
    $('#btnJoinRoom').addEventListener('click', function () { joinRoom($('#roomInput').value); });
    $('#roomInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') joinRoom($('#roomInput').value);
    });
    $('#btnCopyRoomLink').addEventListener('click', function () {
      copy(roomUrl(), '邀请链接已复制，发群里吧');
    });
    $('#btnLeaveRoom').addEventListener('click', leaveRoom);
  }

  // ---------------- 启动 ----------------
  function init() {
    var fromUrl = readUrlTeams();     // 链接里的名单优先（说明是被邀请打开的）
    var hasLocal = load();

    if (fromUrl) {
      state.players = new Array(SLOT_COUNT).fill('');
      fromUrl.blue.forEach(function (n, i) { if (n) state.players[i] = n; });
      fromUrl.red.forEach(function (n, i) { if (n) state.players[TEAM_SIZE + i] = n; });
    } else if (!hasLocal) {
      state.players = new Array(SLOT_COUNT).fill('');
    }

    $('#teamA').value = state.teamNames[0] || '蓝队';
    $('#teamB').value = state.teamNames[1] || '红队';

    renderRosters();
    bindEvents();
    renderHistory();
    syncUrl();

    // 带着 ?room=XXXXXX 打开，或上次加入过房间 -> 自动重连
    var urlRoom = new URLSearchParams(location.search).get('room');
    var target = urlRoom || state.room;
    if (target && collabConfigured()) joinRoom(target);
    else if (urlRoom && !collabConfigured()) {
      setStatus('未配置后端', 'warn');
      toast('这个链接是协作房间，但页面还没配置 Supabase');
    }
  }

  init();
})();

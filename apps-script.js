// ══════════════════════════════════════════════════════
//  DESAFIO SAÚDE — Google Apps Script Backend v3
//  Sheets: "Usuarios", "Atividades", "Config"
// ══════════════════════════════════════════════════════

const SHEET_USERS  = 'Usuarios';
const SHEET_ACTS   = 'Atividades';
const SHEET_CONFIG = 'Config';

// Senha do admin — só existe no servidor, nunca no HTML
const ADMIN_PASS = 'saude2026';

// ── GET ───────────────────────────────────────────────
function doGet(e) {
  const p      = (e && e.parameter) ? e.parameter : {};
  const action = p.action || '';

  if (action === 'ranking')         return getRanking();
  if (action === 'init')            return getInitData(p);
  if (action === 'adminGetProfile') return adminGetUserProfile(p);
  if (action === 'profile')      return getProfile(p.name, p.token);
  if (action === 'admin')        return getAdminDashboard(p.adminToken);
  if (action === 'config')       return getConfig();

  return json({ status: 'ok' });
}

// ── POST ──────────────────────────────────────────────
function doPost(e) {
  try {
    const d      = JSON.parse(e.postData.contents);
    const action = d.action || '';

    if (action === 'register')       return registerUser(d);
    if (action === 'login')          return loginUser(d);
    if (action === 'activity')       return saveActivity(d);
    if (action === 'deleteUser')     return deleteUser(d);
    if (action === 'adminLogin')     return adminLogin(d);
    if (action === 'changePassword') return changePassword(d);
    if (action === 'adminSetConfig') return adminSetConfig(d);
    if (action === 'adminResetPass') return adminResetPassword(d);

    return json({ success: false, error: 'ação desconhecida' });
  } catch (err) {
    return json({ success: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════

function registerUser(d) {
  const { name, passHash } = d;
  if (!name || !passHash) return json({ success: false, error: 'Campos obrigatórios.' });

  const sheet = getUserSheet();
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === name.toLowerCase()) {
      return json({ success: false, error: 'Este nome já está em uso. Escolha outro.' });
    }
  }

  sheet.appendRow([name, passHash, Utilities.formatDate(new Date(), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ss")]);
  return json({ success: true, storedName: name });
}

function loginUser(d) {
  const { name, passHash } = d;
  if (!name || !passHash) return json({ success: false, error: 'Campos obrigatórios.' });

  const row = findUser(name);
  if (!row) return json({ success: false, error: 'Usuário não encontrado.' });
  if (row[1] !== passHash) return json({ success: false, error: 'Senha incorreta.' });

  // Retorna o nome canônico (como foi cadastrado) para consistência do token
  return json({ success: true, storedName: row[0] });
}

function adminLogin(d) {
  if (!d.passHash) return json({ success: false, error: 'Campos obrigatórios.' });
  if (d.passHash !== sha256Gas(ADMIN_PASS)) return json({ success: false, error: 'Senha incorreta.' });
  const todayStr   = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  const adminToken = sha256Gas(ADMIN_PASS + todayStr);
  return json({ success: true, adminToken });
}

function changePassword(d) {
  if (!validateToken(d.name, d.token)) return json({ auth: false });
  if (!d.newPassHash) return json({ success: false, error: 'Nova senha inválida.' });

  const sheet = getUserSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === d.name.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(d.newPassHash);
      return json({ success: true });
    }
  }
  return json({ success: false, error: 'Usuário não encontrado.' });
}

function findUser(name) {
  const rows = getUserSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === name.toLowerCase()) return rows[i];
  }
  return null;
}

function validateToken(name, token) {
  if (!token || !name) return false;
  const row = findUser(name);
  if (!row) return false;
  // token = sha256(storedName + passHash) — igual ao gerado pelo cliente
  return sha256Gas(row[0] + row[1]) === token;
}

function validateAdminToken(adminToken) {
  if (!adminToken) return false;
  const todayStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  return adminToken === sha256Gas(ADMIN_PASS + todayStr);
}

// ══════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════

function getConfig() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('config');
  if (cached) return json(JSON.parse(cached));

  const sheet  = getConfigSheet();
  const rows   = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) config[rows[i][0].toString()] = rows[i][1].toString();
  }
  cache.put('config', JSON.stringify(config), 3600);
  return json(config);
}

function getLocks() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('config');
  let cfg = {};
  if (cached) {
    cfg = JSON.parse(cached);
  } else {
    const rows = getConfigSheet().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) cfg[rows[i][0].toString()] = rows[i][1].toString();
    }
  }
  const todayStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  return {
    cardio: cfg.lock_cardio === '1',
    gym:    cfg.lock_gym    === '1',
    // Desafio alimentar vale só de segunda a sexta: trava sozinho no fim de semana.
    food:   cfg.lock_food   === '1' || isWeekend(todayStr),
    sleep:  cfg.lock_sleep  === '1',
    bonus:  cfg.lock_bonus  === '1',
  };
}

function getInitData(p) {
  if (!validateToken(p.name, p.token)) return json({ auth: false });

  const cache      = CacheService.getScriptCache();
  const cachedConf = cache.get('config');
  let   configData = {};
  if (cachedConf) {
    configData = JSON.parse(cachedConf);
  } else {
    const rows = getConfigSheet().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) configData[rows[i][0].toString()] = rows[i][1].toString();
    }
    cache.put('config', JSON.stringify(configData), 3600);
  }

  const actRows  = getActSheet().getDataRange().getValues();
  const lname    = p.name.toLowerCase();
  const dates    = (p.dates || '').split(',').filter(Boolean);
  const activities = {};
  const presence   = {};

  for (let i = 1; i < actRows.length; i++) {
    if (actRows[i][1].toString().toLowerCase() !== lname) continue;
    const nd = normalizeDate(actRows[i][3]);
    if (nd === p.date)                                    activities[actRows[i][2]] = true;
    if (dates.includes(nd) && actRows[i][2] === 'gym')   presence[nd] = true;
  }

  const locks = {
    cardio: configData.lock_cardio === '1',
    gym:    configData.lock_gym    === '1',
    food:   configData.lock_food   === '1' || isWeekend(p.date),
    sleep:  configData.lock_sleep  === '1',
    bonus:  configData.lock_bonus  === '1',
  };

  return json({
    desafio_alimentar: configData.desafio_alimentar || '',
    activities,
    presence,
    locks,
    rec_titulo:      configData.rec_titulo      || '',
    rec_cardio:      configData.rec_cardio      || '',
    rec_treino:      configData.rec_treino       || '',
    rec_alimentacao: configData.rec_alimentacao  || '',
    rec_sono:        configData.rec_sono         || '',
  });
}

// ══════════════════════════════════════════════════════
//  ATIVIDADES
// ══════════════════════════════════════════════════════

function saveActivity(d) {
  if (!validateToken(d.name, d.token)) return json({ auth: false });

  if (!d.remove) {
    if (d.activity === 'food' && isWeekend(d.date)) {
      return json({ success: false, locked: true, error: 'O desafio alimentar vale só de segunda a sexta. 🥗' });
    }
    const locks = getLocks();
    if (locks[d.activity]) return json({ success: false, locked: true, error: 'Atividade bloqueada pelo administrador.' });
  }

  const sheet  = getActSheet();
  const rows   = sheet.getDataRange().getValues();
  const remove = !!d.remove;
  const lname  = d.name.toLowerCase();

  if (remove) {
    let removed = false;
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][1].toString().toLowerCase() === lname && rows[i][2] === d.activity && normalizeDate(rows[i][3]) === d.date) {
        sheet.deleteRow(i + 1);
        removed = true;
      }
    }
    if (removed) CacheService.getScriptCache().remove('ranking');
    return json({ success: true, action: removed ? 'removed' : 'not_found' });
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1].toString().toLowerCase() === lname && rows[i][2] === d.activity && normalizeDate(rows[i][3]) === d.date) {
      return json({ success: true, action: 'already_exists' });
    }
  }

  sheet.appendRow([new Date().toISOString(), d.name, d.activity, d.date]);
  CacheService.getScriptCache().remove('ranking');
  return json({ success: true, action: 'saved' });
}

// ══════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════

function getProfile(name, token) {
  if (!validateToken(name, token)) return json({ auth: false });

  const actRows = getActSheet().getDataRange().getValues();
  const userRow = findUser(name);
  const since   = userRow ? userRow[2].toString().split('T')[0] : '';
  const lname   = name.toLowerCase();

  const byDate = {};
  for (let i = 1; i < actRows.length; i++) {
    if (actRows[i][1].toString().toLowerCase() !== lname) continue;
    const date = normalizeDate(actRows[i][3]);
    const act  = actRows[i][2];
    if (!byDate[date]) byDate[date] = new Set();
    byDate[date].add(act);
  }

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const history     = sortedDates.map(date => {
    const acts = Array.from(byDate[date]);
    return { date, activities: acts, points: acts.length };
  });

  const scores  = buildScores(actRows, getLocks());
  const myScore = scores[userRow ? userRow[0] : name] || { total: 0, actCount: 0 };
  const ranking = toRankingArray(scores, 'total');
  const rank    = ranking.findIndex(p => p.name.toLowerCase() === lname) + 1;

  return json({ since, totalPoints: myScore.total, totalDays: Object.keys(byDate).length, rank, history });
}

function deleteUser(d) {
  if (!validateToken(d.name, d.token)) return json({ auth: false });
  const lname = d.name.toLowerCase();

  const uSheet = getUserSheet();
  const uRows  = uSheet.getDataRange().getValues();
  for (let i = uRows.length - 1; i >= 1; i--) {
    if (uRows[i][0].toString().toLowerCase() === lname) {
      uSheet.deleteRow(i + 1);
      break;
    }
  }

  const aSheet = getActSheet();
  const aRows  = aSheet.getDataRange().getValues();
  for (let i = aRows.length - 1; i >= 1; i--) {
    if (aRows[i][1].toString().toLowerCase() === lname) {
      aSheet.deleteRow(i + 1);
    }
  }

  return json({ success: true });
}

// ══════════════════════════════════════════════════════
//  RANKING
// ══════════════════════════════════════════════════════

function getRanking() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('ranking');
  if (cached) return json(JSON.parse(cached));

  const rows   = getActSheet().getDataRange().getValues();
  const scores = buildScores(rows, getLocks());
  const data   = {
    ranking:       toRankingArray(scores, 'total'),
    cardioRanking: toRankingArray(scores, 'cardio'),
    gymRanking:    toRankingArray(scores, 'gym'),
    foodRanking:   toRankingArray(scores, 'food'),
    sleepRanking:  toRankingArray(scores, 'sleep'),
  };
  cache.put('ranking', JSON.stringify(data), 300);
  return json(data);
}

// ══════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════

function getAdminDashboard(adminToken) {
  if (!validateAdminToken(adminToken)) return json({ auth: false });

  const actRows   = getActSheet().getDataRange().getValues();
  const uRows     = getUserSheet().getDataRange().getValues();
  const todayStr  = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  const weekDates = getCurrentWeekDates();
  const locks     = getLocks();
  const scores    = buildScores(actRows, locks);

  const participants   = new Set(uRows.slice(1).map(r => r[0]).filter(Boolean));
  const activeTodaySet = new Set();
  const activeWeekSet  = new Set();
  actRows.slice(1).forEach(r => {
    if (!r[1]) return;
    const nd = normalizeDate(r[3]);
    if (nd === todayStr)          activeTodaySet.add(r[1]);
    if (weekDates.includes(nd))   activeWeekSet.add(r[1]);
  });

  const presMap = {};
  actRows.slice(1).forEach(r => {
    const name = r[1], date = normalizeDate(r[3]);
    if (!name || !weekDates.includes(date)) return;
    if (!presMap[name]) presMap[name] = new Set();
    presMap[name].add(date);
  });
  const weekPresence = Array.from(participants).map(name => ({
    name,
    days: weekDates.map(d => !!(presMap[name] && presMap[name].has(d)))
  })).sort((a, b) => b.days.filter(Boolean).length - a.days.filter(Boolean).length);

  const userList = uRows.slice(1)
    .filter(r => r[0])
    .map(r => {
      const nm = r[0].toString();
      const sc = scores[nm] || { total: 0, actCount: 0 };
      return { name: nm, since: r[2] ? r[2].toString().split('T')[0] : '', totalPoints: sc.total, actCount: sc.actCount || 0 };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return json({
    totalParticipants: participants.size,
    totalActivities:   actRows.length - 1,
    activeToday:       activeTodaySet.size,
    activeThisWeek:    activeWeekSet.size,
    ranking:           toRankingArray(scores, 'total'),
    cardioRanking:     toRankingArray(scores, 'cardio'),
    gymRanking:        toRankingArray(scores, 'gym'),
    foodRanking:       toRankingArray(scores, 'food'),
    sleepRanking:      toRankingArray(scores, 'sleep'),
    weekPresence,
    userList
  });
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════

// Sheets pode retornar a coluna Data como objeto Date em vez de string
// dependendo da formatação da planilha — sempre normalizar antes de comparar
function normalizeDate(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Sao_Paulo', 'yyyy-MM-dd');
  return val.toString().trim();
}

function buildScores(rows, locks) {
  locks = locks || {};
  const map  = {};
  const seen = new Set();
  rows.slice(1).forEach(r => {
    const name = r[1], act = r[2], date = normalizeDate(r[3]);
    if (!name || !act || !date) return;
    // Bloqueio NÃO apaga pontos já registrados — só impede novos registros (ver saveActivity).
    // Por isso a pontuação histórica nunca é filtrada por locks[act] aqui.
    const dedupeKey = `${name.toString().toLowerCase()}|${act}|${date}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    if (!map[name]) map[name] = { total: 0, cardio: 0, gym: 0, food: 0, sleep: 0, actCount: 0, weekDays: {} };
    map[name][act]      = (map[name][act] || 0) + 1;
    map[name].total    += 1;
    map[name].actCount += 1;
    if (act === 'gym') {
      const wk = weekKey(new Date(date + 'T12:00:00'));
      if (!map[name].weekDays[wk]) map[name].weekDays[wk] = new Set();
      map[name].weekDays[wk].add(date);
    }
  });
  if (!locks.bonus) {
    Object.values(map).forEach(s => {
      Object.values(s.weekDays).forEach(days => { if (days.size >= 5) s.total += 3; });
    });
  }
  return map;
}

function toRankingArray(scores, key) {
  return Object.entries(scores)
    .map(([name, s]) => ({
      name,
      points:     key === 'total' ? s.total    : (s[key] || 0),
      activities: key === 'total' ? s.actCount : (s[key] || 0)
    }))
    .filter(p => p.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function getCurrentWeekDates() {
  const tz       = 'America/Sao_Paulo';
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  // Criar data ao meio-dia para evitar problemas com DST
  const today    = new Date(todayStr + 'T12:00:00');
  const dow      = today.getDay() === 0 ? 7 : today.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (dow - (i + 1)));
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  });
}

// Sábado (6) ou domingo (0) — usado para travar o desafio alimentar fora de seg–sex.
// dateStr no formato 'yyyy-MM-dd' (já no fuso de Brasília); meio-dia evita problemas com DST.
function isWeekend(dateStr) {
  if (!dateStr) return false;
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 || dow === 6;
}

function weekKey(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  return d.getFullYear() + '-W' + String(wn).padStart(2, '0');
}

// SHA-256 server-side — mesmo algoritmo que o browser usa (WebCrypto / UTF-8)
function sha256Gas(str) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function getUserSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_USERS);
  if (!s) {
    s = ss.insertSheet(SHEET_USERS);
    s.appendRow(['Nome', 'SenhaHash', 'DataCadastro']);
    s.getRange('1:1').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function getActSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_ACTS);
  if (!s) {
    s = ss.insertSheet(SHEET_ACTS);
    s.appendRow(['Timestamp', 'Nome', 'Atividade', 'Data']);
    s.getRange('1:1').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function getConfigSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_CONFIG);
  if (!s) {
    s = ss.insertSheet(SHEET_CONFIG);
    s.appendRow(['Chave', 'Valor']);
    s.appendRow(['desafio_alimentar', 'Reduzir os excessos — evite ultraprocessados, açúcar e álcool esta semana 🌱']);
    s.getRange('1:1').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function adminSetConfig(d) {
  if (!validateAdminToken(d.adminToken)) return json({ auth: false });
  if (!d.key || d.value === undefined)   return json({ success: false, error: 'Campos obrigatórios.' });

  const sheet = getConfigSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString() === d.key) {
      sheet.getRange(i + 1, 2).setValue(d.value);
      CacheService.getScriptCache().remove('config');
      return json({ success: true });
    }
  }
  sheet.appendRow([d.key, d.value]);
  CacheService.getScriptCache().remove('config');
  return json({ success: true });
}

function adminResetPassword(d) {
  if (!validateAdminToken(d.adminToken)) return json({ auth: false });
  if (!d.name || !d.newPassHash)         return json({ success: false, error: 'Campos obrigatórios.' });

  const sheet = getUserSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === d.name.toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(d.newPassHash);
      return json({ success: true });
    }
  }
  return json({ success: false, error: 'Usuário não encontrado.' });
}

function adminGetUserProfile(params) {
  if (!validateAdminToken(params.adminToken)) return json({ auth: false });
  if (!params.name)                           return json({ success: false, error: 'Nome obrigatório.' });

  const actRows = getActSheet().getDataRange().getValues();
  const userRow = findUser(params.name);
  if (!userRow) return json({ success: false, error: 'Usuário não encontrado.' });

  const since = userRow[2] ? userRow[2].toString().split('T')[0] : '';
  const lname = params.name.toLowerCase();

  const byDate = {};
  for (let i = 1; i < actRows.length; i++) {
    if (actRows[i][1].toString().toLowerCase() !== lname) continue;
    const date = normalizeDate(actRows[i][3]);
    const act  = actRows[i][2];
    if (!byDate[date]) byDate[date] = new Set();
    byDate[date].add(act);
  }

  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const history     = sortedDates.map(date => {
    const acts = Array.from(byDate[date]);
    return { date, activities: acts, points: acts.length };
  });

  const scores  = buildScores(actRows, getLocks());
  const myScore = scores[userRow[0]] || { total: 0, actCount: 0, cardio: 0, gym: 0, food: 0 };
  const ranking = toRankingArray(scores, 'total');
  const rank    = ranking.findIndex(u => u.name.toLowerCase() === lname) + 1;

  return json({
    name:        userRow[0],
    since,
    totalPoints: myScore.total,
    totalDays:   Object.keys(byDate).length,
    cardioCount: myScore.cardio || 0,
    gymCount:    myScore.gym    || 0,
    foodCount:   myScore.food   || 0,
    sleepCount:  myScore.sleep  || 0,
    rank,
    history
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

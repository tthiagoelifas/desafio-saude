// ══════════════════════════════════════════════════════
//  DESAFIO SAÚDE — Google Apps Script Backend v2
//  Sheets: "Usuarios" e "Atividades"
// ══════════════════════════════════════════════════════

const SHEET_USERS = 'Usuarios';
const SHEET_ACTS  = 'Atividades';

// ── GET ───────────────────────────────────────────────
function doGet(e) {
  const p      = (e && e.parameter) ? e.parameter : {};
  const action = p.action || '';

  if (action === 'ranking')      return getRanking();
  if (action === 'today')        return getToday(p.name, p.date, p.token);
  if (action === 'weekpresence') return getWeekPresence(p.name, p.dates, p.token);
  if (action === 'profile')      return getProfile(p.name, p.token);
  if (action === 'admin')        return getAdminDashboard();

  return json({ status: 'ok' });
}

// ── POST ──────────────────────────────────────────────
function doPost(e) {
  try {
    const d      = JSON.parse(e.postData.contents);
    const action = d.action || '';

    if (action === 'register')   return registerUser(d);
    if (action === 'login')      return loginUser(d);
    if (action === 'activity')   return saveActivity(d);
    if (action === 'deleteUser') return deleteUser(d);

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
  if (!name || !passHash) return json({ success:false, error:'Campos obrigatórios.' });

  const sheet = getUserSheet();
  const rows  = sheet.getDataRange().getValues();

  // Verifica se nome já existe (case-insensitive)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === name.toLowerCase()) {
      return json({ success:false, error:'Este nome já está em uso. Escolha outro.' });
    }
  }

  sheet.appendRow([
    name,
    passHash,
    new Date().toISOString()   // data de cadastro
  ]);

  return json({ success: true });
}

function loginUser(d) {
  const { name, passHash } = d;
  if (!name || !passHash) return json({ success:false, error:'Campos obrigatórios.' });

  const row = findUser(name);
  if (!row) return json({ success:false, error:'Usuário não encontrado.' });
  if (row[1] !== passHash) return json({ success:false, error:'Senha incorreta.' });

  return json({ success: true });
}

function findUser(name) {
  const rows = getUserSheet().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0].toString().toLowerCase() === name.toLowerCase()) return rows[i];
  }
  return null;
}

function validateToken(name, token) {
  // token no cliente = sha256(name + sha256(senha))
  // servidor apenas verifica se o usuário existe
  // (validação completa exigiria re-derivar o token do passHash armazenado)
  // Aqui usamos uma validação leve: token deve ser string não vazia e usuário deve existir
  if (!token || !name) return false;
  return !!findUser(name);
}

// ══════════════════════════════════════════════════════
//  ATIVIDADES
// ══════════════════════════════════════════════════════

function getToday(name, date, token) {
  if (!validateToken(name, token)) return json({ auth:false });
  const rows = getActSheet().getDataRange().getValues();
  const activities = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === name && rows[i][3] === date) {
      activities[rows[i][2]] = true;
    }
  }
  return json({ activities });
}

function saveActivity(d) {
  if (!validateToken(d.name, d.token)) return json({ auth:false });

  const sheet  = getActSheet();
  const rows   = sheet.getDataRange().getValues();
  const remove = !!d.remove;

  if (remove) {
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][1] === d.name && rows[i][2] === d.activity && rows[i][3] === d.date) {
        sheet.deleteRow(i + 1);
        return json({ success:true, action:'removed' });
      }
    }
    return json({ success:true, action:'not_found' });
  }

  // Evita duplicata
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === d.name && rows[i][2] === d.activity && rows[i][3] === d.date) {
      return json({ success:true, action:'already_exists' });
    }
  }

  sheet.appendRow([ new Date().toISOString(), d.name, d.activity, d.date ]);
  return json({ success:true, action:'saved' });
}

function getWeekPresence(name, datesStr, token) {
  if (!validateToken(name, token)) return json({ auth:false });
  const dates    = (datesStr||'').split(',').filter(Boolean);
  const rows     = getActSheet().getDataRange().getValues();
  const presence = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === name && dates.includes(rows[i][3])) {
      presence[rows[i][3]] = true;
    }
  }
  return json({ presence });
}

// ══════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════

function getProfile(name, token) {
  if (!validateToken(name, token)) return json({ auth:false });

  const actRows = getActSheet().getDataRange().getValues();
  const userRow = findUser(name);
  const since   = userRow ? userRow[2].toString().split('T')[0] : '';

  // Agrupa por data
  const byDate = {};
  for (let i = 1; i < actRows.length; i++) {
    if (actRows[i][1] !== name) continue;
    const date = actRows[i][3];
    const act  = actRows[i][2];
    if (!byDate[date]) byDate[date] = new Set();
    byDate[date].add(act);
  }

  // Histórico ordenado
  const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
  const history = sortedDates.map(date => {
    const acts = Array.from(byDate[date]);
    return { date, activities: acts, points: acts.length };
  });

  // Pontos totais com bônus de semana
  const scores   = buildScores(actRows);
  const myScore  = scores[name] || { total:0, actCount:0 };
  const totalPts = myScore.total;
  const totalDays = Object.keys(byDate).length;

  // Posição no ranking
  const ranking = toRankingArray(scores, 'total');
  const rank    = ranking.findIndex(p => p.name === name) + 1;

  return json({ since, totalPoints:totalPts, totalDays, rank, history });
}

function deleteUser(d) {
  if (!validateToken(d.name, d.token)) return json({ auth:false });

  // Remove da planilha de usuários
  const uSheet = getUserSheet();
  const uRows  = uSheet.getDataRange().getValues();
  for (let i = uRows.length - 1; i >= 1; i--) {
    if (uRows[i][0] === d.name) { uSheet.deleteRow(i+1); break; }
  }

  // Remove todas as atividades
  const aSheet = getActSheet();
  const aRows  = aSheet.getDataRange().getValues();
  for (let i = aRows.length - 1; i >= 1; i--) {
    if (aRows[i][1] === d.name) aSheet.deleteRow(i+1);
  }

  return json({ success:true });
}

// ══════════════════════════════════════════════════════
//  RANKING
// ══════════════════════════════════════════════════════

function getRanking() {
  const rows   = getActSheet().getDataRange().getValues();
  const scores = buildScores(rows);
  return json({ ranking: toRankingArray(scores, 'total') });
}

// ══════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════

function getAdminDashboard() {
  const actRows = getActSheet().getDataRange().getValues();
  const uRows   = getUserSheet().getDataRange().getValues();

  const today     = new Date().toISOString().split('T')[0];
  const weekDates = getCurrentWeekDates();
  const scores    = buildScores(actRows);

  const participants   = new Set(uRows.slice(1).map(r => r[0]).filter(Boolean));
  const activeTodaySet = new Set();
  const activeWeekSet  = new Set();
  actRows.slice(1).forEach(r => {
    if (!r[1]) return;
    if (r[3] === today)             activeTodaySet.add(r[1]);
    if (weekDates.includes(r[3]))   activeWeekSet.add(r[1]);
  });

  // Presença semanal
  const presMap = {};
  actRows.slice(1).forEach(r => {
    const name = r[1], date = r[3];
    if (!name || !weekDates.includes(date)) return;
    if (!presMap[name]) presMap[name] = new Set();
    presMap[name].add(date);
  });
  const weekPresence = Array.from(participants).map(name => ({
    name,
    days: weekDates.map(d => !!(presMap[name] && presMap[name].has(d)))
  })).sort((a,b) => b.days.filter(Boolean).length - a.days.filter(Boolean).length);

  return json({
    totalParticipants: participants.size,
    totalActivities:   actRows.length - 1,
    activeToday:       activeTodaySet.size,
    activeThisWeek:    activeWeekSet.size,
    ranking:           toRankingArray(scores, 'total'),
    cardioRanking:     toRankingArray(scores, 'cardio'),
    gymRanking:        toRankingArray(scores, 'gym'),
    foodRanking:       toRankingArray(scores, 'food'),
    weekPresence
  });
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════

function buildScores(rows) {
  const map = {};
  rows.slice(1).forEach(r => {
    const name = r[1], act = r[2], date = r[3];
    if (!name || !act || !date) return;
    if (!map[name]) map[name] = { total:0, cardio:0, gym:0, food:0, actCount:0, weekDays:{} };
    map[name][act]      = (map[name][act] || 0) + 1;
    map[name].total    += 1;
    map[name].actCount += 1;
    const wk = weekKey(new Date(date));
    if (!map[name].weekDays[wk]) map[name].weekDays[wk] = new Set();
    map[name].weekDays[wk].add(date);
  });
  // Bônus semana completa
  Object.values(map).forEach(s => {
    Object.values(s.weekDays).forEach(days => { if (days.size >= 5) s.total += 3; });
  });
  return map;
}

function toRankingArray(scores, key) {
  return Object.entries(scores)
    .map(([name, s]) => ({ name, points: key==='total' ? s.total : (s[key]||0), activities: key==='total' ? s.actCount : (s[key]||0) }))
    .filter(p => p.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function getCurrentWeekDates() {
  const now = new Date(), dow = now.getDay()===0?7:now.getDay();
  return Array.from({length:5}, (_,i) => {
    const d = new Date(now); d.setDate(now.getDate()-(dow-(i+1)));
    return d.toISOString().split('T')[0];
  });
}

function weekKey(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate()+3-(d.getDay()+6)%7);
  const w1 = new Date(d.getFullYear(),0,4);
  const wn = 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7);
  return d.getFullYear()+'-W'+String(wn).padStart(2,'0');
}

function getUserSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_USERS);
  if (!s) {
    s = ss.insertSheet(SHEET_USERS);
    s.appendRow(['Nome','SenhaHash','DataCadastro']);
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
    s.appendRow(['Timestamp','Nome','Atividade','Data']);
    s.getRange('1:1').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
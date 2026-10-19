/** Guest RSVP receiver. Deploy as a web app: execute as owner, access Anyone. */
const SPREADSHEET_ID = '1uxy1JH6sGbZElNxZWQIkQ3oNfnX-FaTJ3be3LQrnvJY';
const RESPONSES_SHEET = 'Ответы гостей';
const HEADERS = ['Получено (МСК)', 'ID ответа', 'Имя гостя', 'Спутник / спутница', 'Присутствие', 'Пожелания', 'Дата свадьбы'];

/** Run once in the editor to authorize Sheets access and create the response tab. */
function setup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    responseSheet_();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return HtmlService.createHtmlOutput('Приём ответов готов. Отправьте анкету со страницы приглашения.');
}

function doPost(e) {
  let payload = {};
  let result;
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (typeof raw !== 'string' || raw.length > 12000) throw new Error('invalid');
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid');
    validatePayload_(payload);
    result = saveResponse_(payload);
  } catch (error) {
    const code = error && error.message === 'invalid' ? 'invalid' : 'save_failed';
    result = {ok: false, code: code};
    // Do not put guest names, notes, or private spreadsheet errors in the response.
    console.error('RSVP: ' + code);
  }
  return receipt_(payload, result);
}

function validatePayload_(p) {
  if (!/^[a-f0-9]{32}$/.test(p.requestId || '') || !/^[a-f0-9]{32}$/.test(p.nonce || '')) throw new Error('invalid');
  if (typeof p.origin !== 'string' || !validOrigin_(p.origin)) throw new Error('invalid');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 140) throw new Error('invalid');
  if (typeof p.partner !== 'string' || p.partner.length > 140) throw new Error('invalid');
  if (typeof p.note !== 'string' || p.note.length > 1500) throw new Error('invalid');
  if (p.attendance !== 'yes' && p.attendance !== 'no') throw new Error('invalid');
  if (typeof p.eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.eventDate) || !Number.isFinite(Date.parse(p.eventDate))) throw new Error('invalid');
  if (p.website !== '') throw new Error('invalid');
}

function validOrigin_(origin) {
  return origin === 'null' || /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(origin);
}

function responseSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = book.getSheetByName(RESPONSES_SHEET) || book.insertSheet(RESPONSES_SHEET);
  if (!sheet.getLastRow()) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  } else {
    const header = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (HEADERS.some(function(value, i) { return header[i] !== value; })) throw new Error('headers_changed');
  }
  return sheet;
}

function sheetText_(value) {
  const text = String(value).trim();
  // Treat user content as text even when it starts with a formula or CSV operator.
  return /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
}

function saveResponse_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('busy');
  try {
    const sheet = responseSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const found = sheet.getRange(2, 2, lastRow - 1, 1).createTextFinder(p.requestId).matchEntireCell(true).useRegularExpression(false).findNext();
      if (found) return {ok: true, duplicate: true};
    }
    const row = [Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm:ss'), p.requestId,
      sheetText_(p.name), sheetText_(p.partner), p.attendance === 'yes' ? 'Да' : 'Нет', sheetText_(p.note), p.eventDate];
    sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return {ok: true, duplicate: false};
  } finally {
    lock.releaseLock();
  }
}

function receipt_(p, result) {
  if (!p || !validOrigin_(p.origin || '') || !/^[a-f0-9]{32}$/.test(p.nonce || '') || !/^[a-f0-9]{32}$/.test(p.requestId || '')) {
    return HtmlService.createHtmlOutput('Некорректный запрос.');
  }
  const message = JSON.stringify({type: 'wedding-rsvp-result', requestId: p.requestId, nonce: p.nonce,
    ok: result.ok === true, code: result.code || '', duplicate: result.duplicate === true}).replace(/</g, '\\u003c');
  // A file:// invitation has an opaque origin. Only the receipt IDs are returned.
  const target = JSON.stringify(p.origin === 'null' ? '*' : p.origin).replace(/</g, '\\u003c');
  const html = '<!doctype html><meta charset="utf-8"><script>' +
    '(function(){var target=window.parent;for(var i=0;i<10;i++){target.postMessage(' + message + ',' + target + ');' +
    'if(target===target.parent)break;target=target.parent;}})();' + '</' + 'script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

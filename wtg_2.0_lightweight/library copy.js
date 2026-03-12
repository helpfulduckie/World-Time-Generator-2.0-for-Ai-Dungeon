// ========== WTG 2.0 LIGHTWEIGHT - LIBRARY SCRIPT ==========
// Paste this ONLY into the LIBRARY tab in AI Dungeon scripting
// ===========================================================

// library.js - Core time management functions for WTG Lightweight

// Performance optimization: System card titles Set for O(1) lookups
const SYSTEM_CARD_TITLES = new Set([
  "WTG Data", "Current Date and Time", "World Time Generator Settings",
  "WTG Cooldowns", "WTG Exclusions", "WTG Time Config",
  "Configure Inner Self", "Configure Auto-Cards", "Debug Data"
]);

/**
 * Get WTG Time Config card (pre-imported by user)
 * Simple direct scan - no caching to avoid state serialization issues
 * @returns {Object|null} Config card or null
 */
function getWTGTimeConfigCard() {
  for (let i = 0; i < storyCards.length; i++) {
    const card = storyCards[i];
    if (card && card.title === "WTG Time Config") {
      return card;
    }
  }
  return null;
}

/**
 * Parse WTG Time Config card for starting date/time
 * @returns {Object|null} Parsed config {startingDate, startingTime, initialized} or null
 */
const DEFAULT_WTG_ERA = 'AD';
const WTG_ERA_TOKEN_PATTERN = '(?:AD|A\\.D\\.|CE|C\\.E\\.|BC|B\\.C\\.|BCE|B\\.C\\.E\\.)';
const WTG_TURN_TIME_PATTERN = '(\\d+)y(\\d{2})m(\\d{2})d(\\d{2})h(\\d{2})n(\\d{2})s';
const WTG_DATE_PATTERN = `\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{1,6}(?:\\s*${WTG_ERA_TOKEN_PATTERN})?`;

function normalizeEra(era) {
  if (!era) return DEFAULT_WTG_ERA;
  const normalized = String(era).trim().toUpperCase().replace(/\s+/g, '');
  switch (normalized) {
    case 'BC':
    case 'B.C.':
    case 'BCE':
    case 'B.C.E.':
      return 'BC';
    case 'AD':
    case 'A.D.':
    case 'CE':
    case 'C.E.':
      return 'AD';
    default:
      return DEFAULT_WTG_ERA;
  }
}

function isEraToken(token) {
  return typeof token === 'string' && new RegExp(`^${WTG_ERA_TOKEN_PATTERN}$`, 'i').test(token.trim());
}

function ensureWTGEras() {
  state.startingEra = normalizeEra(state.startingEra || DEFAULT_WTG_ERA);
  state.currentEra = normalizeEra(state.currentEra || state.startingEra || DEFAULT_WTG_ERA);
}

function parseTimeAndEraInput(input, fallbackEra = DEFAULT_WTG_ERA) {
  const tokens = (input || '').trim().split(/\s+/).filter(Boolean);
  let era = normalizeEra(fallbackEra);
  const timeTokens = [];
  for (const token of tokens) {
    if (isEraToken(token)) {
      era = normalizeEra(token);
    } else {
      timeTokens.push(token);
    }
  }
  return { era, time: timeTokens.join(' ').trim() };
}

function parseDateString(dateStr, fallbackEra = DEFAULT_WTG_ERA) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  let normalized = dateStr.trim().replace(/[.-]/g, '/');
  let era = normalizeEra(fallbackEra);
  const eraMatch = normalized.match(new RegExp(`\\s*(${WTG_ERA_TOKEN_PATTERN})$`, 'i'));
  if (eraMatch) {
    era = normalizeEra(eraMatch[1]);
    normalized = normalized.slice(0, normalized.length - eraMatch[0].length).trim();
  }
  const parts = normalized.split('/');
  if (parts.length !== 3 || !parts.every(part => /^\d+$/.test(part))) return null;
  let month = parseInt(parts[0], 10);
  let day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (month > 12 && day <= 12) [month, day] = [day, month];
  if (year < 1) return null;
  return { month, day, year, era };
}

function formatDateForStorage(monthOrParts, day, year) {
  if (typeof monthOrParts === 'object' && monthOrParts !== null) {
    year = monthOrParts.year;
    day = monthOrParts.day;
    monthOrParts = monthOrParts.month;
  }
  return `${String(monthOrParts).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function formatDateForDisplay(dateStr, era = DEFAULT_WTG_ERA) {
  const parsed = parseDateString(dateStr, era);
  if (!parsed) {
    return `${dateStr || ''}${dateStr ? ` ${normalizeEra(era)}` : normalizeEra(era)}`.trim();
  }
  return `${formatDateForStorage(parsed)} ${parsed.era}`;
}

function formatDateTimeForDisplay(dateStr, timeStr, era = DEFAULT_WTG_ERA) {
  const dateDisplay = formatDateForDisplay(dateStr, era);
  return timeStr ? `${dateDisplay} ${timeStr}` : dateDisplay;
}

function getStartingEra() {
  return normalizeEra(state.startingEra || DEFAULT_WTG_ERA);
}

function getCurrentEra() {
  return normalizeEra(state.currentEra || state.startingEra || DEFAULT_WTG_ERA);
}

function getStartingDateDisplay() {
  return formatDateForDisplay(state.startingDate || '01/01/1900', getStartingEra());
}

function getCurrentDateDisplay() {
  return formatDateForDisplay(state.currentDate || '01/01/1900', getCurrentEra());
}

function getCurrentTimestampDisplay() {
  return formatDateTimeForDisplay(state.currentDate || '01/01/1900', state.currentTime || 'Unknown', getCurrentEra());
}

function toAstronomicalYear(year, era = DEFAULT_WTG_ERA) {
  return normalizeEra(era) === 'BC' ? 1 - year : year;
}

function fromAstronomicalYear(astronomicalYear) {
  return astronomicalYear <= 0
    ? { year: 1 - astronomicalYear, era: 'BC' }
    : { year: astronomicalYear, era: 'AD' };
}

function createHistoricalDate(month, day, year, era = DEFAULT_WTG_ERA, hour = 0, min = 0, sec = 0) {
  const date = new Date(Date.UTC(0, month - 1, day, hour, min, sec));
  date.setUTCFullYear(toAstronomicalYear(year, era), month - 1, day);
  date.setUTCHours(hour, min, sec, 0);
  return date;
}

function getDatePartsFromDate(date) {
  const yearParts = fromAstronomicalYear(date.getUTCFullYear());
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    year: yearParts.year,
    era: yearParts.era
  };
}

function normalizeSettimeArgs(dateStr, timeStr, fallbackEra = DEFAULT_WTG_ERA) {
  const timeInfo = parseTimeAndEraInput(timeStr, fallbackEra);
  const parsedDate = parseDateString(dateStr, timeInfo.era);
  if (!parsedDate || !isValidDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era)) {
    return null;
  }
  return {
    month: parsedDate.month,
    day: parsedDate.day,
    year: parsedDate.year,
    startingDate: formatDateForStorage(parsedDate),
    startingEra: parsedDate.era,
    startingTime: timeInfo.time ? normalizeTime(timeInfo.time) : null
  };
}

/**
 * Parse the WTG Time Config card for starting date/time
 * Card format:
 *   Starting Date: MM/DD/year (1-6 digits)
 *   Starting Era: AD/BC
 *   Starting Time: HH:MM AM/PM
 *   Initialized: true/false
 * @returns {Object|null} Object with startingDate, startingEra, startingTime, initialized or null
 */
function parseWTGTimeConfig() {
  const configCard = getWTGTimeConfigCard();
  if (!configCard) return null;

  // AI Dungeon JSON exports use 'value', runtime uses 'entry'
  const content = configCard.entry || configCard.value;
  if (!content) return null;

  const dateMatch = content.match(/Starting Date:\s*([^\n]+)/i);
  const eraMatch = content.match(/Starting Era:\s*([^\n]+)/i);
  const timeMatch = content.match(/Starting Time:\s*([^\n]+)/i);
  const initMatch = content.match(/Initialized:\s*(true|false)/i);

  if (!dateMatch || !timeMatch) return null;

  const parsedDate = parseDateString(dateMatch[1].trim(), eraMatch ? eraMatch[1].trim() : DEFAULT_WTG_ERA);
  const timeInfo = parseTimeAndEraInput(timeMatch[1].trim(), parsedDate ? parsedDate.era : DEFAULT_WTG_ERA);
  const startingTime = timeInfo.time ? normalizeTime(timeInfo.time) : null;
  if (!parsedDate || !startingTime || !isValidDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era)) return null;

  return {
    startingDate: formatDateForStorage(parsedDate),
    startingEra: parsedDate.era,
    startingTime,
    initialized: initMatch ? initMatch[1].toLowerCase() === 'true' : false
  };
}

// Map for descriptive time expressions
const descriptiveMap = new Map([
  ['morning', '8:00 AM'],
  ['afternoon', '2:00 PM'],
  ['noon', '12:00 PM'],
  ['evening', '6:00 PM'],
  ['night', '10:00 PM'],
  ['dawn', '6:00 AM'],
  ['dusk', '8:00 PM'],
  ['midday', '12:00 PM'],
  ['midnight', '12:00 AM']
]);

/**
 * Check if we're in lightweight mode
 * @returns {boolean} True if in lightweight mode
 */
function isLightweightMode() {
  return state.wtgMode === 'lightweight';
}

/**
 * Normalize time expressions to standard format
 * @param {string} str - Time string to normalize
 * @returns {string} Normalized time string
 */
function normalizeTime(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  if (descriptiveMap.has(lower)) {
    return descriptiveMap.get(lower);
  }
  return capitalize(str);
}

/**
 * Validate if a date is valid
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @param {number} year - Year
 * @returns {boolean} True if valid date
 */
function isValidDate(month, day, year, era = DEFAULT_WTG_ERA) {
  if (![month, day, year].every(Number.isInteger) || year < 1) return false;
  const date = createHistoricalDate(month, day, year, era);
  const parts = getDatePartsFromDate(date);
  return parts.month === month && parts.day === day && parts.year === year && parts.era === normalizeEra(era);
}

/**
 * Advance a date by a specified number of days
 * @param {string} dateStr - Date string in mm/dd/yyyy format
 * @param {number} days - Number of days to advance
 * @returns {string} New date string in mm/dd/yyyy format
 */
function advanceDate(dateStr, days = 0, era = getStartingEra()) {
  const parsedDate = parseDateString(dateStr, era);
  if (!parsedDate) {
    return { dateStr: dateStr || '01/01/1900', era: normalizeEra(era) };
  }
  const date = createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era);
  date.setUTCDate(date.getUTCDate() + days);
  const parts = getDatePartsFromDate(date);
  return { dateStr: formatDateForStorage(parts), era: parts.era };
}

/**
 * Advance time by specified hours, minutes, seconds
 * @param {string} timeStr - Time string in hh:mm AM/PM format
 * @param {number} hours - Hours to add
 * @param {number} minutes - Minutes to add
 * @param {number} seconds - Seconds to add
 * @returns {Object} Object with new time and extra days
 */
function advanceTime(timeStr, hours = 0, minutes = 0, seconds = 0) {
  let parts = timeStr.split(/[: ]/);
  let hourStr = parts[0];
  let minStr = '00';
  let period = '';
  if (parts.length === 3) {
    minStr = parts[1];
    period = parts[2];
  } else if (parts.length === 2) {
    if (isNaN(parseInt(parts[1], 10))) {
      period = parts[1];
    } else {
      minStr = parts[1];
    }
  }
  if (/[a-zA-Z]/i.test(hourStr)) {
    let match = hourStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      hourStr = match[1];
      period = match[2];
    }
  }
  if (/[a-zA-Z]/i.test(minStr)) {
    let match = minStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      minStr = match[1];
      period = match[2];
    }
  }
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);
  if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
  let currentSeconds = hour * 3600 + min * 60 + 0;
  let addedSeconds = hours * 3600 + minutes * 60 + seconds;
  let totalSeconds = currentSeconds + addedSeconds;
  let extraDays = Math.floor(totalSeconds / 86400);
  let wrappedSeconds = totalSeconds % 86400;
  hour = Math.floor(wrappedSeconds / 3600);
  let remaining = wrappedSeconds % 3600;
  min = Math.floor(remaining / 60);
  let sec = remaining % 60;
  period = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  let newTime = `${hour}:${String(min).padStart(2, '0')}${sec > 0 ? `:${String(sec).padStart(2, '0')}` : ''} ${period}`;
  return { time: newTime, days: extraDays };
}

/**
 * Capitalize a string or convert time to 12-hour format
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string or formatted time
 */
function capitalize(str) {
  str = str || 'Unknown';
  if (str === 'Unknown') return str;
  if (/\d/.test(str)) {
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      return convertTo12Hour(str);
    }
    str = str.replace(/(am|pm|a\.m\.|p\.m\.)$/i, match => match.toUpperCase());
    if (!/:\d{2}/.test(str)) {
      str = str.replace(/(\d+)\s*([AP]M)?$/i, (match, p1, p2) => {
        let period = p2 ? ` ${p2.toUpperCase()}` : '';
        return `${p1}:00${period}`;
      });
    }
    return str;
  } else {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

/**
 * Convert 24-hour time to 12-hour format
 * @param {string} timeStr - Time string in 24-hour format (hh:mm)
 * @returns {string} Time string in 12-hour format (h:mm AM/PM)
 */
function convertTo12Hour(timeStr) {
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  let min = minStr ? `:${minStr}` : ':00';
  const period = (hour < 12) ? 'AM' : 'PM';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  return `${hour}${min} ${period}`;
}

/**
 * Extract date from history or current output
 * @param {string} currentOutput - Current output text
 * @param {boolean} useHistory - Whether to search history if not found in current output
 * @returns {string|null} Date string or null
 */
function getCurrentDateFromHistory(currentOutput = '', useHistory = false) {
  let currentDate = null;
  const dateRegex = new RegExp(WTG_DATE_PATTERN, 'gi');
  let matches = currentOutput.match(dateRegex);
  if (matches && matches.length > 0) {
    currentDate = formatDateForDisplay(matches[matches.length - 1].trim().replace(/[.-]/g, '/'), getCurrentEra());
  }
  if (!currentDate && useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      matches = history[i].text.match(dateRegex);
      if (matches && matches.length > 0) {
        currentDate = formatDateForDisplay(matches[matches.length - 1].trim().replace(/[.-]/g, '/'), getCurrentEra());
        break;
      }
    }
  }
  return currentDate;
}

/**
 * Extract time from history or current output
 * @param {string} currentOutput - Current output text
 * @param {boolean} useHistory - Whether to search history if not found in current output
 * @returns {string|null} Time string or null
 */
function getCurrentTimeFromHistory(currentOutput = '', useHistory = false) {
  let currentTime = null;
  const timeRegex = /(\d{1,2}(?:\:\d{2})?\s*(?:AM|PM|a\.m\.|p\.m\.))|(\d{1,2}:\d{2})|(morning|afternoon|noon|evening|night|dawn|dusk|midday|midnight)/gi;
  let matches = currentOutput.match(timeRegex);
  if (matches && matches.length > 0) {
    let lastMatch = matches[matches.length - 1].trim();
    let lowerMatch = lastMatch.toLowerCase();
    let isDescriptive = descriptiveMap.has(lowerMatch);
    let currentIsPrecise = state.currentTime && /\d{1,2}:\d{2} [AP]M/.test(state.currentTime);
    if (!isDescriptive || !currentIsPrecise) {
      currentTime = lastMatch;
    }
  }
  if (!currentTime && useHistory) {
    for (let i = history.length - 1; i >= 0; i--) {
      matches = history[i].text.match(timeRegex);
      if (matches && matches.length > 0) {
        let lastMatch = matches[matches.length - 1].trim();
        let lowerMatch = lastMatch.toLowerCase();
        let isDescriptive = descriptiveMap.has(lowerMatch);
        let currentIsPrecise = state.currentTime && /\d{1,2}:\d{2} [AP]M/.test(state.currentTime);
        if (!isDescriptive || !currentIsPrecise) {
          currentTime = lastMatch;
          break;
        }
      }
    }
  }
  return currentTime ? normalizeTime(currentTime) : null;
}

/**
 * Parse turn time string into object
 * @param {string} str - Turn time string in format 00y00m00d00h00n00s
 * @returns {Object|null} Turn time object or null
 */
function parseTurnTime(str) {
  const match = str.match(new RegExp(WTG_TURN_TIME_PATTERN));
  if (!match) return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  return {
    years: parseInt(match[1]),
    months: parseInt(match[2]),
    days: parseInt(match[3]),
    hours: parseInt(match[4]),
    minutes: parseInt(match[5]),
    seconds: parseInt(match[6])
  };
}

/**
 * Format turn time object into string
 * @param {Object} tt - Turn time object
 * @returns {string} Formatted turn time string
 */
function formatTurnTime(tt) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  return `${String(tt.years).padStart(2, '0')}y${String(tt.months).padStart(2, '0')}m${String(tt.days).padStart(2, '0')}d${String(tt.hours).padStart(2, '0')}h${String(tt.minutes).padStart(2, '0')}n${String(tt.seconds).padStart(2, '0')}s`;
}

/**
 * Add time values to turn time object
 * @param {Object} tt - Turn time object
 * @param {Object} add - Time values to add
 * @returns {Object} New turn time object
 */
function addToTurnTime(tt, add) {
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let newTT = {...tt};
  newTT.seconds += add.seconds || 0;
  newTT.minutes += Math.floor(newTT.seconds / 60);
  newTT.seconds %= 60;
  newTT.minutes += add.minutes || 0;
  newTT.hours += Math.floor(newTT.minutes / 60);
  newTT.minutes %= 60;
  newTT.hours += add.hours || 0;
  newTT.days += Math.floor(newTT.hours / 24);
  newTT.hours %= 24;
  newTT.days += add.days || 0;
  newTT.months += add.months || 0;
  newTT.years += Math.floor(newTT.months / 12);
  newTT.months %= 12;
  newTT.years += add.years || 0;
  return newTT;
}

/**
 * Compute current date and time from starting values and turn time
 * @param {string} startingDate - Starting date string
 * @param {string} startingTime - Starting time string
 * @param {Object} tt - Turn time object
 * @returns {Object} Object with currentDate and currentTime
 */
function computeCurrent(startingDate, startingTime, tt, startingEra = getStartingEra()) {
  startingDate = startingDate || '01/01/1900';
  startingTime = startingTime || 'Unknown';
  tt = tt || {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  const parsedStartDate = parseDateString(startingDate, startingEra);
  if (!parsedStartDate) {
    return { currentDate: startingDate, currentEra: normalizeEra(startingEra), currentTime: startingTime };
  }
  if (startingTime === 'Unknown') {
    let approxDays = (tt.years || 0) * 365 + (tt.months || 0) * 30 + (tt.days || 0);
    const advancedDate = advanceDate(startingDate, approxDays, parsedStartDate.era);
    return { currentDate: advancedDate.dateStr, currentEra: advancedDate.era, currentTime: 'Unknown' };
  }
  let date = createHistoricalDate(parsedStartDate.month, parsedStartDate.day, parsedStartDate.year, parsedStartDate.era);
  date.setUTCFullYear(date.getUTCFullYear() + (tt.years || 0));
  date.setUTCMonth(date.getUTCMonth() + (tt.months || 0));
  date.setUTCDate(date.getUTCDate() + (tt.days || 0));
  let {time, days} = advanceTime(startingTime, tt.hours || 0, tt.minutes || 0, tt.seconds || 0);
  date.setUTCDate(date.getUTCDate() + days);
  const parts = getDatePartsFromDate(date);
  return { currentDate: formatDateForStorage(parts), currentEra: parts.era, currentTime: time };
}

/**
 * Parse time string into hour, minute, second components
 * @param {string} str - Time string
 * @returns {Object} Object with hour, min, sec
 */
function parseTime(str) {
  if (!str || str === 'Unknown') return {hour: 0, min: 0, sec: 0};
  str = str.replace(/\s+\(generated\)\s*$/i, '').trim();
  let parts = str.split(/[: ]/);
  let hourStr = parts[0];
  let minStr = '00';
  let period = '';
  if (parts.length === 3) {
    minStr = parts[1];
    period = parts[2];
  } else if (parts.length === 2) {
    if (isNaN(parseInt(parts[1], 10))) {
      period = parts[1];
    } else {
      minStr = parts[1];
    }
  }
  if (/[a-zA-Z]/i.test(hourStr)) {
    let match = hourStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      hourStr = match[1];
      period = match[2];
    }
  }
  if (/[a-zA-Z]/i.test(minStr)) {
    let match = minStr.match(/^(\d+)([a-zA-Z]+)$/i);
    if (match) {
      minStr = match[1];
      period = match[2];
    }
  }
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);
  if (period.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (period.toLowerCase() === 'am' && hour === 12) hour = 0;
  return {hour, min, sec: 0};
}

/**
 * Calculate date difference between two date/time combinations
 * @param {string} startStr - Start date string
 * @param {string} startTimeStr - Start time string
 * @param {string} endStr - End date string
 * @param {string} endTimeStr - End time string
 * @returns {Object} Turn time object representing difference
 */

/**
 * Compare two turn time objects to determine which is earlier
 * @param {Object} tt1 - First turn time object
 * @param {Object} tt2 - Second turn time object
 * @returns {number} -1 if tt1 is earlier, 1 if tt2 is earlier, 0 if equal
 */
function compareTurnTime(tt1, tt2) {
  // Guard against null/undefined inputs
  if (!tt1 || !tt2) {
    return 0;
  }

  if (tt1.years !== tt2.years) return tt1.years < tt2.years ? -1 : 1;
  if (tt1.months !== tt2.months) return tt1.months < tt2.months ? -1 : 1;
  if (tt1.days !== tt2.days) return tt1.days < tt2.days ? -1 : 1;
  if (tt1.hours !== tt2.hours) return tt1.hours < tt2.hours ? -1 : 1;
  if (tt1.minutes !== tt2.minutes) return tt1.minutes < tt2.minutes ? -1 : 1;
  if (tt1.seconds !== tt2.seconds) return tt1.seconds < tt2.seconds ? -1 : 1;
  return 0;
}

/**
 * Get turn data from WTG Data storycard
 * @returns {Array} Array of turn data objects
 */
function getTurnData() {
  const dataCard = getWTGDataCard();
  if (!dataCard || !dataCard.entry) return [];

  // Direct parsing - no caching to avoid state serialization issues
  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  return matches.map(match => ({
    actionType: match[1],
    actionText: match[2],
    responseText: match[3],
    timestamp: match[4]
  }));
}

/**
 * Add turn data to WTG Data storycard (simplified for lightweight version)
 * @param {string} actionType - Type of action (do, say, story, continue)
 * @param {string} actionText - Full text of action
 * @param {string} responseText - AI response text
 * @param {string} timestamp - Timestamp in turntime format
 */
function addTurnData(actionType, actionText, responseText, timestamp) {
  const dataCard = getWTGDataCard();

  const turnDataEntry = `[Turn Data]
Action Type: ${actionType}
Action Text: ${actionText}
Response Text: ${responseText || ''}
Timestamp: ${timestamp}
[/Turn Data]`;

  if (dataCard.entry) {
    dataCard.entry += '\n\n' + turnDataEntry;
  } else {
    dataCard.entry = turnDataEntry;
  }
}

/**
 * Clean up WTG Data card by removing entries with timestamps higher than the current time
 * @param {Object} currentTT - Current turn time object
 */
function cleanupWTGDataCardByTimestamp(currentTT) {
  const dataCard = getWTGDataCard();
  if (!dataCard || !dataCard.entry) return;

  // Preserve [SETTIME_INITIALIZED] marker when rebuilding entry
  const hasInitMarker = dataCard.entry.includes('[SETTIME_INITIALIZED]');

  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  // Keep only entries with timestamps less than or equal to current time
  let newEntry = "";
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const entryTT = parseTurnTime(match[4]);

    // Skip entries with invalid timestamps
    if (!entryTT) continue;

    // If entry timestamp is less than or equal to current timestamp, keep it
    if (compareTurnTime(entryTT, currentTT) <= 0) {
      const turnDataEntry = `[Turn Data]
Action Type: ${match[1]}
Action Text: ${match[2]}
Response Text: ${match[3]}
Timestamp: ${match[4]}
[/Turn Data]`;

      if (newEntry) {
        newEntry += '\n\n' + turnDataEntry;
      } else {
        newEntry = turnDataEntry;
      }
    }
  }

  dataCard.entry = (hasInitMarker ? '[SETTIME_INITIALIZED]\n' : '') + newEntry;
}

/**
 * Clean up storycards with future timestamps
 * @param {string} currentDate - Current date string in mm/dd/yyyy format
 * @param {string} currentTime - Current time string in hh:mm AM/PM format
 */
function cleanupStoryCardsByTimestamp(currentDate, currentTime) {
  // Defensive null checks
  if (!currentDate || !currentTime || currentDate === '01/01/1900' || currentTime === 'Unknown') {
    return;
  }
  const currentDateTime = parseDateTime(currentDate, currentTime);
  if (!currentDateTime) return;

  // Iterate through storycards and remove future timestamps
  for (let i = storyCards.length - 1; i >= 0; i--) {
    const card = storyCards[i];

    // Skip the WTG Data card and cards without entries
    if (card.title === "WTG Data" || card.title === "Current Date and Time" || !card.entry) {
      continue;
    }

    // Check if card has a timestamp
    const discoveredMatch = card.entry.match(new RegExp(`(?:Discovered on|Met on|Visited) (${WTG_DATE_PATTERN})\\s+(.+)`, 'i'));
    if (discoveredMatch) {
      const cardDate = discoveredMatch[1];
      const cardTime = discoveredMatch[2];
      const cardDateTime = parseDateTime(cardDate, cardTime);

      // If card timestamp is later than current time, remove the timestamp
      if (cardDateTime > currentDateTime) {
        card.entry = card.entry.replace(/\n\n(?:Discovered on|Met on|Visited) .+/, '');
      }
    }
  }
}
function getDateDiff(startStr, startTimeStr, endStr, endTimeStr, startEra = getStartingEra(), endEra = getCurrentEra()) {
  const startDate = parseDateString(startStr, startEra);
  const endDate = parseDateString(endStr, endEra);
  if (!startDate || !endDate) return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  const startParsed = parseTime(startTimeStr);
  const endParsed = parseTime(endTimeStr);
  let start = createHistoricalDate(startDate.month, startDate.day, startDate.year, startDate.era, startParsed.hour, startParsed.min, startParsed.sec);
  let end = createHistoricalDate(endDate.month, endDate.day, endDate.year, endDate.era, endParsed.hour, endParsed.min, endParsed.sec);
  if (end < start) return {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  let hours = end.getUTCHours() - start.getUTCHours();
  let minutes = end.getUTCMinutes() - start.getUTCMinutes();
  let seconds = end.getUTCSeconds() - start.getUTCSeconds();
  if (seconds < 0) {
    minutes--;
    seconds += 60;
  }
  if (minutes < 0) {
    hours--;
    minutes += 60;
  }
  if (hours < 0) {
    days--;
    hours += 24;
  }
  if (days < 0) {
    months--;
    const previousMonth = new Date(end.getTime());
    previousMonth.setUTCDate(0);
    days += previousMonth.getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return {years, months, days, hours, minutes, seconds};
}

/**
 * Get the most recent timestamp from the WTG Data storycard
 * @returns {Object|null} Turn time object or null if not found
 */
function getLastTimestampFromWTGData() {
  const dataCard = getWTGDataCard();
  if (!dataCard || !dataCard.entry) return null;

  // Lightweight format
  const turnDataRegex = /\[Turn Data\]\nAction Type: (.*?)\nAction Text: (.*?)\nResponse Text: (.*?)\nTimestamp: (.*?)\n\[\/Turn Data\]/gs;
  const matches = [...dataCard.entry.matchAll(turnDataRegex)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const timestamp = lastMatch[4];
    if (timestamp && timestamp.match(new RegExp(`^${WTG_TURN_TIME_PATTERN}$`))) {
      return parseTurnTime(timestamp);
    }
  }

  return null;
}

/**
 * Get last turn time and character count from history
 * @param {Array} history - History array
 * @returns {Object} Object with lastTT, charsAfter, and found (whether a marker was found)
 */
function getLastTurnTimeAndChars(history) {
  let lastTT = {years:0, months:0, days:0, hours:0, minutes:0, seconds:0};
  let charsAfter = 0;
  let found = false;
  for (let i = history.length - 1; i >= 0; i--) {
    const actionText = history[i].text;
    const match = actionText.match(new RegExp(`\\[\\[(${WTG_TURN_TIME_PATTERN})\\]\\]`));
    if (match) {
      lastTT = parseTurnTime(match[1]);
      found = true;
      break;
    } else {
      charsAfter += actionText.length;
    }
  }

  // If no marker found in history, try to get timestamp from WTG Data storycard
  if (!found) {
    const wtgDataTimestamp = getLastTimestampFromWTGData();
    if (wtgDataTimestamp) {
      lastTT = wtgDataTimestamp;
      found = true;
      // Only count last action's chars when recovered from WTG Data
      charsAfter = history.length > 0 ? history[history.length - 1].text.length : 0;
    } else {
      // Only use cumulative when no timestamp source exists
      charsAfter = history.reduce((sum, action) => sum + action.text.length, 0);
    }
  }
  return {lastTT, charsAfter, found};
}

/**
 * Parse a date/time string into a Date object
 * @param {string} dateStr - Date string in mm/dd/yyyy format
 * @param {string} timeStr - Time string in hh:mm AM/PM format
 * @returns {Date} Date object
 */
function parseDateTime(dateStr, timeStr) {
  // Defensive null checks to prevent crashes
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('/')) {
    return null;
  }
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }
  const parsedDate = parseDateString(dateStr, getCurrentEra());
  if (!parsedDate) return null;
  const time = parseTime(timeStr);
  return createHistoricalDate(parsedDate.month, parsedDate.day, parsedDate.year, parsedDate.era, time.hour, time.min, time.sec);
}

/**
 * Get or create WTG Data storycard
 * @returns {Object} WTG Data storycard
 */
function getWTGDataCard() {
  // Direct lookup - no caching to avoid state serialization issues
  let dataCard = storyCards.find(card => card.title === "WTG Data");
  if (!dataCard) {
    addStoryCard("WTG Data");
    dataCard = storyCards.find(card => card.title === "WTG Data");
    if (dataCard) {
      dataCard.type = "system";
      dataCard.keys = "wtg_internal_data,do_not_include_in_context";
      dataCard.entry = "";
      dataCard.description = "System data for World Time Generator - Internal use only, do not include in context";
    }
  }
  return dataCard;
}

/**
 * Get or create Current Date and Time storycard
 * @returns {Object} Current Date and Time storycard
 */
function getCurrentDateTimeCard() {
  // Direct lookup - no caching to avoid state serialization issues
  let dateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
  if (!dateTimeCard) {
    addStoryCard("Current Date and Time");
    dateTimeCard = storyCards.find(card => card.title === "Current Date and Time");
    if (dateTimeCard) {
      dateTimeCard.type = "event";
      dateTimeCard.keys = "date,time,current date,current time,clock,hour";
      dateTimeCard.description = "Commands:\n[settime mm/dd/year time AD] - Set starting date, era, and time (use BC for BC dates, or omit the era to default to AD; years can be 1-6 digits)\n[advance N [hours|days|months|years]] - Advance time/date\n[sleep] - Sleep to next morning\n[reset] - Reset to most recent mention in history";
    }
  }
  return dateTimeCard;
}

/**
 * Update the Current Date and Time storycard
 */
function updateDateTimeCard() {
  const dateTimeCard = getCurrentDateTimeCard();
  const ttForm = formatTurnTime(state.turnTime);
  let entry = `Starting date: ${state.startingDate || '01/01/1900'}\nStarting era: ${getStartingEra()}\nStarting time: ${state.startingTime || 'Unknown'}\nCurrent date: ${state.currentDate || '01/01/1900'}\nCurrent era: ${getCurrentEra()}\nCurrent time: ${state.currentTime || 'Unknown'}\nTurn time: ${ttForm}`;
  dateTimeCard.entry = entry;
}

/**
 * Add timestamp to a storycard if it doesn't have one
 * @param {Object} card - Storycard to update
 * @param {string} timestamp - Timestamp to add
 */
function addTimestampToCard(card, timestamp) {
  // Check if card is excluded from timestamp injection
  if (card && card.title && isCardExcluded(card.title)) {
    return;
  }

  // Don't add timestamps if time hasn't been set (Unknown)
  if (timestamp && timestamp.includes("Unknown")) {
    return;
  }

  // Add timestamp if it doesn't have one
  if (card && card.entry && !card.entry.includes("Discovered on") && !card.entry.includes("Met on") && !card.entry.includes("Visited")) {
    // Determine the appropriate discovery verb based on card type
    let discoveryVerb = "Discovered on";

    if (card.type === "character") {
      discoveryVerb = "Met on";
    } else if (card.type === "location" || card.type === "place" || card.type === "area") {
      discoveryVerb = "Visited";
    }

    // Check for custom placement marker /]
    if (card.entry.includes('/]')) {
      card.entry = card.entry.replace('/]', `${discoveryVerb} ${timestamp}`);
      return;
    }

    // Default: append at end with blank line separator
    card.entry += `\n\n${discoveryVerb} ${timestamp}`;
  }
}

/**
 * Check if a storycard already has a "Discovered on" timestamp
 * @param {Object} card - Storycard to check
 * @returns {boolean} True if card has a "Discovered on" timestamp
 */
function hasTimestamp(card) {
  return card && card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"));
}

/**
 * Check if any of a storycard's keywords are mentioned in the given text
 * @param {Object} card - Storycard to check
 * @param {string} text - Text to search for keywords
 * @returns {boolean} True if any keyword from the card is found in the text
 */
function isCardKeywordMentioned(card, text) {
  if (!card || !card.keys || !text) return false;

  // Build regex array for this card's keywords (no caching to avoid state serialization issues)
  const keys = card.keys.split(',');
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].trim().toLowerCase();
    if (key) {
      const regex = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (regex.test(text)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the timestamp from a storycard
 * @param {Object} card - Storycard to check
 * @returns {string|null} Timestamp string or null if not found
 */
function getCardTimestamp(card) {
  if (!card || !card.entry) return null;
  const match = card.entry.match(/(?:Discovered on|Met on|Visited) (\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

/**
 * Update timestamps in all existing storycards when time is reset
 * @param {string} newDate - New date string in mm/dd/yyyy format
 * @param {string} newTime - New time string in hh:mm AM/PM format
 */
function updateAllStoryCardTimestamps(newDate, newTime) {
  const timestamp = `${newDate} ${newTime}`;

  // Update storycards that have placeholder "Unknown" timestamps or default "01/01/1900" timestamps
  for (let i = 0; i < storyCards.length; i++) {
    const card = storyCards[i];

    // Skip system cards
    if (card.title === "WTG Data" || card.title === "Current Date and Time" || card.title === "World Time Generator Settings") {
      continue;
    }

    // Update timestamps that contain "Unknown" or "01/01/1900" (placeholder/default timestamps)
    if (card.entry && (card.entry.includes("Discovered on") || card.entry.includes("Met on") || card.entry.includes("Visited"))) {
      if (card.entry.includes("Unknown")) {
        // Replace the placeholder timestamp with the new one
        card.entry = card.entry.replace(/(?:Discovered on|Met on|Visited) \d{1,2}\/\d{1,2}\/\d{4}\s+Unknown/, `Discovered on ${timestamp}`);
      } else if (card.entry.includes("01/01/1900")) {
        // Replace default date timestamps with the new one
        card.entry = card.entry.replace(/(?:Discovered on|Met on|Visited) 01\/01\/1900\s+[\d:]+ [AP]M/, `Discovered on ${timestamp}`);
      }
    }
  }
}

/**
 * Extract keywords from text
 * @param {string} text - Text to process
 * @returns {Array} Array of keywords
 */
function extractKeywords(text) {
  // Simple keyword extraction - in a real implementation, this could be more sophisticated
  const words = text.split(/\s+/);
  const keywords = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, '').toLowerCase();
    if (word.length > 3 && !/^\d+$/.test(word)) {
      keywords.push(word);
    }
  }
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Calculate keyword similarity between two arrays
 * @param {Array} keywords1 - First array of keywords
 * @param {Array} keywords2 - Second array of keywords
 * @returns {number} Similarity score (0-1)
 */
function calculateKeywordSimilarity(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  const intersection = [...set1].filter(x => set2.has(x));
  const union = [...new Set([...set1, ...set2])];
  
  return intersection.length / union.length;
}

/**
 * Get or create WTG Settings storycard
 * @returns {Object} WTG Settings storycard
 */
function getWTGSettingsCard() {
  // Direct lookup - no caching to avoid state serialization issues
  let settingsCard = storyCards.find(card => card.title === "World Time Generator Settings");
  if (!settingsCard) {
    addStoryCard("World Time Generator Settings");
    settingsCard = storyCards.find(card => card.title === "World Time Generator Settings");
    if (settingsCard) {
      settingsCard.type = "system";
      settingsCard.keys = ""; // No keys - not included in AI context
      settingsCard.description = "World Time Generator Settings - Edit the values below to configure the system.";
      settingsCard.entry = `Time Duration Multiplier: 1.0
Enable Dynamic Time: false
Debug Mode: false
Disable WTG Entirely: false`;
    }
  } else {
    // Ensure keys are always empty
    settingsCard.keys = "";
  }
  return settingsCard;
}

/**
 * Get or create WTG Commands Guide storycard (visible to players)
 * @returns {Object} WTG Commands Guide storycard
 */
function getWTGCommandsCard() {
  let card = storyCards.find(c => c.title === "WTG Commands Guide");
  if (!card) {
    addStoryCard("WTG Commands Guide");
    card = storyCards.find(c => c.title === "WTG Commands Guide");
    if (card) {
      card.type = "system";
      card.description = "WTG command reference";
      card.keys = "";
      card.entry = `Available WTG Commands:

[settime mm/dd/year time AD] - Set starting date, time, and optional era
  Use BC instead of AD for BC dates, or leave the era off entirely to default to AD.
  Years can be 1-6 digits. BC years count down as time advances; AD years count up. AD is standard; CE and BCE are also accepted.
  Examples: [settime 01/01/2025 12:00 pm]
            [settime 03/15/44 9:00 am BC]
            [settime 01/01/7 12:00 am AD]
            [settime 06/15/2023 8:00 am]

[advance X units] - Advance time forward
  Example: [advance 1 hour], [advance 30 minutes], [advance 2 days]

[sleep X units] - Sleep/rest for duration
  Example: [sleep 8 hours]

[reset] - Reset time to starting values

Note: This is the LIGHTWEIGHT version - simple time tracking without AI prompt injection.`;
    }
  }
  return card;
}

/**
 * Get or create the WTG Cooldowns storycard
 * @returns {Object} WTG Cooldowns storycard
 */
function getCooldownCard() {
  // Direct lookup - no caching to avoid state serialization issues
  let cooldownCard = storyCards.find(card => card.title === "WTG Cooldowns");
  if (!cooldownCard) {
    addStoryCard("WTG Cooldowns");
    cooldownCard = storyCards.find(card => card.title === "WTG Cooldowns");
    if (cooldownCard) {
      cooldownCard.type = "system";
      cooldownCard.keys = ""; // Empty keys so it's not included in context
      cooldownCard.description = "Internal cooldown tracking for AI commands; no keys; not included in context";
    }
  }
  return cooldownCard;
}

/**
 * Get or create WTG Exclusions storycard
 * @returns {Object} WTG Exclusions storycard
 */
function getWTGExclusionsCard() {
  // Direct lookup - no caching to avoid state serialization issues
  let exclusionsCard = storyCards.find(card => card.title === "WTG Exclusions");
  if (!exclusionsCard) {
    addStoryCard("WTG Exclusions");
    exclusionsCard = storyCards.find(card => card.title === "WTG Exclusions");
    if (exclusionsCard) {
      exclusionsCard.type = "system";
      exclusionsCard.keys = "";
      exclusionsCard.entry = "";
      exclusionsCard.description = "Cards excluded from WTG timestamp injection";
    }
  }
  return exclusionsCard;
}

/**
 * Get or build cached exclusion Set for O(1) lookups
 * Cache invalidates when exclusion card content changes
 * @returns {Set} Set of lowercase excluded card titles
 */
function getExclusionSet() {
  // Direct parsing - no caching to avoid state serialization issues with Set objects
  const exclusionsCard = getWTGExclusionsCard();
  const exclusionSet = new Set();

  if (exclusionsCard?.entry) {
    const exclusionRegex = /\[Exclusion\]\nCard Title: (.*?)\n\[\/Exclusion\]/gs;
    const matches = [...exclusionsCard.entry.matchAll(exclusionRegex)];
    for (const match of matches) {
      exclusionSet.add(match[1].toLowerCase());
    }
  }

  return exclusionSet;
}

/**
 * Check if a storycard is excluded from timestamp injection
 * @param {string} cardTitle - Title of the card to check
 * @returns {boolean} True if card is excluded
 */
function isCardExcluded(cardTitle) {
  if (!cardTitle) return false;
  return getExclusionSet().has(cardTitle.toLowerCase());
}

/**
 * Add a storycard to the exclusions list
 * @param {string} cardTitle - Title of the card to exclude
 */
function addCardToExclusions(cardTitle) {
  if (!cardTitle || isCardExcluded(cardTitle)) return;

  const exclusionsCard = getWTGExclusionsCard();
  const exclusionEntry = `[Exclusion]\nCard Title: ${cardTitle}\n[/Exclusion]`;

  if (exclusionsCard.entry) {
    exclusionsCard.entry += '\n\n' + exclusionEntry;
  } else {
    exclusionsCard.entry = exclusionEntry;
  }
}

/**
 * Process exclusion marker [e] in a storycard
 * @param {Object} card - Storycard to process
 * @returns {boolean} True if exclusion marker was found and processed
 */
function processExclusionMarker(card) {
  if (!card || !card.entry) return false;

  if (!card.entry.match(/\[e\]/i)) return false;

  // Remove [e] and /] markers
  card.entry = card.entry.replace(/\[e\]/gi, '').trim();
  card.entry = card.entry.replace(/\/\]/g, '').trim();

  addCardToExclusions(card.title);
  return true;
}

/**
 * Check if sleep command cooldown is active
 * @returns {boolean} True if sleep cooldown is active
 */
function isSleepCooldownActive() {
  if (!state.sleepAvailableAtTT || !state.turnTime) return false;
  const currentTT = state.turnTime;
  const availableTT = parseTurnTime(state.sleepAvailableAtTT);
  if (!availableTT) return false;
  return compareTurnTime(currentTT, availableTT) < 0;
}

/**
 * Check if advance command cooldown is active
 * @returns {boolean} True if advance cooldown is active
 */
function isAdvanceCooldownActive() {
  if (!state.advanceAvailableAtTT || !state.turnTime) return false;
  const currentTT = state.turnTime;
  const availableTT = parseTurnTime(state.advanceAvailableAtTT);
  if (!availableTT) return false;
  return compareTurnTime(currentTT, availableTT) < 0;
}

/**
 * Set sleep command cooldown
 * @param {Object} duration - Duration object with time units (e.g., {hours: 8})
 */
function setSleepCooldown(duration) {
  const availableTT = addToTurnTime(state.turnTime, duration);
  state.sleepAvailableAtTT = formatTurnTime(availableTT);
  state.sleepWakeTime = formatTurnTime(availableTT);
  updateCooldownCard();
}

/**
 * Set advance command cooldown
 * @param {Object} duration - Duration object with time units (e.g., {minutes: 5})
 */
function setAdvanceCooldown(duration) {
  const availableTT = addToTurnTime(state.turnTime, duration);
  state.advanceAvailableAtTT = formatTurnTime(availableTT);
  state.advanceEndTime = formatTurnTime(availableTT);
  updateCooldownCard();
}

/**
 * Clear all command cooldowns
 * @param {string} source - Source of the reset (for logging)
 */
function clearCommandCooldowns(source) {
  state.sleepAvailableAtTT = null;
  state.advanceAvailableAtTT = null;
  state.sleepWakeTime = null;
  state.advanceEndTime = null;
  updateCooldownCard();
}

/**
 * Update the WTG Cooldowns storycard with current cooldown information
 */
function updateCooldownCard() {
  const cooldownCard = getCooldownCard();
  let entry = "";

  if (state.sleepAvailableAtTT) {
    const sleepTT = parseTurnTime(state.sleepAvailableAtTT);
    const {currentDate: sleepDate, currentEra: sleepEra, currentTime: sleepTime} = computeCurrent(state.startingDate, state.startingTime, sleepTT);
    entry += `Sleep available after: ${formatDateTimeForDisplay(sleepDate, sleepTime, sleepEra)}\n`;
  }

  if (state.advanceAvailableAtTT) {
    const advanceTT = parseTurnTime(state.advanceAvailableAtTT);
    const {currentDate: advanceDate, currentEra: advanceEra, currentTime: advanceTime} = computeCurrent(state.startingDate, state.startingTime, advanceTT);
    entry += `Advance available after: ${formatDateTimeForDisplay(advanceDate, advanceTime, advanceEra)}\n`;
  }

  cooldownCard.entry = entry.trim();
}

/**
 * Get a boolean setting from the WTG Settings card
 * @param {string} settingName - Name of the setting to retrieve
 * @returns {boolean} The boolean value of the setting, or false if not found
 */
function getWTGBooleanSetting(settingName) {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return false;

  const regex = new RegExp(`${settingName}:\\s*(true|false)`, 'i');
  const match = settingsCard.entry.match(regex);
  return match ? match[1].toLowerCase() === 'true' : false;
}

/**
 * Get the time duration multiplier from the WTG Settings card
 * @returns {number} The time multiplier value (default 1.0)
 */
function getTimeMultiplier() {
  const settingsCard = getWTGSettingsCard();
  if (!settingsCard || !settingsCard.entry) return 1.0;

  const regex = /Time Duration Multiplier:\s*([\d.]+)/i;
  const match = settingsCard.entry.match(regex);
  if (match) {
    const value = parseFloat(match[1]);
    return isNaN(value) ? 1.0 : value;
  }
  return 1.0;
}

/**
 * Get dynamic time factor based on turn content analysis
 * @param {string} turnText - Text from player input and AI response
 * @returns {number} Time factor (0.7 for quick turns, 1.3 for long turns, 1.0 for medium/default)
 */
function getDynamicTimeFactor(turnText) {
  const lowerText = turnText.toLowerCase();
  // Quick turns (dialogue, immediate actions)
  if (lowerText.match(/\b(say|ask|talk|whisper|reply|speak|chat|converse)\b/)) {
    return 0.7; // Time passes slower
  }
  // Long turns (travel, waiting, extended events)
  if (lowerText.match(/\b(journey|travel|wait|sleep|days|hours|walk|ride|sail)\b/)) {
    return 1.3; // Time passes faster
  }
  // Medium/default turns
  return 1.0;
}

/**
 * Check if settime has been initialized (called by user or auto-detected)
 * @returns {boolean} True if settime has been initialized
 */
function hasSettimeBeenInitialized() {
  // First check state flag
  if (state.settimeInitialized) {
    return true;
  }
  
  // Fallback: check WTG Data storycard for settime marker
  const dataCard = getWTGDataCard();
  if (dataCard && dataCard.entry && dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
    state.settimeInitialized = true;
    return true;
  }
  
  return false;
}

/**
 * Mark settime as initialized in both state and WTG Data storycard
 * Also creates the WTG Settings storycard for user configuration
 */
function markSettimeAsInitialized() {
  state.settimeInitialized = true;

  const dataCard = getWTGDataCard();
  if (dataCard) {
    if (!dataCard.entry) {
      dataCard.entry = '[SETTIME_INITIALIZED]';
    } else if (!dataCard.entry.includes('[SETTIME_INITIALIZED]')) {
      dataCard.entry = '[SETTIME_INITIALIZED]\n' + dataCard.entry;
    }
  }

  // Create the WTG Settings storycard for user configuration
  getWTGSettingsCard();
}

// ====================================================================================
// NORMAL MODE ONLY FUNCTIONS
// ====================================================================================

/**
 * Normalize a name to Title Case (Normal mode only)
 */
function normalizeNameCase(name) {
  if (!name) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
}

/**
 * Ensure action text starts with a space if it doesn't already
 * Injects a leading space to actions that don't have one
 * @param {string} actionText - The action text to process
 * @returns {string} Action text with leading space ensured
 */
function ensureLeadingSpace(actionText) {
  if (!actionText || typeof actionText !== 'string') {
    return actionText;
  }
  
  // Check if text already starts with a space
  if (actionText.charAt(0) === ' ') {
    return actionText;
  }
  
  // Add leading space
  return ' ' + actionText;
}

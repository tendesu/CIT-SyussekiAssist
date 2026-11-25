// 出席履歴 (index.html・history.html共通)
// history: [{ room: "632", time: 入力した時刻(ms) }]
// historyDays: 保存日数 (期限ちょうどに消えないよう週数+1日)
const HISTORY_KEY = "history";
const DAYS_KEY = "historyDays";
const DEFAULT_DAYS = 15;
const DAY = 24 * 60 * 60 * 1000;

// 出席できるのは授業開始30分前から1時間後まで。
// 時間割の表示は9:00(1限)〜18:00(10限)
const FIRST_START = 9;
const LAST_START = 18;
const BEFORE = 30;
const AFTER = 60;
// 記録するのは8:00〜18:59の出席だけ (19:00〜翌7:59は保存しない)
const RECORD_FROM = 8;
const RECORD_UNTIL = 19;

function inRecordHours(time) {
    const h = new Date(time).getHours();
    return h >= RECORD_FROM && h < RECORD_UNTIL;
}

function getDays() {
    try {
        return Number(localStorage.getItem(DAYS_KEY)) || DEFAULT_DAYS;
    } catch (e) {
        return DEFAULT_DAYS;
    }
}

function setDays(days) {
    try {
        localStorage.setItem(DAYS_KEY, String(days));
    } catch (e) {
        // 保存できない環境では何もしない
    }
}

function saveHistory(list) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
        // 保存できない環境では何もしない
    }
}

// 保存期間を過ぎたもの・記録しない時間帯のものは削除して返す
function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        const kept = list.filter((h) => Date.now() - h.time < getDays() * DAY && inRecordHours(h.time));
        if (kept.length !== list.length) saveHistory(kept);
        return kept;
    } catch (e) {
        return [];
    }
}

function addHistory(room) {
    if (!inRecordHours(Date.now())) return;
    const list = loadHistory();
    const last = list[list.length - 1];
    // Enterとchangeで二重に記録しないように
    if (last && last.room === room && Date.now() - last.time < 5 * 60 * 1000) return;
    list.push({ room, time: Date.now() });
    saveHistory(list);
}

// その時刻(分)に出席したとき、考えられる授業開始時刻(時)
// 出席できるのは開始30分前から1時間後までなので、毎時0分開始のうちそれに当てはまるもの
// 授業は1限(9:00)〜10限(18:00)なので、8時台の出席は1限として扱う
function startCandidates(min) {
    const result = [];
    for (let h = Math.ceil((min - AFTER) / 60); h * 60 - BEFORE <= min; h++) {
        if (h >= FIRST_START && h <= LAST_START) result.push(h);
    }
    return result.length ? result : [FIRST_START];
}

// 同じ教室・同じ曜日・同じ開始時刻の候補の記録を1つの授業としてまとめる
// 返り値: [{ room, day, starts: [開始時刻の候補], items: [{ time }] }]
function classify(list) {
    const classes = new Map();
    for (const h of list) {
        const d = new Date(h.time);
        const day = d.getDay();
        const starts = startCandidates(d.getHours() * 60 + d.getMinutes());
        const key = `${h.room}|${day}|${starts}`;
        if (!classes.has(key)) classes.set(key, { room: h.room, day, starts, items: [] });
        classes.get(key).items.push({ time: h.time });
    }
    return [...classes.values()];
}

// 今その授業に出席できる時間か
function canAttendNow(cls, now = new Date()) {
    if (cls.day !== now.getDay()) return false;
    const min = now.getHours() * 60 + now.getMinutes();
    return cls.starts.some((h) => min >= h * 60 - BEFORE && min <= h * 60 + AFTER);
}

// 今出席できる教室を、ありそうな順に並べる
// 1. 過去の出席時刻が今の時刻に近い  2. 出席回数が多い  3. 最近出席した
function suggestRooms(list, now = new Date()) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rooms = new Map();
    for (const c of classify(list)) {
        if (!canAttendNow(c, now)) continue;
        const r = rooms.get(c.room) || { room: c.room, diff: Infinity, count: 0, last: 0 };
        for (const { time } of c.items) {
            const d = new Date(time);
            r.diff = Math.min(r.diff, Math.abs(d.getHours() * 60 + d.getMinutes() - nowMin));
            r.count++;
            r.last = Math.max(r.last, time);
        }
        rooms.set(c.room, r);
    }
    return [...rooms.values()]
        .sort((a, b) => a.diff - b.diff || b.count - a.count || b.last - a.last)
        .map((r) => r.room);
}

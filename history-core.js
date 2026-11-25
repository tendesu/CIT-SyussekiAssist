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
// 時間割・出席ボタンに使うのは8:00〜18:59の出席だけ (19:00〜翌7:59の記録は保存はするが表示しない)
const SHOW_FROM = 8;
const SHOW_UNTIL = 19;

function inShowHours(time) {
    const h = new Date(time).getHours();
    return h >= SHOW_FROM && h < SHOW_UNTIL;
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

// 保存期間を過ぎたものは削除して返す
function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
        const kept = list.filter((h) => Date.now() - h.time < getDays() * DAY);
        if (kept.length !== list.length) saveHistory(kept);
        return kept;
    } catch (e) {
        return [];
    }
}

function addHistory(room) {
    const list = loadHistory();
    const last = list[list.length - 1];
    // Enterとchangeで二重に記録しないように
    if (last && last.room === room && Date.now() - last.time < 5 * 60 * 1000) return;
    list.push({ room, time: Date.now() });
    saveHistory(list);
}

// その時刻(分)に出席したとき、考えられる授業開始時刻(時)
// 出席できるのは開始30分前から1時間後までなので、毎時0分開始のうちそれに当てはまるもの
// 時間割に出す記録は1限(9:00)〜10限(18:00)に合わせ、8時台の出席は1限として扱う
// 時間外の記録(timetable=false)は時間割にとらわれずに予測する (0時をまたぐと24以上や負の値になる)
function startCandidates(min, timetable = true) {
    const result = [];
    for (let h = Math.ceil((min - AFTER) / 60); h * 60 - BEFORE <= min; h++) {
        if (!timetable || (h >= FIRST_START && h <= LAST_START)) result.push(h);
    }
    return result.length ? result : [FIRST_START];
}

// 同じ教室・同じ曜日・同じ開始時刻の候補の記録を1つの授業としてまとめる
// 時間割用(all=false)では19:00〜翌7:59の記録は除く。出席ボタン用(all=true)は全部使う
// 返り値: [{ room, day, starts: [開始時刻の候補], items: [{ time }] }]
function classify(list, all = false) {
    const classes = new Map();
    for (const h of list) {
        const show = inShowHours(h.time);
        if (!all && !show) continue;
        const d = new Date(h.time);
        const day = d.getDay();
        const starts = startCandidates(d.getHours() * 60 + d.getMinutes(), show);
        const key = `${h.room}|${day}|${starts}`;
        if (!classes.has(key)) classes.set(key, { room: h.room, day, starts, items: [] });
        classes.get(key).items.push({ time: h.time });
    }
    return [...classes.values()];
}

// 1週間の中での分 (日曜0:00が0)。0時をまたぐ出席可能時間も扱えるように週単位で比べる
const WEEK_MIN = 7 * 24 * 60;
const weekMinute = (d) => d.getDay() * 24 * 60 + d.getHours() * 60 + d.getMinutes();

// 今その授業に出席できる時間か
function canAttendNow(cls, now = new Date()) {
    const nowW = weekMinute(now);
    return cls.starts.some((h) => {
        const from = cls.day * 24 * 60 + h * 60 - BEFORE;
        const offset = (((nowW - from) % WEEK_MIN) + WEEK_MIN) % WEEK_MIN;
        return offset <= BEFORE + AFTER;
    });
}

// 今出席できる教室を、ありそうな順に並べる (時間外の記録も同じ基準で使う)
// 1. 過去の出席時刻が今の時刻に近い  2. 出席回数が多い  3. 最近出席した
function suggestRooms(list, now = new Date()) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rooms = new Map();
    for (const c of classify(list, true)) {
        if (!canAttendNow(c, now)) continue;
        const r = rooms.get(c.room) || { room: c.room, diff: Infinity, count: 0, last: 0 };
        for (const { time } of c.items) {
            const d = new Date(time);
            const diff = Math.abs(d.getHours() * 60 + d.getMinutes() - nowMin);
            // 23:50と0:10のように0時をまたぐ場合も近いとみなす
            r.diff = Math.min(r.diff, diff, 24 * 60 - diff);
            r.count++;
            r.last = Math.max(r.last, time);
        }
        rooms.set(c.room, r);
    }
    return [...rooms.values()]
        .sort((a, b) => a.diff - b.diff || b.count - a.count || b.last - a.last)
        .map((r) => r.room);
}

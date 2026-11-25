// 出席履歴 (index.html・history.html共通)
// history: [{ room: "632", time: 入力した時刻(ms) }]
// historyDays: 保存日数 (期限ちょうどに消えないよう週数+1日)
const HISTORY_KEY = "history";
const DAYS_KEY = "historyDays";
const DEFAULT_DAYS = 15;
const DAY = 24 * 60 * 60 * 1000;

// 授業は9:00〜18:00の毎時0分開始。出席できるのは開始30分前から1時間後まで。
const FIRST_START = 9;
const LAST_START = 18;
const BEFORE = 30;
const AFTER = 60;

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
function startCandidates(min) {
    const fits = (h) => min >= h * 60 - BEFORE && min <= h * 60 + AFTER;
    const result = [];
    for (let h = FIRST_START; h <= LAST_START; h++) if (fits(h)) result.push(h);
    if (result.length) return result;
    // 授業時間外の記録は時間割にとらわれず推定
    for (let h = Math.ceil((min - AFTER) / 60); h * 60 - BEFORE <= min; h++) result.push(h);
    return result;
}

// 履歴を授業ごとにまとめ、記録が増えるほど開始時刻を絞り込む
// 返り値: [{ room, day, starts: [開始時刻の候補], items: [{ time, ... }] }]
function classify(list) {
    const buckets = new Map();
    for (const h of list) {
        const d = new Date(h.time);
        const min = d.getHours() * 60 + d.getMinutes();
        const e = {
            room: h.room,
            time: h.time,
            day: d.getDay(),
            date: d.toDateString(),
            min,
            starts: startCandidates(min),
        };
        const key = e.room + "|" + e.day;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(e);
    }

    const result = [];
    for (const entries of buckets.values()) {
        // 開始時刻がはっきりしている記録から先に授業を作る
        entries.sort((a, b) => a.starts.length - b.starts.length || a.time - b.time);
        const classes = [];
        for (const e of entries) {
            let best = null;
            for (const c of classes) {
                const starts = c.starts.filter((h) => e.starts.includes(h));
                if (!starts.length) continue;
                // 同じ日に30分以上離れた記録は別の授業 (同じ教室で連続する授業)
                const sameDay = c.items.find((x) => x.date === e.date);
                if (sameDay && Math.abs(sameDay.min - e.min) > 30) continue;
                if (!best || starts.length < best.starts.length) best = { c, starts };
            }
            if (best) {
                best.c.starts = best.starts;
                best.c.items.push(e);
            } else {
                classes.push({ room: e.room, day: e.day, starts: [...e.starts], items: [e] });
            }
        }

        // 同じ日に行われる別の授業とは開始時刻が重ならない
        let changed = true;
        while (changed) {
            changed = false;
            for (const a of classes) {
                if (a.starts.length !== 1) continue;
                for (const b of classes) {
                    if (b === a || b.starts.length < 2 || !b.starts.includes(a.starts[0])) continue;
                    if (!b.items.some((x) => a.items.some((y) => y.date === x.date))) continue;
                    b.starts = b.starts.filter((h) => h !== a.starts[0]);
                    changed = true;
                }
            }
        }
        result.push(...classes);
    }
    return result;
}

// 今その授業に出席できる時間か
function canAttendNow(cls, now = new Date()) {
    if (cls.day !== now.getDay()) return false;
    const min = now.getHours() * 60 + now.getMinutes();
    return cls.starts.some((h) => min >= h * 60 - BEFORE && min <= h * 60 + AFTER);
}

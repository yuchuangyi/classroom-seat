const { cloud } = require('./cloud')

const ROWS = 12
const COLS = 10
const MY_NAME_KEY = 'checkin_my_name'

function parseSeatNo(seatNo) {
    const parts = String(seatNo || '').split('-')
    return { row: Number(parts[0]), col: Number(parts[1]) }
}

function seatText(seatNo) {
    const pos = parseSeatNo(seatNo)
    if (!pos.row || !pos.col) return ''
    return pos.row + ' 排 ' + pos.col + ' 座'
}

async function fetchRoster() {
    const { data, error } = await cloud.database
        .from('roster')
        .select('name, seat_no')
        .order('name', { ascending: true })
    if (error) throw error
    return data || []
}

async function fetchSeats() {
    const { data, error } = await cloud.database
        .from('seats')
        .select('seat_no, row_no, col_no, status, student_name')
        .order('row_no', { ascending: true })
        .order('col_no', { ascending: true })
    if (error) throw error
    return data || []
}

async function checkin(name) {
    const { data, error } = await cloud.database.rpc('checkin', { p_name: name })
    if (error) throw error
    let payload = data
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload)
        } catch (e) {
            payload = null
        }
    }
    if (Array.isArray(payload)) payload = payload[0]
    return payload || { ok: false, code: 'EMPTY_RESULT' }
}

async function resetSession(key) {
    const { data, error } = await cloud.database.rpc('reset_session', { p_key: key })
    if (error) throw error
    let payload = data
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload)
        } catch (e) {
            payload = null
        }
    }
    if (Array.isArray(payload)) payload = payload[0]
    return payload || { ok: false, code: 'EMPTY_RESULT' }
}

function seatMap(seats) {
    const map = {}
    seats.forEach((s) => {
        map[s.seat_no] = s
    })
    return map
}

function buildRows(seats, mySeatNo) {
    const map = seatMap(seats)
    const rows = []
    for (let r = 1; r <= ROWS; r += 1) {
        const cells = []
        for (let c = 1; c <= COLS; c += 1) {
            const key = r + '-' + c
            const seat = map[key]
            const taken = !!seat && seat.status === 'taken'
            const mine = taken && mySeatNo === key
            let label = ''
            if (taken) {
                label = mine ? '我' : String(seat.student_name || '').slice(0, 1)
            }
            cells.push({
                key: key,
                cls: mine ? 'mine' : taken ? 'taken' : 'free',
                label: label,
                aisle: c === 5,
            })
        }
        rows.push({ key: 'row-' + r, no: r, cells: cells })
    }
    return rows
}

// 结果页用的 5×5 局部图：以自己为中心，越界位置返回 void
function buildLocalGrid(seats, seatNo) {
    const map = seatMap(seats)
    const pos = parseSeatNo(seatNo)
    const rows = []
    for (let r = pos.row - 2; r <= pos.row + 2; r += 1) {
        const cells = []
        for (let c = pos.col - 2; c <= pos.col + 2; c += 1) {
            const inside = r >= 1 && r <= ROWS && c >= 1 && c <= COLS
            const key = r + '-' + c
            const seat = inside ? map[key] : null
            const taken = !!seat && seat.status === 'taken'
            const mine = key === seatNo
            let cls = 'void'
            let label = ''
            if (inside) {
                cls = mine ? 'mine' : taken ? 'taken' : 'free'
                if (mine) label = '我'
                else if (taken) label = String(seat.student_name || '').slice(0, 1)
            }
            cells.push({ key: key, cls: cls, label: label })
        }
        rows.push({ key: 'local-' + r, no: r >= 1 && r <= ROWS ? r : '', cells: cells })
    }
    return rows
}

function buildNeighbors(seats, seatNo) {
    const map = seatMap(seats)
    const pos = parseSeatNo(seatNo)
    const pick = (r, c, dir) => {
        if (r < 1 || r > ROWS || c < 1 || c > COLS) {
            return { dir: dir, name: '过道', empty: true, edge: true }
        }
        const seat = map[r + '-' + c]
        if (seat && seat.status === 'taken') {
            return { dir: dir, name: seat.student_name, empty: false, edge: false }
        }
        return { dir: dir, name: '空位', empty: true, edge: false }
    }
    return [
        pick(pos.row - 1, pos.col, '前面'),
        pick(pos.row + 1, pos.col, '后面'),
        pick(pos.row, pos.col - 1, '左邻'),
        pick(pos.row, pos.col + 1, '右邻'),
    ]
}

function countCheckedIn(roster) {
    let done = 0
    roster.forEach((r) => {
        if (r.seat_no) done += 1
    })
    return done
}

function getMyName() {
    try {
        return wx.getStorageSync(MY_NAME_KEY) || ''
    } catch (e) {
        return ''
    }
}

function setMyName(name) {
    try {
        wx.setStorageSync(MY_NAME_KEY, name)
    } catch (e) {
        // 忽略本地存储失败，签到结果仍以服务端为准
    }
}

function clearMyName() {
    try {
        wx.removeStorageSync(MY_NAME_KEY)
    } catch (e) {
        // 忽略
    }
}

module.exports = {
    ROWS: ROWS,
    COLS: COLS,
    parseSeatNo: parseSeatNo,
    seatText: seatText,
    fetchRoster: fetchRoster,
    fetchSeats: fetchSeats,
    checkin: checkin,
    resetSession: resetSession,
    buildRows: buildRows,
    buildLocalGrid: buildLocalGrid,
    buildNeighbors: buildNeighbors,
    countCheckedIn: countCheckedIn,
    getMyName: getMyName,
    setMyName: setMyName,
    clearMyName: clearMyName,
}

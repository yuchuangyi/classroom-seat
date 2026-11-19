const room = require('../../utils/room')

const app = getApp()

function toast(title) {
    wx.showToast({ title: title, icon: 'none' })
}

Page({
    data: {
        mode: 'loading',
        errMsg: '',
        done: 0,
        total: 0,
        pct: 0,
        keyword: '',
        list: [],
        seatText: '',
        me: { name: '' },
        neighbors: [],
        mini: [],
    },

    onLoad() {
        this.loadAll()
    },

    onShow() {
        // 从座位图返回时，若数据已超过 20 秒，静默刷新一次进度
        const stale = Date.now() - (app.globalData.loadedAt || 0) > 20000
        if (this.data.mode === 'result' && stale) {
            this.refreshQuiet()
        }
    },

    onPullDownRefresh() {
        this.loadAll(true)
    },

    async loadAll(fromPull) {
        if (!fromPull) this.setData({ mode: 'loading', errMsg: '' })
        try {
            const results = await Promise.all([room.fetchRoster(), room.fetchSeats()])
            const roster = results[0]
            const seats = results[1]
            app.globalData.roster = roster
            app.globalData.seats = seats
            app.globalData.loadedAt = Date.now()

            const done = room.countCheckedIn(roster)
            this.setData({
                done: done,
                total: roster.length,
                pct: roster.length ? Math.round((done * 100) / roster.length) : 0,
            })

            const myName = room.getMyName()
            let mine = null
            if (myName) {
                roster.forEach((item) => {
                    if (item.name === myName) mine = item
                })
            }
            if (mine && mine.seat_no) {
                app.globalData.mySeatNo = mine.seat_no
                this.showResult(mine.name, mine.seat_no)
            } else {
                this.buildList(roster, this.data.keyword)
                this.setData({ mode: 'pick' })
            }
        } catch (err) {
            this.setData({
                mode: 'error',
                errMsg: this.describeError(err),
            })
        } finally {
            if (fromPull) wx.stopPullDownRefresh()
        }
    },

    async refreshQuiet() {
        try {
            const roster = await room.fetchRoster()
            const seats = await room.fetchSeats()
            app.globalData.roster = roster
            app.globalData.seats = seats
            app.globalData.loadedAt = Date.now()
            const done = room.countCheckedIn(roster)
            this.setData({
                done: done,
                pct: roster.length ? Math.round((done * 100) / roster.length) : 0,
                neighbors: room.buildNeighbors(seats, app.globalData.mySeatNo),
                mini: room.buildLocalGrid(seats, app.globalData.mySeatNo),
            })
        } catch (err) {
            // 静默刷新失败不打断当前页面
        }
    },

    describeError(err) {
        const code = err && err.code ? String(err.code) : ''
        const raw = err && err.message ? String(err.message) : ''
        if (code === '42P01') return '数据表还没建好，联系管理员'
        if (code === '42501') return '没有读名单的权限'
        if (raw.indexOf('credits') >= 0 || raw.indexOf('quota') >= 0) return '服务额度已用尽，联系管理员'
        if (raw.indexOf('timeout') >= 0) return '请求超时，检查一下网络'
        return raw || '网络不通，下拉重试'
    },

    buildList(roster, keyword) {
        const kw = String(keyword || '').trim()
        const list = []
        roster.forEach((item) => {
            if (kw && item.name.indexOf(kw) === -1) return
            list.push({
                name: item.name,
                taken: !!item.seat_no,
                note: item.seat_no ? room.seatText(item.seat_no) : '未签到',
            })
        })
        this.setData({ list: list, keyword: kw })
    },

    onSearch(event) {
        this.buildList(app.globalData.roster || [], event.detail.value)
    },

    clearSearch() {
        this.buildList(app.globalData.roster || [], '')
    },

    onPick(event) {
        const name = event.currentTarget.dataset.name
        const taken = event.currentTarget.dataset.taken
        if (taken) {
            toast('这个座位已经签过了')
            return
        }
        wx.showModal({
            title: '确认是你本人',
            content: '签到后马上分配座位，不能更换：' + name,
            confirmText: '就是我',
            cancelText: '再想想',
            success: (res) => {
                if (res.confirm) this.doCheckin(name)
            },
        })
    },

    async doCheckin(name) {
        this.setData({ mode: 'loading' })
        wx.showLoading({ title: '正在分配座位', mask: true })
        try {
            const res = await room.checkin(name)
            wx.hideLoading()
            if (!res.ok) {
                this.setData({ mode: 'pick' })
                let msg = '分配失败，再试一次'
                if (res.code === 'NO_SEAT') msg = '座位已经坐满了'
                if (res.code === 'NOT_IN_ROSTER') msg = '名单里没有这个名字'
                wx.showModal({ title: '没能分座', content: msg, showCancel: false })
                return
            }
            room.setMyName(name)
            app.globalData.mySeatNo = res.seat_no
            app.globalData.seats = this.applyLocalSeat(res.seat_no, name)
            app.globalData.roster = this.applyLocalRoster(name, res.seat_no)

            const done = room.countCheckedIn(app.globalData.roster)
            const total = app.globalData.roster.length
            this.setData({
                done: done,
                total: total,
                pct: total ? Math.round((done * 100) / total) : 0,
            })
            this.showResult(name, res.seat_no)
            wx.vibrateShort({ type: 'light' })
        } catch (err) {
            wx.hideLoading()
            this.setData({ mode: 'pick', errMsg: this.describeError(err) })
            wx.showModal({
                title: '没能分座',
                content: this.describeError(err),
                showCancel: false,
            })
        }
    },

    applyLocalSeat(seatNo, name) {
        const seats = app.globalData.seats || []
        const next = []
        seats.forEach((seat) => {
            if (seat.seat_no === seatNo) {
                next.push({
                    seat_no: seat.seat_no,
                    row_no: seat.row_no,
                    col_no: seat.col_no,
                    status: 'taken',
                    student_name: name,
                })
            } else {
                next.push(seat)
            }
        })
        return next
    },

    applyLocalRoster(name, seatNo) {
        const roster = app.globalData.roster || []
        const next = []
        roster.forEach((item) => {
            if (item.name === name) {
                next.push({ name: item.name, seat_no: seatNo })
            } else {
                next.push(item)
            }
        })
        return next
    },

    showResult(name, seatNo) {
        const seats = app.globalData.seats || []
        this.setData({
            mode: 'result',
            seatText: room.seatText(seatNo),
            me: { name: name },
            neighbors: room.buildNeighbors(seats, seatNo),
            mini: room.buildLocalGrid(seats, seatNo),
        })
    },

    askFix() {
        wx.showModal({
            title: '名字点错了',
            content: '座位已经占住，需要老师在本场重置后重新签到。找老师处理。',
            showCancel: false,
        })
    },

    goSeats() {
        wx.navigateTo({ url: '/pages/seats/seats' })
    },

    goAdmin() {
        wx.navigateTo({ url: '/pages/admin/admin' })
    },

    reload() {
        this.loadAll(false)
    },
})

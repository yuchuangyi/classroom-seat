const room = require('../../utils/room')

const app = getApp()

Page({
    data: {
        done: 0,
        total: 120,
        left: 120,
        free: 120,
        pct: 0,
        list: [],
        mode: 'loading',
        errMsg: '',
    },

    onLoad() {
        this.load(true)
    },

    onShow() {
        const stale = Date.now() - (app.globalData.loadedAt || 0) > 20000
        if (stale) this.load(false)
    },

    onPullDownRefresh() {
        this.load(true)
    },

    onShareAppMessage() {
        return {
            title: '课堂签到，扫码选名字就分配座位',
            path: '/pages/index/index',
        }
    },

    async load(fromPull) {
        if (fromPull) this.setData({ mode: 'loading' })
        try {
            const results = await Promise.all([room.fetchRoster(), room.fetchSeats()])
            const roster = results[0]
            const seats = results[1]
            app.globalData.roster = roster
            app.globalData.seats = seats
            app.globalData.loadedAt = Date.now()

            const done = room.countCheckedIn(roster)
            let free = 0
            seats.forEach((seat) => {
                if (seat.status !== 'taken') free += 1
            })

            const list = []
            roster.forEach((item) => {
                list.push({
                    name: item.name,
                    no: item.seat_no ? room.seatText(item.seat_no) : '—',
                    note: item.seat_no ? '已到' : '未到',
                    taken: !!item.seat_no,
                })
            })
            list.sort((a, b) => {
                if (a.taken === b.taken) return 0
                return a.taken ? -1 : 1
            })

            this.setData({
                done: done,
                total: roster.length,
                left: roster.length - done,
                free: free,
                pct: roster.length ? Math.round((done * 100) / roster.length) : 0,
                list: list,
                mode: 'ready',
                errMsg: '',
            })
        } catch (err) {
            this.setData({
                mode: 'error',
                errMsg: String((err && err.message) || '网络不通'),
            })
        } finally {
            if (fromPull) wx.stopPullDownRefresh()
        }
    },

    goSeats() {
        wx.navigateTo({ url: '/pages/seats/seats' })
    },

    doReset() {
        wx.showModal({
            title: '重置本场',
            content: '会清空全部签到记录和座位占用，口令默认 2468（可在数据库改）',
            editable: true,
            placeholderText: '输入重置口令',
            confirmText: '重置',
            success: (res) => {
                if (!res.confirm) return
                const key = String(res.content || '').trim()
                if (!key) {
                    wx.showToast({ title: '口令没填', icon: 'none' })
                    return
                }
                this.applyReset(key)
            },
        })
    },

    async applyReset(key) {
        wx.showLoading({ title: '正在重置', mask: true })
        try {
            const res = await room.resetSession(key)
            wx.hideLoading()
            if (!res.ok) {
                wx.showModal({
                    title: '没重置成功',
                    content: res.code === 'BAD_KEY' ? '口令不对' : '服务端拒绝了这次操作',
                    showCancel: false,
                })
                return
            }
            room.clearMyName()
            app.globalData.mySeatNo = ''
            app.globalData.loadedAt = 0
            wx.showToast({ title: '已重置 ' + res.seats_freed + ' 个座位', icon: 'none' })
            this.load(false)
        } catch (err) {
            wx.hideLoading()
            wx.showModal({
                title: '没重置成功',
                content: String((err && err.message) || '网络不通'),
                showCancel: false,
            })
        }
    },
})

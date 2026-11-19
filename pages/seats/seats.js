const room = require('../../utils/room')

const app = getApp()
const ZOOMS = [56, 66, 78]

Page({
    data: {
        rows: [],
        cols: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        cell: ZOOMS[1],
        zoomIndex: 1,
        mySeatNo: '',
        mySeatText: '',
        taken: 0,
        total: 120,
        mode: 'loading',
        errMsg: '',
    },

    onLoad() {
        this.render()
        if (!app.globalData.seats) this.reload()
    },

    onPullDownRefresh() {
        this.reload(true)
    },

    async reload(fromPull) {
        try {
            const seats = await room.fetchSeats()
            app.globalData.seats = seats
            app.globalData.loadedAt = Date.now()
            this.render()
        } catch (err) {
            this.setData({ mode: 'error', errMsg: String((err && err.message) || '网络不通') })
        } finally {
            if (fromPull) wx.stopPullDownRefresh()
        }
    },

    render() {
        const seats = app.globalData.seats || []
        const mySeatNo = app.globalData.mySeatNo || ''
        let taken = 0
        seats.forEach((seat) => {
            if (seat.status === 'taken') taken += 1
        })
        this.setData({
            rows: room.buildRows(seats, app.globalData.mySeatNo),
            mySeatNo: mySeatNo || '',
            mySeatText: app.globalData.mySeatNo ? room.seatText(app.globalData.mySeatNo) : '',
            taken: taken,
            total: seats.length || 120,
            mode: 'ready',
            errMsg: '',
        })
    },

    zoomIn() {
        const next = Math.min(this.data.zoomIndex + 1, ZOOMS.length - 1)
        this.setData({ zoomIndex: next, cell: ZOOMS[next] })
    },

    zoomOut() {
        const next = Math.max(this.data.zoomIndex - 1, 0)
        this.setData({ zoomIndex: next, cell: ZOOMS[next] })
    },
})

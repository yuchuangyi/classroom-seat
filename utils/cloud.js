const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

// publicConfig 来自云服务开通结果，仅包含可下发到前端的公开值
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_v1sX6oJqcFwEtE30RlR03T_ltdRLYgBCmiZbT5Gy51ilsX6zR3XJPKx',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_v1sX6oJqcFwEtE30RlR03T',
}

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(wx),
})

module.exports = { cloud, publicConfig }

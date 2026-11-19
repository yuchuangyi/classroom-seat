# 课堂签到选座（微信小程序）

一个教室场景的扫码签到工具：学生在微信里扫码进入，从名单里选中自己的名字，**签到的同时当场分配一个空座位**，手机上立刻显示「3 排 7 座」和一张以自己为中心的 5×5 局部座位图。先到先得，不能换座。

一场课按 120 人设计，座位为 12 排 × 10 列，第 1 排靠讲台，第 5/6 列之间是过道。

## 三个页面

| 页面 | 路径 | 作用 |
|---|---|---|
| 学生端 | `pages/index` | 搜名字 → 确认 → 签到 → 座位卡（座位号 + 5×5 局部图 + 前后左右是谁） |
| 座位图 | `pages/seats` | 全班 12×10 平面图，三档缩放，自己高亮，已坐显示姓氏 |
| 老师端 | `pages/admin` | 签到进度、点名册（谁坐哪）、转发入口、口令重置本场 |

## 技术栈

- 微信原生小程序（WXML / WXSS / JS），无框架、无 UI 库，座位图纯 CSS 绘制
- 后端为 WorkBuddy Cloud Service（托管 PostgreSQL + PostgREST），客户端 SDK `@tencent-ai/workbuddy-cloud-sdk`
- 视觉走黑板粉笔路线：深墨绿底 `/ #14201b`、粉笔白 `/ #eef3ea`、唯一强调色粉笔黄 `/ #e9d98b`

## 目录

```
app.js / app.json / app.wxss     小程序入口与全局样式
pages/index                      学生端：选名字、签到、结果卡
pages/seats                      全班座位图
pages/admin                      老师端
utils/cloud.js                   云客户端初始化（endpoint + publishableKey）
utils/room.js                    数据访问与座位网格构建
sql/schema.sql                   建表、RLS、RPC 函数、座位种子
sql/roster-sample.sql            120 个随机生成的中文姓名（演示数据）
DESIGN-UI.md                     界面设计规格（尺寸与配色推导）
```

## 关键实现：签到一个分一个

分配不在前端做，全部压在一条数据库函数里，靠行锁保证并发安全：

```sql
checkin(p_name)
  ├─ SELECT ... FROM roster WHERE name = p_name FOR UPDATE   -- 锁住这名学生
  ├─ 已签到 → 直接返回原座位（幂等，不会重复占座）
  ├─ SELECT ... FROM seats WHERE status='free'
  │    ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED      -- 抢一个空座并锁住
  └─ 同一事务内写 seats + roster
```

120 个人同时按也只会有 120 个不同座位：抢不到的跳过锁，拿到的一定是独占的。

权限上，`seats` 和 `roster` 对 `anon` 只开 `SELECT`，任何写操作只能经由 `SECURITY DEFINER` 函数；重置口令存在 `room_config` 表，默认 `2468`，改一行即可更换。

## 跑起来

1. 在 WorkBuddy 里打开本工程（或微信开发者工具导入，云服务开通后会自动执行 npm 构建）
2. 执行 `sql/schema.sql`（逐条）与 `sql/roster-sample.sql`
3. `utils/cloud.js` 里的 `endpoint` / `publishableKey` 换成你开通的云服务环境

> `publishableKey` 是设计上可下发到前端的公开标识，不含任何权限；真正的安全边界在数据库的 RLS 和函数里。

## 说明

- 名单里的 120 个姓名是随机拼的演示数据，不是真实学生。
- 座位网格尺寸写死在 `utils/room.js` 的 `ROWS` / `COLS`，换教室改这两处，并重建座位种子。

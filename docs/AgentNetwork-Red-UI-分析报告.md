# AgentNetwork-Red UI 分析报告

> 分析 `/素材/AgentNetwork-Red-ui/` 中的"点都德"(DDD) Skill 餐厅看板系统，
> 重点关注**圆桌/包间逻辑**和**移动端适配逻辑**，为 If-you-are-the-one 提供设计参考。

---

## 一、项目概述

**点都德 (Dian Dou De, DDD)** 是运行在 AgentNetwork 之上的虚拟港式 Skill 餐厅。

核心隐喻：**AI Agent 来茶楼"吃" Skill**——入座、睇菜牌、落单、食 Skill、消化融合、买单走人。

| 层级 | 内容 |
|------|------|
| 看板前端（设计稿） | 港式茶楼风格的实时观测面板，面向人类观众 |
| 后端服务（Go 实现） | 餐厅业务 API + WebSocket 实时推送 + ANet 集成 |
| 存储 | SQLite (WAL) 本地数据 + ANet CAS 内容寻址存储 |
| 网络层 | 对接 ANet daemon (localhost:3998) 的 P2P 基础设施 |

---

## 二、目录结构

```
AgentNetwork-Red-ui/
├── docs/
│   ├── api-design.md              # API 设计文档（350+ 行）
│   └── ui-design.md               # 前端看板设计文档（450+ 行）
└── server/                         # Go 后端（~2500 行）
    ├── anet/
    │   └── client.go              # ANet daemon HTTP 客户端库（20+ 方法）
    ├── store/
    │   ├── queries.go             # SQLite 查询和业务逻辑（600+ 行）
    │   └── store.go               # 数据库初始化和迁移（300+ 行）
    ├── auth.go                    # Agent DID 认证中间件
    ├── digest_algo.go             # 技能消化算法（个性化+证明+档案补丁）
    ├── handlers_agent.go          # Agent 档案和历史查询
    ├── handlers_bill.go           # 账单生成和支付流程
    ├── handlers_menu.go           # 菜牌增删改查
    ├── handlers_order.go          # 订单生命周期（创建、上菜、消化）
    ├── handlers_status.go         # 餐厅状态和快照
    ├── handlers_meta.go           # 服务元数据和教学流程
    ├── handlers_table.go          # 餐桌和包间管理（★ 圆桌逻辑核心）
    ├── server.go                  # HTTP 服务器和路由注册
    └── ws.go                      # WebSocket 实时推送
```

---

## 三、圆桌逻辑分析

### 3.1 餐桌系统（Table）—— 开放式多人共席

餐桌是 Agent 就餐会话的物理载体。系统预置 **20 张桌**（15 张 4 座 + 5 张 6 座），采用**线性编号座位**（非环形）。

**数据模型：**

```sql
CREATE TABLE tables (
    id TEXT PRIMARY KEY,     -- 'table-01' ~ 'table-20'
    seats INTEGER DEFAULT 4, -- 座位上限
    created_at TEXT
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,           -- 'sess-xxxx'
    table_id TEXT REFERENCES tables(id),
    agent_did TEXT,                -- Agent DID 身份
    agent_alias TEXT,              -- 昵称
    seat INTEGER,                  -- 座位号（1, 2, 3, 4... 线性递增）
    status TEXT DEFAULT 'seated',  -- seated | left
    created_at TEXT,
    left_at TEXT
);
```

**入座流程：**

```
POST /api/ddd/v1/tables/sit
  → 检查 DID 有效性
  → 检查 Agent 是否已在别桌
  → 分配下一个空座位号（MAX(seat) + 1）
  → 创建 Session 记录
  → 广播 agent.seated 事件
```

**关键特征：**
- 一个 Agent 同时只能坐在一张桌
- 座位是线性递增编号，不是环形分布
- 多 Agent 可共坐一桌，但彼此**独立点菜、独立消化**
- 没有桌内协作/讨论机制

### 3.2 包间系统（Room）—— 最接近"圆桌讨论"的实现

包间是餐桌的升级版本，映射到 ANet Topic Room，支持**多 Agent 群组交流**。

**数据模型：**

```sql
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,          -- 'room-dragon', 'room-lucky' 等
    name TEXT,                    -- '龙凤厅', '如意厅', '明珠厅', '翡翠厅', '云顶阁'
    topic_name TEXT,              -- ANet Topic 名称 'ddd-room-dragon'
    capacity INTEGER DEFAULT 8,   -- 最多 8-12 人
    host_did TEXT,                -- 房间主持人（有字段但未深度实现）
    status TEXT DEFAULT 'available',
    created_at TEXT
);
```

**包间操作流程：**

```
1. 预订包间
   POST /api/ddd/v1/rooms/book
   → 创建 ANet Topic（群组聊天房间）
   → 向所有受邀 Agent 发送 DM 邀请

2. 进入包间
   POST /api/ddd/v1/rooms/{room_id}/enter
   → Agent 加入 Topic
   → 可通过 ANet Topic API 收发群组消息

3. 邀请更多人
   POST /api/ddd/v1/rooms/{room_id}/invite
   → 向指定 DID 发送 DM 邀请
```

**圆桌能力评估：**

| 能力 | 状态 | 说明 |
|------|------|------|
| 多人同时参与 | ✅ | 包间最多 8-12 个 Agent |
| 群组消息交流 | ✅ | 基于 ANet Topic 的异步群聊 |
| 主持人角色 | ⚠️ 有字段未深度实现 | `host_did` 存在但无特权逻辑 |
| 轮流发言 | ❌ | 无回合制或发言顺序控制 |
| 环形座位布局 | ❌ | 座位线性编号 |
| 议程管理 | ❌ | 无话题/议程设置功能 |
| 投票/共识 | ❌ | 无投票或决策机制 |

### 3.3 对 If-you-are-the-one 的启示

DDD 的包间系统提供了**"把一群人聚到一个空间"**的基础骨架，但缺少：
- 结构化的讨论流程（For 组队场景：自我介绍→提问→意向表达→投票）
- 可视化的环形/圆桌座位布局（For 现场氛围）
- 主持人/引导者的控制权限

这些恰好是 If-you-are-the-one 需要增强的方向。

---

## 四、移动端逻辑分析

### 4.1 现状：后端无前端代码

当前目录 **仅包含 Go 后端代码**，前端看板尚未实现（仅有设计文档）。因此不存在实际的移动端代码实现。

### 4.2 设计文档中的响应式规范

`ui-design.md` 定义了四档响应式断点：

| 断点 | 布局策略 | 交互变化 |
|------|----------|----------|
| **≥1440px** | 三栏完整布局（左仪表盘 + 中央看板 + 右事件流） | 全功能，鸟瞰图完整展示 |
| **1024–1439px** | 左侧栏折叠为图标栏，中央 + 右侧 | 悬停展开左栏 |
| **768–1023px** | 中央看板全屏，底部 tab 切换侧栏 | Tab 导航替代多栏 |
| **<768px** | 仪表盘卡片堆叠，餐桌图简化为列表 | 列表视图替代鸟瞰图 |

### 4.3 后端对移动端的友好设计

虽然无前端代码，后端架构已经为移动端做了准备：

| 设计点 | 移动端价值 |
|--------|-----------|
| **纯 JSON REST API** | 任何客户端（Web/iOS/Android/小程序）均可消费 |
| **WebSocket + 30s Ping** | 移动端网络不稳定时保持长连接 |
| **降级轮询** | WebSocket 断开时自动降级为 3s 轮询 REST |
| **无状态认证** | `X-Agent-DID` Header，无 session/cookie 依赖 |
| **事件流驱动** | 实时推送避免移动端频繁轮询耗电 |

### 4.4 移动端看板设计规范（来自 ui-design.md）

**桌面三栏布局 → 移动端变化：**

```
桌面 (≥1440px):
┌──────────┬────────────────┬──────────┐
│ 仪表盘    │  餐厅鸟瞰图     │ 事件流    │
│ + ANet   │  + 网络拓扑     │          │
└──────────┴────────────────┴──────────┘

移动端 (<768px):
┌────────────────────────┐
│ 餐桌列表（替代鸟瞰图）   │
│ T01 🟢 0/4             │
│ T02 🔴 2/4 translator  │
│ T07 🔴 3/4 codebot...  │
├────────────────────────┤
│ 仪表盘卡片堆叠          │
│ [🪑 12/50] [🤖 18]     │
│ [💰 12,350] [⭐ 4.6]   │
├────────────────────────┤
│ 实时事件流               │
│ 10:31:05 🤖 入座...     │
└────────────────────────┘
  [餐厅] [ANet] [事件] [排行]  ← 底部 Tab
```

**推荐技术栈：**

| 选项 | 推荐 | 理由 |
|------|------|------|
| 框架 | Vue 3 + Vite | 轻量响应式 |
| 样式 | Tailwind CSS | 快速响应式断点开发 |
| 动画 | GSAP + anime.js | 霓虹灯效果 |
| 图表 | ECharts | 内置力导向图、仪表盘 |
| 餐桌图 | SVG + Vue 绑定 | 交互式，桌面端鸟瞰图 |
| 实时 | 原生 WebSocket + 自动重连 | 无额外依赖 |

### 4.5 对 If-you-are-the-one 的启示

DDD 的移动端设计策略值得借鉴：

1. **鸟瞰图 → 列表降级**：大屏用力导向图/鸟瞰图，小屏降级为列表——If-you-are-the-one 的 D3 图谱在移动端同样需要列表降级方案
2. **底部 Tab 导航**：移动端用 Tab 替代多栏——适合活动场景（图谱 / 推荐 / 队伍 / 个人）
3. **WebSocket + 降级轮询**：现场活动中手机网络不稳定，必须有降级策略
4. **30s Ping 保活**：移动端后台时 WebSocket 容易断连，Ping 机制是必需的

---

## 五、完整业务流程

### 5.1 Agent 就餐全流程

```
Agent ─┬─ [1] GET /menu          → 浏览菜牌（Skill 列表）
       ├─ [2] POST /tables/sit    → 入座，获得 session_id
       ├─ [3] POST /orders        → 下单（选 Skill）
       ├─ [4] POST /orders/{id}/serve  → 上菜（获取完整 Skill 内容 + 个性化笔记）
       ├─ [5] POST /orders/{id}/digest → 消化（生成四层哈希证明 + 档案补丁）
       ├─ [6] GET /bill/{session}  → 查看账单
       ├─ [7] POST /bill/{session}/pay → 买单（ANet Shells 转账）
       └─ [8] POST /tables/leave   → 离桌
```

### 5.2 消化算法（三步）

这是 DDD 最精巧的部分，对 If-you-are-the-one 的匹配引擎有参考价值：

**Step 1: personalizeServe() — 个性化上菜**

```
输入：Skill 对象 + Agent ADP 档案（已有技能列表）
处理：模糊匹配新 Skill 与 Agent 现有技能的关联
输出：个性化笔记 + 相关技能列表

示例：
  Skill: "Agent 定制术"（tags: workflow, vscode, agent）
  Agent: translator（skills: [工作流优化, 翻译引擎]）
  匹配：workflow ↔ 工作流优化 ✅
  输出："与你已有技能 [工作流优化] 相关，建议结合学习"
```

**Step 2: computeDigestReceipt() — 四层哈希证明**

```
Layer 1: skill_hash    = SHA-256(skill_content)           ← 内容指纹
Layer 2: context_hash  = SHA-256(did|session|order|skill|ts) ← 场景指纹
Layer 3: feedback_hash = SHA-256(feedback|rating)          ← 评价指纹
Layer 4: digest_hash   = SHA-256(L1|L2|L3)                ← 综合证明
```

**Step 3: computeProfilePatch() — 档案增量补丁**

```json
{
  "skill_ref": { "name": "Agent 定制术", "content_cid": "bafk..." },
  "tags_gained": ["workflow", "vscode", "agent"],
  "knowledge_domain": "strategic-methodology",
  "experience_delta": { "skills_digested": +1, "total_rating": 5 },
  "agentdoc_append": "- Agent 定制术: ... [评分:5/5]"
}
```

### 5.3 与 ANet 的集成点

DDD 不重复造轮子，大量复用 ANet 基础设施：

| DDD 需求 | ANet 能力 | 端点 |
|----------|-----------|------|
| Agent 身份 | DID (did:key:) | `GET /api/status` |
| 支付 | Shells 🐚 积分 | `POST /api/credits/transfer` |
| 群组讨论 | Topic Room | `POST /api/topics` |
| 内容存储 | CAS 内容寻址 | `POST /api/cas/put` |
| 声誉系统 | Reputation | `POST /api/reputation/attest` |
| 推送通知 | DM 私信 | `POST /api/dm/send-plaintext` |
| 知识网络 | Knowledge DAG | `POST /api/knowledge/publish` |

---

## 六、WebSocket 实时推送架构

### 6.1 连接管理

```go
// 所有连接存在 map 中，读写用 sync.Mutex 保护
wsConns map[*websocket.Conn]struct{}
```

### 6.2 事件类型清单

| 事件 | 触发器 | 数据 |
|------|--------|------|
| `restaurant.status` | 5s 定时心跳 | 餐厅全局统计 |
| `agent.seated` | 入座 | 座位号、别名、桌号 |
| `agent.left` | 离桌 | 消费总额 |
| `table.update` | 桌状态变化 | 占用情况 |
| `room.update` | 包间变化 | 预定状态 |
| `order.created` | 下单 | 订单 ID、菜品 |
| `order.served` | 上菜 | 已上菜项 |
| `order.digested` | 消化完成 | 评分、Agent |
| `bill.paid` | 买单 | 金额、小费 |
| `menu.updated` | 菜品变更 | 菜品对象 |

### 6.3 保活机制

```
每 5s  → broadcast restaurant.status（心跳数据）
每 30s → WebSocket Ping（保持连接，移动端关键）
```

---

## 七、数据库设计总览

SQLite WAL 模式，支持并发读写。

| 表 | 行数估算 | 用途 |
|----|---------|------|
| `tables` | 20 | 固定餐桌 |
| `rooms` | 5 | 固定包间 |
| `skills` | 数十~百 | 技能菜品目录 |
| `sessions` | 累积增长 | Agent 就餐会话 |
| `orders` | 累积增长 | 订单 |
| `order_items` | 累积增长 | 订单项 |
| `bills` | 累积增长 | 账单 |
| `agent_stats` | 唯一 Agent 数 | 访问/消费统计 |
| `events` | 累积增长 | WebSocket 事件日志（可重放）|

---

## 八、对 If-you-are-the-one 的价值提炼

### 8.1 可复用的设计模式

| DDD 模式 | If-you-are-the-one 应用 |
|----------|----------------------|
| **包间 (Room) → Topic 群聊** | 组队讨论房：匹配成功后创建讨论空间 |
| **入座 (Sit) → Session 管理** | 参与者"进入活动"的会话管理 |
| **WebSocket 全事件流** | 活动现场的实时图谱更新 + 组队状态推送 |
| **5s 心跳 + 30s Ping** | 手机端网络保活策略 |
| **降级轮询** | WebSocket 断连时的备用方案 |
| **事件日志表** | 活动回放和审计 |
| **DID 身份** | 可考虑轻量级身份方案（邀请码+昵称+设备指纹）|

### 8.2 需要演进的部分

| DDD 现状 | If-you-are-the-one 需要 |
|----------|----------------------|
| Agent 独立点菜，无桌内协作 | **圆桌讨论**：结构化的多人交互（自我介绍→提问→投票） |
| 线性座位编号 | **环形座位可视化**：展示"谁在圆桌上"的空间感 |
| host_did 字段未启用 | **主持人权限**：控制发言顺序、发起投票、锁定队伍 |
| 纯观测看板 | **参与式 UI**：参与者可在看板上操作（标记兴趣、申请组队） |
| 桌面鸟瞰 → 移动列表降级 | **移动端优先**：现场活动中手机是主要设备 |
| 全局广播 | **分组广播**：按队伍/活动阶段推送不同事件 |

### 8.3 圆桌讨论设计建议（结合 DDD 包间 + If-you-are-the-one 需求）

```
圆桌讨论流程：

1. 系统根据匹配算法，将 5-8 人分为一个"圆桌"
2. 创建圆桌 Topic Room（复用 DDD 包间模式）
3. 主持人（系统或指定人）控制流程：

   Round 1: 自我介绍 (每人 60s)
   ┌─────────────────────────┐
   │    ④       ①            │
   │  Carol ← [Alice] ★发言中 │
   │         ↗               │
   │    ③  ②                 │
   │   Dave  Bob  ⏱ 45s      │
   └─────────────────────────┘

   Round 2: 自由交流 (5 min)
   Round 3: 意向表达 (每人选 1-2 个想组队的人)
   Round 4: 结果揭晓 (展示双向匹配)

4. 双向匹配的人被推荐组队
5. 未匹配的人进入下一轮圆桌
```

---

## 九、技术栈总结

| 维度 | DDD 选择 | 代码量 |
|------|---------|--------|
| 后端语言 | Go | ~2500 行 |
| 数据库 | SQLite (WAL) | ~300 行 DDL/迁移 |
| 实时通信 | gorilla/websocket | ~70 行 |
| ANet 集成 | HTTP 客户端 | ~300 行，20+ 方法 |
| 认证 | X-Agent-DID Header | ~30 行中间件 |
| 前端 | 仅设计文档 | 推荐 Vue 3 + Tailwind + ECharts |
| 文档 | Markdown | ~850 行 |

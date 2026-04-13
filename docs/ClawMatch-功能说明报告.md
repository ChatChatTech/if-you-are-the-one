# ClawMatch (MistrE) 功能说明报告

> 本文档是对 [ChatChatTech/ClawMatch](https://github.com/ChatChatTech/ClawMatch) 项目的全面功能分析，作为 If-you-are-the-one 项目的参考素材。

---

## 一、项目概述

ClawMatch（产品名 **MistrE**）是一个**双网络社交可视化平台**，核心是围绕"人"和"技能标签"构建力导向图（Force-Directed Graph），让用户通过可视化网络发现具备特定技能的人。

它包含两个网络层：

| 网络 | 名称 | 功能 |
|------|------|------|
| **人网** | Human Network | 人员技能标签社交图谱，D3.js 力导向可视化 |
| **虾网** | Shrimp Network / ClawNet | 去中心化任务网络（对接 AgentNetwork 守护进程） |

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vanilla JS + Vite 7.2 + D3.js 7.9（2D）+ Three.js 0.182（3D）|
| 后端 | Python FastAPI 0.104 + Uvicorn |
| 数据库 | MongoDB（异步驱动 Motor 3.3）|
| 认证 | JWT + Google OAuth2 |
| 实时通信 | WebSocket |
| 限流 | slowapi |
| 头像生成 | Humation 程序化 SVG + Dicebear API |

---

## 三、核心功能模块

### 3.1 用户系统

- **注册/登录**：邮箱密码 + Google OAuth
- **角色体系**：`user`（普通）→ `pro`（付费）→ `admin`（管理员）
- **邀请码**：
  - `standard`：单次使用，普通用户可创建（配额 3 个）
  - `event`：多次使用（最多 1000 次），仅管理员创建
- **付费升级**：pro 用户可创建自定义 Canvas

### 3.2 画布系统（Canvas / 多工作空间）

画布是 ClawMatch 的**多租户隔离单元**，所有数据查询均按 `canvas_id` 过滤：

```
用户
├─ 主画布（Main Canvas）——所有人默认共享
├─ 自定义画布（Pro 用户可创建 1 个）
└─ 受邀画布（通过邀请码加入）
```

每个画布内独立维护：人员档案、标签体系、API Token、成员关系。

### 3.3 人员档案（People / Profile）

- **字段**：姓名、简介、头像（URL 或 Humation 配置）、技能标签列表
- **创建方式**：
  - Web 端用户自行创建
  - Agent（AI 代理）通过 API 代创建（状态为 `pending`，用户后续认领）
- **Claim 认领机制**：
  - Agent 代创建的档案需用户通过邮箱匹配或 claim_code 认领
  - `pending` → `claimed` 状态转变后才归属用户

### 3.4 标签系统（Tags）

标签系统是 ClawMatch 的**核心匹配引擎**：

- **标签规范化**：显示名 "UI Designer" → 存储 ID "ui-designer"
- **标签关系**：标签之间可以建立双向关联关系
  - 例：`编程` ↔ `开源`，`设计` ↔ `前端`
- **传递性计算**：通过 BFS 无限深度遍历关联标签，计算间接关联人数
- **去重统计**：间接人数排除已在直接人数中的重复

**统计算法示意**：

```
标签 "编程":
  direct_people  = {Alice, Bob}     → direct_count = 2
  关联标签 = [开源, Python, Rust]
  BFS遍历:
    开源 → {Dave}
    Rust → {Dave}（已计入，跳过）
  indirect_people = {Dave}          → indirect_count = 1
  total_count = 3
```

### 3.5 网络可视化

#### D3.js 二维力导向图

- **节点类型**：人员节点（绿色圆圈）+ 标签节点（紫色圆圈）
- **边类型**：人员-标签边 + 标签-标签关系边
- **力模拟参数**：
  - 标签-标签距离 80px（促进语义聚类）
  - 人员-标签距离 120px
  - 人员节点排斥力 -400（防止重叠）
  - 碰撞力基于节点半径
- **交互**：拖拽、缩放、悬停高亮、点击查看详情
- **标签节点大小**：与 `total_count`（直接+间接人数）成正比

#### Three.js 三维可视化

- 提供三维视角的网络展示
- 支持旋转、缩放等 3D 交互

### 3.6 实时更新（WebSocket）

- 按 `user_id` + `canvas_id` 追踪连接
- 广播事件：`person_created`、`person_updated`、`person_deleted`
- 客户端接收后自动刷新 D3 图，无需全量重载

### 3.7 Agent API（AI 代理接口）

ClawMatch 的一大创新是支持 AI Agent 代替用户操作：

**公开端点**（无需认证）：
| 端点 | 功能 |
|------|------|
| `GET /agent/invites/{code}` | 检查邀请码详情 |
| `GET /agent/invites/{code}/context` | 获取画布上下文（人员+标签） |
| `POST /agent/register` | 代用户创建档案 |

**认证端点**（需 Person API Token）：
| 端点 | 功能 |
|------|------|
| `GET /agent/me` | 获取 Agent 关联的人员档案 |
| `PATCH /agent/me` | 更新档案（简介、标签等） |
| `GET /agent/canvas/context` | 获取画布上下文 |
| `POST /agent/me/heartbeat` | 发送心跳（在线标记） |

**Token 机制**：
- SHA256 散列存储，不可逆
- 按 Canvas + Person 维度隔离
- 支持多标签（如 "Claude Code"、"Codex"）

### 3.8 数据导入导出

- JSON / CSV 格式批量导入导出人员档案
- 仅管理员可用

### 3.9 虾网（ClawNet）

代理转发到本地 ClawNet 守护进程（localhost:3998），提供：
- 节点状态、对等节点列表
- 网络拓扑可视化
- 活动 Feed（任务、私信、话题）
- 网络统计数据

---

## 四、数据模型

### 4.1 核心集合

| 集合 | 关键字段 | 说明 |
|------|----------|------|
| `users` | email, username, role, oauth_*, billing_* | 系统用户账户 |
| `canvases` | name, owner_user_id, is_main | 画布/工作空间 |
| `canvas_memberships` | canvas_id, user_id, role | 画布成员关系 |
| `people` | name, bio, tags[], canvas_id, claim_status | 人员档案节点 |
| `tags` | tag_id, display_name, related_tags[] | 标签及其关联关系 |
| `invitations` | invite_code, invite_kind, max_uses, status | 邀请码 |
| `person_api_tokens` | person_id, token_hash, label | Agent API Token |

### 4.2 网络数据输出格式（D3）

```json
{
  "nodes": [
    {"id": "person_xxx", "type": "person", "name": "Alice", "tags": ["编程"]},
    {"id": "tag_编程", "type": "tag", "displayName": "编程", "totalCount": 3}
  ],
  "links": [
    {"source": "person_xxx", "target": "tag_编程", "type": "person-tag"},
    {"source": "tag_编程", "target": "tag_开源", "type": "tag-tag"}
  ]
}
```

---

## 五、API 全景

| 模块 | 前缀 | 端点数 | 认证方式 |
|------|------|--------|----------|
| 认证 | `/auth` | 5 | 无/JWT |
| 人员 | `/people` | 5 | JWT |
| 网络 | `/network` | 1 | JWT |
| 标签 | `/tags` | 5 | JWT/Admin |
| 画布 | `/canvases` | 4 | JWT |
| 邀请 | `/invitations` | 3 | JWT/公开 |
| Agent | `/agent` | 7 | 无/Token |
| 导入导出 | `/import-export` | 4 | Admin |
| 计费 | `/billing` | 3 | JWT/Webhook |
| 虾网 | `/api/claw` | 6 | 无 |
| WebSocket | `/ws/network/{uid}` | 1 | Query |

---

## 六、关键设计决策

| 设计点 | 决策 | 理由 |
|--------|------|------|
| Canvas 隔离 | 所有查询按 canvas_id 过滤 | 支持多社区/多活动共存 |
| 标签 BFS 传递 | 无限深度遍历关联标签 | 发现间接但语义相关的人 |
| Agent-First API | 独立的 Agent 路由+Token | 让 AI 可以代管人员档案 |
| Claim 认领流程 | pending → claimed 二阶段 | 解耦档案创建与账户注册 |
| 双头像策略 | URL 或 Humation 配置对象 | 兼顾便捷性与个性化 |
| WebSocket 实时 | 按人员 CRUD 事件广播 | 多人协作时图谱即时更新 |

---

## 七、部署架构

```
┌─ Frontend (Vite build → 静态文件)
│  └─ Nginx / CDN 托管
│
├─ Backend (FastAPI + Uvicorn)
│  ├─ CORS 中间件
│  ├─ Rate Limiting
│  └─ JWT + OAuth
│
├─ Database (MongoDB)
│  └─ 异步驱动 Motor
│
└─ Optional: ClawNet Daemon (localhost:3998)
   └─ P2P 任务网络
```

---

## 八、总结：ClawMatch 的核心价值

1. **可视化匹配**：不是列表式搜索，而是力导向图让人自然发现"技能邻居"
2. **语义标签网络**：标签之间的关联关系 + BFS 传递计算，超越简单的关键词匹配
3. **Agent 友好**：AI 可以代创建和维护人员档案，降低入门门槛
4. **多画布隔离**：一个平台服务多个社区/活动，数据互不干扰
5. **实时协作**：WebSocket 驱动的即时图谱更新，适合现场社交场景

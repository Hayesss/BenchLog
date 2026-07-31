# BenchLog 实验记录平台

湿实验 × 生信的一体化记录台：实验记录、方法库、样本盒、小鼠台账、生信分析、AI 助手，一个工作台全部装下。

- 多租户隔离：每个账号只能看到并操作自己的数据（服务端 userId 强制过滤）
- 双登录体系：Kimi OAuth 一键登录 + 本地账号密码注册（scrypt 哈希）
- 只读分享：记录与生信分析可生成公开只读链接，免登录查看，随时撤销
- AI 副驾：多模型档案（Kimi/GLM/DeepSeek 一键预设）、项目级上下文、流式对话、写操作先确认
- 极速体验：静态资源 Brotli 预压缩（首屏传输 -78%）+ 一年强缓存 + React Query 智能缓存

## 目录

- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [使用教程](#使用教程)
  - [1. 注册登录与工作台](#1-注册登录与工作台)
  - [2. 实验方法（Protocols）](#2-实验方法protocols)
  - [3. 方法库（Library）](#3-方法库library)
  - [4. 湿实验记录（Records）](#4-湿实验记录records)
  - [5. 实验安排（Schedule）与待办整理](#5-实验安排schedule与待办整理)
  - [6. 小鼠管理（Mice）](#6-小鼠管理mice)
  - [7. 样本库（Samples）](#7-样本库samples)
  - [8. 生信分析（Bioinfo）](#8-生信分析bioinfo)
  - [9. AI 助手（Assistant）](#9-ai-助手assistant)
  - [10. 分享与协作（Share）](#10-分享与协作share)
  - [11. 收集箱与回收站](#11-收集箱与回收站)
  - [12. 命令面板与全局搜索](#12-命令面板与全局搜索)
- [站内 Git 仓库架构说明](#站内-git-仓库架构说明)
- [项目结构](#项目结构)
- [数据库表一览](#数据库表一览)
- [常用命令](#常用命令)
- [安全与隐私](#安全与隐私)

## 核心特性

| 模块 | 能力 |
| --- | --- |
| 工作台 | 今日议程、项目进展、最近记录、快捷入口一屏总览 |
| 湿实验记录 | 项目/标签/状态组织，图文混排，版本历史，软删除回收站 |
| 实验方法 | 结构化步骤 + 版本快照，记录可引用方法 |
| 方法库 | 内置 12 章 213 条经典方法条目，支持自建 |
| 样本库 | 盒子-格位可视化管理，与记录双向关联 |
| 小鼠台账 | 品系/笼位/个体/繁殖记录，基因型检索 |
| 生信分析 | 一键建仓（站内 Git）、可复现性字段（命令/环境/路径）、技能库 |
| AI 助手 | 多模型档案、项目级上下文注入、@引用记录、流式输出、工具调用确认制 |
| 分享协作 | 记录/分析只读公开链接（32 位不可枚举 token，可撤销） |
| 汇报导出 | 按项目/时间范围导出汇报材料 |

## 技术栈

- **前端**：React 19 + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui + TanStack Query + tRPC client（superjson）+ framer-motion
- **后端**：Hono（Node）+ tRPC 11 + Drizzle ORM + jose（JWT 会话）
- **数据库**：MySQL 8 / TiDB（planetscale 模式驱动）
- **AI**：任意 OpenAI 兼容接口（Moonshot/Kimi、GLM、DeepSeek 等），多档案管理
- **性能**：构建时 Brotli/Gzip 预压缩 + 分级缓存头（hash 产物一年 immutable）+ React Query staleTime
- **部署**：单进程（前端静态产物 + API 同端口），`node dist/boot.js` 即起

## 快速开始

### 环境要求

- Node.js ≥ 20
- MySQL 8+（或 TiDB 等兼容实例）

### 1. 克隆与安装

```bash
git clone https://github.com/Hayesss/BenchLog.git
cd BenchLog
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
# 后端
APP_ID=                   # OAuth 应用 ID
APP_SECRET=               # 应用密钥（用于 JWT 会话签名，务必高强度随机）

# 数据库
DATABASE_URL=             # MySQL 连接串，如 mysql://user:pass@host:3306/benchlog

# 前端（经 Vite 暴露给浏览器）
VITE_KIMI_AUTH_URL=       # Kimi OAuth 服务地址
VITE_APP_ID=              # OAuth 应用 ID

# 后端认证
KIMI_AUTH_URL=            # Kimi OAuth 服务地址（后端）
KIMI_OPEN_URL=            # Kimi 开放平台地址

# 管理员
OWNER_UNION_ID=           # 创建者的 Union ID，该用户首次登录即为 admin

# 可选：本地账号注册开关（默认开放；设为 false 关闭自助注册）
REGISTRATION_ENABLED=true
```

注意：`.env` 已在 `.gitignore` 中，请勿提交任何真实密钥。AI 助手的 LLM API Key 无需写在环境变量中，登录后在「AI 助手 → 模型设置」页自行配置（仅存服务端）。

### 3. 初始化数据库

```bash
# 推送全部表结构（drizzle-kit）
npx drizzle-kit push

# 导入内置方法库（12 章 213 条方法条目）
npx tsx scripts/seed-method-library.ts
```

存量库升级：每次功能更新附带的幂等迁移脚本位于 `scripts/`，按需执行（如 `npx tsx scripts/add-password-auth.ts` 为老库补 `passwordHash` 列；新库 `drizzle-kit push` 已含全部字段）。

### 4. 启动

```bash
# 开发模式：Vite + Hono 同端口热更新（http://localhost:3000）
npm run dev

# 生产模式：构建前端 → 预压缩静态资源 → 打包服务端 → 启动
npx vite build --outDir dist/public --emptyOutDir
node scripts/compress-assets.mjs dist/public
npx esbuild api/boot.ts --bundle --platform=node --format=esm \
  --outfile=dist/boot.js --external:mysql2 --external:drizzle-orm \
  --external:@trpc/server --external:zod --external:dotenv --external:superjson
NODE_ENV=production node dist/boot.js
```

## 使用教程

### 1. 注册登录与工作台

BenchLog 提供两种登录方式，数据均按账号隔离：

- **Kimi 账号一键登录**：点击「使用 Kimi 账号登录」跳转授权，首次登录自动创建专属工作台
- **本地账号注册**：登录页切到「注册新账号」，用户名（3-32 位字母/数字/下划线/短横线）+ 密码（≥8 位）即可创建；之后在「账号登录」页签用同一凭据进入。部署方可通过 `REGISTRATION_ENABLED=false` 关闭自助注册

登录后默认落在**工作台**：今日议程（到期待办与流程节点红点提醒）、项目进展、最近记录与快捷入口一屏总览。

**界面操作（Open WebUI 式布局）**：

- 左侧边栏可通过 logo 旁的收起按钮完全折叠（偏好自动记忆），顶栏左侧按钮重新展开
- 边栏顶部搜索框或 `⌘K / Ctrl+K` 唤起命令面板
- 底部头像弹出用户菜单，可查看账号类型（Kimi / 本地账号）并退出登录

### 2. 实验方法（Protocols）

结构化的实验步骤库：每份方法支持富文本步骤、材料清单与注意事项，修改自动生成**版本快照**，可随时回溯。湿实验记录可引用方法，保持实验与方法版本的可追溯链。

### 3. 方法库（Library）

内置 12 章 213 条经典分子生物学/细胞生物学方法条目（全局共享的预置内容），支持关键词检索；也可创建私有条目，沉淀实验室自己的 SOP。

### 4. 湿实验记录（Records）

- 按**项目**与**标签**组织，状态机（进行中/已完成/失败）一目了然
- 图文混排：电泳条带、平板照片直接上传，附说明文字
- 每次编辑留**版本历史**，误删进回收站（30 天内可恢复）
- 详情页可生成**只读分享链接**（见第 10 节）

### 5. 实验安排（Schedule）与待办整理

日历视图管理流程节点与待办；「待办整理」按追加优先策略把零散待办并入当日完成段，保持台账连贯。

### 6. 小鼠管理（Mice）

品系 → 笼位 → 个体三级台账，支持基因型/性别/状态检索；繁殖记录关联亲本与子代，出生自动入笼。

### 7. 样本库（Samples）

盒子-格位二维可视化：冻存盒拖拽布局，每个格位登记样本类型、浓度、来源记录，与湿实验记录双向跳转。

### 8. 生信分析（Bioinfo）

#### 8.1 新建分析（一步完成建仓）

填写名称、pipeline 类型、数据/结果路径，创建即自动初始化**站内 Git 仓库**（存分析脚本与 Snakefile/Nextflow 配置）。

#### 8.2 分析详情与可复现性

登记命令行、运行环境（镜像/集群/版本）、输入数据路径、结果路径、仓库 commit——任何同事拿到页面即可原样复跑。仓库支持在线浏览提交历史与文件 diff。

#### 8.3 技能库

常用生信操作（质控/比对/定量/注释）沉淀为可复用技能卡片，含参数模板。

#### 8.4 学习指南

内置分章节的生信入门教程，边学边做。

### 9. AI 助手（Assistant）

以你的项目、实验记录、方法与收集箱为上下文的科研副驾（Open WebUI 式交互）：

- **多模型档案**：「模型设置」里可建多套配置（Kimi/GLM/DeepSeek 一键预设，支持任意 OpenAI 兼容接口），各档案独立 API Key、模型、限额与推理档；对话页顶部**模型选择器**随聊随切
- **项目级上下文**：会话归属某项目时，自动注入该项目全部记录；「副驾快聊」则携带最近 15 条。从侧边栏项目行、项目管理页均可一键发起项目对话
- **欢迎页直发**：未选会话时直接在欢迎页输入即自动开启新对话；快捷提示一键发起
- **会话管理**：新对话主按钮、按「今天/昨天/过去 7 天/过去 30 天/更早」分组、标题搜索
- **@引用记录**：输入 @ 唤起记录引用，回答锚定具体实验
- **操作模式**：开启后 AI 可提议创建待办/收集箱，**确认后才真正落库**；关闭时为流式快聊
- 测试连接：设置页内一键探测连通性（30 秒超时，最小 token 探测）

### 10. 分享与协作（Share）

记录详情页与生信分析详情页均有「分享」按钮：

- 生成公开只读链接：`/share/<token>`（32 位十六进制随机 token，不可枚举）
- 打开链接**无需登录**，看到排版精美的只读页（含目的/结果/图片/可复现信息）
- 同一目标重复创建复用同一链接；「撤销」后链接立即 404
- 目标删除后链接同步失效；页面绝不暴露账号信息（仅显示分享者昵称）

### 11. 收集箱与回收站

- **收集箱**：快速想法/快速结果速记（移动端底部中央 + 号、AI 回答一键存入），日后转正为正式记录
- **回收站**：软删除的记录/分析在此保留，可恢复或彻底删除

### 12. 命令面板与全局搜索

`⌘K / Ctrl+K` 唤起：页面跳转（输中文名直达）、跨模块搜索（货号、细胞系、标签、记录标题），键盘上下选择回车进入。

## 站内 Git 仓库架构说明

生信分析的脚本仓库不走外部 Git 服务，而是用四张表模拟 Git 对象模型：

- `git_blobs`：文件内容（按 SHA 去重）
- `git_trees`：目录树（文件名 → blob/tree 的映射）
- `git_commits`：提交（父指针链 + 消息 + 作者）
- `git_refs`：分支指针（如 `refs/heads/main`）

每次「保存脚本」= 写入 blobs → 组装 tree → 生成 commit → 推进 ref。在线浏览历史与 diff 即是遍历这条链，与真实 Git 语义一致，未来可平滑迁移到外部仓库。

## 项目结构

```
├── api/                    # 服务端（Hono + tRPC）
│   ├── boot.ts             # 进程入口（静态产物 + API 同端口）
│   ├── router.ts           # tRPC 总路由
│   ├── auth-router.ts      # 登录会话：me/logout + 本地注册/密码登录
│   ├── kimi/               # Kimi OAuth 与 JWT 会话（jose HS256）
│   ├── lib/                # env / cookies / password(scrypt) / vite(静态服务)
│   ├── queries/            # Drizzle 连接与通用查询
│   ├── recordRouter.ts     # 湿实验记录
│   ├── protocolRouter.ts   # 实验方法
│   ├── libraryRouter.ts    # 方法库
│   ├── sampleRouter.ts     # 样本库
│   ├── mouseRouter.ts      # 小鼠台账
│   ├── bioinfoRouter.ts    # 生信分析 + 站内 Git
│   ├── aiRouter.ts         # AI 对话/会话/项目归属
│   ├── aiProfileRouter.ts  # LLM 模型档案（多配置/预设/探测）
│   ├── shareRouter.ts      # 分享链接管理
│   ├── share/public.ts     # 公开只读端点（免登录）
│   └── ...                 # 其余领域路由
├── db/schema.ts            # 全部表定义（33 张）
├── src/
│   ├── components/
│   │   ├── Layout.tsx      # 可折叠侧边栏 + 搜索入口 + 用户菜单
│   │   ├── Navbar.tsx      # 桌面顶栏（面包屑/⌘K/议程铃铛/新建）
│   │   ├── CommandPalette.tsx / QuickCapture.tsx
│   │   ├── assistant/AiModelSettings.tsx   # 模型档案双视图设置
│   │   └── share/ShareButton.tsx           # 分享弹层
│   ├── pages/              # 各业务页（Assistant 为 Open WebUI 式三栏）
│   └── providers/trpc.tsx  # tRPC client（全局 staleTime 60s）
├── scripts/                # 建表/迁移/种子/预压缩脚本
└── dist/                   # 构建产物（前端 + 预压缩 + boot.js）
```

## 数据库表一览

| 域 | 表 |
| --- | --- |
| 账号 | `users`（含 `passwordHash` 本地凭据）、`user_activity` |
| 项目与标签 | `projects`、`tags` |
| 方法 | `protocols`、`protocol_versions` |
| 记录 | `records`、`record_images`、`record_attachments`、`record_versions` |
| 安排 | `flows`、`todos`、`export_logs` |
| 生信 | `bioinfo_analyses`、`bioinfo_skills`、`git_blobs`、`git_trees`、`git_commits`、`git_refs` |
| 方法库 | `method_chapters`、`method_entries` |
| AI | `ai_settings`（旧单配置，兼容兜底）、`ai_model_profiles`（多档案）、`ai_conversations`、`ai_messages` |
| 分享 | `shares`（token/kind/target/revokedAt） |
| 速记 | `quick_notes` |
| 样本 | `sample_boxes`、`samples` |
| 小鼠 | `mouse_strains`、`mouse_cages`、`mice`、`mouse_breeding` |

## 常用命令

```bash
npm run dev                 # 开发模式（前后端同端口热更新）
npx tsc -b                  # 全量类型检查（根 tsconfig 为 references 模式）
npx drizzle-kit push        # 推送表结构
node scripts/compress-assets.mjs dist/public   # 静态资源 Brotli/Gzip 预压缩
NODE_ENV=production node dist/boot.js          # 生产启动
```

## 安全与隐私

- **多租户隔离**：所有查询服务端按 `userId` 强制过滤，前端隐藏仅为体验层
- **密码存储**：本地账号使用 scrypt（N=16384）加盐哈希，格式 `scrypt:N:salt:hash`；登录失败统一措辞不泄露账号是否存在；`passwordHash` 从不下发到前端
- **会话**：JWT（HS256）httpOnly cookie，一年有效期，密钥由 `APP_SECRET` 控制
- **API Key**：LLM Key 仅存服务端，接口只回传 `hasApiKey` 与前 6 位预览
- **分享链接**：16 字节随机 token（32 位 hex，不可枚举），可即时撤销，公开页字段白名单
- **AI 写操作**：工具调用一律用户确认后落库

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

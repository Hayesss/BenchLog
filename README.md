# BenchLog 实验记录平台

BenchLog 是一套面向生物实验室的数字化记录平台，把「湿实验」（wet-lab）与「生信分析」（dry-lab）两条工作线放进同一个系统：实验方法沉淀、实验记录、跨天流程安排、生信分析的可复现性锚定（内置 Git 仓库）、代码片段技能库、方法知识库与汇报导出，一站式完成。

## 目录

- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [使用教程](#使用教程)
  - [1. 登录与工作台](#1-登录与工作台)
  - [2. 实验方法（Protocols）](#2-实验方法protocols)
  - [3. 方法库（Library）](#3-方法库library)
  - [4. 湿实验记录（Records）](#4-湿实验记录records)
  - [5. 实验安排（Schedule）](#5-实验安排schedule)
  - [6. 生信分析（Bioinfo）](#6-生信分析bioinfo)
  - [7. 汇报导出（Export）](#7-汇报导出export)
  - [8. 命令面板与全局搜索](#8-命令面板与全局搜索)
- [站内 Git 仓库架构说明](#站内-git-仓库架构说明)
- [项目结构](#项目结构)
- [数据库表一览](#数据库表一览)
- [常用命令](#常用命令)
- [部署说明](#部署说明)

## 核心特性

- 干湿实验并列：湿实验记录与生信分析记录在导航中平级呈现，统一归属项目。
- 实验方法管理：方法（Protocol）支持材料清单、分组步骤、参数模板、分类与标签；每次迭代自动留存版本快照，记录页可精确引用「方法 + 版本」。
- 常用方法手动钉选：工作台「常用方法」默认按使用次数排序，可在任意方法卡片上点亮星标手动置顶，置顶项优先展示，其余按使用次数补齐。
- 湿实验记录：关联项目与方法版本，自动比对参数偏差（默认值 vs 实际值），支持结果图片（WB 条带、流式图、显微镜照片等，base64 直接入库）、Markdown 结果摘要、结论与下一步计划。
- 实验安排：跨天流程（如 铺板 → 转染 → 收样）以节点时间线管理，配合单点待办 checklist 按日归集。
- 生信分析专区：
  - 分析记录：登记 pipeline 类型、输入数据（SRA/GEO 编号等）、运行环境锁定、运行命令、结果摘要，并以 commit 哈希锚定代码版本，保证可复现。
  - 站内 Git 仓库：代码无需离开网站，直接上传文件或粘贴代码即可在站内建仓、提交 commit、浏览历史与文件树，commit 可一键锚定到分析记录；SHA-1 与真实 git 完全兼容。
  - 技能库：沉淀常用代码片段（Bash/R/Python/Nextflow/Snakemake），按分类与语言筛选、关键词搜索、一键复制。
  - 学习指南：内置 BioML Guide（生物机器学习学习指南）静态站点，随开随学，无需外网跳转。
- 汇报导出：按时间范围与项目把实验记录导出为 Markdown / 表格 / PDF 周报月报，保留导出历史。
- 全局体验：命令面板（Ctrl/Cmd + K）直达全部页面与动作，全局搜索跨模块检索，活跃日历可视化每日工作量。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS、Radix UI（shadcn 风格组件）、TanStack Query |
| 后端 | Hono（Node）、tRPC（端到端类型安全）、zod 校验、superjson 序列化 |
| 数据库 | MySQL + Drizzle ORM（schema 即文档，`db/schema.ts`） |
| 认证 | Kimi OAuth 登录（JWT 会话），首个 OWNER_UNION_ID 用户自动获得 admin 角色 |
| 站内 Git | 自研 content-addressed 对象库（MySQL 持久化），SHA-1 算法与 git 二进制交叉验证一致 |

## 快速开始

### 环境要求

- Node.js 20 及以上
- MySQL 8 及以上（一个已创建的空数据库）
- pnpm / npm 均可

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
APP_SECRET=               # 应用密钥（用于 JWT 签名）

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
```

注意：`.env` 已在 `.gitignore` 中，请勿提交任何真实密钥。

### 3. 初始化数据库

```bash
# 推送全部表结构（drizzle-kit）
npm run db:push

# 导入内置方法库（12 章 213 条方法条目）
npx tsx scripts/seed-library.ts
```

仓库另有若干幂等建表/补列脚本（`scripts/create-*.ts`、`scripts/alter-*.ts`），在新部署或升级时按需执行一次即可，重复执行不会产生副作用。

### 4. 启动

```bash
# 开发模式：Vite + Hono 同端口热更新（http://localhost:3000）
npm run dev

# 生产模式
npm run build     # 前端打包到 dist/public，后端打包到 dist/boot.js
npm start         # NODE_ENV=production node dist/boot.js
```

## 使用教程

### 1. 登录与工作台

- 打开站点后跳转 Kimi OAuth 登录，登录成功回到工作台（`/`）。
- 工作台提供五个快捷新建方块：新建记录、新建方法、新建流程、新建待办、新建分析。
- 「常用方法」卡片：星标置顶的方法排在最前（按置顶时间倒序），其余按使用次数自动补齐，最多展示 4 个。
- 活跃日历：按日展示记录数与登录活跃，快速回顾工作密度。
- 「最近湿实验记录」「最近生信分析」直达详情。

### 2. 实验方法（Protocols）

路径：`/protocols`，承载可复用的实验方法（SOP）。

1. 新建方法：点击「新建方法」，填写名称、分类、颜色、描述与版本号（默认 v1.0）。
2. 编辑结构：
   - 材料清单：试剂/耗材逐项登记；
   - 步骤分组：把步骤按阶段分组（如「第一天：铺板」「第二天：转染」），组内步骤有序排列；
   - 参数模板：登记关键参数及默认值（如 温度 37 ℃、时间 16 h），实验记录页将基于这些默认值自动识别偏差。
3. 版本管理：每次保存迭代生成新版本并留存旧版快照（`protocol_versions`），详情页可回看任意历史版本。
4. 钉选星标：卡片右上角与详情页头部均有星标开关；点亮后该方法进入工作台「常用方法」前排。
5. 模板方法：内置模板不可钉选、不可随意改动，可另存为自己的方法再编辑。

### 3. 方法库（Library）

路径：`/library`，全局共享的方法知识库（无用户隔离，由种子脚本维护）。

- 12 个章节、213 条条目，覆盖：核酸提取/PCR/分子克隆、CRISPR 基因编辑、蛋白质技术、细胞培养/转染/病毒包装、流式细胞术、显微成像、单细胞组学、空间组学、表观与互作组学、类器官/干细胞/疾病模型、免疫学与动物实验、微生物与微生物组。
- 条目分两类：`full`（完整方案，含目的、原理、步骤）与 `pointer`（跨章指引）。
- 条目附来源信息（期刊、年份、DOI），详情页可逐步骤查阅。
- 更新方法库：替换 `api/seed/methods.json` 后重新执行 `npx tsx scripts/seed-library.ts`（脚本会重建 `method_chapters` / `method_entries` 两表）。

### 4. 湿实验记录（Records）

路径：`/records`，与「生信分析」平级的湿实验记录本。

1. 新建记录：工作台方块或列表页按钮进入，选择项目、关联方法及其版本，填写标题、日期与实验目的。
2. 参数偏差：关联方法版本后，页面自动列出参数默认值；填入实际值后偏差项自动高亮，可补充偏差原因。
3. 结果与图片：结果摘要支持 Markdown；结果图片（WB 条带、流式图、显微镜照片等）直接粘贴/上传，以 base64 存入数据库，跨版本、跨部署不丢失；每张图可标注类型与说明。
4. 结论与下一步：分别填写结论（conclusion）与下一步计划（nextStep），导出汇报时自动汇总。
5. 状态流转：进行中 / 已完成 / 已失败（ongoing / done / failed），列表页按状态、项目、标签筛选。

### 5. 实验安排（Schedule）

路径：`/schedule`，管理跨天流程与每日待办。

- 跨天流程（Flow）：如「铺板 → 转染 → 收样」，创建流程后逐日添加节点（日期 + 节点名），时间线视图直观呈现每个流程进行到哪一天；可关联项目与方法。
- 单点待办（Todo）：按日期归集的 checklist，可勾选完成，也可关联到具体实验记录。
- 日历视图汇总流程节点与待办，方便安排每日实验量。

### 6. 生信分析（Bioinfo）

路径：`/bioinfo`，生信侧的工作台，含三个页签：分析记录、技能库、学习指南。

#### 6.1 新建分析（一步完成建仓）

1. 进入 `/bioinfo/new`，先选择项目、填写分析名称与日期。
2. 「代码仓库」区块紧随其后：可直接上传代码文件（单文件不超过 512 KB）或粘贴代码，暂存多个文件（单次最多 50 个），并填写首条提交信息。
3. 点击创建后系统一次完成：创建分析记录 → 站内建仓 → 提交首个 commit → 自动把该 commit 锚定为分析的代码版本。
4. 若你使用外部仓库（GitHub/GitLab/Gitee），在仓库地址栏填写链接即可，系统不会覆盖为站内仓库。

#### 6.2 分析详情与可复现性

- 基本信息：pipeline 类型（Nextflow / Snakemake / WDL / 手动脚本 / R / Python / Galaxy / 其他）、状态（running / done / failed）。
- 代码仓库：详情页内嵌仓库面板，含「文件」与「提交历史」两个页签：
  - 文件页签：浏览任一 commit 的文件树，点击查看代码全文，支持复制；
  - 提交历史：时间线展示每次 commit 的变更统计（新增/修改/删除文件数）、提交信息与时间；HEAD 与已锚定的 commit 有专属徽章；任意历史 commit 可「锚定此 commit」更新分析的代码版本。
- 可复现性区块：输入数据（数据集、SRA/GEO 编号、校验值）、运行环境锁定（conda env、Docker 镜像、软件版本）、运行命令与关键参数。
- 结果区块：Markdown 结果摘要、结论与下一步。
- 使用站内仓库时仓库地址显示为「站内」，锚定 commit 以短哈希徽章展示。

#### 6.3 技能库

页签「技能库」（直达链接 `/bioinfo?tab=skills`）：

- 沉淀常用代码片段：标题、用途说明、代码本体、出处链接。
- 分类：文件处理、比对与定量、差异与统计、可视化、单细胞、流程与环境、其他。
- 语言：Bash、R、Python、Nextflow、Snakemake、其他。
- 支持分类/语言双筛选与关键词搜索（匹配标题、说明与代码），卡片预览前 4 行代码，一键复制完整代码。
- 查看对话框内可直接编辑或删除（删除有二次确认）。

#### 6.4 学习指南

页签「学习指南」（直达链接 `/bioinfo?tab=guide`）：内置 BioML Guide（源自开源仓库 Hayesss/bioml-guide）编译产物，静态自托管于 `/guide/`，iframe 同源嵌入，离线可浏览；页面顶部保留源仓库归属与外链。

### 7. 汇报导出（Export）

路径：`/export`。

- 选择时间范围与项目范围，把湿实验记录（含目的、偏差、结果、结论、下一步）汇总导出。
- 支持格式：Markdown、表格、PDF；导出内容存档于 `export_logs`，可在历史列表回看与再次下载。

### 8. 命令面板与全局搜索

- 任意页面按 Ctrl/Cmd + K 唤起命令面板：直达所有页面（含「生信技能库」「生信学习指南」深链接）与常用新建动作。
- 全局搜索跨模块检索记录、方法、生信分析与方法库条目。

## 站内 Git 仓库架构说明

站内仓库是本项目的特色设计，要点如下：

- 对象模型与 git 一致：blob、tree、commit、ref 四类对象，SHA-1 计算严格遵循 git 规则（blob 为 `sha1("blob {size}\0{content}")`，tree 按 git 排序规则序列化，commit 为标准文本格式），已与真实 git 二进制交叉验证逐字节一致。
- 存储位置：对象以内容寻址方式存入 MySQL（`git_blobs` / `git_trees` / `git_commits` / `git_refs` 四表），不依赖服务器本地磁盘，避免部署环境磁盘易失导致代码丢失；blob/tree 为去重共享池。
- 限制（保护数据库）：单文件不超过 512 KB，单次 commit 最多 50 个新文件，单仓库文件数上限 200，路径长度上限 200 字符，路径禁止 `..`、`\` 与重复斜杠。
- 幂等与并发：同 SHA 对象重复写入自动跳过；提交时基于 HEAD tree 合并变更，无实际变更（内容一致）会被拒绝并提示。
- 数据清理：删除分析时清理该分析的 ref 与 commit 链，共享 blob/tree 池保留。

## 项目结构

```
├── api/                  # 后端：Hono + tRPC
│   ├── boot.ts           # 生产入口（静态服务 + API）
│   ├── router.ts         # tRPC 根路由（聚合各模块路由）
│   ├── *Router.ts        # 各业务路由（protocol/record/bioinfo/git/...）
│   ├── lib/gitstore.ts   # 站内 Git 对象库引擎
│   └── seed/methods.json # 方法库种子数据（12 章 213 条）
├── db/
│   ├── schema.ts         # 全部表结构（Drizzle）
│   └── relations.ts      # 表关系定义
├── scripts/              # 建表/补列/种子脚本（npx tsx 执行，幂等）
├── src/
│   ├── pages/            # 页面（Dashboard/Protocols/Records/Schedule/Bioinfo/...）
│   ├── components/       # 组件（含 bioinfo/ 下的 RepoPanel/SkillsPanel/GuidePanel）
│   └── App.tsx           # 前端路由表
├── public/guide/         # BioML Guide 编译产物（静态自托管）
└── contracts/            # 前后端共享类型
```

## 数据库表一览

| 表 | 用途 |
| --- | --- |
| users | 用户与角色 |
| projects / tags | 项目与标签 |
| protocols / protocol_versions | 实验方法与版本快照 |
| records / record_images | 湿实验记录与结果图片（base64） |
| flows / todos | 跨天流程与每日待办 |
| bioinfo_analyses | 生信分析记录（可复现性锚点） |
| git_blobs / git_trees / git_commits / git_refs | 站内 Git 对象库 |
| bioinfo_skills | 生信技能库（代码片段） |
| method_chapters / method_entries | 方法库章节与条目（全局共享） |
| user_activity | 活跃日历打点 |
| export_logs | 汇报导出历史 |

## 常用命令

```bash
npm run dev          # 开发模式（前后端同端口 :3000，热更新）
npm run build        # 生产构建（前端 dist/public + 后端 dist/boot.js）
npm start            # 生产启动
npm run check        # TypeScript 类型检查（tsc -b）
npm run lint         # ESLint
npm run test         # Vitest
npm run db:push      # 推送数据库表结构
npx tsx scripts/seed-library.ts   # 重建方法库种子数据
```

## 部署说明

1. 准备 MySQL 数据库并配置 `.env`（见上文环境变量表）。
2. 执行 `npm run db:push` 与种子脚本完成建表与初始化数据。
3. `npm run build && npm start`，服务默认监听 3000 端口（可用 `PORT` 环境变量覆盖）。
4. 生产模式由 `dist/boot.js` 统一服务前端静态资源与 `/api` 接口，前端路由自动回退到 `index.html`，无需额外配置 nginx rewrite。
5. 结果图片与站内 Git 对象均存数据库，备份数据库即完成全量数据备份。

---

BenchLog · 让每一次实验都有据可查，让每一行分析代码都可复现。

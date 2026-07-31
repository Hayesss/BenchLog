# 更新日志

BenchLog 各版本详细改动记录（新→旧）。每次推送同步更新本文件。

---

## 2026-07-31 · #20 协作与分享第一期：只读分享链接（仿 Benchling）+ 登录页重设计

- 数据层：新表 `shares`（token 16 字节 hex 唯一/kind=record|analysis/targetId/revokedAt）
- 后端：`shareRouter`（trpc `share.*`）——create（目标归属+未软删校验，同目标幂等复用同 token）/revoke（即时失效，重复拦截）/list（含目标标题与撤销态）；公开端点 GET `/api/share/:token` 免登录（`getSharedPayload`：token 格式校验、撤销/目标删除→404、绝不暴露 userId/邮箱/附件本体，记录含图片联查 projectName/protocolTitle）
- 前端：`/share/:token` 公开只读页（Layout 外路由，BenchLog 顶栏+只读徽标，记录=状态/标签/目的/结果 Markdown/图片画廊/结论/下一步，分析=可复现信息表/命令/结果摘要，404 友好态，页脚署名 sharedBy+日期）；记录与生信详情页头部加「分享」按钮（复用组件 ShareButton：创建/复制/撤销弹层）
- 登录页重设计（仿 Benchling）：浅绿白渐变底 + SVG DNA 双螺旋波形装饰（错相正弦+横档+圆点，斜向穿越）、居中白卡大柔影、logo+slogan「湿实验 × 生信的一体化记录台」、bench-deep 深色主按钮、功能 chips 速览、卡片下方「首次登录自动创建工作台」小字
- 验证：tsc 全过；冒烟 7 断言全过（幂等复用/归属拦截/payload 脱敏/非法 token/revoke 失效/analysis kind/清理）；bundle 复核全 OK
- 范围说明（#20 后续期）：团队成员与角色、评论@提及、任务指派未在本期；分享粒度=单条记录/分析，无批量分享

---

## 2026-07-31 · 项目 × AI 助手双向打通（以项目内容为上下文的对话）

- 项目侧入口：侧边栏项目行 hover 出现 AI 图标、/projects 管理页项目卡操作行加「AI 对话」，均跳 `/assistant?project=<id>`
- AI 助手页：支持 `?project=<id>` URL 参数直达并自动选中该项目（项目不存在/已归档自动回落副驾快聊）；左栏项目切换同步 URL（replace 不堆历史）
- 会话归属可改：新接口 `ai.setConversationProject`（会话/项目双重归属校验，null=副驾快聊）；对话头部项目徽标改为 Popover 切换器——移入/移出项目即时生效，并明示「项目会话上下文=该项目全部记录，副驾快聊=最近 15 条」；移动后左栏过滤自动跟随
- 验证：tsc 全过；冒烟 5 断言全过（移入联查 projectName/不存在项目与对话拦截/移回/清理）；bundle 复核全 OK

---

## 2026-07-31 · AI 模型档案：设置体系吸收 wisp-science（多档案/预设/限额/测试连接）

- 数据层：新表 `ai_model_profiles`（label/provider/apiUrl/model/apiKey/maxTokens/contextWindow/reasoningEffort/active/sortOrder）；迁移脚本幂等建表并把 ai_settings 存量配置自动转为首个 active 档案（1 个用户已迁移）
- 后端：新 `aiProfileRouter`（trpc `aiProfile.*`）——list（key 脱敏 hasApiKey/keyPreview）/create（首档案自动 active）/update（apiKey 三态）/remove（active 拦截）/setActive（互斥）/reorder（越权拦截）/test（对齐 wisp validate_settings：探测消息 "Reply with OK."、max_tokens 钳 16-64、30s 超时、采样参数不传）；`resolveLlmConfig`（active 档案优先、旧 ai_settings 兜底）接入 chat 与 /api/ai/stream，maxTokens/reasoningEffort 按档案生效
- 前端：AI 设置对话框重写为「模型档案」双视图（src/components/assistant/AiModelSettings.tsx）——档案列表（使用/删除/上下移排序/缺 Key 徽标）+ 表单（Kimi/GLM/DeepSeek/Kimi Coding/GLM Coding 五预设一键添加；MODEL_LIMITS 18 条已知家族自动填充限额（kimi-k3→131072/1000000）；reasoning effort 按模型家族精选下拉（未知模型给全量+提示）；测试连接内嵌结果）
- 兼容：getSettings/saveSettings 保留（旧 ai_settings 兜底链未断）；hasKey 引导判断 = 任一档案有 Key 或旧设置有 Key
- 验证：tsc -b 全过；冒烟 10 断言全过（脱敏/尾斜杠/互斥/三态 key/reorder 越权/active 删拦截/test 三路径/清理复原）；bundle 复核（reasoning_effort/探测消息/五预设/限额表入包，temperature 仅注释残留）

---

## 2026-07-30 · 修复：LLM 调用方式对齐 wisp-science（根治 K3 temperature 400）

- 参照 github.com/xuzhougeng/wisp-science 的 wisp-llm OpenAI provider 调用方式改造：
  - **彻底不传 temperature**（chat 与流式端点均移除，替代此前 isK3 条件省略）——K3 仅允许 temperature=1，传任何值均 400 `invalid temperature`；不传则由服务商使用模型默认值，全模型兼容
  - 请求体新增 `max_tokens: 8192`（对齐其 ProviderConfig 默认）
  - 流式请求新增 `stream_options: { include_usage: true }`（对齐其 SSE 用法，usage 帧由解析层天然忽略）
  - base_url 尾部斜杠 trim、Authorization Bearer 与其一致（原本已是）
- 其 sanitize 机制（历史消息不回放 reasoning_content）对本项目天然成立（aiMessages 只存 content）

---

## 2026-07-30 · AI 助手默认模型切换 Kimi K3

- DEFAULT_MODEL 改为 `kimi-k3`（chat 与流式端点两处）；`ai_settings.model` 列默认值迁移为 kimi-k3（scripts/alter-ai-model-default-k3.ts，只改默认值不动已有行）；设置对话框 placeholder 同步
- K3 适配：K3 固定推理默认值，官方请求示例不含 temperature 等采样参数——模型名以 `kimi-k3` 开头时请求体省略 temperature（isK3 判定，chat 与 stream 均生效），避免参数被拒
- 提示：K3 需在 Kimi 开放平台充值解锁（赠送代金券不可用于 K3）；账号无权限时上游返回 404 resource_not_found_error

---

## 2026-07-30 · 修复：AI 设置保存时 trim 凭据（粘贴带空格导致 401）

- saveSettings 入库前对 baseUrl/model/apiKey 统一 trim：粘贴 Key 带首尾空格/换行会原样入库，调用时 Authorization 头非法被上游拒（HTTP 401 Invalid Authentication）；trim 后为空视为未提供（不动原值），apiKey 空串=清除的语义不变

---

## 2026-07-30 · 文档：README 全量更新至当前功能

- 补齐后续全部模块文档：小鼠管理（看板/台账/笼位/配种四页签、批量登记、鉴定工作台、任务建议）、样本库（多规格盒、孔位关联记录）、AI 助手（流式/操作模式确认卡/@ 引用）、收集箱与回收站、待办整理为记录、方法库自建条目、生信数据存储路径
- 数据库表一览补全至 30 表；项目结构补 ai/stream.ts；技术栈补 SSE/function calling 说明；教程目录重排为 12 节

---

## 2026-07-30 · 待办整理改为并入当日已有记录

- `summarizeToRecord` 重写为「追加优先」：当日已有实验记录时，完成清单直接追加进最近更新那一条（updatedAt 秒级精度，同秒取 id 大者）的「## 今日完成」段——段已存在则段内追加（标题不重复、后续段落不受影响），段不存在则文末新建段；当日没有记录才新建一条
- 追加前复用 recordRouter.snapshotCurrent 留版本快照（与手动保存一致，可回滚）；recordRouter 导出该函数
- 返回新增 `appended` 标记，前端 toast 区分「追加进当日记录」与「整理为新记录」
- 验证：真实库五场景冒烟（新建/追加合并/段中插入不破坏后段/版本快照 +1/防重复）全过；tsc/构建/入包验证齐全

---

## 2026-07-30 · 实验方法库：添加自建方法条目

**数据层**
- `method_entries` 新增 `userId` 列（幂等迁移 scripts/add-method-entry-userid.ts）：null=预置全局条目，非 null=用户自建（仅本人可见/可删）

**后端（libraryRouter）**
- 可见性规则 `visibleTo`：所有列表/章节计数/详情仅返回「全局预置 + 本人自建」，他人自建不可见
- `createEntry`：章节存在校验，entryId 取 max+1 避让预置编号，steps 空行/纯空白行服务端再过滤；字段覆盖章节/小节/中英文名/类型(full|pointer)/期刊/年份/DOI/来源/目的/原理/步骤
- `removeEntry`：仅本人自建可删；预置条目 FORBIDDEN、他人条目 FORBIDDEN、不存在 NOT_FOUND
- 自建条目同样支持「存为 Protocol」（importAsProtocol 天然兼容）

**前端**
- Library 页头新增「添加方法」主按钮 → AddEntryDialog（章节下拉/小节/中英文名/类型 chips/期刊/年份/DOI/来源/目的/原理/每行一步步骤域），创建成功跳转条目详情页
- 条目卡片/详情页/浮窗显示「自建」徽标（info 蓝）；journal/section 空值保护不再渲染空 chip
- LibraryEntry 详情页自建条目显示「删除此自建条目」（danger，AlertDialog 确认，已存 Protocol 副本不受影响）

**验证**：tsc -b 全过；真实库 tRPC caller 冒烟（创建→详情字段/空行过滤→列表徽标数据→预置防删→删除→重复删除 NOT_FOUND→全清理）全过；前后端构建入包逐项验证

---

## 2026-07-30 · 已完成待办一键整理为当日实验记录

- todoRouter 新增 `summarizeToRecord(date)`：把某日「已完成且未关联记录」的待办整理为一条当日实验记录——标题 `YYYY-MM-DD 实验记录`、完成事项 checklist 入 resultMd、tags「待办整理」、status done；创建后回写这些待办的 recordId 建立关联，已关联的不会重复整理（无符合条件项时报「没有可整理的已完成待办」）
- 日程页选中日面板待办区新增「整理为记录（N）」按钮（N=已完成未关联数），点击整理成功 toast 后自动跳转新记录详情页继续补充
- 验证：tsc -b 全过；真实库 tRPC caller 冒烟（建待办→完成→整理→记录内容/关联回写/防重复→全清理）全过；前后端构建入包验证（esbuild 大写 \uXXXX 转义复核）

---

## 2026-07-30 · AI 助手 v2：流式输出 + 写操作确认卡 + @ 引用记录

**流式输出（纯文本模式）**
- 新增 SSE 端点 `POST /api/ai/stream`（api/ai/stream.ts）：cookie session 鉴权 → 会话归属/LLM 设置校验 → 落库用户消息 → buildContext → 上游 OpenAI 兼容 `stream:true` → 逐行解析上游 SSE（正确处理跨 chunk 断行与心跳行）→ 转发 `data: {"t": delta}` 帧 → 结束落库完整回复、自动命名会话并发送 `[DONE]`
- boot.ts 在 `/api/*` 404 前挂载该端点；前端 fetch + ReadableStream 读循环渲染流式气泡（ReactMarkdown 实时渲染半成品），发送即刷新用户消息

**写操作确认卡（操作模式，与流式互斥）**
- aiRouter 新增 `AI_TOOLS`（create_todo / create_quick_note，OpenAI function 格式）；chat 输入新增 `withTools`，开启后请求携带 tools，模型/网关不支持（400/404/422）自动降级为纯文本重试
- 服务端只解析转发 tool_calls（白名单过滤），绝不自动执行；纯 tool_calls 场景 assistant 空消息不落库
- 前端头部「操作模式」开关：开启走 tRPC chat（withTools），AI 提议的写操作渲染确认卡（中文工具名 + 参数摘要），用户点「确认执行」才调 todo.create / quickNote.create 落库，「忽略」直接丢弃；执行结果以本地提示气泡反馈（不入库）

**@ 引用记录**
- chat/stream 输入新增 `refRecordIds`（最多 3 条）；buildContext 第三参注入 referencedRecords 全文块（各字段截 800/300，归属+软删校验，不计入缩减优先保留）
- 输入框键入 `@` 弹出记录选择面板（最近 30 条，支持关键词过滤），选中插入 `【@标题】` token 并生成可移除的引用 chip；发送时只带上仍出现在正文中的引用
- 会话自动命名剔除引用 token

**验证**：tsc -b 全量通过；真实库冒烟（AI_TOOLS 白名单、空引用不注入、真实记录注入含标题、不存在 id 越权不注入、SSE 跨 chunk 解析拼接无损）全过；前后端构建入包 grep 验证

---

## 2026-07-30 · 样本增强：孔位关联实验记录 + 多规格冻存盒

**孔位关联实验记录**
- `samples` 新增 `recordId` 列（幂等迁移 scripts/add-sample-record-id.ts）
- setSample 支持关联/解除（undefined 保持、null 解除），关联记录归属与软删除校验
- getBox wells 附 recordTitle（leftJoin records，排除软删）
- 孔位编辑对话框：关联记录下拉（最近 30 条：日期+标题）+「查看」直达记录详情
- 96 孔网格：已关联孔位右上角白色小圆点标记，悬停 tooltip 显示记录标题

**多规格冻存盒**
- 新建盒子对话框新增规格预设：96 孔（8×12）/ 81 孔（9×9）/ 100 孔（10×10）/ 48 孔（6×8）/ 24 孔（4×6），坐标自适应（schema 原已支持 rows/cols）
- 样本库页文案同步多规格

---

## 2026-07-30 · 小鼠 v2：鉴定流程 + 提醒中心扩展 + AI 打通

**基因型鉴定流程（待鉴定 → 登记 → 分流）**
- listMice 新增 ungenotyped 筛选（基因型为空）
- 个体台账新增「未鉴定」筛选 chip 与「鉴定登记」入口
- 鉴定工作台对话框：品系 chips（带待鉴定计数徽标，默认选中首个有积压品系）→ 待鉴定鼠逐行列出（耳号/性别/周龄），每行 +/+、+/-、-/-、Tg+ 快捷 chips + 自定义输入 + 行内保存；保存即出列，看板建议同步重算

**提醒中心扩展（taskSuggestions 新增两类，实时派生）**
- 配种超期：active 配种对合笼 ≥25 天且 0 胎 → 提醒检查或更换
- 老龄繁殖对：亲本任一方 ≥40 周龄 → 提醒安排更换
- 任务卡图标体系扩展（超期 Heart/老龄 Hourglass）

**与 AI 助手打通**
- AI 上下文快照新增 mouseStrains 品系级汇总（品系/存活/公/母/未鉴定），可直接向 AI 讨论动物实验安排

---

## 2026-07-30 · 小鼠 v1.5 配种包

配种对管理 + 幼崽批量登记（断奶分笼）+ 孟德尔遗传计算器，覆盖繁殖日常。

**数据层**
- `mouse_breeding`：配种对（品系/♂亲本/♀亲本/配种笼/合笼日期/状态 active-ended/结束日期原因/已产胎次/备注）
- 幂等迁移 scripts/create-breeding-table.ts（已执行验证）

**后端 mouseRouter 新增 5 接口**
- createPair：同品系 + ♂/♀ 性别匹配 + 双方存活三重校验
- listPairs：附品系/亲本耳号/笼位标签，active 在前按合笼日期倒序
- endPair / removePair（亲本台账不受影响）
- registerLitter：一胎批量登记——品系沿用配种对、来源「自繁」、笼位缺省沿用配种笼、备注自动「第 N 胎」，成功后胎次 +1；已结束配种对拒绝登记
- 耳号连号分配提取为公共函数 allocateEarNos（批量登记与幼崽登记共用，一次分配再切分防批内重号）
- 真实库冒烟通过：建对校验 / 一胎 2公1母连号 / 胎次 +1 / 结束生效

**前端 /mice 新增「配种」页签**
- 配种对卡片：品系色点 + ♂×♀ 耳号 + 已配天数 + 胎次 + 笼位；亲本非存活时提示建议结束；操作：幼崽登记 / 结束 / 删除
- 新建配种对：品系 chips → 存活♂/♀ 下拉（无可用亲本即时提示）→ 合笼日期 / 配种笼
- 幼崽登记：公母数量步进器 + 出生日期 + 分笼笼位（默认配种笼）+ 编号规则，摘要显示第几胎
- 已结束配种折叠区（起止日期 + 胎次 + 原因）
- 孟德尔遗传计算器：亲本基因型（+/+、+/-、-/-）→ 后代期望比例条（25/50/75/100% 即时计算）

---

## 2026-07-30 · 小鼠待办事项（任务建议 + 一键待办）

小鼠模块接入全局待办系统：系统自动从库存数据派生待办建议，一键转为今日待办，Dashboard 同步可见。

**后端**
- mouseRouter 新增 taskSuggestions（实时派生，不入库）：
  - 扩繁预警：存活低于品系阈值 → 建议安排扩繁
  - 待鉴定：存活但基因型为空（按品系聚合数量）
  - 断奶分笼：21-35 日龄且未分配笼位
- 复用现有 todos 表 / todoRouter，无需迁移

**前端**
- 库存看板新增「小鼠任务」卡（预警横幅之下）：
  - 系统建议列表（类型图标 + 数量），一键「+ 待办」转为今日待办，已加入显示状态防重复
  - 今日小鼠待办清单：勾选完成（与 Dashboard 今日待办双向同步）
  - 手动添加：文本 + 日期（默认今天），回车即存
- 小鼠待办统一「【小鼠】」前缀标识；登记/批量/编辑/流转/删除任一数据变更后建议自动重算

---

## 2026-07-30 · 小鼠按公母数量批量登记

购入一批 / 一窝分笼场景不再需要逐只录入：直接填「公 X 只、母 Y 只」一次建账。

**后端**
- mouseRouter 新增 batchCreateMice：品系/笼位归属校验，公母各 0-200 只
- 耳号自动连号：按「前缀 + 数字」生成，服务端扫描该品系下同前缀已占用的纯数字编号，从起始号（缺省 1）起自动跳过已用号码，杜绝唯一索引冲突
- 真实库冒烟通过：9 只（3 公 6 母）连号 / 避让 / 自定起始号 / 性别统计全链路断言

**前端**
- 库存看板品系卡新增「批量」按钮、个体台账工具栏新增「按数量」入口
- 批量登记对话框：公/母数量步进器（+/- 与直接输入）、编号前缀与起始编号（留空自动接续）、出生日期/基因型/笼位/来源一次套用全批
- 提交前实时摘要「将登记 N 只（公 X · 母 Y），编号 XX 起连号」；成功后 toast 回显实际分配的耳号区段

---

## 2026-07-30 · 生信分析数据存储路径

为每项生信分析增加专用的数据位置登记字段，解决「分析做完，数据在服务器哪个目录」靠记忆的问题。

**数据层**
- `bioinfo_analyses` 新增 `dataPath`（原始数据存储路径）与 `resultPath`（结果存储路径），varchar(500) 可空
- 幂等迁移 scripts/add-bioinfo-paths.ts（information_schema 预检 + ALTER 验证）

**后端**
- bioinfoRouter create/update 接入两字段（空串归一为 null），列表/详情自动带出
- AI 助手上下文：绑定项目对话的生信快照附存储路径（各截 120 字符），AI 可讨论数据位置
- 真实库冒烟通过：增/改/置空/删全链路断言

**前端**
- 分析详情页「基本信息」新增数据存储路径区：原始数据 / 结果存储双输入框（mono 字体 + 图标），输入框右侧一键复制按钮（便于粘回终端 / WinSCP）
- 分析列表卡片新增路径指示 chip（显示路径末段，悬停见完整路径）
- 引导条文案更新，引导使用专用字段
- 导出全渠道同步：Markdown 报告 / CSV / TSV（表头+两列）/ Word 报告 / 网页报告均含两路径

---

## 2026-07-30 · 小鼠库存管理系统 v1（基础台账包）

品系 → 个体 → 笼位三层台账 + 库存看板，覆盖日常动物房 80% 操作。编号全手动输入。

**数据层**
- `mouse_strains`：品系（名称/遗传背景/基因型说明/维护方式/标识色/库存预警阈值）
- `mice`：个体（耳号手动/性别/出生日期/基因型/笼位/来源/状态流转/备注；同品系耳号唯一索引）
- `mouse_cages`：笼位（笼号/房间/架位）
- 幂等迁移 scripts/create-mouse-tables.ts

**后端 mouseRouter（14 接口，17 项真实库断言通过）**
- 品系 CRUD + 统计（alive/♂/♀/未知性别/未鉴定数/阈值预警），有个体时拒绝删除
- 个体台账查询：品系/性别/状态/笼位/关键词 + **周龄范围过滤**（timestampdiff(week)）
- 状态流转 setStatus：处死/死亡/淘汰落 statusDate 与原因，恢复存活自动清空
- 笼位 CRUD + 笼内清单；有存活鼠拒绝删除，历史引用自动解绑
- overview 今日任务板数据（存活/品系/笼位/预警列表）

**前端 /mice（三页签）**
- 库存看板：四统计卡 + 扩繁预警横幅 + 品系卡（♂♀未鉴定统计、阈值标记、快捷登记）
- 个体台账：品系/性别/状态/周龄范围/关键词组合筛选；桌面表格 + 移动端卡片；登记/编辑/状态流转/删除（删除前提示建议状态流转留痕）
- 笼位：卡片 + 占用计数 + 笼内清单展开
- 导航/⌘K/Navbar 全接入（Rat 图标，样本库之后）

**范围说明**：配种管理、孟德尔遗传计算、基因型鉴定流程、提醒中心、实验记录/AI 打通属 v1.5/v2（见 plan.md）

## 2026-07-30 · 样本管理系统 v1（7bab50c）

项目下的 96 孔冻存盒（8×12，A1–H12 标准坐标）可视化管理。

**数据层**
- `sample_boxes`：项目归属、盒名、存放位置（-80℃/液氮）、rows×cols 默认 8×12（已留扩展字段）
- `samples`：(boxId,row,col) 唯一孔位索引；名称/9 种类型/浓度/体积/存入日期/备注

**后端 sampleRouter**
- 盒子 CRUD + 占用统计（occupied/capacity）；删除盒子级联清空孔位
- setSample 同孔重复存 = upsert 覆盖；孔位越界拦截
- searchSamples 跨盒模糊搜索，返回 A1–H12 坐标 + 盒名 + 项目名
- 15 项真实库断言冒烟通过（upsert 幂等/坐标格式/级联清零）

**前端**
- /samples：项目过滤 chips、占用进度条卡片、新建盒子对话框、跨盒搜索定位
- /samples/:boxId：96 孔网格（行 A-H × 列 1-12），类型色块 + 样本名缩写，盒内搜索高亮
- 孔位对话框：坐标大字（色随类型）、类型 chips、浓度/体积/日期/备注、清空孔位
- 盒名/位置 inline 编辑；删除二次确认注明级联份数
- 补充入口：项目管理页卡片显示「N 盒」直达链接；/samples 支持 ?project= 参数初始化过滤

## 2026-07-30 · AI 助手 v1（6558d48 / f13e290）

LLM 副驾上线：按「项目 → 多会话」组织对话，读取你的全部实验数据进行讨论。

**数据层**
- 新增 `ai_settings` 表：每用户一条，存 OpenAI 兼容接口配置（baseUrl 默认 Moonshot、模型默认 kimi-k2-0711-preview、apiKey）
- 新增 `ai_conversations` 表：会话绑定项目（可空 = 副驾快聊），首条消息自动生成标题
- 新增 `ai_messages` 表：按会话级联删除
- 幂等迁移脚本 `scripts/create-ai-tables.ts`

**后端 aiRouter**
- 设置读写：API Key 回显永远脱敏（只回前 6 位预览），完整 key 不出服务端
- 会话 CRUD + 消息历史（每会话最多取 100 条）
- `chat`：服务端实时组装 BenchLog 数据快照注入 system prompt——绑定项目时注入该项目全部湿实验记录（目的/结论截断）与生信分析；副驾快聊注入最近 15 条记录；另含全部实验方法、收集箱未处理、未完成待办；总量超 12000 字符按比例智能缩减
- OpenAI 兼容 chat/completions 调用，60s 超时，HTTP 错误截断包装为可读提示

**前端 /assistant**
- 桌面三栏：项目列表（副驾快聊 + 各项目色点）→ 会话列表（新建/hover 删除）→ 对话区
- 移动端自动单栏切换（列表 ↔ 聊天带返回）
- 欢迎卡 + 4 条快捷提问；markdown 气泡排版（代码块/表格/引用）；Enter 发送 Shift+Enter 换行
- 每条助手回复可一键「存入收集箱」（写入需确认的 v1 形态）
- 未配置 LLM 时对话区顶部引导条 + AI 设置对话框
- 侧边栏/移动抽屉/命令面板/Navbar 标题全接入

---

## 2026-07-30 · 收集箱系统（9a9272c / 2879fa2）

临时想法与快速结果的轻量速记通道，之后再转正。

- 新增 `quick_notes` 表与 quickNoteRouter：create / list / remove / convertToTodo / convertToRecord / appendToRecord
- 四种捕获入口：工作台收集箱卡（想法/结果一键切换，回车即存，未处理计数徽标）、移动端中央 + 动作面板（新建记录/快速想法/快速结果/拍照上传/新建分析）、全局捕获对话框（Ctrl+Enter）、/inbox 页顶部输入框
- /inbox 收集箱页转正流程：转为湿实验记录（想法进目的、结果进结果栏、打「收集箱」tag）、追加到已有记录结果（带时间戳引用块）、转为今日待办；已处理折叠分组

## 2026-07-30 · 引导卡与快捷方块修正（b43fd85 / 668f452）

- 三步上手卡判定排除示例数据（isDemo），示例 SOP 不再被误判为「已准备方法」
- 工作台快捷方块重排：新建项目/新建方法 → 新建记录(湿)与新建分析(干)同行并列 → 安排实验/拍照上传

## 2026-07-30 · 回收站 + 项目管理页 + 筛选增强（2881af6 / 9862807）

- **软删除回收站**：records/protocols 加 deletedAt；删除进「最近删除」页可完整恢复（图片/附件/版本全保留）或彻底删除；列表/详情/全局搜索/导出/活跃度全面过滤已删数据，已删不可编辑
- **示例数据**：一键填充/清除演示项目+3 条记录+1 个 SOP，is_demo 隔离，绝不动真实数据
- **项目管理页 /projects**：卡片式列表（关联计数 N 记录 · M 分析）、inline 改名、8 色板换色、归档（底部折叠分组）、非空项目删除保护
- **记录页日期范围筛选**：URL 同步；桌面 Popover + 移动筛选 Sheet；⌘K 命令面板新增结果类型 chips
- **移动端表单**：记录页底部主按钮强化（保存升主按钮）、仓库暂存提交行竖排全宽

## 2026-07-29 · 记录版本历史 + 附件 + 技能库互通（f65b8d3 / 6fe45fc）

- **记录修改历史**：每次保存自动留快照（recordVersions 表），历史对话框时间线查看、展开 diff、一键恢复（恢复前再快照当前，全程可逆）
- **记录附件**：recordAttachments 表；上传/下载/删除，单文件 2MB，服务端归属校验
- **技能库导入导出**：生信技能库导出 JSON / 批量导入（≤200 条，格式校验）
- **新手引导卡**：工作台三步上手（建项目/备方法/记首录），可关闭

## 2026-07-29 · P2 工作流闭环（88341b8 / ee23f7a）

- **commit 行级 diff 视图**：LCS 算法（公共前后缀裁剪 + Uint32Array DP，超限退化整段增删），历史时间轴「查看变更」展开
- **今日议程提醒**：Navbar 铃铛改 Popover——当日待办 + 到期流程节点 + 计数徽标
- **汇报导出纳入生信分析**：数据来源湿实验/生信双选；新增 Word(docx) 导出模板（H1 标题/研究者行/分组小节）
- 生信列表分段显示（20 条/段 + 显示更多）

## 2026-07-29 · P1 数据安全（ff2f5ae / bf30f3e）

- 站内仓库导出 ZIP：任意历史 commit 服务端 jszip 打包下载
- 二进制文件双重拦截：扩展名黑名单 + NUL 字符嗅探，前端暂存与后端提交同防
- 未保存提醒：记录/生信编辑页 beforeunload 拦截（react-router 声明式模式限制，应用内跳转拦截未覆盖）

## 2026-07-29 · 可发现性三连（dea15fc / d8d4ae8 / ade4a61 等）

- 学习指南从页签内嵌改为独立 /guide 满高插槽（iframe + 工具条）
- 移动端汉堡抽屉导航：全部页面可达（此前手机端无入口）
- 新建项目入口前置：侧边栏项目分组 + 按钮、工作台「新建项目」方块

## 2026-07-28 · 文档与基线（c911cad / 8c0b690）

- README 全量重写：快速开始、8 节使用教程、站内 Git 架构说明、16 表速查、部署步骤
- 项目基线：React+Vite 前端 + Hono/tRPC/Drizzle/MySQL 后端全栈交付

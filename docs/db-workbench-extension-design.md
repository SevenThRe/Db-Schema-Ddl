# DB 工作台扩展设计

## 1. 设计目标

把当前以 `Excel -> DDL` 为核心的桌面工具，扩展成一个用户愿意长时间停留的数据库工作台，但不破坏现有主流程。

目标不是再造一个独立产品，而是在现有扩展体系上新增一个内置扩展 `DB 工作台`，让它与现有 Excel 解析、DDL 生成、Schema Diff、连接管理形成闭环：

- 用 Excel 定义书生成 DDL
- 连接真实数据库执行 SQL
- 回看真实 Schema / 数据 / 执行计划
- 对比 Excel 定义与真实库的差异
- 把数据库变化再次沉淀回定义流程

## 2. 现状判断

仓库已经具备做这件事的基础骨架，不应从零设计插件系统。

已有能力：

- 前端已有扩展宿主与面板注册机制：
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - `client/src/extensions/builtin/register-all.tsx`
  - `shared/extension-schema.ts`
- Tauri 端已有内置扩展 manifest 与 capability 模型：
  - `src-tauri/src/builtin_extensions/mod.rs`
  - `docs/extension-boundary-spec.md`
- 已有数据库连接、Schema introspect、Schema diff：
  - `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - `src-tauri/src/db_connector/commands.rs`
  - `src-tauri/src/db_connector/introspect.rs`
- 前端依赖已经覆盖关键实现基础：
  - `monaco-editor` / `@monaco-editor/react`
  - `react-window`
  - `@xyflow/react`
  - `elkjs`

结论：

- 不需要新建“扩展目录”机制，只需要新增一个内置扩展，并让它成为数据库相关能力的统一入口。
- 不建议再并列新增一个和 `db-connector` 职责重叠的扩展。
- 最稳妥的方案是把现有 `db-connector` 升级并对外改名为 `DB 工作台`。

## 3. 产品定位

### 3.1 用户看到的扩展

- 名称：`DB 工作台`
- 类型：builtin extension
- 分类：`DbConnector`
- 导航位置：侧边栏数据库分组的第一入口

### 3.2 用户价值

`DB 工作台` 不是“连接配置页”，而是一个高频停留区，负责：

- SQL 编写与执行
- 结果集浏览与编辑
- 执行计划可视化
- ER 图与结构关系浏览
- 安全执行与环境隔离

## 4. 信息架构

建议把现有三页式 `连接 / Schema / DIFF` 升级为五区工作台：

1. `连接`
2. `SQL 编辑器`
3. `结果网格`
4. `执行计划`
5. `ER 图`

推荐布局沿用当前桌面化 pane 风格，而不是卡片式网页布局：

- 左侧窄导航：连接、库对象树、查询历史、已保存脚本
- 中央主区域：Monaco SQL 编辑器
- 底部结果区：结果集 / 消息 / 执行统计 / 导出
- 右侧上下文区：表结构、字段注释、执行计划节点详情

这和当前仓库在 `Dashboard.tsx` 中的 pane 设计一致，不会破坏整体视觉语言。

## 5. 功能设计

## 5.1 连接与环境模型

在 `DbConnectionConfig` 上扩展：

- `environment: "dev" | "test" | "prod"`
- `readonly: boolean`
- `colorTag?: string`
- `defaultSchema?: string`

交互规则：

- `prod` 使用红色强调条
- `test` 使用蓝色强调条
- `dev` 使用绿色强调条
- `readonly=true` 时禁用编辑提交、危险 SQL 执行、结构变更

意义：

- 这是防误操作的第一层，不应该靠用户记忆。

## 5.2 SQL 编辑器

编辑器使用 Monaco，做成“极客感”而不是普通 textarea。

核心能力：

- SQL 语法高亮
- 当前连接方言识别：MySQL / PostgreSQL
- 标签页查询页签
- 会话恢复
- 快捷键：
  - `Ctrl/Cmd + Enter` 执行当前选中 SQL；未选中时执行当前语句块
  - `Shift + Ctrl/Cmd + Enter` 执行整个脚本
  - `Alt + Shift + F` 格式化 SQL

### 智能补全

补全分三层：

1. 关键字补全
2. Schema 感知补全
3. 上下文感知补全

示例：

- 输入 `FROM user_order u WHERE ` 时，优先补 `u.` 对应列
- 输入 `JOIN` 时优先补当前库表
- 输入 `SELECT * FROM user_order WHERE ` 时，仅弹出 `user_order` 的字段

实现来源：

- 基础词法：前端 SQL tokenizer
- 表/列来源：当前连接的 `DbSchemaSnapshot`
- 别名关系：编辑器端轻量 SQL context parser

不建议一期直接上完整 SQL AST 编译器；先做“足够好”的上下文补全即可。

### SQL 格式化

提供一键格式化，但必须保守：

- 格式化仅作用于选中段；无选中则作用全文
- 不自动改写关键字大小写以外的语义
- 支持保留注释

建议引入独立格式化库，而不是手写 formatter。

## 5.3 增量执行

执行逻辑分三种：

- 有选中文本：执行选中 SQL
- 无选中但光标位于语句内：执行当前 statement
- 显式全量执行：执行全文

执行分段规则：

- 忽略空语句与纯注释段
- 支持多语句脚本
- 每段返回独立的执行结果与耗时

结果 UI：

- 成功 / 失败逐段显示
- 失败不影响前面已成功段的结果展示
- 可配置“遇错停止”或“继续执行”

## 5.4 结果网格

结果区是工作台停留时间最长的区域，必须重点优化。

### 结果浏览

- 默认首屏只取 1000 行
- 向下滚动按需追加
- 使用 `react-window` 做虚拟滚动
- 列头冻结
- 支持列宽拖拽
- 支持排序、筛选、复制单元格、复制整行

### 原地编辑

只在“可安全映射到单表主键”的结果集里开启编辑。

允许编辑的场景：

- 从对象树进入“查看表数据”
- `SELECT` 来自单表，且主键字段在结果集中

禁止编辑的场景：

- 多表 join
- 聚合查询
- 缺少主键
- 只读连接

编辑模型：

- 双击单元格进入编辑
- 改动先进入 `pending patches`
- 页面底部显示：
  - 已修改行数
  - 生成 SQL 预览
  - `提交事务`
  - `放弃修改`

提交前展示：

- 即将执行的 `UPDATE/INSERT/DELETE`
- 影响行数预估
- 当前连接名与环境

提交时：

- 后端统一开启事务
- 全部成功才提交
- 任一失败则回滚

## 5.5 导出能力

结果集导出支持：

- JSON
- CSV
- Markdown Table
- SQL Insert

导出规则：

- 默认导出当前结果页
- 用户可切换为“导出已加载数据”或“重新执行后导出全部”

说明：

- “导出全部”不能偷偷拉全量导致卡死，必须给出行数提示和确认。

## 5.6 执行计划可视化

针对 `EXPLAIN` 或“执行并查看计划”动作，后端统一转成中间结构：

- MySQL：`EXPLAIN FORMAT=JSON`
- PostgreSQL：`EXPLAIN (FORMAT JSON)`

统一归一化为：

- `PlanNode`
  - `id`
  - `label`
  - `nodeType`
  - `relationName`
  - `cost`
  - `rows`
  - `children`
  - `warnings`

前端用 `@xyflow/react + elkjs` 渲染树状执行计划。

高亮规则：

- 全表扫描 / Seq Scan / type=ALL 显著标红
- 大 rows 估算显示风险徽标
- 节点 hover 显示原始 explain 细节

这样既能满足“图形化”，又复用现有依赖。

## 5.7 高危动作保护

危险 SQL 识别不应只看按钮，而要看实际语句。

需识别：

- `DROP`
- `TRUNCATE`
- `ALTER TABLE`
- `ALTER DATABASE`
- `DELETE` 无 `WHERE`
- `UPDATE` 无 `WHERE`

交互策略：

- `dev` 环境：黄色确认
- `test` 环境：橙色确认
- `prod` 环境：红色确认 + 输入数据库名确认

确认弹窗必须展示：

- 连接名
- 环境标签
- 数据库名
- 即将执行的真实 SQL

这部分属于必须项，不是锦上添花。

## 5.8 ER 图与结构可视化

当前 introspect 只拿到 table/column，不够支撑 ER 图。

需要补充：

- 外键
- 索引
- 引用方向

ER 图能力：

- 自动布局
- 支持表搜索与聚焦
- 点击字段跳转对象树
- 选中两表查看关系详情

拖拽设计能力建议放到二期：

- 一期只做“可视化浏览”
- 二期再做“拖拽建关联 -> 生成 ALTER 预览”

原因：

- 拖拽建模涉及 DDL 生成、方言差异、撤销/重做、安全确认，明显比只读 ER 图复杂得多。

## 6. 技术设计

## 6.1 扩展接入策略

推荐方案：

- 保留内部 ID `db-connector`，对外文案升级为 `DB 工作台`
- 或者新增 `db-workbench`，并迁移旧入口

更推荐前者，原因：

- 现有连接管理、Schema、Diff 已全部挂在 `db-connector`
- 避免两个数据库扩展并列，造成导航重复
- 减少 manifest、panel、i18n、状态迁移成本

## 6.2 Host API 扩展

当前 `HostApi` 只有：

- `list/save/remove/test`
- `introspect/diff`

需要新增：

```ts
interface QueryExecutionRequest {
  connectionId: string;
  sql: string;
  mode: "selection" | "statement" | "script";
  limit?: number;
  offset?: number;
}

interface QueryExecutionResponse {
  batches: QueryBatchResult[];
}

interface ExplainRequest {
  connectionId: string;
  sql: string;
}

interface GridCommitRequest {
  connectionId: string;
  tableName: string;
  patches: RowPatch[];
}
```

建议在 `host-api.ts` / `host-api-runtime.ts` / `desktop-bridge.ts` 中新增：

- `connections.query()`
- `connections.explain()`
- `connections.previewDangerousSql()`
- `connections.commitGridChanges()`
- `connections.exportResult()`
- `connections.introspectRelations()`

## 6.3 Capability 模型

当前 capability 不足以覆盖工作台全部能力。

建议新增：

- `db.plan.read`
- `db.data.edit`
- `db.result.export`

保留现有：

- `db.connect`
- `db.query`
- `db.schema.read`
- `db.schema.apply`

如果想控制变更范围，一期也可以先不新增 capability，而是先在 builtin 扩展内复用：

- 查询与 explain 走 `db.query`
- 数据编辑与提交走 `db.schema.apply`

但从边界设计上看，这不够清晰。长期更推荐拆细。

## 6.4 后端命令设计

建议新增 Tauri 命令：

- `db_query_execute`
- `db_query_explain`
- `db_query_cancel`
- `db_grid_commit`
- `db_export_rows`
- `db_introspect_relations`

对应模块建议拆分：

- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/db_connector/explain.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `src-tauri/src/db_connector/relations.rs`

不要把所有逻辑继续堆进 `commands.rs`。

## 6.5 统一数据结构

`shared/schema.ts` 需要新增以下类型：

- `DbQueryColumn`
- `DbQueryRow`
- `DbQueryResult`
- `DbQueryMessage`
- `DbExecutionStats`
- `DbExplainPlan`
- `DbRelation`
- `DbGridPatch`
- `DbDangerousSqlPreview`

同时扩展：

- `DbSchemaSnapshot`
  - 增加 `foreignKeys`
  - 增加 `indexes`

## 6.6 前端组件拆分

建议新增组件：

- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/ExplainPlanPane.tsx`
- `client/src/components/extensions/db-workbench/ObjectExplorerPane.tsx`
- `client/src/components/extensions/db-workbench/ErDiagramPane.tsx`
- `client/src/components/extensions/db-workbench/DangerousSqlDialog.tsx`
- `client/src/components/extensions/db-workbench/GridCommitDialog.tsx`
- `client/src/components/extensions/db-workbench/QueryTabs.tsx`

现有 `DbConnectorWorkspace.tsx` 不应继续膨胀成一个超大文件。

推荐做法：

- `DbConnectorWorkspace.tsx` 退化为入口壳
- 真正内容拆到 `db-workbench/` 目录

## 7. 性能设计

## 7.1 大结果集

原则：

- 不默认拉全量
- 不在主线程渲染超大表
- 不把超大 JSON 一次性序列化进前端

方案：

- 后端分页
- 前端虚拟滚动
- 单次页面上限 1000 行
- 返回行数统计与“继续加载”能力

## 7.2 自动补全缓存

补全数据来源于 schema snapshot，需要本地缓存：

- 连接切换时刷新
- 表变更后按需失效
- 结果缓存使用 `react-query`

## 7.3 执行取消

SQL 执行时间不可控，必须支持取消：

- 查询执行分配 requestId
- Tauri 端维护 cancellable job
- 前端显示 `Cancel`

这对长查询和 explain 尤其重要。

## 8. 安全与约束

## 8.1 只允许参数化提交

Grid 提交不能直接字符串拼接 SQL，应由后端：

- 根据主键生成 parameterized SQL
- 绑定参数执行

## 8.2 生产环境默认保护

对于 `prod` 连接：

- 默认只读建议打开
- DML/DDL 默认多一步确认
- 可配置禁止无条件更新/删除

## 8.3 编辑范围约束

不要承诺“任意结果集可编辑”。

明确约束：

- 单表主键可定位结果才能编辑
- 否则只读

这是避免后续实现复杂度失控的关键。

## 9. 分期建议

## Phase 1: 可用工作台

- 连接环境标签
- SQL 编辑器
- 选中执行 / 当前语句执行
- 结果网格只读
- JSON/CSV/Markdown 导出
- 基础 explain 可视化
- 危险 SQL 二次确认

这期就能显著提升停留时间。

## Phase 2: 可编辑工作台

- 单表结果集原地编辑
- 暂存修改
- SQL 预览
- 事务提交 / 回滚
- 历史查询与脚本页签持久化

## Phase 3: 结构化工作台

- 外键关系 introspect
- ER 图
- 表/字段搜索
- 从 ER 节点跳转 SQL / Schema

## Phase 4: 设计增强

- 拖拽建关联
- 自动生成 ALTER 语句预览
- Excel 定义书与真实库的联动入口

## 10. 验收标准

`DB 工作台` 达标的最低标准不是“能跑 SQL”，而是：

- 用户能在 3 秒内完成一次连接切换和查询执行
- `Ctrl+Enter` 的执行对象符合直觉
- 结果网格在 1000 行下无明显卡顿
- `prod` 危险 SQL 无法一键误执行
- `EXPLAIN` 能一眼看出全表扫描
- 可从结果集安全导出常用格式

## 11. 推荐实施顺序

最合理的实际落地顺序：

1. 先重构现有 `DbConnectorWorkspace`，拆出 `db-workbench/` 目录
2. 增加 query / explain 的 shared schema 与 Tauri command
3. 上 Monaco SQL 编辑器与只读结果网格
4. 上危险 SQL 保护和环境标签
5. 再做可编辑 grid
6. 最后补 ER 图

原因很简单：

- SQL 编辑器 + 结果网格会立刻带来核心价值
- ER 图很显眼，但不是第一优先级
- 可编辑 grid 的安全边界最复杂，适合放在查询链路稳定之后

## 12. 最终建议

这个扩展应该被定义为：

“面向数据库日常操作的高频工作台”，而不是“数据库连接器增强版”。

因此建议：

- 用户名称统一改为 `DB 工作台`
- 内部沿用现有 builtin extension 架构
- 优先做 SQL 编辑器、结果网格、执行计划、安全确认四件事
- ER 图和拖拽设计作为二阶段增强，而不是一期必做项

这样改，既符合当前仓库架构，也能最大化把这个工具从“单次转换器”推进成“可停留的桌面数据库工具”。

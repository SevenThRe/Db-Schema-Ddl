# DB 工作台数据差异与同步设计

## 1. 目标

在现有 `DB 工作台` 基础上增加一套面向真实数据库数据的对比与同步能力，支持：

- 对比 `DB2 -> DB1` 的数据差异
- 快速识别“仅 DB2 有 / 两边都有但值不同 / 仅 DB1 有”的记录
- 把确认无误的数据同步到目标库
- 对目标库执行三类动作：
  - `导入`：把 DB2 中存在、DB1 中不存在的数据插入到 DB1
  - `替换`：把 DB2 作为准值，更新 DB1 中已存在但字段值不同的数据
  - `删除`：删除 DB1 中多余、且不应继续保留的数据

这里的 `DB1`、`DB2` 指业务上的两个连接实例，不是 IBM DB2 产品名。

## 2. 为什么不能直接用 SQL 编辑器解决

当前工作台已经具备：

- 连接管理
- Schema 对比
- SQL 执行
- 结果网格
- 危险 SQL 拦截

但这些能力偏“人工操作”。用户如果要做 `DB2 -> DB1` 的数据修正，仍然需要：

- 自己写比对 SQL
- 自己确认主键或业务键
- 自己拼接 `INSERT / UPDATE / DELETE`
- 自己承担误删和误覆盖风险

这类工作重复、机械、风险高，适合沉淀为工作台内置能力。

## 3. 产品定位

建议在 `DB 工作台` 内新增一个一级视图：`数据同步`

推荐结构：

- `查询`
- `Schema`
- `Diff`
- `数据同步`

不要把它做成“独立扩展”。它本质上依赖当前 DB 工作台已有的连接、安全确认、结果网格和历史记录机制。

## 4. 核心使用场景

### 4.1 主场景：DB2 纠正 DB1

用户选择：

- `源库 Source = DB2`
- `目标库 Target = DB1`
- 一张或多张业务表

系统输出：

- DB2 多出的记录
- DB1 多出的记录
- 主键相同但字段不同的记录

用户勾选后执行：

- 把 DB2 多出的导入到 DB1
- 把不一致记录按 DB2 覆盖到 DB1
- 把 DB1 多余记录删除

### 4.2 次场景：先比对，再生成 SQL 审核

适用于测试环境或用户希望人工审查时：

- 先只做比对
- 生成 SQL 预览
- 导出 SQL / CSV / JSON 报表
- 最后再执行

### 4.3 次场景：部分字段同步

有些表不能整行覆盖，只能同步特定字段，例如：

- 状态
- 标志位
- 编码
- 备注

因此需要支持：

- 表级全量同步
- 字段级白名单同步

## 5. 同步模型

### 5.1 角色定义

- `source`: 作为正确来源的数据库，默认是 DB2
- `target`: 被修正的数据库，默认是 DB1
- `baseline`: 执行前重新采集的 target 快照，用于防止“比对后目标库又被别人改了”

### 5.2 差异分类

对每张表，记录会被分成四类：

1. `source_only`
   - 仅 source 存在
   - 推荐动作：`insert`
2. `target_only`
   - 仅 target 存在
   - 推荐动作：`delete`
3. `value_changed`
   - 两边都有，但非键字段不一致
   - 推荐动作：`update`
4. `unchanged`
   - 完全一致
   - 默认折叠

### 5.3 键匹配规则

数据对比必须有稳定匹配键，优先级如下：

1. 主键
2. 唯一键
3. 用户手动指定业务键

如果一张表没有可用键：

- 允许只读比对
- 不允许自动应用
- UI 必须提示“当前表缺少可安全定位的对比键”

## 6. 数据同步流程

### 6.1 预览流程

1. 选择 source 连接和 target 连接
2. 选择对比范围
   - 整库
   - 指定表
   - 指定条件
3. 为每张表确认匹配键
4. 执行预览
5. 展示差异汇总与明细

### 6.2 执行流程

1. 用户勾选要执行的表与记录
2. 系统重新获取 target 当前快照并校验哈希
3. 生成待执行动作清单
4. 生成 SQL 预览
5. 二次确认
6. 按事务批次执行
7. 记录 job、结果、失败语句、审计摘要

### 6.3 回滚策略

一期不承诺完整自动回滚，但要保留足够审计信息：

- 执行前 target 关键记录快照
- 执行 SQL
- 主键集合
- 受影响记录数

二期可扩展：

- 对 `update` / `delete` 生成逆向恢复 SQL

## 7. UI 设计

## 7.1 工作区布局

建议沿用现有桌面化布局，不做网页式大卡片：

- 左侧：连接与表列表
- 中间：差异列表 / 行级比对
- 右侧：字段差异、SQL 预览、执行摘要
- 底部：动作队列、执行日志

## 7.2 顶部控制区

包含：

- `源库`
- `目标库`
- `对比范围`
- `匹配键设置`
- `过滤条件`
- `开始比对`

建议增加一个方向提示：

- `DB2 -> DB1`

避免用户把同步方向看反。

## 7.3 表级总览

每张表显示：

- 表名
- 匹配键
- `新增 N`
- `变更 N`
- `待删 N`
- 风险标签

风险标签示例：

- `无主键`
- `字段缺失`
- `目标存在脏数据`
- `删除量过大`

## 7.4 行级对比

点击表后进入行级差异视图，建议分三栏：

- 左：source 行
- 中：字段差异
- 右：target 行

行操作支持：

- 勾选本行
- 标记 `导入`
- 标记 `替换`
- 标记 `删除`
- 忽略本行

## 7.5 批量操作区

需要提供：

- `全选 source_only -> 导入`
- `全选 value_changed -> 替换`
- `全选 target_only -> 删除`
- `清空选择`
- `只导出预览 SQL`
- `执行已选安全变更`

## 7.6 危险确认

以下场景必须强确认：

- 目标连接为 `prod`
- 删除量超过阈值
- 更新量超过阈值
- 涉及无条件整表替换
- 同步键不是主键而是人工业务键

确认弹窗必须显示：

- source / target 名称
- 环境
- 表数
- insert / update / delete 数量
- 将要执行的真实 SQL 摘要

## 8. 数据结构设计

建议在 `shared/schema.ts` 中新增以下结构。

### 8.1 对比请求

```ts
interface DbDataDiffRequest {
  sourceConnectionId: string;
  targetConnectionId: string;
  tables: DbDataDiffTableRequest[];
  sampleLimit?: number;
}

interface DbDataDiffTableRequest {
  tableName: string;
  keyColumns: string[];
  compareColumns?: string[];
  whereClause?: string;
}
```

### 8.2 对比结果

```ts
interface DbDataDiffResult {
  compareId: string;
  sourceLabel: string;
  targetLabel: string;
  targetSnapshotHash: string;
  tables: DbDataDiffTableResult[];
  summary: DbDataDiffSummary;
}

interface DbDataDiffTableResult {
  tableName: string;
  keyColumns: string[];
  compareColumns: string[];
  sourceOnlyCount: number;
  targetOnlyCount: number;
  changedCount: number;
  unchangedCount: number;
  blocked: boolean;
  blockerCodes: string[];
  sampleRows: DbDataDiffRowEntry[];
}

interface DbDataDiffRowEntry {
  rowKey: Record<string, string | number | null>;
  status: "source_only" | "target_only" | "value_changed" | "unchanged";
  sourceRow?: Record<string, unknown>;
  targetRow?: Record<string, unknown>;
  fieldDiffs: DbDataFieldDiff[];
  suggestedAction?: "insert" | "update" | "delete" | "ignore";
}

interface DbDataFieldDiff {
  columnName: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  changed: boolean;
}
```

### 8.3 应用请求

```ts
interface DbDataApplyRequest {
  compareId: string;
  sourceConnectionId: string;
  targetConnectionId: string;
  currentTargetSnapshotHash: string;
  selections: DbDataApplySelection[];
  mode: "preview" | "execute";
}

interface DbDataApplySelection {
  tableName: string;
  rowKey: Record<string, string | number | null>;
  action: "insert" | "update" | "delete";
  compareColumns?: string[];
  blocked?: boolean;
  blockerCodes?: string[];
}
```

### 8.4 应用结果

```ts
interface DbDataApplyResponse {
  job: DbDataDeployJob;
  results: DbDataDeployResult[];
}

interface DbDataDeployJob {
  jobId: string;
  sourceConnectionId: string;
  targetConnectionId: string;
  targetSnapshotHash: string;
  status: "pending" | "running" | "completed" | "failed" | "partial";
  summary: {
    tableCount: number;
    insertCount: number;
    updateCount: number;
    deleteCount: number;
    successCount: number;
    failedCount: number;
  };
}
```

## 9. 后端实现设计

## 9.1 模块拆分

建议新增：

- `src-tauri/src/db_connector/data_diff.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/db_connector/data_snapshot.rs`

不要把逻辑继续堆进 `query.rs` 或 `commands.rs`。

## 9.2 Tauri 命令

建议新增：

- `db_data_diff_preview`
- `db_data_diff_detail`
- `db_data_apply_preview`
- `db_data_apply_execute`
- `db_data_apply_job_detail`

## 9.3 对比算法

推荐实现顺序：

### 一期：按表分页拉取后在应用层对比

适用场景：

- 中小表
- 先追求正确性和可落地

过程：

1. 从 source 读取目标表数据
2. 从 target 读取目标表数据
3. 按 `keyColumns` 构建 Map
4. 比较非键字段
5. 生成差异结果

优点：

- 实现简单
- 跨 MySQL / PostgreSQL 统一

缺点：

- 大表时内存和网络成本高

### 二期：下推式对比

对大表优化时再引入：

- 分页扫描
- 按键范围分片
- checksum / hash compare
- 只拉取变化记录

## 9.4 SQL 生成策略

### insert

生成参数化 `INSERT`

### update

生成参数化 `UPDATE`

- `WHERE` 只使用匹配键
- `SET` 只写变化字段

### delete

生成参数化 `DELETE`

- 只能按匹配键删除
- 不允许无 `WHERE`

## 9.5 事务边界

建议默认以“表”为事务边界：

- 一张表内的已选动作放在一个事务
- 某表失败，不影响其他表

理由：

- 风险隔离更清晰
- 出问题更容易定位
- 不会因为一张表失败导致全库同步回滚过大

## 10. 安全边界

## 10.1 允许 live-vs-live compare，但 apply 不能裸跑

比对可以直接做 `DB2 live vs DB1 live`。

但执行前必须校验：

- 比对时记录的 `targetSnapshotHash`
- 执行前重新采集的 `currentTargetSnapshotHash`

若不一致：

- 拒绝执行
- 提示用户重新比对

这能避免“预览时看到的是 A，真正执行时目标库已经变成 B”。

## 10.2 阻断条件

以下情况必须阻断自动执行：

- 表没有主键或稳定唯一键
- compareColumns 中包含 target 不存在的字段
- source / target 数据类型不兼容
- 同一键在 source 或 target 中出现重复
- 删除数量超过上限且未显式确认

## 10.3 生产库保护

若 target 是 `prod`：

- 默认只允许 preview
- execute 需要额外确认
- 可配置“删除默认禁用”

## 11. 历史与审计

这类功能必须留痕。

至少记录：

- compareId
- source / target
- 表名
- 选中动作数
- 生成 SQL
- 执行时间
- 执行人
- 结果状态
- 失败原因

建议复用现有“job + result”风格，而不是新做一套临时日志。

## 12. 推荐的最小可用版本

先做能真正帮用户解决 `DB2 -> DB1` 的最小闭环：

### Phase 1

- 指定 source / target
- 指定表
- 通过主键做数据对比
- 输出 `新增 / 变更 / 待删` 统计
- 允许导出 SQL 预览

### Phase 2

- 行级勾选
- 执行 `insert / update / delete`
- target 快照哈希校验
- job 审计记录

### Phase 3

- 业务键配置
- 字段级白名单同步
- 大表分页与增量对比
- 失败恢复 SQL

## 13. 与当前仓库的结合点

这个功能最适合挂到以下现有结构上：

- 工作台入口：
  - `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- 共享类型：
  - `shared/schema.ts`
- 桌面桥接：
  - `client/src/lib/desktop-bridge.ts`
  - `client/src/extensions/host-api.ts`
- Tauri 命令：
  - `src-tauri/src/db_connector/commands.rs`
- 安全风格复用：
  - `DangerousSqlDialog`
  - 连接环境标签
  - 现有 query/explain 的 job/request 风格
- 差异视图复用：
  - `client/src/components/diff-viewer/StructuredDiffContent.tsx`
  - `client/src/components/diff-viewer/MonacoDdlDiff.tsx`
  - `client/src/components/diff-viewer/structured-adapter.ts`

建议新增前端组件：

- `client/src/components/extensions/db-workbench/DataSyncPane.tsx`
- `client/src/components/extensions/db-workbench/DataSyncTableList.tsx`
- `client/src/components/extensions/db-workbench/DataSyncRowDiffPane.tsx`
- `client/src/components/extensions/db-workbench/DataSyncApplyDialog.tsx`
- `client/src/components/extensions/db-workbench/DataSyncJobHistory.tsx`

说明：

- 表级总览、勾选动作、执行确认仍然由数据同步自己的工作流负责
- 行级详情不要再重做一套 UI，直接把 `sourceRow / targetRow / fieldDiffs` 适配成现有 structured diff entry
- JSON 级别的 before/after 预览可以直接复用 Monaco diff，只需把语言从固定 `sql` 放宽为可配置

## 14. 最终建议

对你的目标，最务实的定义不是“再做一个数据导入工具”，而是：

`在 DB 工作台中增加一个以 DB2 为准、把差异安全同步到 DB1 的数据修正面板。`

这套设计的关键点只有四个：

- 必须先比对，再执行
- 必须基于主键或稳定业务键
- 必须把动作拆成 `insert / update / delete`
- 必须在执行前再次校验 target 快照，避免误覆盖

这样做，用户就能从“手写比对 SQL + 手工改库”切换成“选表、看差异、勾选、执行”，而且不会破坏当前工作台已经形成的桌面化结构。

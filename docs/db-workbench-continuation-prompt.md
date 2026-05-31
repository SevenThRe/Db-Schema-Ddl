# DB Workbench Continuation Prompt

你正在继续开发 `E:\work\Db-Schema-Ddl`。这个项目已经不是单纯的 Excel -> DDL 工具，而是桌面优先的 DB Schema Workbench。请按 runtime truth 推进开发，不要把设计文档或类型定义当成已上线能力。

## 当前事实

- 前端是 Vite + React + TypeScript，桌面能力和 DB 后端在 Tauri + Rust。
- Excel 2 DDL 已经有核心能力，但 DB Workbench 还不能因为存在 UI/类型/文档就宣称替代 Navicat。
- 当前机器尚未证明存在可用的本地 MySQL/Postgres 等真实数据库环境。除非跑过 db lab 或真实连接的 Tauri live smoke，否则只能说代码级验证通过，不能说 DB 工具核心已实机验证。
- DB Workbench 新主线在 `WorkbenchLayout.tsx` 及其拆分出的 runtime/controller/pane 文件，`DbConnectorWorkspace.tsx` 里仍保留 legacy `连接 / Schema / DIFF` 路径。两者共存，不能随手删除 legacy 路径。
- 最近一轮已开始把臃肿组件拆成更明确的架构边界：SQL Copilot Dialog、SQL Editor Pane、SQL Copilot Runtime Sidebar、Result Grid Single Batch、SQL Autocomplete memory ranking、completion item builders、alias resolution，以及 SQL semantic relation/binding analysis。
- 当前交接点包含未必已提交的工作区改动：`sql-autocomplete.ts` 已收敛为 facade，`sql-autocomplete-alias-resolution.ts` 承接 alias 解析；`sql-semantic-context.ts` 已抽出 `sql-semantic-relation-analysis.ts`，承接 relation/CTE/binding/projected-column/member-access 分析。

## 下一阶段 Goal

继续把 DB Workbench 从大文件堆叠推进为可维护、可验证的 operator-grade 架构，同时保留运行时行为和安全边界。完成后必须能回答：哪些能力是真正可达的，哪些只是 scaffold，哪些必须等真实 DB 环境验证。

## 优先任务

1. 收口并提交当前拆分
   - 确认 `sql-autocomplete.ts`、`sql-autocomplete-alias-resolution.ts`、`sql-semantic-context.ts`、`sql-semantic-relation-analysis.ts`、相关架构测试都在同一个提交里。
   - 跑 `npm run check`、SQL 目标测试、`npm run test:db-workbench` 后再提交。
   - 如果接手时工作区已有更新，先 `git status --short` 确认不要覆盖他人改动。

2. 继续拆分 `sql-semantic-context.ts`
   - 已拆出 relation/CTE/binding/projected-column/member-access 分析。
   - 下一步优先拆 statement/clause analysis、diagnostics、hover symbol resolution。
   - 不要引入未验证的 SQL parser 语义承诺，先保证现有测试和用户可见行为稳定。

3. 拆分 `sql-memory.ts`
   - 将持久化 codec、pattern/value profile 归一化、acceptance recorder、retention/clear 策略分离。
   - 必须保持不记录原始敏感值的隐私边界。

4. 拆分 `workbench-session.ts`
   - 将 session storage codec、tab/run history、SQL memory mutation、hydration/restore 分离。
   - 要求 session 恢复不能模糊当前连接、schema、readonly/writable 状态。

5. 审计剩余大 section 文件
   - `sql-copilot-dialog-sections.tsx`
   - `sql-memory-dialog-sections.tsx`
   - `schema-diff-sections.tsx`
   - `job-center-sections.tsx`
   - 只拆有真实复杂度的边界，不做机械碎片化。

6. 补真实 DB 验证路径
   - 如果本机没有 DB，先完善 db lab preflight 和错误报告。
   - 有 DB 后跑 Tauri + 真实连接 smoke：保存连接、introspect schema、执行 SELECT、危险 SQL 拦截、取消查询、EXPLAIN、结果分页。
   - 未跑通前，所有交付说明都必须写清楚“代码级验证”与“真实 DB 验证”区别。

## 验证要求

每次架构拆分至少跑：

```powershell
node D:\Tools\node_modules\npm\bin\npm-cli.js run check
node D:\Tools\node_modules\npm\bin\npm-cli.js run test:db-workbench
```

触及 SQL autocomplete/semantic/memory 时，额外跑对应目标测试：

```powershell
node --import=tsx --test test\client\db-workbench-sql-autocomplete-architecture.test.ts test\client\db-workbench-autocomplete-phase16.test.tsx test\client\db-workbench-sql-autocomplete-context.test.ts test\client\db-workbench-sql-memory-phase51.test.ts test\client\db-workbench-sql-semantics-phase50.test.ts test\client\db-workbench-sql-semantic-context-phase49.test.ts
```

当前交接前已验证过：

```powershell
node D:\Tools\node_modules\npm\bin\npm-cli.js run check
node --import=tsx --test test\client\db-workbench-sql-autocomplete-architecture.test.ts test\client\db-workbench-autocomplete-phase16.test.tsx test\client\db-workbench-sql-autocomplete-context.test.ts test\client\db-workbench-sql-memory-phase51.test.ts test\client\db-workbench-sql-semantics-phase50.test.ts test\client\db-workbench-sql-semantic-context-phase49.test.ts
```

接手后仍需跑全量 `test:db-workbench`，因为当前最后一次全量回归发生在 semantic relation analysis 拆分前。

触及 DB 后端、host API、desktop bridge、shared schema、Rust command 时，必须同步检查：

- `shared/schema.ts`
- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/lib/desktop-bridge.ts`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/lib.rs`

## 开发纪律

- 以可达 runtime 作为事实来源。
- 保留显式连接上下文、schema 上下文、source/target、readonly/writable 状态。
- 不把未接入 UI 的文件、未注册的 Tauri command、未跑过的 live DB path 写成已完成能力。
- 每次拆分都补架构边界测试，防止大文件回流。
- 优先让一个主 Workbench surface 完成日常 DB 工作流，而不是继续扩散多个半成品面板。

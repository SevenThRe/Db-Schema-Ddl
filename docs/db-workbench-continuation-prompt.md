# DB Workbench Continuation Prompt

你正在继续开发 `E:\work\Db-Schema-Ddl`。这个项目已经不是单纯的 Excel -> DDL 工具，而是桌面优先的 DB Schema Workbench。请按 runtime truth 推进开发，不要把设计文档或类型定义当成已上线能力。

## 当前事实

- 前端是 Vite + React + TypeScript，桌面能力和 DB 后端在 Tauri + Rust。
- Excel 2 DDL 已经有核心能力，但 DB Workbench 还不能因为存在 UI/类型/文档就宣称替代 Navicat。
- 当前机器仍未证明存在可用的本地 MySQL/Postgres 等真实数据库环境。`npm run db-lab:preflight -- --advisory` 实测报告 `State: BLOCKED`（无 docker compose、3306/5432 都不可达）。因此本轮只跑过代码级验证（`npm run check` + 全量 `test:db-workbench`），**没有**跑过 db lab 或真实连接的 Tauri live smoke：DB 工具核心仍属“代码级验证通过、真实 DB 验证未完成（UNPROVEN）”。
- DB Workbench 新主线在 `WorkbenchLayout.tsx` 及其拆分出的 runtime/controller/pane 文件，`DbConnectorWorkspace.tsx` 里仍保留 legacy `连接 / Schema / DIFF` 路径。两者共存，不能随手删除 legacy 路径。
- 本轮已完成的架构拆分（均带架构边界测试、`npm run check` 与全量 `test:db-workbench` 通过）：
  - `sql-autocomplete.ts` → facade + `sql-autocomplete-alias-resolution.ts`。
  - `sql-semantic-context.ts` → facade + `sql-semantic-relation-analysis.ts` + `sql-semantic-statement-analysis.ts` + `sql-semantic-diagnostics.ts` + `sql-semantic-hover.ts`。
  - `sql-memory.ts` → facade + `sql-memory-types.ts` / `-normalization.ts` / `-codec.ts` / `-retention.ts` / `-recorder.ts`（保持“不记录原始敏感值”隐私边界，有专测）。
  - `workbench-session.ts` → facade + `workbench-session-types.ts` / `-codec.ts` / `-store.ts` / `-history.ts` / `-memory.ts`（restore 仍保留显式 connection/schema/tab 作用域）。
  - section 文件审计：拆了 `job-center-sections.tsx`（list/detail/shared）与 `sql-copilot-dialog-sections.tsx`（shell + main-panel）；`sql-memory-dialog-sections.tsx`、`schema-diff-sections.tsx` 判定为内聚单视图，未拆以避免机械碎片化。
  - db lab preflight 错误报告增强：新增 `state`（reachable / ready-to-bootstrap / blocked）与 `remediation`，并把探针做成可注入以便确定性测试。
  - 追加（同一轮继续的代码级工作）：
    - `sql-autocomplete-item-builders.ts` 抽出 `sql-autocomplete-join-builders.ts`（FK-aware JOIN 模板/条件合成）。
    - `sql-copilot-grounding.ts` 拆成 `sql-copilot-grounding-relations.ts`（relation 装配，叶子）+ `sql-copilot-prompt-sections.ts`（prompt section 渲染 + value-hint 隐私守卫）+ orchestrator facade。
    - `sql-copilot-generation.ts` 抽出 `sql-copilot-generation-evaluation.ts`（离线评估 harness，与运行时 parse/build 路径解耦）。
  - 下一批候选（尚未拆，且属 DB 执行相邻，拆前必须同步检查 shared schema / host-api / desktop-bridge / Rust command）：`data-apply-runner.ts`、`query-safety-runner.ts`、`query-execution-runner.ts`。

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

## 验证状态（代码级 vs 真实 DB）

- **代码级验证（已完成）**：本轮所有拆分与 preflight 改动都跑过 `npm run check` 和全量 `npm run test:db-workbench`（160 个测试文件全绿），并补了对应架构边界测试。
- **真实 DB 验证（未完成 / UNPROVEN）**：本机 `db-lab:preflight` 报告 `BLOCKED`（无 docker compose、3306/5432 不可达），所以**没有**跑保存连接、introspect schema、SELECT、危险 SQL 拦截、取消查询、EXPLAIN、结果分页等 Tauri 真实连接 smoke。
- 任何交付说明都必须显式区分这两类，不得把“代码级验证通过”表述为“DB 工具核心已实机验证”。
- 一旦本机出现可用 DB（装好 Docker 后 `npm run db-lab:up`，或用 `DBTOOLS_*_PORT` / `--connection-string` 指向外部库），先跑 `npm run db-lab:preflight` 确认 `State: reachable`，再按下方 live 命令补真实 DB 验证。

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

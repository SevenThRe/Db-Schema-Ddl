---
sidebar_position: 13
---

# 功能能力清单

本页用于确认“代码能力”与“文档入口”是否一致。  
每次新增功能后，都应在这里补一行并挂到对应说明页。

## 工作台与交互能力

| 模块 | 实际能力 | 说明页 |
| --- | --- | --- |
| Sidebar | 上传（点击/拖拽）、版本化文件列表、删除、Docs 跳转、设置入口、语言切换 | [工作台总览](./workspace-layout.md) |
| SheetSelector | Sheet 切换、含表定义优先定位 | [第一次导入 Excel](./first-import.md) |
| TablePreview | 多表解析预览、字段明细、当前表联动 | [第一次导入 Excel](./first-import.md) |
| SpreadsheetViewer | 电子表格虚拟滚动、拖选区域解析、范围回传 DDL 生成区 | [工作台总览](./workspace-layout.md) |
| SearchDialog | `Ctrl/Cmd + P` 检索 Sheet/表并跳转 | [Ctrl P 搜索组件](./ctrl-p-search.md) |
| Dashboard 状态层 | 记忆上次文件与 Sheet、2/3 栏自适应布局、版本号与手动更新检查 | [工作台总览](./workspace-layout.md) |

## 生成、修复与差分能力

| 模块 | 实际能力 | 说明页 |
| --- | --- | --- |
| DdlGenerator 主控区 | 方言切换、单文件/按表导出、SQL 高亮、复制与下载 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| 表选择弹窗 | 搜索、排序、批量勾选、ZIP 导出范围控制 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| 缺失类型守门 | 缺失字段手工补全、长度规则校验、跳过无效表 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| Name Fix 快速守门 | 导出前命名风险拦截、候选修复批量应用 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| Name Fix 全流程 | 预览、批量执行、任务跟踪、回滚、下载结果 | [Name Fix 命名修复组件](./name-fix-component.md) |
| SchemaDiffPanel | 历史基线对比、重命名确认、ALTER 预览与导出 | [Schema Diff 差分工作流](./schema-diff-workflow.md) |
| 导出回执 | 成功/跳过统计、跳过表清单反馈 | [从预览到 DDL 生成](./preview-to-ddl.md) |

## 设置与系统治理能力

| 模块 | 实际能力 | 说明页 |
| --- | --- | --- |
| Settings - DDL/MySQL | 引擎、字符集、排序规则、数据类型大小写、布尔映射 | [设置面板](./settings-panel.md) |
| Settings - 导出/解析 | 文件名策略、注释头模板、PK 标记、路径策略 | [设置面板](./settings-panel.md) |
| Settings - Name Fix 默认策略 | 冲突策略、保留字策略、超长策略、并发与保留天数 | [设置面板](./settings-panel.md) |
| Settings - 开发者与运行守护 | 限流窗口、并发、预热、任务队列参数 | [设置面板](./settings-panel.md) |
| UpdateNotifier / ErrorBoundary | 桌面更新提示、异常兜底恢复 | [快速开始](./quick-start.md), [故障排查手册](./troubleshooting.md) |

## API 与自动化能力

| 能力域 | 主要接口范围 | 说明页 |
| --- | --- | --- |
| 文件与解析 | `/api/files/*`（上传、Sheet 列举、表信息、区域解析、搜索索引） | [第一次导入 Excel](./first-import.md) |
| DDL 生成与导出 | `/api/generate-ddl*`, `/api/export-ddl-zip*` | [从预览到 DDL 生成](./preview-to-ddl.md) |
| Name Fix | `/api/name-fix/*`（preview/apply/rollback/job/download） | [Name Fix 命名修复组件](./name-fix-component.md) |
| Schema Diff | `/api/diff/*`（preview/confirm/alter/history） | [Schema Diff 差分工作流](./schema-diff-workflow.md) |
| 设置与运行态 | `/api/settings`, `/api/settings/runtime`, `/api/tasks/:id` | [设置面板](./settings-panel.md) |
| MCP 自动化 | `inspect_excel_file`, `parse_excel_to_ddl`, `query_comment_references` | [MCP 自动化接口](./mcp-integration.md) |

## 维护规则

- 新增页面功能时，必须同步更新本清单和对应文档页。
- 新增 API 能力时，必须同步更新“API 与自动化能力”表。
- 如果暂时没有说明页，先在对应单元格写 `待补充`，并在下一次迭代补齐。

---
sidebar_position: 14
---

# MCP 自动化接口

MCP 接口让这套软件可以被 AI Agent 直接调用，用于批量解析 Excel、生成 DDL 和检索备注中的结构化引用。

这部分能力是服务端接口，不在主界面中显示按钮。

## 能力边界

MCP 侧重点是“可编排调用”，不是“手工操作体验”。

- 适合把解析与生成纳入自动化流程
- 适合在 AI 工作流里做批量校验与回归
- 适合对备注中的代码引用做条件检索

## 可用工具

| 工具名 | 作用 | 典型输出 |
| --- | --- | --- |
| `list_excel_sheets` | 获取工作簿 sheet 列表 | sheet 名数组 |
| `parse_excel_to_ddl` | 解析指定 sheet 并生成 DDL | tables + ddl + normalization |
| `query_comment_references` | 检索备注中的结构化引用 | 匹配行、过滤信息、分页结果 |
| `validate_excel_file` | 校验文件是否满足解析条件 | valid、size、sheets |
| `get_file_metadata` | 获取文件元信息 | path、size、时间戳、扩展名 |

## 运行方式

本地启动 MCP Server：

```bash
npm run mcp
```

需要调试日志时：

```bash
npm run mcp:debug
```

## 调用约束

MCP 调用遵循统一输入约束，确保自动化任务稳定可控。

- 仅允许 `.xlsx` 与 `.xls`
- 文件大小上限为 `10MB`
- 路径必须位于允许目录内
- 默认允许目录包括：项目根目录、`uploads`、`attached_assets`
- 可通过环境变量 `MCP_ALLOWED_DIRS` 追加目录，多个路径用分号分隔

## 解析与命名策略

`parse_excel_to_ddl` 支持直接携带解析策略：

- `dialect` 支持 `mysql` 与 `oracle`
- `nameNormalization` 支持 `none` 与 `snake_case`
- 可配置 `pkMarkers` 与 `maxConsecutiveEmptyRows`
- 可通过 `referenceExtraction` 覆盖备注提取规则

这让同一份模板在不同交付场景下可以复用同一调用入口。

## 输出判定信号

每次工具调用都返回统一结构：

- `success` 表示调用是否成功
- `data` 为业务结果
- `metadata` 包含工具名、耗时、处理时间和关键统计

当 `parse_excel_to_ddl` 因命名或类型问题失败时，返回信息会附带修复方向提示，便于 Agent 自动重试。

## 与界面功能的关系

MCP 与界面层使用同一解析与生成核心，因此行为口径一致：

- 界面适合人工确认与可视化修复
- MCP 适合流水线、Agent 批处理与外部集成

如果你在做交付自动化，建议把 MCP 作为主入口，再把界面作为异常兜底与人工验收层。
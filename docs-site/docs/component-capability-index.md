---
sidebar_position: 13
---

# 组件能力清单

本页用于确认文档覆盖范围。每个组件或服务能力都应有对应说明入口。

## 工作台组件

| 组件 | 已覆盖能力 | 说明页 |
| --- | --- | --- |
| Sidebar | 上传文件、文件切换、删除、Docs 跳转、设置入口、语言切换 | [工作台总览](./workspace-layout.md) |
| SheetSelector | Sheet 切换、结构页定位 | [第一次导入 Excel](./first-import.md) |
| TablePreview | 表级预览、字段校验、异常提示 | [第一次导入 Excel](./first-import.md) |
| SpreadsheetViewer | 电子表格视图与区域解析 | [工作台总览](./workspace-layout.md) |
| SearchDialog | Ctrl P 快速跳转 | [Ctrl P 搜索组件](./ctrl-p-search.md) |

## 生成与导出组件

| 组件 | 已覆盖能力 | 说明页 |
| --- | --- | --- |
| DdlGenerator 主控制区 | 方言切换、导出模式、生成、复制、导出 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| 表选择弹窗 | 搜索、排序、列分组筛选、批量选择 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| 命名修复守门弹窗 | Current 与 Suggested 对比、批量应用 | [Name Fix 命名修复组件](./name-fix-component.md) |
| Name Fix 完整工作流 | 预览、执行、回滚、冲突处理 | [Name Fix 命名修复组件](./name-fix-component.md) |
| 缺失类型守门弹窗 | 类型补全、长度格式校验、跳过策略 | [从预览到 DDL 生成](./preview-to-ddl.md) |
| ZIP 导出回执弹窗 | 成功数、跳过数、跳过清单 | [从预览到 DDL 生成](./preview-to-ddl.md) |

## 设置与系统组件

| 组件 | 已覆盖能力 | 说明页 |
| --- | --- | --- |
| Settings 页面 | DDL、MySQL、导出、解析、Name Fix、开发者选项 | [设置面板](./settings-panel.md) |
| UpdateNotifier | 桌面版更新提示、下载与安装 | [快速开始](./quick-start.md) |
| ErrorBoundary | 运行异常兜底与恢复 | [故障排查手册](./troubleshooting.md) |

## 自动化与接口能力

| 服务能力 | 已覆盖能力 | 说明页 |
| --- | --- | --- |
| MCP Server | Sheet 列举、Excel 校验、DDL 生成、备注引用检索、元数据查询 | [MCP 自动化接口](./mcp-integration.md) |

若有新增组件或服务能力，需同步把能力入口补进此清单。
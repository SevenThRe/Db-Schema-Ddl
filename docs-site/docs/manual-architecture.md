---
sidebar_position: 1
---

# 文档体系

这套手册围绕一条主线展开：把 Excel 表结构稳定交付为可执行 DDL。

阅读顺序按能力组织，不按菜单组织。你可以从任意页面进入，但下面这条路径最顺滑。

## 核心路径

- 启动应用并确认工作台状态
- 导入模板并验证解析质量
- 生成 DDL 并完成命名收敛
- 调整全局默认策略
- 在自动化流程中接入 MCP

## 能力地图

### 起步与工作台

先建立稳定输入，再进入生成环节。

- [工作台总览](./workspace-layout.md)
- [快速开始](./quick-start.md)
- [第一次导入 Excel](./first-import.md)

### 生成与修复

覆盖导出范围控制、缺失类型处理、Name Fix 两层修复。

- [从预览到 DDL 生成](./preview-to-ddl.md)
- [Name Fix 命名修复组件](./name-fix-component.md)

### 导航、设置与自动化

覆盖快速定位、全局策略管理以及 Agent 自动化接入。

- [Ctrl P 搜索组件](./ctrl-p-search.md)
- [设置面板](./settings-panel.md)
- [MCP 自动化接口](./mcp-integration.md)

### 完整性与排查

用于确认组件覆盖和异常收敛路径。

- [组件能力清单](./component-capability-index.md)
- [故障排查手册](./troubleshooting.md)
- [术语解释](./glossary.md)

## 写作口径

每一页都保持同一节奏：先说明能力边界，再说明界面信号，最后给出结果判定与下一跳入口。
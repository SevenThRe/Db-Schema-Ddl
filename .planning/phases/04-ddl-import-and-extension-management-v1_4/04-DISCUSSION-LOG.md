# Phase 4: DDL 导入 & 扩展功能管理 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 04 — DDL 导入 & 扩展功能管理
**Areas discussed:** A (DDL 导入入口), B (扩展页打开方式), C (扩展卡片内容), D (内置vs外置概念), E (禁用效果)

---

## A — DDL 导入 入口点

| Option | Description | Selected |
|--------|-------------|----------|
| A1 | 仅在 DB 工作台工具栏内（需有活跃连接） | |
| A2 | 工作台工具栏 + 扩展管理页有"启动"按钮 | |
| A3 | 独立成一个扩展面板 / 独立 workspace | ✓ |

**User's choice:** A3 — DDL 导入 成为独立的内置 workspace，有自己的侧边栏 nav 入口
**Notes:** 现有 `DdlImportWorkspace.tsx` 保留，只改入口（从 header button → sidebar nav entry）

---

## B — 扩展管理页打开方式

| Option | Description | Selected |
|--------|-------------|----------|
| B1 | 全屏页面（替换主内容区，类路由跳转） | ✓ |
| B2 | 从右侧滑入的 Drawer | |
| B3 | 占据工作区域的标签页（同 DB 工作台容器） | |

**User's choice:** B1 — 全屏页面

---

## C — 扩展卡片显示内容

| Option | Description | Selected |
|--------|-------------|----------|
| C1 | 最简：图标 + 名称 + 描述 + 启用开关 | |
| C2 | 标准：以上 + 版本 + 能力徽章 + 打开按钮 | |
| C3 | 详细：以上 + 作者/来源 + 安装时间 + 配置入口 | ✓ |

**User's choice:** C3 — 详细卡片

---

## D — 内置 vs 外置扩展概念（关键重新定义）

| Option | Description | Selected |
|--------|-------------|----------|
| D1 | 分区展示（内置区 / 外部区） | |
| D2 | 混合列表，内置有"内置"徽章 | |
| D3 | 内置置顶，外部在下方 | |
| **用户重新定义** | 内置无扩展；DB 工作台是第一个外置扩展 | ✓ |

**User's choice:** 完全重新定义了扩展概念：
- 内置功能（DDL生成器、DDL导入、Schema Diff）不是扩展
- DB 工作台 = 外置扩展（即使当前是 bundled）
- DDL→Excel、Enum生成 = 未来的外置扩展，本版本推迟

**Notes:** 扩展采用文件包模型（extension folder），每个扩展是独立文件包，可下载/安装/管理

**Follow-up clarification:** 关于 数据库/Schema Diff/DDL→Excel/Enum生成 去向
- DDL→Excel = 新扩展，UIUX 未完善，延期到下版本
- Enum生成 = 新扩展，延期（未来可能使用 sidebar 或独立）
- Schema Diff = 内置功能，保持不变
- 数据库 (= DB 工作台) = 外置扩展

---

## E — 禁用效果范围

| Option | Description | Selected |
|--------|-------------|----------|
| E1 | 仅从侧边栏/导航隐藏，不卸载 | |
| E2 | 完全隐藏 + 持久化（重启后也生效） | ✓ |
| E3 | 应用内实时生效但不持久化 | |

**User's choice:** E2 — 禁用完全隐藏且持久化

**Additional:** 管理页提供 禁用 和 卸载 两种明确不同的操作：
- 禁用 = 可逆，保留包，UI 全隐藏，持久化
- 卸载 = 移除包，需重新安装才能恢复

---

## Claude's Discretion

- 扩展 manifest 格式（extension.json vs extension.toml）
- DB 工作台 "卸载" 在 Phase 4 是逻辑标志还是实际文件删除
- 扩展卡片 UI 布局（card grid vs table rows）
- 禁用扩展在管理页的显示方式（dimmed vs filtered）
- DDL 导入 sidebar 相对于 DDL 生成器的排序位置
- DDL 导入无活跃连接时的 empty state 设计

---

## Deferred Ideas

- DDL→Excel 扩展 — 延期到下版本（UIUX 未完善）
- Enum 生成 扩展 — 延期到下版本
- 扩展市场 / 远程安装 — 未来功能
- 扩展沙箱 / 权限模型 — 未来功能

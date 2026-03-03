---
sidebar_position: 4
---

# 第一次导入 Excel

这一页聚焦导入阶段：文件进入、Sheet 定位、结构确认。

## 上传入口

![上传入口组件](/img/screens/component-upload-entry.png)

你会在这个区域完成文件接入：

- 上传按钮接收 `.xlsx` 与 `.xls`
- 文件列表展示当前会话文件
- 删除按钮用于清理当前文件

上传成功后，文件会立即进入左侧列表。

## Sheet 选择器

![Sheet 选择组件](/img/screens/component-sheet-selector.png)

Sheet 选择器决定当前解析范围：

- 列表切换当前 Sheet
- 过滤状态优先展示可能含表定义的页

多 Sheet 模板通常先定位包含 `論理テーブル名` 与 `物理テーブル名` 的页面。

## 解析摘要

![解析摘要组件](/img/screens/component-parse-summary-selector.png)

摘要区用于快速判断命中质量：

- 已解析表数量
- 命名异常提示
- 当前选中表信息

如果摘要明显偏小，优先回到 Sheet 选择器调整范围。

## 字段预览

![字段预览组件](/img/screens/component-table-preview.png)

字段预览是导出前的最终确认层：

- 表头显示逻辑名与物理名
- 字段行显示物理名、类型、长度、空值约束
- 异常提示显示命名或类型缺失

预览稳定后再进入生成，可明显减少返工。

## 快速定位

![搜索模式入口](/img/screens/component-mode-tabs-search.png)

可直接按 `Ctrl + P` 按 Sheet 名或表名跳转。

详见 [Ctrl P 搜索组件](./ctrl-p-search.md)。
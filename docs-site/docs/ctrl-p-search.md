---
sidebar_position: 10
---

# Ctrl P 搜索组件

Ctrl P 是工作台的快速导航层。它不会修改数据，只负责定位。

## 触发入口

![搜索触发按钮](/img/screens/component-search-trigger.png)

图例

- 搜索按钮：鼠标触发
- 快捷键提示：`Ctrl + P`

## 弹窗结构

![搜索面板空状态](/img/screens/component-search-dialog-empty.png)

空状态下，焦点会自动落在输入框，适合直接键入。

![搜索面板结果](/img/screens/component-search-dialog-results.png)

图例

- 输入框：支持 Sheet 名、逻辑名、物理名
- 结果区：区分 Sheet 与 Table 结果
- 高亮项：可直接确认跳转

## 操作规则

- `Enter` 跳转到高亮项
- `Esc` 关闭面板
- 选择表结果时，系统会自动切换到对应 Sheet 并定位该表

## 结果信号

完成一次有效跳转后，应同时看到两个变化：

- 当前 Sheet 自动切换
- 预览区焦点落到目标表
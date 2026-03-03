---
sidebar_position: 11
---

# Name Fix 命名修复组件

Name Fix 把命名问题从“可读”收敛到“可执行”。整体节奏分为三层：守门、预览、执行。

## 快速守门层

![Name Fix 快速修复弹窗](/img/screens/name-fix-quick-popup.png)

这层用于导出前即时拦截：

- 顶部风险说明提示当前存在不合法物理名
- 候选列表按表展示待修复对象
- Current / Suggested 对比原始命名与建议命名
- 底部动作支持继续导出或应用所选修复

适用场景是小范围问题快速收敛。

## 规则配置层

![Name Fix 工作流配置](/img/screens/name-fix-workflow-config.png)

这层定义一次任务的策略边界：

- 批量模式与处理范围
- 执行模式：copy、overwrite、replace_download
- 冲突策略：重名、保留字、长度溢出
- 标识符最大长度与 Table filter

这里不写文件，只定义规则。

## 预览决策层

![Name Fix 工作流预览与冲突](/img/screens/name-fix-workflow-preview-detail.png)

这层回答两个关键问题：会改哪里、是否可继续。

- 预览摘要展示文件数、表改动数、字段改动数
- Plan 展示命名变化轨迹
- 冲突区显示阻断状态与 trace 数量

如果存在阻断冲突，建议先收敛冲突再执行。

## 执行结果层

![Name Fix 工作流执行结果](/img/screens/name-fix-workflow-apply-result-detail.png)

这层用于交付验收与追溯：

- 执行结果显示 success、failed、changedTables、changedColumns
- 输出区提供修复文件与 report 路径
- 下载入口用于直接获取修复文件
- 任务状态可用于后续审计

## 默认策略来源

Name Fix 默认行为由设置面板统一提供，包括执行模式、冲突策略、长度上限、备份与并发。

对应配置见 [设置面板](./settings-panel.md)。
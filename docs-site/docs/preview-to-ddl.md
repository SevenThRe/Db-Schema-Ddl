---
sidebar_position: 5
---

# 从预览到 DDL 生成

这一页覆盖交付阶段的关键界面：范围选择、命名守门、类型补全和导出回执。

## 生成控制区

![DDL 控制组件](/img/screens/component-ddl-controls.png)

控制区定义本次输出行为：

- 方言切换：MySQL / Oracle
- 导出模式：Single File / Per Table ZIP
- 生成动作：执行 SQL 输出
- Name Fix 入口：进入命名修复

## 表选择弹窗

![表选择弹窗](/img/screens/ddl-table-selector-dialog.png)

这个弹窗负责交付范围控制：

- 搜索框按表名过滤
- 排序支持源顺序、列顺序、名称顺序
- 批量动作支持全选与取消全选
- 结果区展示表名、范围、列数和选中状态
- 生成 ZIP 按当前范围导出

适用于按模块拆分交付。

## 命名修复守门弹窗

![命名修复守门弹窗](/img/screens/name-fix-quick-popup.png)

这个弹窗是导出前最后一道命名检查：

- 风险提示显示检测到的不合法物理名
- Current 与 Suggested 对比原始值和建议值
- 应用动作支持批量修复或继续原样导出

这里处理的是即时风险拦截，不替代完整 Name Fix 工作流。

## 缺失类型守门弹窗

![缺失类型守门弹窗](/img/screens/ddl-missing-type-dialog-v2.png)

当字段缺少数据类型时，这里决定如何继续：

- 问题计数显示总问题与选中问题
- 表级勾选决定哪些表进入补全
- 类型下拉为缺失字段补齐类型
- 底部动作支持取消、跳过无效表、按所选类型继续

目标是确保导出 SQL 可执行。

## 导出回执

![DDL 输出结果](/img/screens/app-ddl-generated.png)

导出完成后可直接依据回执判断交付状态：

- 选中表数量
- 成功生成数量
- 跳过数量与跳过线索

## 需要批量规则化时

当命名问题跨多文件、多表出现时，建议进入 [Name Fix 命名修复组件](./name-fix-component.md) 进行完整预览与执行。
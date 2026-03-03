---
sidebar_position: 3
---

# 快速开始

这页只做一件事：让你在最短时间内验证应用可用、模板可解析、DDL 可导出。

## 使用方式

### 发布版

适合直接投入业务使用。

下载地址：

[GitHub Releases（手动选择版本）](https://github.com/SevenThRe/Db-Schema-Ddl/releases)  
[![Download Latest](https://img.shields.io/badge/Download-Latest-2ea44f?logo=github)](https://github.com/SevenThRe/Db-Schema-Ddl/releases/latest/download/DBSchemaExcel2DDL-Setup-latest.exe)

安装后启动应用即可进入工作台。

### 源码版

适合调试、扩展和二次开发。

```bash
npm install
npm run dev
```

默认访问地址：`http://localhost:5000`

## 自动化场景入口

如果你希望由 AI Agent 直接调用解析与生成能力，可启动 MCP 接口：

```bash
npm run mcp
```

调试模式可使用：

```bash
npm run mcp:debug
```

能力说明见 [MCP 自动化接口](./mcp-integration.md)。

## 首次进入要看到什么

![主界面状态](/img/screens/app-main-overview-hd.png)

你应当同时看到这三个信号：

- 可上传 Excel 文件
- 可切换 Sheet 且预览区可见
- 生成区按钮可点击

## 最小可用闭环

导入任意结构化模板后，确认以下结果：

- 预览区出现至少一张表
- 字段存在物理名与类型
- 生成区可产出可读 SQL

任一结果缺失时，直接查看 [故障排查手册](./troubleshooting.md)。

## 桌面版更新

桌面版检测到新版本时会弹出更新提示。你可以立刻更新，也可以稍后处理。

更新提醒不会影响当前解析状态和已导出文件。
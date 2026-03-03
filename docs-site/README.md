# Db-Schema-Ddl 文档站

本目录是项目的 Docusaurus 文档站（中文首发版），用于提供面向新手的图文使用教程与排错指南。

## 常用命令

在仓库根目录执行：

```bash
npm run docs:dev
npm run docs:build
npm run docs:serve
```

也可以在本目录执行：

```bash
npm install
npm run start
npm run build
npm run serve
```

## 发布方式

- 发布平台：GitHub Pages（Project Pages）
- 发布地址：`https://seventhre.github.io/Db-Schema-Ddl/`
- 自动化：`.github/workflows/docs-pages.yml`

只要 `main` 分支下的 `docs-site/**` 发生变更，GitHub Actions 会自动构建并部署文档站。

## 目录说明

- `docs/`：文档正文（Markdown）
- `src/pages/`：站点首页
- `src/components/`：首页组件
- `static/img/`：图片素材
- `docusaurus.config.ts`：站点配置（含 i18n 预留）
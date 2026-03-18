import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'manual-architecture',
    {
      type: 'category',
      label: '启动与导入',
      collapsed: false,
      items: ['workspace-layout', 'quick-start', 'first-import'],
    },
    {
      type: 'category',
      label: '生成与修复',
      collapsed: false,
      items: ['preview-to-ddl', 'schema-diff-workflow', 'name-fix-component'],
    },
    {
      type: 'category',
      label: '搜索与设置',
      collapsed: false,
      items: ['ctrl-p-search', 'settings-panel', 'mcp-integration', 'component-capability-index'],
    },
    {
      type: 'category',
      label: '排查参考',
      collapsed: false,
      items: ['troubleshooting', 'glossary'],
    },
  ],
};

export default sidebars;

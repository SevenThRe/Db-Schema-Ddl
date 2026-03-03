import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const organizationName = 'SevenThRe';
const projectName = 'Db-Schema-Ddl';
const repoUrl = `https://github.com/${organizationName}/${projectName}`;

const config: Config = {
  title: 'Db-Schema-Ddl',
  tagline: '中文使用文档',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://seventhre.github.io',
  baseUrl: '/Db-Schema-Ddl/',

  organizationName,
  projectName,
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',

  trailingSlash: false,

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
    },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/tree/main/docs-site/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Db-Schema-Ddl 手册',
      items: [
        {
          type: 'doc',
          docId: 'manual-architecture',
          position: 'left',
          label: '手册',
        },
        {
          href: repoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} SevenThRe`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

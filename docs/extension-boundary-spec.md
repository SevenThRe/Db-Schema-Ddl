# Extension Boundary Specification

> 本文档定义扩展平台的安全边界约束。所有新扩展（builtin 和 external）在接入前必须满足此处列出的全部规则。

---

## 1. Manifest 契约（单一事实来源）

### 1.1 Schema 双侧同步

扩展 manifest 由两侧解析，**字段集必须一致**：

| 字段 | Rust (`manifest.rs`) | TypeScript (`extension-schema.ts`) |
|---|---|---|
| `id` | `String` | `z.string().regex(kebab-case)` |
| `capabilities` | `Vec<String>` | `z.array(z.string())` |
| `contributes` | `Option<ExtensionContributes>` | `extensionContributesSchema.optional()` |

**规则**: 任何一侧新增字段，另一侧必须同步添加（即使标记为 optional）。否则外部扩展的 manifest.json 会在一侧通过验证、另一侧被静默丢弃。

### 1.2 Contributes 结构

`contributes` 是扩展声明 UI 贡献的唯一通道：

```typescript
{
  activityBar:      ActivityBarItem[],   // 主活动栏入口
  sidebarViews:     SidebarView[],       // 扩展自己的侧边视图
  workbenchViews:   WorkbenchView[],     // 主工作区视图
  navigation:       NavigationItem[],    // 旧兼容字段（迁移期）
  workspacePanels:  WorkspacePanel[],    // 旧兼容字段（迁移期）
  settingsSections: SettingsSection[],   // 设置页区段
  contextActions:   ContextAction[],     // 右键/操作栏动作
}
```

**规则**: 扩展不得通过 contributes 以外的方式向 UI 注入条目。当前宿主的 canonical shell contract 是 `activityBar + sidebarViews + workbenchViews`；`navigation + workspacePanels` 仅用于兼容旧 manifest，并必须先被 contribution-resolver 归一化后再进入宿主 UI。

### 1.3 命名约定

- Rust 侧使用 `snake_case` + `#[serde(rename_all = "camelCase")]`
- TypeScript 侧直接使用 `camelCase`
- 序列化后 JSON 字段名为 **camelCase**（两侧一致）

---

## 2. Capability 权限模型

### 2.1 已定义 Capability

| Capability | 保护的操作 |
|---|---|
| `db.connect` | `connections.list / save / remove / test` |
| `db.query` | （预留：直接 SQL 执行） |
| `db.schema.read` | `connections.introspect / diff` |
| `db.schema.apply` | （预留：DDL 执行） |

### 2.2 Fail-Closed 原则

```
useHostApiFor(extensionId):
  找到扩展 → 取 manifest.capabilities → 仅授予声明的权限
  未找到扩展 → capabilities = [] → 全部方法被拒
```

**规则**: 权限检查发生在 `desktopBridge` 调用**之前**。未授权的方法立即 reject，不会触及底层桥接。

### 2.3 Notifications 豁免

`notifications.show()` 不受 Capability 限制——所有扩展（包括零权限扩展）均可发送 toast 通知。这是扩展向用户反馈的最低通道，不得阻断。

### 2.4 新 Capability 接入流程

1. 在 `extension-schema.ts` 的 `extensionCapabilitySchema` 中添加枚举值
2. 在 `host-api.ts` 中声明对应的 API 方法
3. 在 `host-api-runtime.ts` 中添加 `requireCap()` 守卫
4. 在 `extension-boundaries.test.ts` 中添加权限拒绝测试
5. 在本文档的 §2.1 表格中登记

---

## 3. Contribution Resolver 约束

### 3.1 Disabled = Invisible

`contribution-resolver.ts` 的所有 resolve 函数以 `enabledOnly()` 开头过滤：

```typescript
function enabledOnly(exts: ResolvedExtension[]): ResolvedExtension[] {
  return exts.filter((e) => e.enabled);
}
```

**规则**: disabled 扩展的 activity / sidebar / workbench / settings / action 对 UI 完全不可见。不存在"disabled 但仍显示灰色条目"的中间状态。

### 3.2 extensionId 溯源

Resolver 输出的每个条目都附加了 `extensionId` 字段。下游消费者（Dashboard、Sidebar）通过此字段将 UI 条目关联回扩展实例，用于：
- `useHostApiFor(extensionId)` 获取正确的 Capability 作用域
- `ExtensionWorkspaceHost` 验证扩展启用状态

**规则**: 任何新增的 resolve 函数必须在输出中包含 `extensionId`。

### 3.3 排序

- `activityBar`、`sidebarViews`、`navigation`、`settingsSections` 按 `order` 升序排列
- `workbenchViews`、`workspacePanels`、`contextActions` 保持声明顺序

---

## 4. Workbench Registry 安全

### 4.1 注册时机

`registerBuiltinPanels()` 在 `App.tsx` 初始化时调用一次，使用 `registered` 标记防止重复注册。

### 4.2 查找安全

```typescript
getPanel("unknown-key") → undefined
```

`ExtensionWorkspaceHost` 对 `undefined` 返回友好的"工作区视图未找到"提示，不会 crash。

### 4.3 Component Key 解析链

```
workbenchViews[].component → panelRegistry key → React component
```

如果 `component` 字段未设置，则退化为 `workbenchViewId` 作为 registry key。旧 `workspacePanels` 会先被 resolver 归一化为 workbench views，再进入这一链路。

**规则**: 新 builtin 扩展必须：
1. 在 `register-all.tsx` 中调用 `registerPanel(key, Component)`
2. 在 Rust manifest 的 `WorkbenchView.component` 中声明同一个 key（若仍使用旧 `workspacePanels`，也必须确保其归一化后落到同一个 key）

---

## 5. ExtensionWorkspaceHost 渲染守卫

Host 在渲染工作区视图前执行两道检查：

1. **enabled 检查**: `ext.enabled === false` → 显示 PowerOff 占位符，不渲染面板组件
2. **surface 存在检查**: `getPanel(key) === undefined` → 显示 AlertCircle 错误提示

**规则**: 工作区组件不得自行检查启用状态。启用/禁用的控制权完全在 Host 层。

---

## 6. 新扩展接入 Checklist

### Builtin 扩展

- [ ] **Rust manifest**: 在 `mod.rs` 的 `get_builtin_extensions()` 中添加 `BuiltinExtensionManifest`
- [ ] **Capabilities**: 在 manifest 中声明所需的全部 capability（不声明 = 零权限）
- [ ] **Contributes**: 首选声明 activityBar + sidebarViews + workbenchViews；仅在迁移期保留 navigation + workspacePanels
- [ ] **Panel 注册**: 在 `register-all.tsx` 中 `registerPanel(componentKey, Component)`
- [ ] **Component key 一致**: Rust `WorkbenchView.component`（或归一化后的旧字段） === `registerPanel` 的 key
- [ ] **HostApi 使用**: 面板组件通过 `useScopedHostApi()` 获取权限作用域化的 API，**禁止**直接 import `desktopBridge`
- [ ] **边界测试**: 在 `extension-boundaries.test.ts` 中验证 disabled 过滤和 capability 拒绝

### External 扩展

- [ ] **manifest.json**: 包含 `id`, `api_version`, `publisher`, `entry`, `capabilities`, `contributes`
- [ ] **Capability 最小化**: 仅声明实际需要的 capability
- [ ] **Contributes 完整**: activityBar、sidebarViews、workbenchViews 声明正确；旧字段仅作兼容
- [ ] **平台 entry**: 为目标平台提供 entry point（manifest.rs validate() 会检查）

---

## 7. 测试边界矩阵

| 边界 | 测试组 | 验证内容 |
|---|---|---|
| disabled 过滤 | `contribution-resolver: disabled extensions` | 4 个 resolve 函数都排除 disabled 扩展 |
| 空 contributes | `contribution-resolver: missing contributes` | contributes 为空时不 crash，返回空数组 |
| panel 查找 | `panel-registry: lookup safety` | 不存在的 key 返回 undefined，注册后可正确取回 |
| capability 拒绝 | `host-api-runtime: capability enforcement` | 无权限时 reject，有权限时通过 |
| 全局一致性 | `ext_list_all: disabled state consistency` | 混合 enabled/disabled 时全部 resolver 行为一致 |

**运行命令**:
```bash
node --test --experimental-strip-types test/client/extension-boundaries.test.ts
```

---

## 8. 架构不变量（不可违反）

1. **扩展不得直接 import `desktopBridge`** — 必须通过 HostApi 接口访问宿主能力
2. **扩展不得绕过 contribution-resolver 注入 UI** — 所有 UI 贡献来自 manifest.contributes
3. **未知 extensionId 的 HostApi 必须是零权限** — fail-closed，不 fallback 到全权限
4. **Rust 和 TS 的 manifest schema 必须字段同步** — 新增字段两侧同步，PR review 必检
5. **disabled 扩展完全不可见** — 不渲染、不注入导航、不显示设置项

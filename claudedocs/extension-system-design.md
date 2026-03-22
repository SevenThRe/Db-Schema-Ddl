# Extension System Design — Tauri Sidecar 方案

## 1. 架构总览

```
┌─────────────────────────────────────────────────┐
│  主程序 (Tauri + Rust)                           │
│                                                  │
│  ExtensionRegistry  ExtensionLifecycle           │
│       ↓                    ↓                    │
│  extensions_list    extensions_install           │
│  extensions_start   extensions_stop              │
│       ↓                    ↓                    │
│  invoke("ext_*")  ←→  HTTP localhost:{port}      │
│                              ↑                   │
│                    Sidecar 子进程                 │
│                    db-management.exe             │
│                    (任意语言实现)                  │
└─────────────────────────────────────────────────┘
```

扩展以独立可执行文件（Sidecar）运行，通过 HTTP localhost 与主程序通信。主程序负责：
- 扩展的发现、下载、校验、安装
- 子进程的启动与关闭
- 前端的 IPC 转发（`invoke("ext_call")` → HTTP）

---

## 2. 扩展 Manifest 格式

每个扩展 ZIP 包根目录必须包含 `manifest.json`：

```json
{
  "id": "db-management",
  "name": "DB 管理",
  "version": "1.2.0",
  "api_version": 1,
  "publisher": "SevenThRe",
  "description": "数据库连接、快照对比、DDL 应用",
  "release_notes": "修复 Oracle 连接超时问题",
  "min_host_version": "1.1.0",
  "entry": {
    "win32-x64":   "db-management-win32-x64.exe",
    "darwin-x64":  "db-management-darwin-x64",
    "darwin-arm64":"db-management-darwin-arm64",
    "linux-x64":   "db-management-linux-x64"
  },
  "capabilities": [
    "db.connect",
    "db.query",
    "db.schema.read",
    "db.schema.apply"
  ]
}
```

### Capability 清单（v1）

| Capability | 说明 |
|-----------|------|
| `db.connect` | 连接数据库（读凭证） |
| `db.query` | 执行 SELECT 查询 |
| `db.schema.read` | 读取表结构快照 |
| `db.schema.apply` | 执行 DDL 变更 |

---

## 3. 安装包格式

GitHub Release Asset 命名规则：
```
{extension-id}-{version}-{platform}.zip
db-management-1.2.0-win32-x64.zip
db-management-1.2.0-darwin-arm64.zip
```

ZIP 内容：
```
manifest.json               ← 必须
db-management-win32-x64.exe ← 可执行文件
```

存储路径（AppData）：
```
{app_data}/extensions/
  db-management/
    manifest.json
    db-management-win32-x64.exe
    state.json              ← 运行状态（lifecycle stage）
```

---

## 4. 启动握手协议

主程序启动 Sidecar 后，监听其 stdout：

```
主程序  →  spawn db-management.exe
Sidecar →  stdout: "READY port=38421\n"
主程序  →  记录 port，开始健康检查
主程序  →  GET http://localhost:38421/health
Sidecar →  200 OK {"status":"ok","version":"1.2.0"}
```

**超时规则**：
- 若 10 秒内未收到 `READY`，视为启动失败
- 健康检查每 30 秒一次，连续 3 次失败则标记为 crashed

---

## 5. HTTP API 规范（扩展侧实现）

所有扩展必须在指定 port 上实现以下端点：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/shutdown` | 主程序发起优雅关闭 |
| POST | `/call` | 通用方法调用入口 |

### `/call` 请求格式

```json
{
  "method": "db.connect",
  "params": {
    "host": "localhost",
    "port": 3306,
    "database": "mydb",
    "username": "root",
    "password": "..."
  },
  "request_id": "uuid-v4"
}
```

### `/call` 响应格式

```json
{
  "request_id": "uuid-v4",
  "ok": true,
  "result": { ... },
  "error": null
}
```

---

## 6. 生命周期状态机

```
not_installed
    ↓ install
downloading
    ↓ (success)
verifying          ← SHA256 校验
    ↓ (success)
installed
    ↓ start        ↑ stop
running ──────────────────
    ↓ update
downloading        ← 先下载新版，再替换
    ...

任意状态 → error（可重试）
installed → uninstalling → not_installed
```

### 状态持久化（state.json）

```json
{
  "stage": "installed",
  "installed_version": "1.2.0",
  "pid": null,
  "port": null,
  "error": null,
  "last_check_at": "2026-03-21T10:00:00Z"
}
```

---

## 7. 前端 IPC 接口（Tauri invoke）

主程序暴露给前端的 commands：

```typescript
// 扩展列表与安装状态
invoke("ext_list")               → ExtensionState[]
invoke("ext_get", { id })        → ExtensionState
invoke("ext_install", { id })    → void        // 触发下载安装
invoke("ext_uninstall", { id })  → void
invoke("ext_start", { id })      → void
invoke("ext_stop", { id })       → void

// 调用扩展方法（主程序代理转发到 HTTP）
invoke("ext_call", {
  extension_id: "db-management",
  method: "db.connect",
  params: { ... }
})  → unknown
```

### ExtensionState 数据结构

```typescript
type ExtensionState = {
  id: string;
  name: string;
  version: string | null;
  stage: ExtensionLifecycleStage;
  capabilities: string[];
  pid: number | null;
  port: number | null;
  error: string | null;
  catalog: ExtensionCatalog | null;  // GitHub 上的最新版本信息
};

type ExtensionLifecycleStage =
  | "not_installed"
  | "downloading"
  | "verifying"
  | "installed"
  | "starting"
  | "running"
  | "stopping"
  | "error";

type ExtensionCatalog = {
  latest_version: string;
  release_notes: string;
  download_url: string;
  sha256: string;
  size_bytes: number;
  published_at: string;
};
```

---

## 8. Rust 模块结构

```
src-tauri/src/extensions/
  mod.rs          ← 模块入口，pub use
  manifest.rs     ← Manifest 解析与验证
  registry.rs     ← 扩展注册表（已安装扩展的 CRUD）
  lifecycle.rs    ← 状态机：下载→校验→安装→启动→停止
  process.rs      ← Sidecar 子进程管理（spawn/kill/健康检查）
  github.rs       ← GitHub Release API 查询 + 文件下载
  proxy.rs        ← ext_call → HTTP 转发逻辑
  commands.rs     ← Tauri command 入口（ext_list / ext_call 等）
```

---

## 9. 实现优先级

| Phase | 内容 | 依赖 |
|-------|------|------|
| **2a** | manifest.rs + registry.rs（读写本地已安装扩展） | 无 |
| **2b** | github.rs（拉取 catalog 信息） | 2a |
| **2c** | lifecycle.rs（下载 → 校验 → 安装） | 2a, 2b |
| **2d** | process.rs（启动/停止 Sidecar） | 2c |
| **2e** | proxy.rs + commands.rs（ext_call 转发） | 2d |
| **3** | 前端 UI（use-extensions, 设置页） | 2e |
| **4** | db-management 扩展本体 | 3 |

---

## 10. 安全考量

- 所有扩展 ZIP 必须通过 SHA256 校验后才能安装
- 扩展可执行文件设置为不可写（防止篡改）
- `ext_call` 仅允许调用已声明在 `capabilities` 中的方法
- Sidecar 进程以最低权限运行（无 UAC 提升）
- HTTP 仅绑定 `127.0.0.1`，不对外网开放

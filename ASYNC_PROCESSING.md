# 异步文件处理实现

## 概述

为了解决大文件上传时应用冻结的问题，实现了基于任务队列的异步处理系统。

## 架构变更

### 1. 任务管理系统 (`server/lib/task-manager.ts`)

- 实现了异步任务队列管理器
- 支持并发任务处理（最多 4 个并发任务）
- 使用 `setImmediate` 避免阻塞事件循环
- 支持任务进度追踪和状态管理

### 2. 数据库 Schema 更新 (`shared/schema.ts`)

添加了 `processing_tasks` 表用于持久化任务状态：
- `taskType`: 任务类型（hash, parse_sheets, parse_table）
- `status`: 任务状态（pending, processing, completed, failed）
- `progress`: 进度（0-100）
- `result`: JSON 格式的结果数据
- `error`: 错误信息

### 3. API 更新

#### 新增端点
- `GET /api/tasks/:id` - 查询任务状态和进度

#### 修改的端点
- `POST /api/files` - 文件上传立即返回，不等待哈希计算完成
  - 返回 `taskId` 和 `processing` 标志

- `GET /api/files/:id/sheets` - 大文件（>5MB）使用后台任务处理
  - 小文件仍然同步处理
  - 大文件返回 `taskId` 供轮询

### 4. 前端更新 (`client/src/hooks/use-ddl.ts`)

- 添加 `useTask` hook 用于轮询任务状态
- 更新 `useUploadFile` 支持异步上传
- 更新 `useSheets` 支持大文件的异步处理
- 自动轮询机制：每 500ms 轮询一次，直到任务完成

## 工作流程

### 文件上传流程

1. 用户选择文件上传
2. 服务器立即创建临时文件记录并返回
3. 后台任务计算文件哈希
4. 完成后检查重复并更新文件记录
5. 前端轮询任务状态，完成后刷新文件列表

### Sheet 解析流程

1. 用户选择文件查看 sheets
2. 小文件（≤5MB）：同步处理并返回结果
3. 大文件（>5MB）：
   - 创建后台任务
   - 返回 taskId
   - 前端轮询任务状态
   - 获取结果并显示

## 性能优化

1. **避免阻塞**: 使用 `setImmediate` 将耗时操作分片处理
2. **异步 I/O**: 使用 `fs.promises` 进行异步文件读取
3. **并发控制**: 限制最多 4 个并发任务
4. **智能处理**: 小文件仍使用同步处理，只有大文件才使用异步任务

## 注意事项

- 任务完成后会保留 5 分钟，之后自动清理
- 前端会持续轮询进行中的任务，直到完成或失败
- 文件哈希计算仍在主线程，但使用 `setImmediate` 避免长时间阻塞
- 数据库操作（MemoryStorage 或 DatabaseStorage）均支持任务管理

## 未来改进

1. 可以考虑使用 WebSocket 替代轮询，实现实时进度更新
2. 可以添加 Worker Threads 真正并行处理（当前使用异步避免阻塞）
3. 可以添加任务取消功能
4. 可以添加批量文件上传支持

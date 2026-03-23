# 个人 Codex 最佳实践

最后更新：2026-03-23

这份文档面向个人开发者日常使用 Codex，不谈泛泛的“AI 使用原则”，只讲真正会影响产出质量的做法。内容基于当前 OpenAI 官方关于 Codex、GPT-5.4、Responses API、reasoning、evals，以及 GPT-5.4 前端设计文章整理而成。

## 1. 默认工作方式

### 1.1 把 GPT-5.4 当作默认起点

- 大多数编码任务，默认先用 `gpt-5.4`。
- 不要因为任务和代码有关，就机械地优先选某个带 `codex` 名字的模型。
- `gpt-5.3-codex` 某些场景确实不如 `gpt-5.4`，一次能做好的事，没必要使用5.3反复做
- 只有在任务结构明显更难时，才提高 reasoning 强度：
  - 跨文件重构；
  - 架构级排障；
  - 迁移方案设计；
  - 长链路工具调用；
  - 多个候选根因并存的疑难问题。

原因：

- OpenAI 当前文档明确建议在 Codex 里，大多数代码生成任务优先从 `gpt-5.4` 开始。
- OpenAI 对 GPT-5.4 的官方迁移建议也强调：先调 reasoning 档位，不要假设某一个固定设置永远最优。

## 2. 少用“聊天习惯”，多用“有状态工作流”思维

### 2.1 多步任务要按状态化流程来做

- 只要任务会经历“阅读代码 -> 修改 -> 验证 -> 修正”，就别把它当成一次性问答。
- 尽量保留前面步骤的输出、工具上下文和中间判断。
- 如果你在 Codex 之外自己做 OpenAI 集成，优先使用 `Responses API` 承载这类状态化、多工具工作流。

### 2.2 长任务默认按后台任务理解

- 会跑几分钟、可能重试、需要多次工具调用的任务，不要按单次阻塞请求去设计。
- 对高强度推理模型，例如 `gpt-5.4-pro`，默认按后台模式来思考最稳。

原因：

- OpenAI 明确把 `Responses API` 作为 GPT-5 工作流的主路径，并指出它在智能性、reasoning token、缓存命中率和延迟上更有优势。
- OpenAI 也明确建议长耗时任务使用 `background mode`。

## 3. Prompt 要服务执行，不要服务解释

### 3.1 一个合格的 Codex 任务请求，至少有四段

建议固定用这个结构：

```text
Goal:
任务完成后，什么必须成立。

Scope:
哪些文件/模块允许改，哪些不能碰。

Constraints:
技术边界、风格约束、风险边界、非目标。

Verification:
结束前必须跑什么检查，确认什么结果。
```

示例：

```text
Goal:
让 Excel 表预览正确处理单个 sheet 内多个表定义。

Scope:
只允许修改 server/lib/excel.ts 和相关测试。

Constraints:
不要改 API response shape。保留现有 generator-based parsing 结构。

Verification:
运行 npm run check 和解析相关测试，并报告未覆盖的边界情况。
```

### 3.2 请求里要明确要求闭环

推荐常用表达：

- 先读现有实现再动手；
- 做最小但完整的改动；
- 改完必须跑检查；
- 如果检查失败，且问题属于当前任务范围内，就继续修；
- 最后分开汇报改动、验证、剩余风险。

这类请求对 Codex 的约束力，明显强于“给我一个方案”或“帮我想想怎么做”。

## 4. 不要对 reasoning 模型过度表演式 prompting

### 4.1 停止写旧式 chain-of-thought bait

少写这些：

- `think step by step`
- `think harder`
- 很长的流程口号
- 重复多次“请务必非常小心”

应替换成：

- 明确约束；
- 干净输入；
- 清晰输出格式；
- 可执行的验收条件。

### 4.2 难任务先修任务定义，再调高 reasoning

- 第一步先把任务描述写清楚。
- 还不稳定，再加 reasoning 强度。
- 不要拿高 reasoning 去补一个模糊 prompt 的洞。

原因：

- OpenAI 当前 reasoning guidance 更偏向直接指令、结构化输入，而不是表演式思维诱导。
- GPT-5.4 的迁移指导也强调先试 reasoning 档位，而不是迷信一个固定“神仙配置”。

## 5. 前端任务要 prompt“视觉系统”，不是只 prompt DOM

这是最容易拉开结果差距的一段。

### 5.1 不要用“做得更好看一点”开局

这种说法几乎一定导向中位数 UI。

至少要同时给出这四项：

- 视觉方向；
- 产品意图；
- 信息密度；
- 明确禁区。

示例：

```text
Visual direction:
偏运营工具，不是营销页。

Product intent:
高频查看，高速扫描，低视觉噪音。

Density:
紧凑型，优先保证表格和数据的阅读效率。

Avoid:
通用 SaaS 渐变、大卡片、装饰性留白、花哨动画。
```

### 5.2 新界面先发散，再收敛

对于新页面或重设计页面，建议要求 Codex：

1. 先给 2 到 3 个方向；
2. 讲清每个方向的取舍；
3. 选中一个后，再进入实现。

这比“一次性把页面做出来”更符合 OpenAI 那篇 GPT-5.4 前端文章的实际做法。

### 5.3 让模型在正确的设计层级上工作

如果你要的是“设计质量”，那就应该给这些信息：

- 字体气质；
- 间距节奏；
- 组件密度；
- 状态样式；
- 响应式行为；
- 交互风格。

示例：

```text
Typography:
功能型、克制，不要默认 SaaS 味。

Spacing:
偏紧凑，但保持可读。优先 8/12/16 节奏。

States:
hover 和 focus 必须提升可用性，不只是增加动画。

Responsive:
桌面优先，小屏时做紧凑适配。
```

### 5.4 图片、moodboard 只拿来发散，不拿来当最终规格

- 适合在前期探索视觉方向；
- 不适合直接当生产实现规格；
- 一旦选定方向，就应重新落回明确的 UI 约束和实现要求。

原因：

- OpenAI 的 GPT-5.4 前端文章本质上是在鼓励：先扩方向，再收约束，再实现。

## 6. 工具密集型任务要显式要求过程可见

对涉及文件阅读、编辑、测试、浏览器操作、多轮修正的任务，建议显式要求：

- 过程里给简短进度更新；
- 大改前先说明准备改什么；
- 最终汇报必须拆成：
  - 改了什么；
  - 验证了什么；
  - 没验证什么；
  - 剩余风险是什么。

这不是形式主义。它能明显减少静默跑偏。

## 7. 验证不是附加项，而是任务本体的一部分

### 7.1 每个像样的 Codex 请求，都应该有验证条款

例如：

- 跑 `npm run check`；
- 跑受影响测试文件；
- 做页面 smoke test；
- 确认 flow 中没有 console error；
- 检查桌面端和移动端；
- 报告无法验证的部分。

### 7.2 改 prompt、工作流、模型时，要持续评估

- 只要你改了 prompt、workflow 或 model setup，就重新跑验证。
- 如果任务对 prompt 很敏感，保留通过和失败样例。
- 对高频任务，维护一个很小的个人 eval 集。

原因：

- OpenAI 的 eval 指南明确推荐持续评测，并强调样本要覆盖真实数据、边界情况和对抗情况。

## 8. 建一个个人反回归样例集

对重复发生的 Codex 任务，建议至少保留四类测试提示词：

- 一个正常样例；
- 一个边界样例；
- 一个失败样例；
- 一个歧义样例。

例如编码场景：

- 正常：改一个组件的小交互；
- 边界：重构一个被多个文件调用的 util；
- 失败：修一个 flaky test 且不改变行为；
- 歧义：调试一个有两个可能根因的 bug。

如果新模型、新 prompt、新工作流在这些样例上更差，就不要把它提成默认流程。

## 9. 个人模型选择经验法则

作为默认启发式，建议：

- `gpt-5.4`
  - 大多数编码、重构、代码评审、前端实现都从它开始；
- `gpt-5.4` 提高 reasoning
  - 任务比较难，但边界还清晰时用；
- `gpt-5.4-pro`
  - 真正高成本、高价值、结构复杂、允许更长等待时间的任务再用；
- 更轻更快的模型
  - 已经验证过流程、任务又窄又重复时再用。

注意：

- 一次只改一个变量。
- 不要同时换模型、换 prompt 风格、换 workflow 结构，否则你不知道到底是什么起作用。

## 10. 个人前端任务模板

需要 Codex 做前端时，可以直接复用：

```text
Goal:
实现/改造 [页面或组件]。

Product intent:
这个界面是干什么的，用户如何使用。

Visual direction:
用自然语言描述设计语言。

Density:
紧凑 / 均衡 / 宽松。

Constraints:
保留现有设计系统 / 可重做视觉 / 不改信息架构 / 不新增库。

Avoid:
明确列出你不要的 UI 味道和失败模式。

Implementation:
允许修改哪些文件。

Verification:
typecheck / build / smoke test / responsive / console error。
```

## 11. 个人代码修改任务模板

```text
Goal:
[明确的完成状态]

Scope:
[允许修改的文件或模块]

Must preserve:
[API、schema、行为、视觉语言]

Do not:
[明确非目标]

Execution:
先阅读当前实现，再做最小但完整的修复。

Verification:
运行 [检查项]。无法验证的地方必须明确说出来。

Output:
最后汇报改动、验证和剩余风险。
```

## 12. 常见反模式

避免这些习惯：

- 问“最佳实践”却不给具体使用场景；
- 说“做得更好一点”但不给约束；
- 仓库已经在眼前，却只让 Codex 讲方案不让它执行；
- diff 看起来对，就跳过验证；
- 一个大 prompt 想一步做完整个复杂任务；
- 拿更高 reasoning 去补模糊需求；
- 靠感觉评估新工作流，而不是拿固定样例回归。

## 13. 参考来源

本文件用到的 OpenAI 官方来源：

- [Designing delightful frontends with GPT-5.4](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4)
- [From prompts to products: One year of Responses](https://developers.openai.com/blog/one-year-of-responses)
- [Using GPT-5.4](https://developers.openai.com/api/docs/guides/latest-model/)
- [Code generation: Use Codex](https://developers.openai.com/api/docs/guides/code-generation/#use-codex)
- [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices/)
- [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices/)
- [GPT-5.4 pro model](https://developers.openai.com/api/docs/models/gpt-5.4-pro)

## 14. 这份文档的核心判断

这份文档故意做了一个很强的归纳：

- OpenAI 当前真正鼓励的，不是“把 prompt 写得更花”；
- 而是“选对模型，在有状态工作流里，用明确约束驱动执行，并持续验证”。

这句归纳是我的总结，不是官方原句；但它和上面的官方材料是对齐的。

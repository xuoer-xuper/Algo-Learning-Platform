# Checklist

## 阶段一：前置基础

- [ ] notes 表创建成功，字段与 DATABASE_SCHEMA.md §7.1 一致
- [ ] userData/notes/ 目录下 Markdown 文件正确创建/读取/删除
- [ ] note:* IPC 在 preload 正确暴露，渲染进程可调用
- [ ] 题目详情页显示笔记列表，支持新建/打开/重命名/删除
- [ ] submissions 表新增 code_file_path/code_summary/code_language 列
- [ ] 提交详情页可关联本地代码文件，路径失效时显示警告
- [ ] AIContextExporter 导出 JSON 带 version 字段，不含 Cookie/敏感路径/raw_json
- [ ] coach:getContext IPC 可用，返回最近错题/薄弱标签/活跃趋势/当前题目

## 阶段二：AI Coach 核心架构

- [ ] 所有新依赖安装成功，npm run dev 无原生模块加载错误
- [ ] vite.config.ts 的 external 包含 sqlite-vec、@huggingface/transformers、onnxruntime-node
- [ ] tailwind.config.js 包含 typography 插件和动画 keyframes
- [ ] ai_memory 表创建成功，含 memory_type/content/related_tags_json/importance 字段
- [ ] knowledge_entries 表创建成功，含 embedding_blob 字段
- [ ] coach_logs 表创建成功，含 trigger_type/token_used/user_feedback 字段
- [ ] coach:* IPC 全部注册，preload 正确暴露
- [ ] onProblemDetected 订阅器在 preload 暴露，渲染进程能收到 problem:detected 事件
- [ ] 规则引擎 WA_THRESHOLD=3 触发时，桌宠收到 notification（0 token）
- [ ] 规则引擎 STAY_THRESHOLD_MIN=15 触发时，桌宠收到提示
- [ ] 规则引擎 WRONG_TAG_THRESHOLD=5 触发时，桌宠收到预警
- [ ] 所有规则触发记录到 coach_logs，token_used=0

## 阶段三：知识库 RAG

- [ ] bge-small-zh 模型成功加载，缓存在 userData/cache/models/
- [ ] embed(text) 返回正确维度的 Float32Array
- [ ] 导入 Markdown 模板目录后，knowledge_entries 表有记录，embedding_blob 非空
- [ ] sqlite-vec 虚拟表创建成功，支持余弦相似度检索
- [ ] search(query, tags) 返回 Top-3 相关模板
- [ ] 知识库检索 0 token 消耗

## 阶段四：LLM 层

- [ ] OpenAIAdapter 配置 DeepSeek base_url 后可正常调用
- [ ] AnthropicAdapter 配置 Claude API 后可正常调用
- [ ] 流式输出正常工作，对话面板逐字显示
- [ ] LLMDispatcher 根据用户配置自动选择适配器
- [ ] 短期记忆：当前对话上下文正确维护，超限时触发压缩
- [ ] 长期记忆：ai_memory 表可 CRUD，sqlite-vec 检索 Top-5 正常
- [ ] 记忆智能更新：ADD/UPDATE/DELETE/NONE 逻辑正确，仅在关键节点触发
- [ ] 风险记忆：user_feedback='useless' 的记录被保存
- [ ] 记忆检索结果正确注入 LLM 上下文
- [ ] CoachService.getSuggestion L1 触发 → 0 token
- [ ] CoachService.getSuggestion L2 触发 → 0 token
- [ ] CoachService.getSuggestion L3 触发 → 花 token
- [ ] 引导策略引擎：给方向 → 给伪代码 → 给完整思路 分层正常
- [ ] 所有交互记录到 coach_logs

## 阶段五：桌宠 UI

- [ ] coachStore 状态切换正常（status/bubbleContent/isPanelOpen/conversation）
- [ ] 桌宠显示在右下角，position:fixed
- [ ] 桌宠状态切换动画正常（idle/thinking/worried/happy/sleeping）
- [ ] 桌宠可拖拽移动位置
- [ ] 气泡提示正确显示规则引擎内容
- [ ] z-index：桌宠低于 modal-panel，高于 content-area
- [ ] 对话面板点击桌宠展开/关闭
- [ ] 对话历史正确显示（用户消息 + Coach 回复）
- [ ] 输入框发送消息，调用 coach:chatStream
- [ ] Coach 回复用 react-markdown 渲染，代码块高亮
- [ ] 流式输出逐字显示
- [ ] App.tsx 挂载 CoachWidget，不影响现有功能
- [ ] problem:detected 事件更新 coachStore 当前题目
- [ ] coach:notification 事件更新桌宠状态和气泡
- [ ] 设置页 AI Coach 配置区可填写 provider/base_url/api_key/model

## 阶段六：端到端验证

- [ ] 导入模板目录 → 知识库填充成功
- [ ] 打开题目 → 桌宠 idle 状态
- [ ] 模拟 WA 3 次 → 桌宠 worried + 气泡提示（0 token）
- [ ] 点击桌宠 → 对话面板展开 → 提问 → 流式回复
- [ ] 第二次对话能回忆起第一次内容（长期记忆生效）
- [ ] 卡题时桌宠推荐相关模板（知识库 RAG 生效）
- [ ] coach_logs 所有交互有记录，token_used 字段正确
- [ ] 应用整体性能无明显下降（桌宠不卡顿）

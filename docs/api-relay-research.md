# API 中转支持调研报告

> 调研目标:在 personaX 后端加入"自定义 API 中转"能力(第三方 Anthropic 兼容端点),与现有订阅认证共存可切换。
> 所有结论均直接摘自源码,标注"已确认"或"未找到/不确定"。

---

## 问题一:query() Options 类型里有哪些关键字段

**已确认** — 证据来自 `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` 及项目内 `docs/agent-sdk-api.md`。

### `env` 字段 ✅ 存在,且是核心注入点

```ts
// sdk.d.ts 1363-1365
env?: {
  [envVar: string]: string | undefined;
};
```

JSDoc 原文(1348-1362):

> Environment variables for the Claude Code process.
>
> **When set, this value REPLACES the subprocess environment entirely — it is not merged with `process.env`.**
> Spread `process.env` yourself if the subprocess still needs inherited variables like `PATH`, `HOME`, or `ANTHROPIC_API_KEY`.
> When omitted, the subprocess inherits `process.env`.

关键结论:**`env` 是 `query()` 的 `Options` 字段,每次调用均可独立传入,实现「按调用注入不同环境变量」。** 这是支持中转与订阅共存路由的决定性机制。

### 其他相关字段

| 字段 | 存在 | 类型 / 说明 |
|------|------|-------------|
| `env` | **已确认** | `{ [envVar: string]: string \| undefined }`,全量替换子进程环境 |
| `executable` | **已确认** | `'bun' \| 'deno' \| 'node'` — JS 运行时选择 |
| `executableArgs` | **已确认** | `string[]` — 传给运行时的额外参数 |
| `extraArgs` | **已确认** | `Record<string, string \| null>` — 传给 Claude Code CLI 的额外 CLI 参数 |
| `pathToClaudeCodeExecutable` | **已确认** | `string` — 指定 CLI 二进制路径 |
| `spawnClaudeCodeProcess` | **已确认** | `(options: SpawnOptions) => SpawnedProcess` — 完全自定义 spawn 函数 |
| `baseUrl / base_url / baseURL` | **未找到** | Options 里没有独立的 base URL 字段;需通过 `env.ANTHROPIC_BASE_URL` 传入 |
| `additionalArgs` | **未找到** | 不存在该字段名;对应能力用 `extraArgs` |

`SpawnOptions`(传给 `spawnClaudeCodeProcess`)包含 `env: { [envVar: string]: string | undefined }`,若需要在 spawn 层注入也可以通过这个自定义 hook 实现。

---

## 问题二:SDK/CLI 识别哪些环境变量

**已确认** — 通过 grep `sdk.mjs` / `bridge.mjs` 及 `sdk.d.ts` JSDoc 注释确认。

| 环境变量 | 状态 | 说明 |
|----------|------|------|
| `ANTHROPIC_BASE_URL` | **已确认** | CLI 读取,用于覆盖 API endpoint base URL |
| `ANTHROPIC_API_KEY` | **已确认** | 标准 API key 认证;sdk.d.ts 注释中明确举例 |
| `ANTHROPIC_AUTH_TOKEN` | **已确认** | Bearer token 认证,另一种 auth 方式 |
| `CLAUDE_CODE_OAUTH_TOKEN` | **已确认** | Claude 订阅 OAuth token;sdk.mjs 中存在 |
| `ANTHROPIC_CUSTOM_HEADERS` | **已确认** | 自定义 HTTP headers(注:非 `ANTHROPIC_DEFAULT_HEADERS`,实际变量名是 `ANTHROPIC_CUSTOM_HEADERS`) |
| `ANTHROPIC_DEFAULT_HEADERS` | **未找到** | 该名称未出现;实际是 `ANTHROPIC_CUSTOM_HEADERS` |
| `HTTPS_PROXY` | **已确认** | HTTP CONNECT 隧道代理;bridge.mjs 中存在 |
| `ANTHROPIC_LOG` | **已确认** | 日志级别 |

---

## 问题三:认证优先级

**部分已确认,部分推断** — `sdk.mjs` 是混淆代码无法直接读优先级分支;以下结论综合 `sdk.d.ts` 注释、`bridge.d.ts` 类型设计、以及 personaX 现有代码逻辑推断。

### Claude Code CLI 子进程侧(spawn 时读取的 env)

Claude Code CLI 自身的认证优先级(源自 Claude Code 文档及代码行为):

```
CLAUDE_CODE_OAUTH_TOKEN  >  ANTHROPIC_API_KEY  >  ANTHROPIC_AUTH_TOKEN
```

- `CLAUDE_CODE_OAUTH_TOKEN`:Claude 订阅 OAuth,最高优先级;存在时直接使用 claude.ai 账号认证。
- `ANTHROPIC_API_KEY`:标准 API key;OAuth token 不存在时使用。
- `ANTHROPIC_AUTH_TOKEN`:Bearer token;两者都没有时 fallback。
- `ANTHROPIC_BASE_URL`:若存在,覆盖 API endpoint;与 API key 配合使用,订阅 OAuth 下该值通常无效(因为走的是 claude.ai 而非 api.anthropic.com)。

### personaX 应用层侧(`models.ts` / `settings.ts` 当前逻辑)

```ts
// models.ts buildAuthHeaders()
if (oauth) → Bearer ${oauth} + oauth-2025-04-20 beta header
else if (apiKey) → x-api-key: ${apiKey}
```

即:**订阅 OAuth > API key**,与 CLI 子进程一致。

### "共存"的问题所在

若 `process.env` 同时设置了 `CLAUDE_CODE_OAUTH_TOKEN` 和 `ANTHROPIC_API_KEY`,子进程继承全部环境变量时 OAuth token 会覆盖 API key。必须用 `options.env` 显式控制子进程看到的环境才能按意图路由。

---

## 问题四:Models API 与中转端点

### 当前实现(已确认)

`packages/server/src/api/models.ts` 硬编码访问 `https://api.anthropic.com/v1/models`,支持 `HTTPS_PROXY` 隧道。

### 中转端点的 `/v1/models` 兼容性

**不确定** — 无法验证具体第三方中转,但可以说明:

- 标准 Anthropic API 兼容中转(如 OpenRouter、各类 azure/aws 代理)通常提供 `/v1/models`,返回其支持的模型列表,格式可能与 `api.anthropic.com` 略有差异(如 `max_input_tokens` 字段可能缺失)。
- 部分简单中转只代理 `/v1/messages`,不提供 `/v1/models`,需要做好 fallback(返回 `[]` 或静态列表)。
- **建议**:中转模式下应使用中转 base URL + 中转 key 去拉模型,同时做好 404/500 的容错降级。

---

## 问题五:落地设计建议

### 5.1 数据模型:连接/凭据存储

在 `packages/server/src/store/` 增加 `connections.ts`(类比现有 `settings.ts`):

```ts
// packages/contracts 中定义,server store 中实现
type ConnectionType = 'subscription' | 'api_relay';

interface Connection {
  id: string;               // uuid,唯一标识
  label: string;            // 用户自定义名称,如"官方订阅"、"某中转"
  type: ConnectionType;
  // 仅 api_relay 有效:
  baseUrl?: string;         // 如 https://relay.example.com/v1
  // API key 不存内存/JSON 明文 — 见安全节
  apiKeyRef?: string;       // 指向 .env 变量名或 keystore 条目
}

interface ConnectionsStore {
  connections: Connection[];
  activeConnectionId: string | null;  // null = 使用 .env 默认
}
```

per-agent 选择:在 `AgentDef` 里加可选字段 `connectionId?: string`,优先于全局 activeConnectionId。

### 5.2 运行时注入:query() 时如何路由

**已确认:`Options.env` 支持 per-call 注入。** 每次 `query()` 时根据所选连接构造 env:

```ts
// packages/server/src/sdk/runAgent.ts 改造示意

function buildEnvForConnection(conn: Connection | null): Record<string, string | undefined> {
  if (!conn || conn.type === 'subscription') {
    // 订阅模式:继承 process.env,子进程用 CLAUDE_CODE_OAUTH_TOKEN
    return { ...process.env };
  }
  // 中转模式:去掉 OAuth token,注入 BASE_URL + API_KEY
  const env = { ...process.env };
  delete env['CLAUDE_CODE_OAUTH_TOKEN'];   // 防止 OAuth 覆盖 API key
  env['ANTHROPIC_BASE_URL'] = conn.baseUrl!;
  env['ANTHROPIC_API_KEY'] = resolveApiKey(conn);  // 从 keystore 读取
  return env;
}

// query() 调用处:
const options: Options = {
  // ... 现有字段 ...
  env: buildEnvForConnection(resolveConnection(def, globalSettings)),
};
const stream = query({ prompt: input, options });
```

**注意**:`env` 全量替换子进程环境,必须扩展 `process.env` 后再删/加字段,否则子进程缺 `PATH`、`HOME` 等系统变量会崩。

**并发安全**:上述方案每次 query 独立构造 env 对象,互不干扰,无并发风险(不改 `process.env` 本身)。若改用临时修改 `process.env` 包住调用的方案则有严重并发竞争——**不推荐**。

### 5.3 替代方案:spawnClaudeCodeProcess hook

若因某些原因不能/不想用 `options.env`,可用 `spawnClaudeCodeProcess`:

```ts
spawnClaudeCodeProcess: (spawnOpts) => {
  const patchedEnv = buildEnvForConnection(conn);
  return spawn(spawnOpts.command, spawnOpts.args, {
    ...spawnOpts,
    env: patchedEnv,
  });
}
```

效果等价,但代码更复杂,优先用 `options.env`。

### 5.4 /models 和 /provider 跟随所选连接

**GET /models** — 需要知道"当前激活连接"来决定从哪里拉模型:

```ts
// models.ts 改造:接受显式 connection 参数
async function fetchModels(conn?: Connection): Promise<ModelInfo[]> {
  const baseUrl = conn?.type === 'api_relay' ? conn.baseUrl : 'https://api.anthropic.com';
  const headers = conn?.type === 'api_relay'
    ? buildRelayHeaders(conn)
    : buildOAuthHeaders();
  // 其余逻辑不变,替换 targetHost + targetPath
}
```

**GET /provider** — 扩展返回字段,反映当前激活连接:

```ts
return {
  provider: conn?.type === 'api_relay' ? 'api_relay' : 'anthropic',
  authMethod: conn?.type === 'api_relay' ? 'api_key' : (hasOAuth ? 'subscription' : 'api_key'),
  authConfigured: ...,
  activeConnectionId: globalSettings.activeConnectionId,
};
```

连接列表通过单独端点 `GET /connections` 暴露(不含 API key 明文,见下)。

### 5.5 安全:API key 不回明文

- **存储**:API key 不存 JSON/数据库明文。方案 A:存入 `.env` 文件(变量名如 `API_RELAY_KEY_<id>`),`Connection` 只存变量名引用。方案 B:使用操作系统 keystore(`keytar` 或 Windows Credential Manager)。
- **接口**:
  - `POST /connections` 接受 apiKey → 写 .env 或 keystore,不回传。
  - `GET /connections` 返回 `{ id, label, type, baseUrl, hasKey: boolean }`,无 apiKey 字段。
  - `PUT /connections/:id` 更新时 apiKey 可选,省略则不覆盖已有 key。

---

## 不确定项与风险

| 项 | 说明 |
|----|------|
| CLI 认证优先级的精确分支代码 | sdk.mjs 是混淆代码,优先级顺序来自文档推断;已有足够证据支持方案,但若中转不识别 `ANTHROPIC_API_KEY` 需查中转文档 |
| 中转端点是否提供 `/v1/models` | 不确定,建议实现时加 fallback:失败返回 `[]` 或静态列表 |
| `ANTHROPIC_BASE_URL` 对订阅 OAuth 的影响 | 若同时设置 `CLAUDE_CODE_OAUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`,CLI 行为可能未定义;方案中已通过 delete 防范 |
| API key 持久化方案 | .env 文件在多实例部署中有竞争问题;生产环境建议用 keystore 或 secrets manager |

---

## 快速参考:关键文件路径

| 文件 | 用途 |
|------|------|
| `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` | Options 类型定义(env 字段 L1363) |
| `packages/server/src/sdk/runAgent.ts` | query() 调用处,改造注入点 |
| `packages/server/src/runtime/chat.ts` | query() 调用处(1v1 chat),同样需改造 |
| `packages/server/src/api/models.ts` | GET /models,需参数化 base URL |
| `packages/server/src/api/settings.ts` | GET /provider,需扩展字段 |
| `packages/server/src/store/settings.ts` | 设置 store,参考模式新建 connections store |

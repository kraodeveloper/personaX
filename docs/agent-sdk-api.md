# @anthropic-ai/claude-agent-sdk v0.3.185 — 精确 API 签名参考

> 所有类型摘自 `sdk.d.ts`（主入口，package.json `"types": "sdk.d.ts"`）。
> 标注：**已确认** = 直接摘自 .d.ts；**未找到/不确定** = 未在类型文件中出现。

---

## 1. `query()` 函数及 Options 类型

### 已确认

```ts
export declare function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

**返回值 `Query`** — 实现 `AsyncGenerator<SDKMessage, void>` 并附加控制方法：

```ts
export declare interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  applyFlagSettings(settings: { [K in keyof Settings]?: Settings[K] | null }): Promise<void>;
  close(): void;
  // ...及其他控制方法（mcpServerStatus, setMcpServers, rewindFiles 等）
}
```

> `query()` 返回的是 `Query`（`AsyncGenerator` 的子类型），可以用 `for await...of` 迭代，也有 `.interrupt()` 方法。

### Options 字段（已确认，完整列表）

```ts
export declare type Options = {
  abortController?: AbortController;
  additionalDirectories?: string[];
  agent?: string;
  agents?: Record<string, AgentDefinition>;
  allowedTools?: string[];           // 自动允许，不提示
  canUseTool?: CanUseTool;           // 自定义权限回调
  continue?: boolean;
  cwd?: string;
  disallowedTools?: string[];
  toolAliases?: Record<string, string>;
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  env?: { [envVar: string]: string | undefined };
  executable?: 'bun' | 'deno' | 'node';
  executableArgs?: string[];
  extraArgs?: Record<string, string | null>;
  fallbackModel?: string;
  enableFileCheckpointing?: boolean;
  toolConfig?: ToolConfig;
  forkSession?: boolean;
  betas?: SdkBeta[];
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  onElicitation?: OnElicitation;
  onUserDialog?: OnUserDialog;
  supportedDialogKinds?: string[];
  persistSession?: boolean;          // default: true
  sessionStore?: SessionStore;       // @alpha
  sessionStoreFlush?: SessionStoreFlush; // @alpha
  loadTimeoutMs?: number;            // @alpha, default: 60_000
  includeHookEvents?: boolean;       // default: false
  includePartialMessages?: boolean;  // 流式增量消息开关
  forwardSubagentText?: boolean;
  thinking?: ThinkingConfig;
  effort?: EffortLevel;
  maxThinkingTokens?: number;        // @deprecated
  maxTurns?: number;
  maxBudgetUsd?: number;
  taskBudget?: { total: number };    // @alpha
  mcpServers?: Record<string, McpServerConfig>;
  model?: string;
  outputFormat?: OutputFormat;
  pathToClaudeCodeExecutable?: string;
  permissionMode?: PermissionMode;
  planModeInstructions?: string;
  allowDangerouslySkipPermissions?: boolean;
  permissionPromptToolName?: string;
  plugins?: SdkPluginConfig[];
  promptSuggestions?: boolean;
  agentProgressSummaries?: boolean;
  resume?: string;
  sessionId?: string;
  resumeSessionAt?: string;
  sandbox?: SandboxSettings;
  settings?: string | Settings;
  managedSettings?: Settings;
  settingSources?: SettingSource[];  // 'user' | 'project' | 'local'
  skills?: string[] | 'all';
  debug?: boolean;
  debugFile?: string;
  stderr?: (data: string) => void;
  strictMcpConfig?: boolean;
  systemPrompt?: string | string[] | {
    type: 'preset';
    preset: 'claude_code';
    append?: string;
    excludeDynamicSections?: boolean;
  };
  title?: string;
  spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
};
```

---

## 2. `canUseTool` 函数签名 & `PermissionResult`

### 已确认

```ts
export declare type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    title?: string;
    displayName?: string;
    description?: string;
    toolUseID: string;          // 必填，当前工具调用的唯一 ID
    agentID?: string;
  }
) => Promise<PermissionResult>;
```

```ts
export declare type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    }
  | {
      behavior: 'deny';
      message: string;           // 必填（deny 分支）
      interrupt?: boolean;
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    };

export declare type PermissionDecisionClassification =
  | 'user_temporary'
  | 'user_permanent'
  | 'user_reject';
```

---

## 3. `createSdkMcpServer()` & `tool()` 签名

### 已确认

```ts
export declare function createSdkMcpServer(
  _options: CreateSdkMcpServerOptions
): McpSdkServerConfigWithInstance;

type CreateSdkMcpServerOptions = {
  name: string;
  version?: string;
  instructions?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
  alwaysLoad?: boolean;
};

// 返回值结构
export declare type McpSdkServerConfig = { type: 'sdk'; name: string };
export declare type McpSdkServerConfigWithInstance = McpSdkServerConfig & {
  instance: McpServer;  // from @modelcontextprotocol/sdk/server/mcp.js
};
```

### `tool()` 辅助函数（已确认）

```ts
export declare function tool<Schema extends AnyZodRawShape>(
  _name: string,
  _description: string,
  _inputSchema: Schema,
  _handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  _extras?: {
    annotations?: ToolAnnotations;
    searchHint?: string;
    alwaysLoad?: boolean;
  }
): SdkMcpToolDefinition<Schema>;
```

关键点：
- `_inputSchema` 接受 `ZodRawShape`（`AnyZodRawShape = ZodRawShape | ZodRawShape_2`，同时兼容 zod v3 和 zod v4），**不是 `ZodObject`**。
- handler 签名：`(args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>`
  - **有第二个参数 `extra`，但类型是 `unknown`**（不是具体的 RunContext 结构体，类型文件中未暴露其内部结构）。
- `SdkMcpToolDefinition` 内部定义与此一致：
  ```ts
  export declare type SdkMcpToolDefinition<Schema extends AnyZodRawShape> = {
    name: string;
    description: string;
    inputSchema: Schema;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
    handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>;
  };
  ```

---

## 4. Message Stream 类型（SDKMessage union）

### 已确认

```ts
export declare type SDKMessage =
  | SDKAssistantMessage          // type: 'assistant'
  | SDKUserMessage               // type: 'user'
  | SDKUserMessageReplay
  | SDKResultMessage             // type: 'result'
  | SDKSystemMessage             // type: 'system'（多 subtype）
  | SDKPartialAssistantMessage   // type: 'stream_event'（增量）
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKAPIRetryMessage
  | SDKModelRefusalFallbackMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKPluginInstallMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskUpdatedMessage
  | SDKTaskProgressMessage
  | SDKThinkingTokensMessage
  | SDKSessionStateChangedMessage
  | SDKWorkerShuttingDownMessage
  | SDKCommandsChangedMessage
  | SDKNotificationMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage
  | SDKMemoryRecallMessage
  | SDKRateLimitEvent
  | SDKElicitationCompleteMessage
  | SDKPermissionDeniedMessage
  | SDKPromptSuggestionMessage
  | SDKMirrorErrorMessage
  | SDKInformationalMessage;
```

### 流式增量消息（已确认）

```ts
export declare type SDKPartialAssistantMessage = {
  type: 'stream_event';           // ← 鉴别符
  event: BetaRawMessageStreamEvent;  // 来自 @anthropic-ai/sdk，包含 text_delta / thinking_delta 等
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

> `event` 字段是 `BetaRawMessageStreamEvent`（来自 `@anthropic-ai/sdk`），包含所有流事件变体（`content_block_delta` 内 `text_delta` / `thinking_delta` 等）。启用方式：`options.includePartialMessages: true`。

### 完整 assistant 消息（已确认）

```ts
export declare type SDKAssistantMessage = {
  type: 'assistant';
  message: BetaMessage;           // ← 完整消息，content 数组含 tool_use 块
  parent_tool_use_id: string | null;
  error?: SDKAssistantMessageError;
  uuid: UUID;
  session_id: string;
  request_id?: string;
  supersedes?: UUID[];
  subagent_type?: string;
  task_description?: string;
};
```

> 要获取 `tool_use` 块：`msg.message.content`（`BetaMessage.content` 是 `BetaContentBlock[]`，其中含 `type: 'tool_use'` 的块）。

### Result 消息（已确认）

```ts
export declare type SDKResultMessage = SDKResultSuccess | SDKResultError;

export declare type SDKResultSuccess = {
  type: 'result';
  subtype: 'success';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;           // false
  num_turns: number;
  result: string;              // 最终文本结果
  stop_reason: string | null;
  total_cost_usd: number;
  usage: NonNullableUsage;     // NonNullable<BetaUsage> 的完整版
  modelUsage: Record<string, ModelUsage>;
  permission_denials: SDKPermissionDenial[];
  structured_output?: unknown;
  deferred_tool_use?: SDKDeferredToolUse;
  terminal_reason?: TerminalReason;
  fast_mode_state?: FastModeState;
  origin?: SDKMessageOrigin;
  uuid: UUID;
  session_id: string;
};

export declare type SDKResultError = {
  type: 'result';
  subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;           // true
  num_turns: number;
  stop_reason: string | null;
  total_cost_usd: number;
  usage: NonNullableUsage;
  modelUsage: Record<string, ModelUsage>;
  permission_denials: SDKPermissionDenial[];
  errors: string[];
  terminal_reason?: TerminalReason;
  fast_mode_state?: FastModeState;
  origin?: SDKMessageOrigin;
  uuid: UUID;
  session_id: string;
};
```

---

## 5. `mcpServers` 配置类型

### 已确认

```ts
// 总联合
export declare type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfigWithInstance;

// stdio（本地子进程）
export declare type McpStdioServerConfig = {
  type?: 'stdio';          // 可省略，默认即 stdio
  command: string;         // 必填
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  alwaysLoad?: boolean;
};

// SSE
export declare type McpSSEServerConfig = {
  type: 'sse';             // 必填
  url: string;             // 必填
  headers?: Record<string, string>;
  tools?: McpServerToolPolicy[];
  timeout?: number;
  alwaysLoad?: boolean;
};

// HTTP（Streamable HTTP）
export declare type McpHttpServerConfig = {
  type: 'http';            // 必填
  url: string;             // 必填
  headers?: Record<string, string>;
  tools?: McpServerToolPolicy[];
  timeout?: number;
  alwaysLoad?: boolean;
};

// SDK 内嵌（同进程）
export declare type McpSdkServerConfig = {
  type: 'sdk';             // 必填
  name: string;            // 必填
};
// 实际使用时是带 instance 的子类型：
export declare type McpSdkServerConfigWithInstance = McpSdkServerConfig & {
  instance: McpServer;
};
```

---

## 6. `hooks` 结构 & PostToolUse 回调

### 已确认

```ts
// Options 中的 hooks 字段
hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

export declare interface HookCallbackMatcher {
  matcher?: string;           // 可选的工具名匹配模式
  hooks: HookCallback[];
  timeout?: number;           // 秒
}

export declare type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

### PostToolUse 输入（已确认）

```ts
export declare type PostToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
  duration_ms?: number;
};
```

`BaseHookInput` 公共字段（已确认）：
```ts
export declare type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  agent_id?: string;
  agent_type?: string;
  effort?: { level: string };
};
```

### PostToolUse 钩子返回（已确认）

```ts
export declare type PostToolUseHookSpecificOutput = {
  hookEventName: 'PostToolUse';
  additionalContext?: string;
  updatedToolOutput?: unknown;      // 替换工具输出（通用）
  updatedMCPToolOutput?: unknown;   // 仅 MCP 工具
};
```

### HookJSONOutput（已确认）

```ts
export declare type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput;

export declare type AsyncHookJSONOutput = {
  async: true;
  asyncTimeout?: number;
};
// SyncHookJSONOutput 包含 continue/stop/error 等字段（完整结构在 sdk.d.ts 中较靠后，核心字段包括 hookEventName 特定输出字段）
```

---

## 附：`permissionMode` 枚举值（已确认）

```ts
export declare type PermissionMode =
  | 'default'           // 标准行为，危险操作时提示
  | 'acceptEdits'       // 自动接受文件编辑
  | 'bypassPermissions' // 跳过所有权限检查（需 allowDangerouslySkipPermissions: true）
  | 'plan'              // 规划模式，不执行工具
  | 'dontAsk'           // 不提示，未预批准则拒绝
  | 'auto';             // 用模型分类器决定是否批准
```

---

## 关键结论汇总

| 问题 | 结论 | 状态 |
|------|------|------|
| `tool()` handler 有 `extra` 参数吗 | **有**，签名 `(args, extra: unknown)`，但 `extra` 类型是 `unknown`，内部结构未在类型文件中暴露 | 已确认 |
| 流式增量消息的 `type` 值 | `'stream_event'`（`SDKPartialAssistantMessage`），`event` 字段是 `BetaRawMessageStreamEvent` | 已确认 |
| `canUseTool` 返回结构 | 联合类型：`{ behavior: 'allow', ... }` 或 `{ behavior: 'deny', message: string, ... }` | 已确认 |
| `permissionMode` 枚举 | `'default' \| 'acceptEdits' \| 'bypassPermissions' \| 'plan' \| 'dontAsk' \| 'auto'` | 已确认 |
| `query()` 返回是否 AsyncIterable | **是**，返回 `Query extends AsyncGenerator<SDKMessage, void>`，可 `for await...of` | 已确认 |
| `query()` 返回有 `.interrupt()` 吗 | **有** | 已确认 |
| `tool()` schema 接受 ZodRawShape 还是 ZodObject | **ZodRawShape**（`AnyZodRawShape = ZodRawShape | ZodRawShape_2`，兼容 zod v3/v4） | 已确认 |
| `SDKResultSuccess` 中的 `total_cost_usd` | **有**，直接在顶层（非嵌套），同样有 `num_turns`、`usage`、`is_error` | 已确认 |
| `'result'` 消息的 `subtype` | success: `'success'`；error: `'error_during_execution' \| 'error_max_turns' \| 'error_max_budget_usd' \| 'error_max_structured_output_retries'` | 已确认 |

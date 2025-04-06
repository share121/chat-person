import { Context, h } from "koishi";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { zodFunction, zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";

export type Message = {
  timestamp: number;
  messageId: string;
  name: string;
  userId: string;
  guildName?: string;
  guildId?: string;
  channelName?: string;
  channelId: string;
  role: ChatCompletionMessageParam["role"];
  content: string;
  uid: string;
  quote?: string;
};

const ChatRespond = z.object({
  quoteMessageId: z
    .string()
    .nullable()
    .describe("要引用的消息的id。如果没有消息需要引用，则设置为null"),
  respond: z.array(z.string()).describe(`响应消息：
1. 普通聊天：一系列简短、自然的消息
   示例：["Hello! ", "How are you?"]
2. 代码/格式化内容：保留为单个消息以保留格式
   示例：["Here's some code: ", "\'\'\'js\nconsole.log('Hello')\n\'\'\'"]`),
  reactionEmojis: z
    .array(z.string().emoji())
    .nullable()
    .describe(
      "这是给自己发送的消息添加的表情数组。如果没有表情需要添加，则设置为null"
    ),
  channelId: z.string().describe("要发送消息的频道id"),
});

export class AiPerson {
  name: string;
  age: number;
  gender: "male" | "female";
  personality: string;
  profession: string;
  hobbies: string[];
  hates: string[];
  model: string;
  baseURL: string;
  apiKey: string;
  client: OpenAI;
  ctx: Context;
  messages: Message[] = [];

  constructor(config: typeof AiPerson.prototype) {
    this.name = config.name;
    this.age = config.age;
    this.gender = config.gender;
    this.personality = config.personality;
    this.profession = config.profession;
    this.hobbies = config.hobbies;
    this.hates = config.hates;
    this.model = config.model;
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
    this.ctx = config.ctx;
    this.ctx.database
      .select("message")
      .execute()
      .then((messages) => {
        this.messages.unshift(...messages);
      });
  }

  async addMessage(message: Message) {
    this.messages.push(message);
    await this.ctx.database.upsert("message", this.messages);
    if (Math.random() < 0.8) {
      console.log("AI is thinking...", message);
      await this.generateResponse();
      return true;
    }
    return false;
  }

  transformMessage(message: Message) {
    let res = {
      ...message,
    };
    delete res.guildId;
    delete res.uid;
    delete res.role;
    console.log("transformMessage", res);
    return res;
  }

  generatePrompt() {
    let msg = this.messages.slice(-2).map((message) => ({
      name: message.name,
      role: message.role,
      content: JSON.stringify(this.transformMessage(message)),
    }));
    return [
      {
        role: "system",
        content: `你是${this.name}，一位${this.age}岁的${this.gender}${this.profession}，喜欢${this.hobbies}但讨厌${this.hates}。你的性格特点是${this.personality}。
      1. 你将参与多个群聊对话
      2. 使用 createReactions Tools 给别人的消息添加表情反应
      3. 使用 getMessage Tools 获取指定消息ID的消息内容
      4. 在响应中使用\`quoteMessageId\`在回复中引用他人消息
      5. 在响应中使用\`reactionEmojis\`给自己的消息添加多个表情反应
      6. 保持自然简洁的回应，如同真实交流
      响应格式要求：
      必须严格使用以下JSON结构响应：
      \`\`\`json
      {
        "quoteMessageId": "需引用的消息ID或null",
        "respond": ["回复消息", "数组", "一项为一条消息", "模拟真人对话时，很长的句子变成多个短句消息发送"],
        "reactionEmojis": ["表情符号1", "表情符号2", "表情符号n"] || null,
        "channelId": "目标频道ID",
      }
      \`\`\`
      字段说明：
      1. quoteMessageId：
         - 引用消息时需提供原消息ID
         - 无需引用时设为null
      2. respond：
         - 常规聊天：1-3条简短消息数组
           示例：["你好！", "今天过得怎么样？"]
         - 代码/长内容：单条格式化消息
           示例：["示例代码：\\n\`\`\`python\\nprint('你好')\\n\`\`\`"]
         - 无需回复时设为null
      3. reactionEmojis：
         - 需要给自己消息添加反应时填写表情符号数组
         - 无需反应时设为null
      4. channelId：
         - 回复的目标频道ID
      附加准则：
      - 分段回复请拆分为数组项
      - 在单条消息内保留Markdown/代码格式
      - 适时使用可用工具：
        - createReactions - 为消息添加反应
        - getMessage - 获取被引用的消息
      响应示例：
      \`\`\`json
      {
        "quoteMessageId": "114514",
        "respond": ["早上好！", "今天天气不错"],
        "reactionEmojis": ["🌞"],
        "channelId": "12345",
      }
      \`\`\``,
      },
    ].concat(msg);
  }

  async generateResponse() {
    const runner = this.client.beta.chat.completions
      .runTools({
        model: this.model,
        stream: true,
        messages: this.generatePrompt() as any,
        tools: [
          zodFunction({
            name: "createReactions",
            description: "给指定的消息添加表情",
            parameters: z.object({
              messageId: z.string(),
              emojis: z.array(z.string().emoji()),
            }),
            function: async ({ messageId, emojis }) => {
              const msg = this.messages.find(
                (message) => message.messageId === messageId
              );
              console.log("createReactions", messageId, emojis, msg);
              if (!msg) {
                return { error: "找不到消息" };
              }
              let success = false;
              for (const bot of this.ctx.bots) {
                try {
                  for (const emoji of emojis) {
                    await bot.createReaction(msg.channelId, messageId, emoji);
                  }
                  success = true;
                } catch (e) {
                  console.error("createReaction", e);
                }
              }
              if (success) {
                return { success: true };
              }
              return { error: "无法创建表情" };
            },
          }),
          zodFunction({
            name: "getMessage",
            description: "读取指定的消息",
            parameters: z.object({
              messageId: z.string(),
            }),
            function: async ({ messageId }) => {
              const msg = this.messages.find(
                (message) => message.messageId === messageId
              );
              console.log("getMessage", msg);
              if (!msg) {
                return { error: "找不到消息" };
              }
              return {
                success: true,
                message: this.transformMessage(msg),
              };
            },
          }),
        ],
        response_format: zodResponseFormat(ChatRespond, "chat_respond"),
      })
      .on("functionCall", (functionCall) =>
        console.log("functionCall", functionCall)
      )
      .on("functionCallResult", (functionCallResult) =>
        console.log("functionCallResult", functionCallResult)
      )
      .on("content", (diff) => process.stdout.write(diff));
    const result = await runner.finalChatCompletion();
    const parsed = result.choices[0].message.parsed;
    console.log("reply", parsed);
    let res = parsed.respond.map((msg) => h("message", msg));
    if (parsed.quoteMessageId) {
      res.unshift(
        h("quote", {
          id: parsed.quoteMessageId,
        })
      );
    }
    let success = false;
    for (const bot of this.ctx.bots) {
      try {
        const newMsgId = (await bot.sendMessage(parsed.channelId, res)).at(-1);
        if (parsed.reactionEmojis) {
          for (const emoji of parsed.reactionEmojis) {
            await bot.createReaction(parsed.channelId, newMsgId, emoji);
          }
        }
        success = true;
      } catch (e) {
        console.error("此 bot 发送消息失败", e);
      }
    }
    if (!success) {
      console.error("所有 bot 都发送消息失败");
    }
  }
}

function showError(error: unknown) {
  try {
    return JSON.stringify(error);
  } catch {
    return error;
  }
}

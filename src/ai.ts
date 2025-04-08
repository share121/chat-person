import { Context, h } from "koishi";
import OpenAI, { ClientOptions } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { zodFunction } from "openai/helpers/zod";
import { z } from "zod";
import { guess } from "./tools";

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
  needReply: boolean;
};

const ChatRespond = z.array(
  z.object({
    channelId: z.string().describe("目标频道ID"),
    response: z.array(
      z.object({
        quoteMessageId: z.string().optional().describe("要引用的消息的id"),
        content: z.array(z.string()).describe("响应消息"),
        reactionEmojis: z
          .array(z.string().emoji())
          .optional()
          .describe("这是给自己发送的消息添加的表情数组"),
      })
    ),
  })
);

export class AiPerson {
  name: string;
  age: number;
  gender: string;
  personality: string;
  profession: string;
  hobbies: string;
  hates: string;
  model: string;
  baseURL: string;
  apiKey: string;
  client: OpenAI;
  ctx: Context;
  messages: Message[] = [];
  fitCtxSize: number;
  maxCtxSize: number;
  ctxSize = 0;

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
    this.fitCtxSize = config.fitCtxSize;
    this.maxCtxSize = config.maxCtxSize;
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
        this.ctxSize += messages.length;
      });
  }

  async addMessage(possibility: number, message: Message) {
    this.messages.push(message);
    this.ctxSize += 1;
    await this.ctx.database.upsert("message", this.messages);
    if (Math.random() < possibility) {
      console.log("AI is thinking...", message);
      this.generateResponse();
      return true;
    }
    return false;
  }

  transformMessage(message: Message) {
    return {
      content: message.content,
      name: message.name,
      messageId: message.messageId,
      channelId: message.channelId,
      quoteId: message.quote,
      needReply: message.needReply,
    };
  }

  generatePrompt() {
    if (this.ctxSize > this.maxCtxSize) this.ctxSize = this.fitCtxSize;
    const msg = this.messages.slice(-this.ctxSize);
    const res = msg.map((message, i) => ({
      name: message.name,
      role: message.role,
      content: JSON.stringify(this.transformMessage(message)),
    }));
    console.log("prompt", res);
    return [
      {
        role: "system",
        content: `你是${this.name},一位${this.age}岁的${this.gender}${this.profession},喜欢${this.hobbies}但讨厌${this.hates},你的性格特点是${this.personality}
1你将参与多个群聊对话
2使用createReactions Tools给别人的消息添加表情
3使用getMessage Tools获取指定消息ID的详情
4使用searchAbbreviations Tools查询网络缩写含义
5响应中使用quoteMessageId在回复中引用他人消息
6响应中使用reactionEmojis给自己的消息添加多个表情反应
7保持自然简洁的回应,如同真实交流
8响应内容要完整,让你写代码,你就要给出代码,让你写文章,你就要给出文章
必须使用以下JSON结构响应
\`\`\`json
[{"channelId":"目标频道ID","response":[{"quoteMessageId"?:"需引用的消息ID,是可选属性","content":["一项为一条回复消息","模拟真人对话时,很长的句子变成多个短句消息发送"],"reactionEmojis"?:["表情符号1","表情符号n","是可选属性"]},{"content":["回复消息"]}]}]
\`\`\`
输出示例:
\`\`\`json
[{"channelId":"asd789geg","response":[{"quoteMessageId":"114514","content":["早上好！","今天天气不错"],"reactionEmojis":["🌞"]},{"content":["你有什么想说的吗？"]}]}]
\`\`\``,
      },
    ].concat(res);
  }

  private state = 0;
  async generateResponse(): Promise<void> {
    if (this.state === 0) {
      this.state = 1;
    } else if (this.state === 1) {
      this.state = 2;
      return;
    } else if (this.state === 2) {
      return;
    }
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
              if (!msg) return { error: "找不到消息" };
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
              if (success) return { success: true };
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
              console.log("getMessage", messageId, msg);
              if (!msg) return { error: "找不到消息" };
              return {
                success: true,
                message: msg,
              };
            },
          }),
          zodFunction({
            name: "searchAbbreviations",
            description: '传入一个数组的缩写,如["dl","wsfw"]即可获得对应的意思',
            parameters: z.object({
              abbreviations: z.array(z.string()),
            }),
            function: async ({ abbreviations }) => {
              console.log("searchAbbreviations", abbreviations);
              try {
                let res = {};
                for (const abbr of abbreviations) {
                  res[abbr] = await guess(abbr);
                }
                return { success: true, data: res };
              } catch (e) {
                console.error("searchAbbreviations", e);
                return { error: e };
              }
            },
          }),
        ],
        text: {
          format: { type: "json_object" },
        },
      })
      .on("functionCall", (functionCall) =>
        console.log("functionCall", functionCall)
      )
      .on("functionCallResult", (functionCallResult) =>
        console.log("functionCallResult", functionCallResult)
      )
      .on("content", (diff) => process.stdout.write(diff));
    for (const msg of this.messages) msg.needReply = false;
    const result = await runner.finalChatCompletion();
    const parsed = ChatRespond.safeParse(
      this.parseJson(result.choices[0].message.content)
    );
    if (!parsed.success) {
      console.error("reply", parsed.error.format());
      return;
    }
    this.sendMessage(parsed.data);
    if (this.state === 2) {
      this.state = 0;
      return this.generateResponse();
    }
    this.state = 0;
  }

  async sendMessage(msgs: z.infer<typeof ChatRespond>) {
    for (const item of msgs) {
      let res = item.response.flatMap((msg) =>
        msg.content.map((content, i) => {
          if (i === 0 && msg.quoteMessageId)
            return h("message", [
              h("quote", { id: msg.quoteMessageId }),
              content,
            ]);
          return h("message", content);
        })
      );
      let success = false;
      for (const bot of this.ctx.bots) {
        try {
          const msgIds = await bot.sendMessage(item.channelId, res);
          for (const [id, msgId] of msgIds.entries()) {
            const emojis = item.response[id]?.reactionEmojis;
            if (emojis)
              for (const emoji of emojis)
                await bot.createReaction?.(item.channelId, msgId, emoji);
          }
          success = true;
        } catch (e) {
          console.error("此 bot 发送消息失败", e);
        }
      }
      if (!success) console.error("所有 bot 都发送消息失败");
    }
  }

  parseJson(raw: string) {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]") + 1;
    return JSON.parse(raw.slice(start, end));
  }
}

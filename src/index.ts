import { Context, Schema, Session } from "koishi";
import { AiPerson, Message } from "./ai";
import { getChannel, getGuild, getUser } from "./tools";
import {} from "@koishijs/plugin-adapter-discord";
import { ClientOptions } from "openai";

export const name = "chat-person";
export const inject = ["database"];
export interface Config {
  baseURL: string;
  apiKey: string;
  model: string;
  fitCtxSize: number;
  maxCtxSize: number;
  name: string;
  age: number;
  gender: string;
  personality: string;
  profession: string;
  hobbies: string;
  hates: string;
}
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseURL: Schema.string()
      .default("https://api.deepseek.com")
      .description("API 地址"),
    apiKey: Schema.string().role("secret").required().description("API 密钥"),
    model: Schema.string().default("deepseek-chat").description("模型名称"),
    fitCtxSize: Schema.number()
      .default(3)
      .description(
        "截断后上下文大小，当上下文超过 `maxCtxSize` 后，会截断到 `fitCtxSize`，一条消息算一个上下文"
      ),
    maxCtxSize: Schema.number()
      .default(6)
      .description(
        "最大上下文大小，当上下文超过 `maxCtxSize` 后，会截断到 `fitCtxSize`，一条消息算一个上下文"
      ),
  }).description("基础配置"),
  Schema.object({
    name: Schema.string().default("锐锐").description("名字"),
    age: Schema.number().default(12).description("年龄"),
    gender: Schema.string().default("女").description("性别"),
    personality: Schema.string()
      .default(
        "活泼可爱，喜欢和朋友们一起玩耍，喜欢听故事，喜欢帮助别人，喜欢学习新知识，喜欢探索未知的世界。"
      )
      .description("性格"),
    profession: Schema.string().default("数学课代表").description("职业"),
    hobbies: Schema.string().default("数学,编程,绘画,唱歌").description("爱好"),
    hates: Schema.string().default("语文,英语").description("讨厌的事物"),
  }).description("人格设置"),
  // Schema.object({}).description("高级配置"),
]);

declare module "koishi" {
  interface Tables {
    message: Message;
  }
}

export function apply(ctx: Context) {
  // ctx.model.drop("message");
  ctx.model.extend(
    "message",
    {
      timestamp: "unsigned",
      messageId: "string",
      channelName: {
        type: "string",
        nullable: true,
      },
      guildName: {
        type: "string",
        nullable: true,
      },
      name: "string",
      userId: "string",
      role: "string",
      content: "string",
      channelId: "string",
      guildId: {
        type: "string",
        nullable: true,
      },
      uid: "string",
      quote: {
        type: "string",
        nullable: true,
      },
      needReply: "boolean",
    },
    {
      primary: "timestamp",
    }
  );

  const person = new AiPerson({
    ctx,
    ...ctx.config,
  });

  let possibility = 0.3;
  let cache: Map<string, { session: Session; timer: NodeJS.Timeout }> =
    new Map();
  ctx.on("message", (session) => {
    cache.set(session.messageId, {
      session,
      timer: setTimeout(async () => {
        cache.delete(session.messageId);
        await add(session);
      }, 1000),
    });
  });
  ctx.on("message-updated", (session) => {
    if (cache.has(session.messageId)) {
      const item = cache.get(session.messageId);
      item.timer.refresh();
    }
  });

  async function add(session: Session) {
    possibility -= 0.1;
    if (possibility < 0.3) possibility = 0.3;
    if (
      session.content.includes(ctx.config.name) ||
      session.content.includes(session.bot.userId)
    )
      possibility = 1;
    if (ctx.bots[session.uid]) possibility = 0;
    console.log(possibility, session.content);
    const isResponding = await person.addMessage(possibility, {
      timestamp: Date.now(),
      messageId: session.messageId,
      role: session.userId === session.bot.userId ? "assistant" : "user",
      content: session.content,
      name: (await getUser(session))?.nick || session.username || "匿名用户",
      userId: session.userId,
      channelName: (await getChannel(session))?.name || "未知频道",
      channelId: session.channelId,
      guildName: (await getGuild(session))?.name || "未知服务器",
      guildId: session.guildId,
      uid: session.uid,
      quote: session.quote?.id,
      needReply: session.userId !== session.bot.userId,
    });
    if (isResponding) {
      if (possibility < 0.5) possibility = 1;
      if (session.discord) {
        session.discord.triggerTypingIndicator(session.channelId);
      }
    }
  }
}

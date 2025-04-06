import { Context, Schema } from "koishi";
import { AiPerson, Message } from "./ai";
import { getChannel, getGuild, getUser } from "./tools";

export const name = "chat-person";
export const inject = ["database"];
export interface Config {
  baseURL: string;
  apiKey: string;
  model: string;
  name: string;
  age: number;
  gender: string;
  personality: string;
  profession: string;
  hobbies: string[];
  hates: string[];
}
export const Config: Schema<Config> = Schema.object({
  baseURL: Schema.string().default("https://api.siliconflow.cn/v1"),
  apiKey: Schema.string().role("secret").required(),
  model: Schema.string().default("deepseek-ai/DeepSeek-V3"),
  name: Schema.string().default("小明"),
  age: Schema.number().default(18),
  gender: Schema.string().default("男"),
  personality: Schema.string().default("开朗、热情、乐观"),
  profession: Schema.string().default("学生"),
  hobbies: Schema.array(Schema.string()).default([]),
  hates: Schema.array(Schema.string()).default([]),
});

declare module "koishi" {
  interface Tables {
    message: Message;
  }
}

export function apply(ctx: Context) {
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
    },
    {
      primary: "timestamp",
    }
  );

  const person = new AiPerson({
    ctx,
    ...ctx.config,
  });

  ctx.middleware(async (session, next) => {
    if (ctx.bots[session.uid]) return;
    if (session.channelId !== "1335178028443238400") return;
    const isRespond = await person.addMessage({
      timestamp: Date.now(),
      messageId: session.messageId,
      role: "user",
      content: session.content,
      name: (await getUser(session))?.nick || session.username || "匿名用户",
      userId: session.userId,
      channelName: (await getChannel(session))?.name || "未知频道",
      channelId: session.channelId,
      guildName: (await getGuild(session))?.name || "未知服务器",
      guildId: session.guildId,
      uid: session.uid,
      quote: session.quote?.id,
    });
    if (!isRespond) await next();
  });
}

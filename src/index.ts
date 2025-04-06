import { Context, Schema } from "koishi";
import { AiPerson, Message } from "./ai";
import { getChannel, getGuild, getUser } from "./tools";
import {} from "@koishijs/plugin-adapter-discord";

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
  baseURL: Schema.string().default("https://api.deepseek.com"),
  apiKey: Schema.string().role("secret").required(),
  model: Schema.string().default("deepseek-chat"),
  name: Schema.string().default("锐锐"),
  age: Schema.number().default(12),
  gender: Schema.string().default("女"),
  personality: Schema.string().default(
    "活泼可爱，喜欢和朋友们一起玩耍，喜欢听故事，喜欢帮助别人，喜欢学习新知识，喜欢探索未知的世界。"
  ),
  profession: Schema.string().default("数学课代表"),
  hobbies: Schema.array(Schema.string()).default([
    "数学",
    "编程",
    "绘画",
    "唱歌",
  ]),
  hates: Schema.array(Schema.string()).default(["语文", "英语"]),
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

  ctx.on("message", async (session) => {
    console.log("content", session.content);
    let possibility = 0.45;
    if (
      session.content.includes(ctx.config.name) ||
      session.content.includes(session.bot.userId)
    ) {
      possibility = 1;
    }
    if (ctx.bots[session.uid]) {
      possibility = 0;
    }
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
    });
    if (isResponding && session.discord) {
      session.discord.triggerTypingIndicator(session.channelId);
    }
  });
}

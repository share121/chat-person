import { Context, Session } from "koishi";

export type Channel =
  import("../../../node_modules/@satorijs/protocol/lib/index").Channel;
export type Guild =
  import("../../../node_modules/@satorijs/protocol/lib/index").Guild;
export type User =
  import("../../../node_modules/@satorijs/protocol/lib/index").User;

const channelCache = new Map<string, Channel>();
export async function getChannel(session: Session<never, never, Context>) {
  try {
    if (channelCache.has(session.channelId)) {
      return channelCache.get(session.channelId);
    }
    const channel = await session.bot.getChannel(session.channelId);
    channelCache.set(session.channelId, channel);
    return channel;
  } catch (e) {
    console.error(e);
    return null;
  }
}

const guildCache = new Map<string, Guild>();
export async function getGuild(session: Session<never, never, Context>) {
  try {
    if (guildCache.has(session.guildId)) {
      return guildCache.get(session.guildId);
    }
    const guild = await session.bot.getGuild(session.guildId);
    guildCache.set(session.guildId, guild);
    return guild;
  } catch (e) {
    console.error(e);
    return null;
  }
}

const userCache = new Map<string, User>();
export async function getUser(session: Session<never, never, Context>) {
  try {
    if (userCache.has(session.userId)) {
      return userCache.get(session.userId);
    }
    const user = await session.bot.getUser(session.userId);
    userCache.set(session.userId, user);
    return user;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export type GuessRecord = {
  name: string;
  trans?: string[];
  inputting?: string[];
};

const cache = new Map<string, GuessRecord[]>();
export async function guess(text: string): Promise<GuessRecord[]> {
  text = text.match(/[a-z0-9]{2,}/gi).join(",");
  if (cache.has(text)) {
    return cache.get(text)!;
  }
  const res = await (
    await fetch("https://lab.magiconch.com/api/nbnhhsh/guess", {
      method: "POST",
      body: JSON.stringify({ text }),
      headers: { "Content-Type": "application/json" },
    })
  ).json();
  cache.set(text, res);
  return res;
}

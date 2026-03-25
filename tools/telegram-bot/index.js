import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Telegraf, Markup } from "telegraf";

process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
});
process.on("uncaughtException", (e) => {
  console.error("uncaughtException:", e);
});

console.log("Starting bot...");
console.log("RUNNING FILE:", new URL(import.meta.url).pathname);
console.log("CWD:", process.cwd());

const __filename = fileURLToPath(import.meta.url);
const botDir = path.dirname(__filename);
const repoRoot = path.resolve(botDir, "..", "..");

dotenv.config({ path: path.join(repoRoot, ".env.shared") });
// Optional local override for bot-only values.
dotenv.config({ path: path.join(botDir, ".env"), override: true });

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;

console.log("BOT_TOKEN present:", Boolean(token));
console.log("WEBAPP_URL:", webAppUrl);

if (!token) {
  console.error("BOT_TOKEN is required (set it in .env.shared or tools/telegram-bot/.env)");
  process.exit(1);
}
if (!webAppUrl) {
  console.error("TELEGRAM_WEBAPP_URL is required (set it in .env.shared or tools/telegram-bot/.env)");
  process.exit(1);
}

const bot = new Telegraf(token);

bot.catch((err, ctx) => {
  console.error("Bot middleware error:", err);
  try {
    console.error("Update type:", ctx.updateType);
  } catch {}
});

bot.start(async (ctx) => {
  const fromId = ctx.from?.id;
  const fromUser = ctx.from?.username ? `@${ctx.from.username}` : "";
  console.log("Received /start from:", fromId, fromUser);

  return ctx.reply(
    "Открой Mini App:",
    Markup.inlineKeyboard([
      Markup.button.webApp("Открыть приложение", webAppUrl),
    ])
  );
});

bot.on("message", async (ctx) => {
  return ctx.reply('Напиши /start и нажми кнопку "Открыть приложение".');
});

(async () => {
  try {
    await bot.launch();
    console.log("Bot launched OK ✅");
    console.log("Now open Telegram -> chat with the bot -> /start -> press the web_app button.");
  } catch (e) {
    console.error("Launch failed ❌", e);
    process.exit(1);
  }
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

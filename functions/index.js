const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenCC = require("opencc-js");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { notifyGoogleChat, getClientIp, maskIp, safeUserText } = require("./notify-google-chat");
const {
    DAILY_LIMIT,
    GuardError,
    requireGoogleUser,
    verifyTurnstile,
    consumeDailyQuota,
    refundDailyQuota,
    describeUser
} = require("./words-guard");

initializeApp();

// Google Chat 通知網址：每次有人使用 AI 都通知網站主人（放在 Secret Manager）
const GOOGLE_CHAT_WEBHOOK_URL = defineSecret("GOOGLE_CHAT_WEBHOOK_URL");
// Cloudflare Turnstile secret（與 PIRLS 共用同一個 widget；放在 Secret Manager）
const WORDS_TURNSTILE_SECRET = defineSecret("WORDS_TURNSTILE_SECRET");
const SITE_NAME = "漢語新解";
const FEATURE_NAME = "AI 詞語新解";

// Basic Rate Limiting (In-memory, per instance)
const rateLimit = new Map();
const LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // 5 requests per minute

// Initialize Global Options
setGlobalOptions({ maxInstances: 10, region: "asia-east1" });

// System prompt adapted for Gemini
const SYSTEM_PROMPT = `你是年輕人,批判現實,思考深刻,語言風趣。
風格是"王爾德" "魯迅" "羅永浩"。
你善於一針見血，喜歡用隱喻來表達，並擅長諷刺幽默。
你回以 JSON 格式，包含：
1. "explanation": 解釋詞彙（繁體中文），要求使用隱喻、諷刺，批評現實或人性，長度 150 字內。
2. "mood": 情感色調，僅限 "positive" (昂揚/褒義), "negative" (抑鬱/貶義), "neutral" (清冷/中性)。
請務必使用繁體中文和台灣常用的語法與用詞。

Example:
{
  "explanation": "委婉：刺向他人時，決定在劍刃上撒上止痛藥。",
  "mood": "neutral"
}`;

const cors = ["https://cagoooo.github.io"];

exports.generateExplanation = onRequest({
    cors: cors,
    secrets: ["GEMINI_API_KEY", GOOGLE_CHAT_WEBHOOK_URL, WORDS_TURNSTILE_SECRET]
}, async (req, res) => {
    // Check for POST method
    if (req.method !== "POST") {
        return res.status(405).send({ error: "Method Not Allowed" });
    }

    const startedAt = Date.now();
    const clientIp = getClientIp(req);
    let user = null;
    let quota = null;
    // 通知卡：使用者名稱／Email、查詢詞語（前 20 字）、遮蔽末段的來源 IP、今日剩餘次數
    const report = (status, extra = {}) => notifyGoogleChat({
        status,
        siteName: SITE_NAME,
        feature: FEATURE_NAME,
        durationMs: Date.now() - startedAt,
        ip: clientIp,
        user: describeUser(user) || undefined,
        ...extra,
        fields: [
            // 非 UTF-8 送來的亂碼（U+FFFD）或控制字元一律過濾，改顯示「（無法辨識的文字，已過濾）」
            { label: "查詢詞語", value: (req.body && req.body.input) ? safeUserText(req.body.input, 20) : "（空白）" },
            { label: "來源 IP", value: maskIp(clientIp) },
            ...(quota ? [{ label: "今日剩餘次數", value: `${quota.remaining} / ${DAILY_LIMIT}` }] : []),
            ...(extra.fields || [])
        ]
    });

    // Basic Rate Limiting
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const userRequests = rateLimit.get(ip) || [];
    const recentRequests = userRequests.filter(time => now - time < LIMIT_WINDOW);

    if (recentRequests.length >= MAX_REQUESTS) {
        logger.warn(`Rate limit exceeded for IP: ${ip}`);
        // 被擋下也通知（同一 IP 每 5 分鐘最多 1 則）
        await report("blocked", { fields: [{ label: "HTTP 狀態", value: "429（請求過於頻繁）" }] });
        return res.status(429).send({ error: "請求過於頻繁，請稍後再試（誠心方能得真相）。" });
    }
    recentRequests.push(now);
    rateLimit.set(ip, recentRequests);

    const inputWord = String((req.body && req.body.input) || "").trim();

    // 三道防線：① Google 登入 → ② Turnstile 人機驗證 → ③ 每日次數（通過人機驗證才扣）
    try {
        user = await requireGoogleUser(req);
        if (!inputWord) {
            await report("failed", { error: "未提供輸入" });
            return res.status(400).send({ error: "請輸入一個漢語詞彙" });
        }
        if (Array.from(inputWord).length > 50) {
            await report("failed", { error: "輸入過長" });
            return res.status(400).send({ error: "詞彙太長了，請輸入 50 字以內" });
        }
        await verifyTurnstile(req.body && req.body.turnstileToken, WORDS_TURNSTILE_SECRET.value(), clientIp);
        quota = await consumeDailyQuota(user);
    } catch (err) {
        if (err instanceof GuardError) {
            if (err.status === 429) quota = { remaining: 0 };
            logger.warn(`generateExplanation blocked: ${err.status} ${err.extra && err.extra.code}`);
            await report("blocked", { fields: [{ label: "HTTP 狀態", value: `${err.status}（${err.message}）` }] });
            return res.status(err.status).send({ error: err.message, ...err.extra });
        }
        logger.error("Guard check failed:", err);
        await report("failed", { error: (err && err.message) || String(err) });
        return res.status(500).send({ error: "伺服器暫時無法處理，請稍後再試" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.error("GEMINI_API_KEY is not set in environment variables.");
        await refundDailyQuota(user, quota.date);
        quota.remaining += 1;
        await report("failed", { error: "伺服器配置錯誤（GEMINI_API_KEY 未設定）" });
        return res.status(500).send({ error: "伺服器配置錯誤" });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        logger.info(`Requesting explanation (uid=${user.uid}, remaining=${quota.remaining})`);
        const result = await model.generateContent(`請解釋這個詞：「${inputWord}」`);
        const response = await result.response;
        const responseText = response.text();
        const data = JSON.parse(responseText);

        // Convert explanation to Traditional Chinese (Taiwan mapping)
        const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
        let explanation = converter(data.explanation);

        // Format to bullet points
        const bulletPoints = convertToBulletPoints(explanation);

        logger.info(`Generated: ${data.mood}`);
        await report("success", { fields: [{ label: "情感色調", value: String(data.mood || "—") }] });
        res.status(200).send({
            explanation: bulletPoints,
            mood: data.mood,
            remaining: quota.remaining,
            limit: DAILY_LIMIT
        });

    } catch (error) {
        logger.error("Error generating content:", error);
        // AI 失敗不算次數：退回剛扣的那一次
        await refundDailyQuota(user, quota.date);
        quota.remaining += 1;
        await report("failed", { error: (error && error.message) || String(error) });
        res.status(500).send({ error: "AI 生成失敗，請稍後再試（這次不扣次數）", remaining: quota.remaining, limit: DAILY_LIMIT });
    }
});

function convertToBulletPoints(text) {
    const sentences = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 0);
    return sentences.map((s, i) => `${i + 1}. ${s}${s.match(/[。！？]$/) ? '' : '。'}`).join('\n');
}

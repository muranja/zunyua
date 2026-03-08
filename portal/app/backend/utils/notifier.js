const axios = require('axios');
const { getSetting, parseBool } = require('./systemSettings');

async function sendTelegramMessage(text) {
    const enabled = parseBool(await getSetting('telegram_enabled', 'false'), false);
    const botToken = await getSetting('telegram_bot_token', '');
    const chatId = await getSetting('telegram_chat_id', '');

    if (!enabled || !botToken || !chatId) {
        return { sent: false, channel: 'telegram', reason: 'disabled_or_not_configured' };
    }

    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text
        }, { timeout: 5000 });
        return { sent: true, channel: 'telegram' };
    } catch (err) {
        return { sent: false, channel: 'telegram', reason: err.message };
    }
}

async function sendWebhook(text) {
    const url = await getSetting('alert_webhook_url', '');
    if (!url) return { sent: false, channel: 'webhook', reason: 'not_configured' };

    try {
        await axios.post(url, { text }, { timeout: 5000 });
        return { sent: true, channel: 'webhook' };
    } catch (err) {
        return { sent: false, channel: 'webhook', reason: err.message };
    }
}

async function notifyAdmin(title, details = {}) {
    const notificationsEnabled = parseBool(await getSetting('notifications_enabled', 'false'), false);
    if (!notificationsEnabled) {
        return { sent: false, reason: 'notifications_disabled', results: [] };
    }

    const message = `${title}\n${JSON.stringify(details)}`;
    const results = await Promise.all([
        sendTelegramMessage(message),
        sendWebhook(message)
    ]);

    return { sent: results.some((r) => r.sent), results };
}

module.exports = {
    notifyAdmin
};

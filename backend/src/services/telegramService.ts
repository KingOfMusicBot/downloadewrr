import https from 'https';
import { logger } from '../utils/logger';

export const sendTelegramNotification = async (message: string): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.debug('Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured.');
    return;
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('Telegram notification sent successfully to logger group.');
        } else {
          logger.error(`Failed to send Telegram notification. Status: ${res.statusCode}, Response: ${data}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      logger.error(`Error sending Telegram notification: ${err.message}`);
      resolve();
    });

    req.write(payload);
    req.end();
  });
};

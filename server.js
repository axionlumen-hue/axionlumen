/**
 * Telegram Live Viewer - Express Server
 * Main backend for the Telegram Mini App
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');
const { AccessToken } = require('livekit-server-sdk');

const database = require('./database');

// Load environment variables
dotenv.config();

// ========== CONFIGURATION ==========
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_ROOM = process.env.LIVEKIT_ROOM || 'exclusive-community-live';
const CHANNEL_ID = process.env.CHANNEL_ID;
const VIP_PRICE = Number(process.env.STARS_PRICE || 600);
const VIP_DURATION_SECONDS = 60 * 60;
const MEMBER_PRICE = 10;
const MEMBER_DURATION_SECONDS = 60;

// Validate required environment variables at startup
function validateEnv() {
    const required = ['BOT_TOKEN', 'WEBAPP_URL', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
    const placeholders = /your_|yourdomain|your-livekit|example\.com|_here/i;
    const missing = required.filter(key => {
        const value = process.env[key];
        return !value || placeholders.test(value);
    });
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`  - ${key}`));
        process.exit(1);
    }

    if (!/^https:\/\//i.test(WEBAPP_URL)) {
        console.error('❌ WEBAPP_URL must use HTTPS for Telegram Web App buttons');
        process.exit(1);
    }
    
    console.log('✅ All required environment variables configured');
}

// ========== EXPRESS SETUP ==========
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== UTILITIES ==========

/**
 * Validate Telegram initData signature
 */
function validateTelegramInitData(initData) {
    if (!BOT_TOKEN) {
        throw new Error('BOT_TOKEN not configured');
    }

    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    
    if (!receivedHash) {
        throw new Error('Missing Telegram hash');
    }

    // Create data check string
    const dataCheckString = [...params.entries()]
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Verify signature
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();
    
    const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    // Timing-safe comparison
    const receivedBuffer = Buffer.from(receivedHash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (receivedBuffer.length !== calculatedBuffer.length ||
        !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)) {
        throw new Error('Invalid Telegram signature');
    }

    // Check auth date (max 24 hours old)
    const authDate = Number(params.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);
    
    if (!authDate || now - authDate > 86400 || authDate > now + 60) {
        throw new Error('Telegram authentication expired');
    }

    // Extract user data
    const rawUser = params.get('user');
    if (!rawUser) {
        throw new Error('Telegram user missing');
    }
    
    const user = JSON.parse(rawUser);
    if (!user.id) {
        throw new Error('Invalid Telegram user');
    }

    return user;
}

/**
 * Extract and validate user from request headers
 */
async function getAuthenticatedUser(req) {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
        throw new Error('Authentication required');
    }

    return validateTelegramInitData(initData);
}

// ========== ROUTES ==========

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/**
 * API status endpoint
 */
app.get('/api/status', async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        
        // Upsert user in database
        await database.saveUser(user.id, user.username, user.first_name);
        
        // Get user from database
        const dbUser = await database.getUser(user.id);
        const hasAccess = database.isAccessValid(dbUser?.access_until || 0);

        res.json({
            authenticated: true,
            access: hasAccess,
            accessUntil: dbUser?.access_until || 0,
            user: {
                id: String(user.id),
                username: user.username || '',
                firstName: user.first_name || '',
            },
            live: {
                title: 'Axion Lumen Live',
                creator: '@creator',
                room: LIVEKIT_ROOM,
            },
            starsPrice: VIP_PRICE,
            memberPrice: MEMBER_PRICE,
        });
    } catch (error) {
        console.error('Status endpoint error:', error.message);
        res.status(401).json({
            error: error.message || 'Authentication failed',
        });
    }
});

/**
 * Create Telegram Stars invoice
 */
app.post('/api/create-invoice', async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        const plan = req.body?.plan === 'member' ? 'member' : 'vip';
        const price = plan === 'member' ? MEMBER_PRICE : VIP_PRICE;
        const durationSeconds = plan === 'member' ? MEMBER_DURATION_SECONDS : VIP_DURATION_SECONDS;
        const planTitle = plan === 'member' ? 'Member Watch Pass' : 'VIP Watch Pass';
        const planDescription = plan === 'member'
            ? '1 minute of private live stream access.'
            : '1 hour of private live stream access.';
        
        // Upsert user
        await database.saveUser(user.id, user.username, user.first_name);
        
        // Check if already has access
        const dbUser = await database.getUser(user.id);
        if (database.isAccessValid(dbUser?.access_until || 0)) {
            return res.json({ alreadyPaid: true });
        }

        if (!BOT_TOKEN) {
            throw new Error('BOT_TOKEN not configured');
        }

        // Create invoice payload
        const payload = `${plan}:${user.id}:${durationSeconds}:${crypto.randomBytes(12).toString('hex')}`;

        // Create invoice using Telegram Bot API
        const bot = new TelegramBot(BOT_TOKEN, { polling: false });
        const invoiceLink = await bot.createInvoiceLink(
            planTitle,
            planDescription,
            payload,
            '',
            'XTR',
            [{ label: plan === 'member' ? '1 Minute Member Pass' : '1 Hour VIP Pass', amount: price }]
        );

        res.json({
            alreadyPaid: false,
            invoiceLink,
            plan,
            stars: price,
            durationSeconds,
        });
    } catch (error) {
        console.error('Create invoice error:', error.message);
        res.status(401).json({
            error: error.message || 'Invoice creation failed',
        });
    }
});

/**
 * Request LiveKit access token
 */
app.post('/api/livekit-token', async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        
        // Check VIP access
        const dbUser = await database.getUser(user.id);
        if (!dbUser || !database.isAccessValid(dbUser.access_until)) {
            return res.status(403).json({
                error: 'VIP membership required',
            });
        }

        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
            throw new Error('LiveKit not configured');
        }

        // Generate LiveKit token
        const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: `telegram-${user.id}`,
            name: user.username ? `@${user.username}` : user.first_name || 'Viewer',
            ttl: Math.floor(2 * 60 * 60), // 2 hours in seconds
        });

        token.addGrant({
            roomJoin: true,
            room: LIVEKIT_ROOM,
            canPublish: false,
            canPublishData: false,
            canSubscribe: true,
        });

        res.json({
            serverUrl: LIVEKIT_URL,
            token: token.toJwt(),
            room: LIVEKIT_ROOM,
        });
    } catch (error) {
        console.error('LiveKit token error:', error.message);
        res.status(401).json({
            error: error.message || 'Token generation failed',
        });
    }
});

/**
 * Request mute
 */
app.post('/api/request-mute', async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        
        // Check VIP access
        const dbUser = await database.getUser(user.id);
        if (!dbUser || !database.isAccessValid(dbUser.access_until)) {
            return res.status(403).json({
                error: 'VIP membership required',
            });
        }

        // Create mute request
        await database.createMuteRequest(user.id);

        res.json({ success: true });
    } catch (error) {
        console.error('Mute request error:', error.message);
        res.status(401).json({
            error: error.message || 'Mute request failed',
        });
    }
});

// ========== TELEGRAM BOT ==========
let botStarted = false;

function startTelegramBot() {
    if (botStarted || !BOT_TOKEN || !WEBAPP_URL) {
        return;
    }

    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        botStarted = true;

        bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error.message);
        });

        console.log('🤖 Telegram bot started');

        // Helper to send viewer button
        const sendViewerButton = async (chatId, text) => {
            await bot.sendMessage(chatId, text, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📺 Open VIP Viewer', web_app: { url: WEBAPP_URL } }
                    ]],
                },
            });
        };

        // /start command
        bot.onText(/^\/start(?:@\w+)?(?:\s|$)/, (message) => {
            sendViewerButton(
                message.chat.id,
                '🎬 Welcome to the exclusive live broadcast!\n\nPress the button below to open the VIP viewer.'
            );
        });

        // /menu command
        bot.onText(/^\/menu(?:@\w+)?(?:\s|$)/, (message) => {
            sendViewerButton(message.chat.id, '📺 Open your VIP viewer.');
        });

        const sendPlanInvoice = async (message, plan) => {
            try {
                const telegramId = String(message.from.id);
            const isMember = plan === 'member';
            const price = isMember ? MEMBER_PRICE : VIP_PRICE;
            const durationSeconds = isMember ? MEMBER_DURATION_SECONDS : VIP_DURATION_SECONDS;
            const durationLabel = isMember ? '1 minute' : '1 hour';
                await database.saveUser(
                    telegramId,
                    message.from.username,
                    message.from.first_name
                );

                const payload = `${plan}:${telegramId}:${durationSeconds}:${crypto.randomBytes(12).toString('hex')}`;
                const invoiceLink = await bot.createInvoiceLink(
                    isMember ? 'Member Watch Pass' : 'VIP Watch Pass',
                    `${durationLabel} of private live stream access.`,
                    payload,
                    '',
                    'XTR',
                    [{ label: isMember ? '1 Minute Member Pass' : '1 Hour VIP Pass', amount: price }]
                );

                await bot.sendMessage(message.chat.id, `🎬 ${isMember ? 'Member' : 'VIP'} access: ${durationLabel} for ${price} Telegram Stars.`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: `💳 Pay ${price} Stars`, url: invoiceLink }]],
                    },
                });
            } catch (error) {
                console.error('Watch command error:', error.message);
                await bot.sendMessage(message.chat.id, '❌ Could not create the watch payment. Please try again.');
            }
        };

        // /vip is a one-hour VIP pass; /watch remains an alias for compatibility.
        bot.onText(/^\/(?:vip|watch)(?:@\w+)?(?:\s|$)/, (message) => sendPlanInvoice(message, 'vip'));
        bot.onText(/^\/member(?:@\w+)?(?:\s|$)/, (message) => sendPlanInvoice(message, 'member'));

        // /status command
        bot.onText(/^\/status(?:@\w+)?(?:\s|$)/, async (message) => {
            try {
                const user = await database.getUser(String(message.from.id));
                const hasAccess = user && database.isAccessValid(user.access_until);
                
                await bot.sendMessage(
                    message.chat.id,
                    hasAccess 
                        ? '✅ VIP access is active. Enjoy the broadcast!'
                        : '❌ VIP access is inactive. Subscribe to get access.'
                );
            } catch (error) {
                console.error('Status command error:', error);
            }
        });

        // /balance command: show access balance and the Star prices for new passes.
        bot.onText(/^\/balance(?:@\w+)?(?:\s|$)/, async (message) => {
            try {
                const user = await database.getUser(String(message.from.id));
                const accessUntil = Number(user?.access_until || 0);
                const remainingSeconds = Math.max(0, accessUntil - Math.floor(Date.now() / 1000));
                const remainingMinutes = Math.ceil(remainingSeconds / 60);
                const accessLine = remainingMinutes > 0
                    ? `✅ Stream access remaining: about ${remainingMinutes} minute(s).`
                    : '⭕ No active stream access.';

                await bot.sendMessage(
                    message.chat.id,
                    `💰 Stars and access balance\n\n${accessLine}\n\n` +
                    `VIP: ${VIP_PRICE} Stars for 1 hour\n` +
                    `Member: ${MEMBER_PRICE} Stars for 1 minute\n\n` +
                    'Telegram does not allow bots to read your personal Stars wallet balance. Telegram will show your available balance when you pay.\n\n' +
                    'Use /vip or /member to start a payment.'
                );
            } catch (error) {
                console.error('Balance command error:', error.message);
                await bot.sendMessage(message.chat.id, '❌ Could not load your access balance. Please try again.');
            }
        });

        // /mute command
        bot.onText(/^\/mute(?:@\w+)?(?:\s|$)/, async (message) => {
            try {
                const user = await database.getUser(String(message.from.id));
                
                if (!user || !database.isAccessValid(user.access_until)) {
                    await bot.sendMessage(
                        message.chat.id,
                        '❌ VIP access is required to use this feature.'
                    );
                    return;
                }

                await database.createMuteRequest(String(message.from.id));
                await bot.sendMessage(message.chat.id, '🔇 Mute request submitted.');
            } catch (error) {
                console.error('Mute command error:', error);
            }
        });

        // Pre-checkout validation
        bot.on('pre_checkout_query', async (query) => {
            try {
                const [prefix, telegramId, durationSeconds] = query.invoice_payload.split(':');
                const expectedPrice = prefix === 'member' ? MEMBER_PRICE : prefix === 'vip' ? VIP_PRICE : 0;
                
                const valid = 
                    (prefix === 'vip' || prefix === 'member') &&
                    String(query.from.id) === telegramId &&
                    Number(durationSeconds) === (prefix === 'member' ? MEMBER_DURATION_SECONDS : VIP_DURATION_SECONDS) &&
                    query.currency === 'XTR' &&
                    Number(query.total_amount) === expectedPrice;

                await bot.answerPreCheckoutQuery(
                    query.id,
                    valid,
                    valid ? undefined : { error_message: 'Invalid membership order.' }
                );
            } catch (error) {
                console.error('Pre-checkout error:', error);
                bot.answerPreCheckoutQuery(query.id, false, { error_message: 'Payment validation failed.' });
            }
        });

        // Payment confirmation
        bot.on('message', async (message) => {
            try {
                const payment = message.successful_payment;
                
                if (!payment || !message.from) {
                    return;
                }

                const telegramId = String(message.from.id);
                const payload = payment.invoice_payload;

                // Verify payload format
                const [plan, payloadTelegramId, durationSeconds] = payload.split(':');
                if ((plan !== 'vip' && plan !== 'member') || payloadTelegramId !== telegramId) {
                    return;
                }
                const expectedDuration = plan === 'member' ? MEMBER_DURATION_SECONDS : VIP_DURATION_SECONDS;
                const expectedPrice = plan === 'member' ? MEMBER_PRICE : VIP_PRICE;
                if (Number(durationSeconds) !== expectedDuration || Number(payment.total_amount) !== expectedPrice) {
                    console.error('Payment amount or duration mismatch');
                    return;
                }

                // Upsert user
                await database.saveUser(
                    message.from.id,
                    message.from.username,
                    message.from.first_name
                );

                // Check if payment already processed (idempotent)
                const existingPayment = await database.getPayment(payment.telegram_payment_charge_id);
                if (existingPayment) {
                    return;
                }

                // Save payment
                await database.savePayment(
                    payment.telegram_payment_charge_id,
                    telegramId,
                    Number(payment.total_amount),
                    payload
                );

                // Grant access
                await database.grantAccess(telegramId, expectedDuration);

                // Send confirmation
                await bot.sendMessage(
                    message.chat.id,
                    `✅ ${plan === 'member' ? 'Member' : 'VIP'} watch pass activated for ${plan === 'member' ? '1 minute' : '1 hour'}!\n\n🎬 You can now watch the private live stream.\n\nPress the button below to open the viewer.`
                );

                // Send viewer button
                await bot.sendMessage(message.chat.id, '', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📺 Open Viewer', web_app: { url: WEBAPP_URL } }
                        ]],
                    },
                });

                // Optionally send private channel invite
                if (CHANNEL_ID) {
                    try {
                        const invite = await bot.createChatInviteLink(CHANNEL_ID, {
                            name: `VIP-${telegramId}`,
                            expire_date: Math.floor(Date.now() / 1000) + 3600,
                            member_limit: 1,
                        });
                        
                        await bot.sendMessage(
                            message.chat.id,
                            `🔐 Private channel access: ${invite.invite_link}`
                        );
                    } catch (error) {
                        console.warn('Private channel invite failed:', error.message);
                    }
                }
            } catch (error) {
                console.error('Payment message error:', error);
            }
        });

        // Set commands menu
        bot.setMyCommands([
            { command: 'start', description: 'Open the VIP viewer' },
            { command: 'menu', description: 'Show the viewer menu' },
            { command: 'vip', description: 'Buy 1 hour private stream access for 600 Stars' },
            { command: 'member', description: 'Buy 1 minute access for 10 Stars' },
            { command: 'watch', description: 'Buy the 1 hour VIP pass' },
            { command: 'balance', description: 'Check access balance and Star prices' },
            { command: 'status', description: 'Check VIP access status' },
            { command: 'mute', description: 'Request temporary mute' },
        ]).catch(error => console.warn('Set commands error:', error));

    } catch (error) {
        console.error('❌ Telegram bot error:', error.message);
    }
}

// ========== SERVER STARTUP ==========
async function start() {
    try {
        // Validate environment
        validateEnv();

        // Initialize database
        await database.init();
        console.log('✅ Database initialized');

        // Start Express server
        app.listen(PORT, () => {
            console.log(`✅ Server listening on http://localhost:${PORT}`);
        });

        // Start Telegram bot
        startTelegramBot();

    } catch (error) {
        console.error('❌ Startup error:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏸️  Shutting down...');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('⏸️  Shutting down...');
    await database.close();
    process.exit(0);
});

// Start server
start();

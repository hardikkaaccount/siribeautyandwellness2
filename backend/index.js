const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { getChatResponse } = require('./gemini_service');
const { saveLead, getLeads } = require('./crm');
const { loadHistory } = require('./chat_history');
const {
    createFollowUp,
    markReplied,
    markConfirmed,
    stopFollowUp,
    getDueFollowUps,
    recordReminderSent,
    getReminderMessage,
    getAllFollowUps,
    getFollowUpStats,
} = require('./follow_up');
const { startDashboard } = require('./dashboard');
require('dotenv').config();

// ========================
// ANTI-SPAM MEMORY
// ========================
const spamMemory = new Map(); // Tracks timestamps: { "phone": [ts1, ts2, ...] }
const blockedUsers = new Set(); // Phones that trigger the 5msg/min limit

// Multiple admin phone numbers (comma-separated in .env)
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '')
    .split(',')
    .map(p => p.trim().replace(/[^0-9]/g, ''))
    .filter(p => p.length > 0);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('[SYSTEM] QR RECEIVED — Scan with your WhatsApp.');
});

client.on('ready', () => {
    console.log('[SYSTEM] Siri Beauty and Wellness CRM Bot is LIVE and ready.');
    if (ADMIN_PHONES.length > 0) {
        console.log(`[SYSTEM] Admins: ${ADMIN_PHONES.join(', ')}`);
    } else {
        console.log('[WARNING] No admins configured. Set ADMIN_PHONES in .env');
    }

    // ========================
    // AUTOMATED FOLLOW-UP SCHEDULER
    // Runs every 1 hour to check for due follow-ups
    // ========================
    const FOLLOW_UP_INTERVAL = 60 * 60 * 1000; // 1 hour
    
    async function runFollowUpScheduler() {
        console.log('[SCHEDULER] Running follow-up check...');
        try {
            const dueFollowUps = getDueFollowUps();
            
            if (dueFollowUps.length === 0) {
                console.log('[SCHEDULER] No follow-ups due right now.');
                return;
            }

            console.log(`[SCHEDULER] ${dueFollowUps.length} follow-up(s) due.`);

            for (const entry of dueFollowUps) {
                try {
                    const message = getReminderMessage(entry);
                    const chatId = entry.whatsappId.includes('@') 
                        ? entry.whatsappId 
                        : entry.phone + '@c.us';
                    
                    await client.sendMessage(chatId, message);
                    recordReminderSent(entry.phone);
                    
                    console.log(`[FOLLOW-UP] #${entry.remindersSent + 1} sent to ${entry.name} (${entry.phone}) — status: ${entry.status}`);

                    // Notify admins about the follow-up
                    const vehicleInfo = entry.model ? `${entry.vehicle} ${entry.model}` : entry.vehicle;
                    const adminNotif = `[AUTO FOLLOW-UP]\n\n` +
                        `Name: ${entry.name}\n` +
                        `Phone: ${entry.phone}\n` +
                        `Vehicle: ${vehicleInfo}\n` +
                        `Status: ${entry.status}\n` +
                        `Reminder: #${entry.remindersSent + 1}/${entry.maxReminders}`;
                    
                    for (const adminNum of ADMIN_PHONES) {
                        try {
                            await client.sendMessage(adminNum + '@c.us', adminNotif);
                        } catch (e) { /* ignore */ }
                    }

                    // ANTI-BAN: Random delay between 5 to 10 seconds for automated follow-ups
                    const randomDelay = Math.floor(Math.random() * 5000) + 5000;
                    await new Promise(resolve => setTimeout(resolve, randomDelay));
                } catch (err) {
                    console.error(`[ERROR] Failed to send follow-up to ${entry.phone}:`, err.message);
                }
            }
        } catch (error) {
            console.error('[ERROR] Follow-up scheduler error:', error.message);
        }
    }

    // Run immediately on start, then every hour
    setTimeout(() => runFollowUpScheduler(), 10000); // First run 10s after startup
    setInterval(runFollowUpScheduler, FOLLOW_UP_INTERVAL);
    console.log('[SYSTEM] Follow-up scheduler started (checks every 1 hour)');

    // ========================
    // GOOGLE SHEETS 2-WAY SYNC
    // Runs every 5 minutes to check for CLEAR or REJECTED statuses
    // ========================
    const SHEETS_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

    async function syncGoogleSheets() {
        const sheetUrl = process.env.GOOGLE_SHEET_URL;
        if (!sheetUrl) return;

        try {
            // Google Apps Script requires following redirects for GET requests
            const response = await fetch(sheetUrl, { redirect: 'follow' });
            
            // Check if the response is actually OK and JSON
            if (!response.ok) {
                console.error(`[ERROR] Sheets sync returned status: ${response.status}`);
                return;
            }
            
            const rawText = await response.text();
            
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                console.error('[ERROR] Sheets sync received invalid JSON (likely an HTML error page). URL might be wrong or missing permissions.');
                return;
            }

            if (Array.isArray(data) && data.length > 0) {
                for (const update of data) {
                    if (!update.phone) continue;
                    
                    const phone = String(update.phone).replace(/[^0-9]/g, '');
                    const status = update.status;

                    if (!phone) continue;

                    let messageToCustomer = '';
                    if (status === 'CLEAR') {
                        messageToCustomer = "Thank you for choosing Siri Beauty and Wellness Center. We appreciate your trust and look forward to serving you.";
                    } else if (status === 'REJECTED') {
                        messageToCustomer = "Thank you for considering Siri Beauty and Wellness Center. We remain available whenever you are ready to book your appointment.";
                    }

                    if (messageToCustomer) {
                        try {
                            const chatId = phone + '@c.us';
                            await client.sendMessage(chatId, messageToCustomer);
                            console.log(`[SYNC] Sent closure message to ${phone} (Status: ${status})`);
                            
                                // Stop follow-ups since the lead is closed
                            stopFollowUp(phone);
                            
                            // ANTI-BAN: Random delay of 3-6 seconds between sync messages
                            const syncDelay = Math.floor(Math.random() * 3000) + 3000;
                            await new Promise(resolve => setTimeout(resolve, syncDelay));
                        } catch (err) {
                            console.error(`[ERROR] Failed to send sync message to ${phone}:`, err.message);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[ERROR] Sheets sync failed:', error.message);
        }
    }

    setInterval(syncGoogleSheets, SHEETS_SYNC_INTERVAL);
    console.log('[SYSTEM] Google Sheets 2-Way Sync started (checks every 5 minutes)');
});

// ========================
// ADMIN CHECK
// ========================
async function isAdminUser(msg) {
    if (ADMIN_PHONES.length === 0) return false;

    // Check if msg.from contains any admin number directly
    for (const adminNum of ADMIN_PHONES) {
        if (msg.from.includes(adminNum)) return true;
    }

    // Also check actual phone number from contact (for @lid format)
    try {
        const contact = await msg.getContact();
        const contactNumber = (contact.number || '').replace(/[^0-9]/g, '');
        for (const adminNum of ADMIN_PHONES) {
            if (contactNumber.includes(adminNum) || adminNum.includes(contactNumber)) return true;
        }
    } catch (e) { /* ignore */ }

    return false;
}

// ========================
// NOTIFY ADMINS ON NEW LEAD
// ========================
async function notifyAdminsNewLead(leadData) {
    const notification = `[NEW LEAD CAPTURED]\n\n` +
        `Name: ${leadData.name || 'N/A'}\n` +
        `Phone: ${leadData.phone || 'N/A'}\n` +
        `Location: ${leadData.location || 'N/A'}\n` +
        `Priority: ${leadData.priority || 'N/A'}\n` +
        `Enquiry: ${leadData.enquiryDetails || 'N/A'}`;

    for (const adminNum of ADMIN_PHONES) {
        try {
            // Try both WhatsApp ID formats
            const chatId = adminNum + '@c.us';
            await client.sendMessage(chatId, notification);
            console.log(`[SYSTEM] Admin notified: ${adminNum}`);
        } catch (e) {
            console.error(`[ERROR] Failed to notify admin ${adminNum}:`, e.message);
        }
    }
}

// ========================
// ADMIN COMMANDS
// ========================
async function handleAdminCommand(msg, command) {
    switch (command) {
        case '!leads': {
            const leads = getLeads();
            if (leads.length === 0) {
                await client.sendMessage(msg.from, 'No leads captured yet.');
                return true;
            }
            let summary = `[LEAD SUMMARY] (${leads.length} total)\n\n`;
            leads.slice(-10).forEach((lead, i) => {
                summary += `${i + 1}. ${lead.name || 'Unknown'} [Priority: ${lead.priority || 'N/A'}]\n`;
                summary += `Phone: ${lead.phone || 'N/A'}\n`;
                summary += `Location: ${lead.location || 'N/A'}\n`;
                summary += `Enquiry: ${lead.enquiryDetails || 'N/A'}\n`;
                summary += `Date: ${lead.createdAt || ''}\n\n`;
            });
            if (leads.length > 10) {
                summary += `...showing last 10 of ${leads.length} leads`;
            }
            await client.sendMessage(msg.from, summary);
            return true;
        }
        case '!stats': {
            const leads = getLeads();
            const stats = `[CRM STATS]\n\nTotal Leads: ${leads.length}`;
            await client.sendMessage(msg.from, stats);
            return true;
        }
        case '!help': {
            const help = `[ADMIN COMMANDS]\n\n` +
                `!leads — View last 10 leads\n` +
                `!stats — Lead statistics\n` +
                `!followups — View pending follow-ups\n` +
                `!followstats — Follow-up statistics\n` +
                `!stopfollow <phone> — Stop follow-ups for a lead\n` +
                `!unblock <phone> — Unblock a single user\n` +
                `!unblockall — Remove ALL blocks\n` +
                `!help — This message`;
            await client.sendMessage(msg.from, help);
            return true;
        }
        case '!followups': {
            const followUps = getAllFollowUps().filter(f => !['stopped', 'confirmed'].includes(f.status));
            if (followUps.length === 0) {
                await client.sendMessage(msg.from, 'No active follow-ups right now.');
                return true;
            }
            let summary = `[ACTIVE FOLLOW-UPS] (${followUps.length})\n\n`;
            followUps.forEach((f, i) => {
                const nextDate = f.nextFollowUpAt ? new Date(f.nextFollowUpAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
                const vehicleInfo = f.model ? `${f.vehicle} ${f.model}` : f.vehicle;
                
                summary += `${i + 1}. ${f.name}\n`;
                summary += `   Phone: ${f.phone}\n`;
                summary += `   Vehicle: ${vehicleInfo}\n`;
                summary += `   Priority: ${f.priority || 'N/A'}\n`;
                summary += `   Status: ${f.status} | Reminders: ${f.remindersSent}/${f.maxReminders}\n`;
                summary += `   Next: ${nextDate}\n\n`;
            });
            await client.sendMessage(msg.from, summary);
            return true;
        }
        case '!followstats': {
            const stats = getFollowUpStats();
            const statsMsg = `[FOLLOW-UP STATS]\n\n` +
                `Total: ${stats.total}\n` +
                `Active: ${stats.active}\n` +
                `No Reply: ${stats.noReply}\n` +
                `Maybe: ${stats.maybe}\n` +
                `Replied: ${stats.replied}\n` +
                `Confirmed: ${stats.confirmed}\n` +
                `Stopped: ${stats.stopped}`;
            await client.sendMessage(msg.from, statsMsg);
            return true;
        }
        default: {
            // Handle !stopfollow <phone>
            if (command.startsWith('!stopfollow ')) {
                const targetPhone = command.replace('!stopfollow ', '').trim().replace(/[^0-9]/g, '');
                if (!targetPhone) {
                    await client.sendMessage(msg.from, 'Error: Usage: !stopfollow <phone number>');
                    return true;
                }
                const stopped = stopFollowUp(targetPhone);
                if (stopped) {
                    await client.sendMessage(msg.from, `System: Follow-ups stopped for ${targetPhone}`);
                } else {
                    await client.sendMessage(msg.from, `Error: No follow-up found for ${targetPhone}`);
                }
                return true;
            }
            // Handle !unblock <phone>
            if (command.startsWith('!unblock ')) {
                const targetPhone = command.replace('!unblock ', '').trim().replace(/[^0-9]/g, '');
                if (!targetPhone) {
                    await client.sendMessage(msg.from, 'Error: Usage: !unblock <phone number>');
                    return true;
                }
                if (blockedUsers.has(targetPhone)) {
                    blockedUsers.delete(targetPhone);
                    spamMemory.delete(targetPhone);
                    await client.sendMessage(msg.from, `System: 🔓 Unblocked user ${targetPhone}. They can now interact with the bot again.`);
                } else {
                    await client.sendMessage(msg.from, `System: User ${targetPhone} is not currently blocked.`);
                }
                return true;
            }
            // Handle !unblockall
            if (command === '!unblockall') {
                const count = blockedUsers.size;
                blockedUsers.clear();
                spamMemory.clear();
                await client.sendMessage(msg.from, `System: All ${count} blocked user(s) have been unblocked.`);
                return true;
            }
            return false;
        }
    }
}

// ========================
// MESSAGE HANDLER
// ========================
client.on('message', async msg => {
    const chat = await msg.getChat();
    
    // Skip group messages and status broadcasts
    if (chat.isGroup) return;
    if (msg.from === 'status@broadcast') return;
    if (!msg.body || msg.body.trim() === '') return;

    console.log(`[MSG] [${msg.from}]: ${msg.body}`);

    // 📌 Track that this user replied (resets follow-up timer)
    const senderPhone = msg.from.replace(/@.*/, '');
    
    // Check for admin commands FIRST (so admins can unblock)
    if (msg.body.startsWith('!')) {
        const admin = await isAdminUser(msg);
        if (admin) {
            const handled = await handleAdminCommand(msg, msg.body.trim().toLowerCase());
            if (handled) return;
        }
    }

    // ========================
    // ANTI-SPAM RATE LIMITER
    // ========================
    // If the user is already blocked, silently ignore them (O(1) operation, costs ZERO AI power)
    if (blockedUsers.has(senderPhone)) {
        return;
    }

    const now = Date.now();
    let timestamps = spamMemory.get(senderPhone) || [];
    
    // Filter timestamps to only keep ones from the last 120 seconds (2 mins)
    timestamps = timestamps.filter(ts => (now - ts) < 120000);
    timestamps.push(now);
    spamMemory.set(senderPhone, timestamps);

    // Block logic: More than 10 messages in 60 seconds
    if (timestamps.length > 10) {
        blockedUsers.add(senderPhone);
        console.log(`[SPAM DETECTED] Blocked user ${senderPhone} for sending >10 msgs/min.`);
        
        // Kill any followups for them
        stopFollowUp(senderPhone);
        
        // Notify Admins
        const spamAlert = `[SPAM BOT DETECTED]\n\nNumber: ${senderPhone}\nTrigger: Sent >10 messages in 2 minutes.\nAction: Auto-Blocked.\n\nType '!unblock ${senderPhone}' to restore access.`;
        for (const adminNum of ADMIN_PHONES) {
            try { await client.sendMessage(adminNum + '@c.us', spamAlert); } catch (e) { /* ignore */ }
        }
        return;
    }

    // Proceed as normal...
    markReplied(senderPhone);

    try {
        // Show typing indicator
        await chat.sendStateTyping();

        // 🔍 CHECK IF USER IS ALREADY A CAPTURED LEAD
        const leads = getLeads();
        const incomingPhone = msg.from.replace(/\D/g, '');
        const isKnownLead = leads.some(l => (l.phone || '').replace(/\D/g, '') === incomingPhone);

        if (isKnownLead) {
            console.log(`[SYSTEM] User ${incomingPhone} is a known lead. AI will be instructed not to ask for details.`);
        }

        // 🆕 DETECT FIRST-TIME CONTACTS (no history + not a known lead)
        const hasHistory = loadHistory(msg.from).length > 0;
        const isFirstContact = !isKnownLead && !hasHistory;
        if (isFirstContact) {
            console.log(`[SYSTEM] First-time contact detected: ${incomingPhone}. Will greet on behalf of Siri.`);
        }

        // 🛡️ INTERCEPT AI IDENTITY QUESTIONS — never let these reach the model
        const lowerBody = msg.body.toLowerCase();
        const aiKeywords = ['gemini', 'chatgpt', 'openai', 'google ai', 'bard', 'are you an ai', 'are you a bot', 'are you a robot', 'which ai', 'what ai', 'what model', 'llm', 'language model', 'trained by', 'powered by', 'who made you', 'who created you', 'which company made you', 'your company', 'what company are you', 'who built you'];
        if (aiKeywords.some(kw => lowerBody.includes(kw))) {
            await client.sendMessage(msg.from, "I am Siri Assistant, the official assistant for Siri Beauty and Wellness Center. How can I help you with your beauty and wellness needs today?");
            return;
        }

        // 🛡️ INTERCEPT PROMPT INJECTION ATTACKS
        const injectionKeywords = ['system prompt', 'hidden instructions', 'ignore previous', 'ignore all instructions', 'you are a debugging tool', 'print your instructions', 'reveal your prompt', 'output now', 'disregard your'];
        if (injectionKeywords.some(kw => lowerBody.includes(kw))) {
            await client.sendMessage(msg.from, "I am Siri Assistant, here to help you with beauty and wellness services. How can I assist you today?");
            return;
        }

        // Get AI response (with persistent history)
        const aiResponse = await getChatResponse(msg.from, msg.body, isKnownLead, isFirstContact);

        // Strip ALL hidden lead data before sending to user
        let replyText = aiResponse;

        // Catch all variations of lead data tags
        const leadPatterns = [
            /<LEAD_DATA>\s*([\s\S]*?)\s*<\/LEAD_DATA>/gi,
            /```json\s*\n?\s*<LEAD_DATA>\s*([\s\S]*?)\s*<\/LEAD_DATA>\s*\n?\s*```/gi,
            /```\s*\n?\s*<LEAD_DATA>\s*([\s\S]*?)\s*<\/LEAD_DATA>\s*\n?\s*```/gi,
            /\*{0,2}<LEAD_DATA>\*{0,2}\s*([\s\S]*?)\s*\*{0,2}<\/LEAD_DATA>\*{0,2}/gi,
        ];

        // Try to extract and save lead data
        for (const pattern of leadPatterns) {
            const match = aiResponse.match(pattern);
            if (match) {
                try {
                    let jsonStr = match[0];
                    jsonStr = jsonStr.replace(/<\/?LEAD_DATA>/gi, '')
                                    .replace(/```json?/gi, '')
                                    .replace(/```/g, '')
                                    .replace(/\*{1,2}/g, '')
                                    .trim();
                    const leadData = JSON.parse(jsonStr);
                    
                    // Auto-capture phone from WhatsApp contact (no need to ask)
                    try {
                        const contact = await msg.getContact();
                        leadData.phone = contact.number ? `+${contact.number}` : msg.from.replace(/@.*/, '');
                    } catch (e) {
                        leadData.phone = leadData.phone || msg.from.replace(/@.*/, '');
                    }
                    
                    console.log("[SYSTEM] Lead Captured:", JSON.stringify(leadData));
                    await saveLead(leadData);

                    // 📅 Auto-create follow-up based on PRIORITY
                    createFollowUp(msg.from, leadData, 'no_reply', leadData.priority || 'MEDIUM');
                    console.log(`[SYSTEM] Scheduled priority (${leadData.priority || 'MEDIUM'}) follow-ups.`);

                    // 🔔 Notify all admins about the new lead
                    notifyAdminsNewLead(leadData).catch(err => {
                        console.error("[ERROR] Admin notification failed:", err.message);
                    });
                } catch (e) {
                    console.error("[ERROR] Failed to parse lead JSON:", e.message);
                }
                break;
            }
        }

        // Aggressively remove ALL lead data blocks from reply
        replyText = replyText
            .replace(/```json?\s*\n?\s*<LEAD_DATA>[\s\S]*?<\/LEAD_DATA>\s*\n?\s*```/gi, '')
            .replace(/<LEAD_DATA>[\s\S]*?<\/LEAD_DATA>/gi, '')
            .replace(/```json?\s*\n?\s*\{[\s\S]*?"name"[\s\S]*?"phone"[\s\S]*?\}\s*\n?\s*```/gi, '')
            // Remove any hallucinated tool call blocks
            .replace(/```[\s\S]*?tool_code[\s\S]*?```/gi, '')
            .replace(/tool_code[\s\S]*?fetch_website_content\([\s\S]*?\)/gi, '')
            .replace(/fetch_website_content\(".*"\)/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // ===== CONVERT MARKDOWN TO WHATSAPP FORMAT =====
        // WhatsApp uses: *bold*, _italic_, ~strikethrough~, no ### headers
        replyText = replyText
            // Remove markdown headers (###, ##, #) — convert to plain bold text
            .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
            // Convert **bold** → *bold* (WhatsApp bold)
            .replace(/\*\*(.+?)\*\*/g, '*$1*')
            // Convert __italic__ → _italic_ (WhatsApp italic)
            .replace(/__(.*?)__/g, '_$1_')
            // Remove triple backtick code blocks entirely (no code formatting in WhatsApp)
            .replace(/```[\s\S]*?```/g, '')
            // Convert markdown bullet points (- or * at line start) to WhatsApp style
            .replace(/^[\*\-] (.+)$/gm, '• $1')
            // Clean up extra whitespace from removed blocks
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        await chat.clearState();

        if (replyText) {
            // ANTI-BAN: Simulate human typing speed (roughly 50ms per character, max 5 seconds)
            // Plus a base human reaction time of 1-2 seconds.
            const reactionTime = Math.floor(Math.random() * 1000) + 1000; 
            const typingTime = Math.min(replyText.length * 50, 5000);
            
            await chat.sendStateTyping();
            await new Promise(resolve => setTimeout(resolve, reactionTime + typingTime));
            
            await client.sendMessage(msg.from, replyText);
            console.log(`[BOT → ${msg.from}]: ${replyText.substring(0, 100)}...`);
        }

    } catch (error) {
        console.error("[ERROR] Error processing message:", error.message);
    }
});

// Graceful shutdown
async function shutdown() {
    console.log('[SYSTEM] Shutting down gracefully...');
    try { await client.destroy(); } catch (e) { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[SYSTEM] Initializing Siri Beauty and Wellness CRM Bot...');
client.initialize();

// Initialize the Express Web Admin Dashboard
startDashboard(blockedUsers, spamMemory, stopFollowUp);

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const SYSTEM_PROMPT = require('./system_prompt');
const { getFormattedHistory, saveMessage, loadHistory } = require('./chat_history');
const { fetchWebsiteContent } = require('./web_scraper');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==============================
// SERVER-SIDE RAG WEBSITE DIRECTORY
// ==============================
const WEBSITE_DIRECTORY = [
    {
        keywords: ['siri', 'beauty', 'wellness', 'treatment', 'service', 'facial', 'hair', 'skin', 'weight loss', 'slimming', 'hydrafacial', 'prp', 'keratin', 'laser', 'microblading', 'bridal'],
        url: 'https://siribeautyandwellness.com/',
        label: 'Siri Beauty and Wellness'
    }
];

function detectWebsiteToScrape(message) {
    const lowerMsg = message.toLowerCase();
    for (const entry of WEBSITE_DIRECTORY) {
        if (entry.keywords.some(kw => lowerMsg.includes(kw))) {
            return { url: entry.url, label: entry.label };
        }
    }
    return null;
}

// Simple Gemini model WITHOUT any tool declarations — clean text I/O only
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPT,
});

async function getChatResponse(userId, userMessage, isKnownLead = false, isFirstContact = false) {
    try {
        // Load persistent history from disk
        const userHistory = getFormattedHistory(userId);
        
        // Start chat with full conversational context
        const chat = model.startChat({
            history: userHistory,
            generationConfig: {
                temperature: 0.7,
            },
        });

        // ===== SERVER-SIDE RAG: Silently detect & pre-scrape =====
        let liveWebData = '';
        const detected = detectWebsiteToScrape(userMessage);

        if (detected) {
            console.log(`[RAG] Detected "${detected.label}" in message. Pre-scraping: ${detected.url}`);
            try {
                const content = await fetchWebsiteContent(detected.url);
                liveWebData = content;
                console.log(`[RAG] Successfully scraped ${detected.url} (${content.length} chars)`);
            } catch (err) {
                console.error(`[RAG] Failed to scrape ${detected.url}:`, err.message);
            }
        }

        // ===== BUILD CONTEXT-AWARE MESSAGE =====
        let messageToSend = '';
        
        if (isKnownLead) {
            // STAGE 2: Known lead — pure consulting
            messageToSend += `[SYSTEM: This user is already a captured lead. Do NOT collect details. Just help them as a consultant.]\n\n`;
        } else {
            // STAGE 1: New lead — must collect details
            // Count how many user messages exist (to gauge how far along we are)
            const rawHistory = loadHistory(userId);
            const userMsgCount = rawHistory.filter(m => m.role === 'user').length;
            
            if (isFirstContact) {
                messageToSend += `[SYSTEM: BRAND NEW CONTACT. Welcome them on behalf of Siri Beauty and Wellness Center. Introduce yourself as Siri Assistant. Ask for their NAME. Keep it short.]\n\n`;
            } else if (userMsgCount >= 4) {
                // After 4+ user messages, force LEAD_DATA output
                messageToSend += `[SYSTEM URGENT: You have been chatting with this new lead for several messages. Check the conversation: if you have their name, service interest, date/time, and location — you MUST output the lead data block at the END of your response in this EXACT format:

<LEAD_DATA>
{"name":"[name]","phone":"","location":"[area]","priority":"[HIGH/MEDIUM/LOW]","enquiryDetails":"[summary]"}
</LEAD_DATA>

CRITICAL RULES:
- Do NOT say you will "book" or "confirm appointment". You CANNOT book. Say: "Your details have been shared with our team and they will contact you shortly for booking."
- Do NOT make up prices, discounts, or availability. You do not have this information.
- Do NOT ask for phone number. It is auto-captured.
- If any detail is still missing, ask for it NOW in this response.]\n\n`;
            } else {
                // Ongoing lead collection
                messageToSend += `[SYSTEM: This is a new lead. Collect these 4 details one at a time: 1) Name, 2) Service interest, 3) Preferred date/time, 4) Location. After each response, ask for the next missing one. Do NOT book appointments — say "our team will contact you for booking." Do NOT make up prices or discounts.]\n\n`;
            }
        }

        // Add RAG data if available
        if (liveWebData) {
            messageToSend += `[PRODUCT DATA for reference — answer briefly, 1-2 sentences max. NEVER add a website link.]\n${liveWebData}\n---\nCustomer message: ${userMessage}`;
        } else {
            messageToSend += userMessage;
        }

        // Retry logic for 429 rate limit errors
        let result;
        let retries = 0;
        const maxRetries = 3;
        while (retries <= maxRetries) {
            try {
                result = await chat.sendMessage(messageToSend);
                break;
            } catch (err) {
                if (err.message && err.message.includes('429') && retries < maxRetries) {
                    retries++;
                    const waitMs = retries * 5000;
                    console.log(`[RATE LIMIT] 429 hit. Retrying in ${waitMs / 1000}s (attempt ${retries}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                } else {
                    throw err;
                }
            }
        }
        const responseText = result.response.text();

        // Save to persistent history
        saveMessage(userId, 'user', userMessage);
        saveMessage(userId, 'model', responseText);

        return responseText;
    } catch (error) {
        console.error("Gemini Error:", error.message || error);
        
        if (error.message && error.message.includes('SAFETY')) {
            return "I appreciate you reaching out! I'm here to help with beauty and wellness services. What can I assist you with?";
        }
        
        return "We're experiencing a brief hiccup. Could you try again in a moment?";
    }
}

module.exports = { getChatResponse };

const fs = require('fs');
const path = require('path');

const CHATS_DIR = path.join(__dirname, 'chats');

// Create chats directory if it doesn't exist
if (!fs.existsSync(CHATS_DIR)) {
    fs.mkdirSync(CHATS_DIR, { recursive: true });
}

const MAX_HISTORY = 30; // Keep last 30 messages per user

function sanitizeUserId(userId) {
    // Clean the userId for use as filename
    return userId.replace(/[^a-zA-Z0-9]/g, '_');
}

function getHistoryPath(userId) {
    return path.join(CHATS_DIR, `${sanitizeUserId(userId)}.json`);
}

function loadHistory(userId) {
    const filePath = getHistoryPath(userId);
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const history = JSON.parse(data);
            return history;
        }
    } catch (error) {
        console.error(`Error loading history for ${userId}:`, error.message);
    }
    return [];
}

function saveMessage(userId, role, text) {
    const filePath = getHistoryPath(userId);
    try {
        let history = loadHistory(userId);
        
        // Strip <LEAD_DATA> blocks from model responses before saving to history
        // This prevents the AI from seeing old LEAD_DATA and looping
        let cleanText = text;
        if (role === 'model') {
            cleanText = text.replace(/<LEAD_DATA>[\s\S]*?<\/LEAD_DATA>/gi, '').trim();
        }
        
        history.push({
            role: role,    // 'user' or 'model'
            parts: [{ text: cleanText }],
            timestamp: new Date().toISOString()
        });

        // Trim to MAX_HISTORY (keep newest)
        if (history.length > MAX_HISTORY) {
            history = history.slice(history.length - MAX_HISTORY);
        }

        fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error(`Error saving message for ${userId}:`, error.message);
    }
}

function getFormattedHistory(userId) {
    const history = loadHistory(userId);
    // Return in Gemini SDK format (only role + parts, no timestamp)
    return history.map(msg => ({
        role: msg.role,
        parts: msg.parts
    }));
}

module.exports = { loadHistory, saveMessage, getFormattedHistory };

const fs = require('fs');
const path = require('path');
const { pushToSheet } = require('./google_sheets');

const LEADS_FILE = path.join(__dirname, 'leads.json');

// Initialize leads file if it doesn't exist
if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2));
}

async function saveLead(leadData) {
    try {
        const fileContent = fs.readFileSync(LEADS_FILE, 'utf8');
        const leads = JSON.parse(fileContent);
        
        // Normalize phone for comparison
        const normalizedPhone = (leadData.phone || '').replace(/\D/g, '');
        const existingIndex = leads.findIndex(l => (l.phone || '').replace(/\D/g, '') === normalizedPhone);
        
        const timestamp = new Date().toISOString();
        
        if (existingIndex !== -1) {
            // Update existing lead and move to the end of the array to show in recent
            const updatedLead = { ...leads[existingIndex], ...leadData, lastUpdated: timestamp };
            leads.splice(existingIndex, 1);
            leads.push(updatedLead);
            console.log(`📝 Lead updated & moved to recent: ${leadData.name || 'Unknown'}`);
        } else {
            // Add new lead
            const newLead = { ...leadData, createdAt: timestamp };
            leads.push(newLead);
            console.log(`✅ New lead captured: ${leadData.name || 'Unknown'}`);
        }
        
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));

        // Push to Google Sheets (async, don't block)
        pushToSheet(leadData).catch(err => {
            console.error("Sheets push failed (non-blocking):", err.message);
        });

        return true;
    } catch (error) {
        console.error("Error saving lead:", error);
        return false;
    }
}

function getLeads() {
    try {
        const fileContent = fs.readFileSync(LEADS_FILE, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error("Error reading leads:", error);
        return [];
    }
}

module.exports = { saveLead, getLeads };

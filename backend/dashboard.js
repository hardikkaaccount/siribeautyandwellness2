const express = require('express');
const cors = require('cors');
const path = require('path');
const { getLeads } = require('./crm');
const { getAllFollowUps, getFollowUpStats } = require('./follow_up');

function startDashboard(blockedUsers, spamMemory, stopFollowUp) {
    const app = express();
    app.use(cors()); // Allow requests from our React Frontend
    app.use(express.json());

    app.get('/api/stats', async (req, res) => {
        try {
            // Fetch live leads from Google Sheets
            const sheetUrl = process.env.GOOGLE_SHEET_URL;
            let totalLeads = 0;
            if (sheetUrl) {
                const response = await fetch(`${sheetUrl}?action=getAll`, { redirect: 'follow' });
                if (response.ok) {
                    const data = await response.json();
                    totalLeads = Array.isArray(data) ? data.length : 0;
                }
            }
            
            const fStats = getFollowUpStats();
            res.json({
                totalLeads,
                followUpStats: fStats,
                blockedCount: blockedUsers.size
            });
        } catch (error) {
            console.error('[DASHBOARD] Error fetching stats from sheets:', error);
            res.status(500).json({ error: 'Failed to compute stats' });
        }
    });

    app.get('/api/leads', async (req, res) => {
        try {
            const sheetUrl = process.env.GOOGLE_SHEET_URL;
            if (!sheetUrl) return res.status(500).json({ error: 'GOOGLE_SHEET_URL not set in .env' });

            const response = await fetch(`${sheetUrl}?action=getAll`, { redirect: 'follow' });
            if (!response.ok) throw new Error('Failed to fetch from Google Sheets');
            
            const leads = await response.json();
            res.json(leads);
        } catch (error) {
            console.error('[DASHBOARD] Error fetching leads from sheets:', error);
            res.status(500).json({ error: 'Failed to fetch leads' });
        }
    });

    app.get('/api/followups', (req, res) => {
        res.json(getAllFollowUps());
    });

    app.get('/api/blocked', (req, res) => {
        res.json(Array.from(blockedUsers));
    });

    app.post('/api/unblock', (req, res) => {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: "Phone required" });
        
        const cleanPhone = String(phone).replace(/[^0-9]/g, '');
        if (blockedUsers.has(cleanPhone)) {
            blockedUsers.delete(cleanPhone);
            spamMemory.delete(cleanPhone);
            res.json({ success: true, message: `Unblocked ${cleanPhone}` });
        } else {
            res.json({ success: false, message: `${cleanPhone} is not blocked` });
        }
    });

    app.post('/api/stopFollowUp', (req, res) => {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: "Phone required" });
        
        const cleanPhone = String(phone).replace(/[^0-9]/g, '');
        const stopped = stopFollowUp(cleanPhone);
        res.json({ success: stopped, message: stopped ? 'Follow-ups marked as Complete/Stopped' : 'No active follow-up found' });
    });

    app.post('/api/updateStatus', async (req, res) => {
        try {
            const { phone, status } = req.body;
            if (!phone || !status) return res.status(400).json({ error: "Phone and status required" });
            
            const sheetUrl = process.env.GOOGLE_SHEET_URL;
            if (sheetUrl) {
                // Trigger the Google Apps Script doPost -> updateStatus
                await fetch(sheetUrl, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateStatus', phone, status }),
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            res.json({ success: true });
        } catch (error) {
            console.error('[DASHBOARD] Error updating status:', error);
            res.status(500).json({ error: 'Failed' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`[SYSTEM] 🌐 Backend API running at http://localhost:${PORT}`);
    });
}

module.exports = { startDashboard };

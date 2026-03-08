require('dotenv').config();

async function pushToSheet(leadData) {
    const sheetUrl = process.env.GOOGLE_SHEET_URL;
    
    if (!sheetUrl) {
        console.warn("GOOGLE_SHEET_URL not set in .env — skipping Sheets push.");
        return false;
    }

    try {
        const response = await fetch(sheetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData),
            redirect: 'follow' // Apps Script redirects on POST
        });

        const result = await response.text();
        console.log("Google Sheets response:", result);
        return true;
    } catch (error) {
        console.error("Error pushing to Google Sheets:", error.message);
        return false;
    }
}

module.exports = { pushToSheet };

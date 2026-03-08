/**
 * Test: Full Lead Collection Flow
 * Simulates a new customer conversation and verifies:
 * 1. AI asks for name on first message
 * 2. AI collects service interest, date/time, location
 * 3. AI outputs <LEAD_DATA> block after all 4 details
 * 4. Lead is saved to leads.json
 */
const { getChatResponse } = require('./gemini_service');
const { saveLead, getLeads } = require('./crm');
const fs = require('fs');
const path = require('path');

const TEST_USER = 'test_lead_user_' + Date.now();
const LEADS_FILE = path.join(__dirname, 'leads.json');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('='.repeat(60));
    console.log('TEST: Full Lead Collection Flow');
    console.log('='.repeat(60));

    // Step 1: New contact says Hi (isFirstContact = true)
    console.log('\n--- STEP 1: First contact says "Hi" ---');
    const r1 = await getChatResponse(TEST_USER, 'Hi', false, true);
    console.log('BOT:', r1);
    console.log('CHECK: Does it ask for name?', r1.toLowerCase().includes('name') ? 'YES ✅' : 'NO ❌');
    await delay(2000);

    // Step 2: Customer gives name
    console.log('\n--- STEP 2: Customer gives name ---');
    const r2 = await getChatResponse(TEST_USER, 'My name is Priya Sharma', false, false);
    console.log('BOT:', r2);
    await delay(2000);

    // Step 3: Customer mentions service interest
    console.log('\n--- STEP 3: Customer asks about a service ---');
    const r3 = await getChatResponse(TEST_USER, 'I am looking for Hydrafacial treatment', false, false);
    console.log('BOT:', r3);
    await delay(2000);

    // Step 4: Customer gives date/time
    console.log('\n--- STEP 4: Customer gives date/time ---');
    const r4 = await getChatResponse(TEST_USER, 'March 20th, 3 PM', false, false);
    console.log('BOT:', r4);
    await delay(2000);

    // Step 5: Customer gives location
    console.log('\n--- STEP 5: Customer gives location ---');
    const r5 = await getChatResponse(TEST_USER, 'I am from Koramangala', false, false);
    console.log('BOT:', r5);

    // Check if LEAD_DATA was in any response
    console.log('\n' + '='.repeat(60));
    console.log('RESULTS:');
    console.log('='.repeat(60));

    const allResponses = [r1, r2, r3, r4, r5].join('\n');
    const hasLeadData = allResponses.includes('<LEAD_DATA>') || allResponses.includes('LEAD_DATA');
    console.log('LEAD_DATA block found in responses?', hasLeadData ? 'YES ✅' : 'NO ❌');

    if (hasLeadData) {
        // Extract it
        const match = allResponses.match(/<LEAD_DATA>\s*([\s\S]*?)\s*<\/LEAD_DATA>/i);
        if (match) {
            console.log('LEAD_DATA content:', match[1].trim());
            try {
                const parsed = JSON.parse(match[1].trim());
                console.log('Parsed lead:', JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.log('Failed to parse lead JSON:', e.message);
            }
        }
    }

    // Check leads.json
    const leads = getLeads();
    console.log('\nLeads in leads.json:', leads.length);
    if (leads.length > 0) {
        console.log('Latest lead:', JSON.stringify(leads[leads.length - 1], null, 2));
    }

    // Print all raw responses to check for hidden blocks
    console.log('\n' + '='.repeat(60));
    console.log('RAW RESPONSE DUMP (checking for hidden LEAD_DATA):');
    console.log('='.repeat(60));
    [r1, r2, r3, r4, r5].forEach((r, i) => {
        console.log(`\n--- Response ${i + 1} RAW ---`);
        console.log(JSON.stringify(r));
    });
}

runTest().then(() => {
    console.log('\nTest complete.');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});

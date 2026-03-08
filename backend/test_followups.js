/**
 * 🧪 TEST SCRIPT — Follow-Up System
 * Run: node test_followups.js
 * 
 * This simulates the follow-up lifecycle WITHOUT waiting 2 days.
 * It manually sets dates in the past to trigger "due" follow-ups.
 */

const fs = require('fs');
const path = require('path');
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

const FOLLOWUPS_FILE = path.join(__dirname, 'followups.json');

// Colors for console
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(emoji, msg) { console.log(`${emoji} ${msg}`); }
function pass(msg) { console.log(`${GREEN}  ✅ PASS: ${msg}${RESET}`); }
function fail(msg) { console.log(`${RED}  ❌ FAIL: ${msg}${RESET}`); }
function header(msg) { console.log(`\n${CYAN}${'='.repeat(50)}\n${msg}\n${'='.repeat(50)}${RESET}`); }

// Backup existing followups
let backup = null;
if (fs.existsSync(FOLLOWUPS_FILE)) {
    backup = fs.readFileSync(FOLLOWUPS_FILE, 'utf8');
}

// Start fresh for testing
fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify({}, null, 2));

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) { pass(msg); passed++; }
    else { fail(msg); failed++; }
}

try {
    // ========================
    // TEST 1: Create follow-ups
    // ========================
    header('TEST 1: Creating Follow-Ups');

    createFollowUp('919876543210@c.us', {
        name: 'Test User A',
        phone: '919876543210',
        vehicle: 'Royal Enfield',
        model: 'Classic 350',
    }, 'no_reply', 'HIGH');

    createFollowUp('919999888877@c.us', {
        name: 'Test User B',
        phone: '919999888877',
        vehicle: 'KTM',
        model: 'Duke 390',
    }, 'maybe', 'MEDIUM');

    const all = getAllFollowUps();
    assert(all.length === 2, 'Two follow-ups created');
    assert(all.find(f => f.name === 'Test User A'), 'User A found');
    assert(all.find(f => f.name === 'Test User B'), 'User B found');

    // ========================
    // TEST 2: Check NOT due yet (freshly created)
    // ========================
    header('TEST 2: Not Due Yet (Just Created)');

    const dueNow = getDueFollowUps();
    assert(dueNow.length === 0, 'No follow-ups due immediately (correct!)');

    // ========================
    // TEST 3: Simulate time passing (set nextFollowUpAt to past)
    // ========================
    header('TEST 3: Simulate 2 Days Passing (Trigger Due)');

    const followUps = JSON.parse(fs.readFileSync(FOLLOWUPS_FILE, 'utf8'));
    
    // Set User A's next follow-up to 1 hour ago
    followUps['919876543210'].nextFollowUpAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(followUps, null, 2));

    const dueAfterTimeskip = getDueFollowUps();
    assert(dueAfterTimeskip.length === 1, 'One follow-up is now due');
    assert(dueAfterTimeskip[0].name === 'Test User A', 'User A is the due one');

    // ========================
    // TEST 4: Get reminder message
    // ========================
    header('TEST 4: Reminder Message Templates');

    const msg1 = getReminderMessage(dueAfterTimeskip[0]);
    assert(msg1.includes('Test User A'), 'Message includes user name');
    assert(msg1.includes('Royal Enfield Classic 350') || msg1.includes('Royal Enfield'), 'Message includes vehicle/model logic');
    log('💬', `Message: "${msg1}"`);

    // ========================
    // TEST 5: Record reminder sent
    // ========================
    header('TEST 5: Record Reminder Sent');

    recordReminderSent('919876543210');
    const afterSend = getAllFollowUps().find(f => f.phone === '919876543210');
    assert(afterSend.remindersSent === 1, 'Reminder count is 1');
    assert(afterSend.nextFollowUpAt !== null, 'Next follow-up scheduled');
    log('📅', `Next follow-up: ${new Date(afterSend.nextFollowUpAt).toLocaleString()}`);

    // ========================
    // TEST 6: Mark replied (resets timer)
    // ========================
    header('TEST 6: User Replies (Reset Timer)');

    markReplied('919876543210');
    const afterReply = getAllFollowUps().find(f => f.phone === '919876543210');
    assert(afterReply.status === 'replied', 'Status changed to replied');
    assert(afterReply.remindersSent === 0, 'Reminder count reset to 0');

    // ========================
    // TEST 7: Mark confirmed (stops follow-ups)
    // ========================
    header('TEST 7: Mark Confirmed (Stop Follow-ups)');

    markConfirmed('919876543210');
    const afterConfirm = getAllFollowUps().find(f => f.phone === '919876543210');
    assert(afterConfirm.status === 'confirmed', 'Status is confirmed');

    // Confirmed users should not appear in due list
    const followUps2 = JSON.parse(fs.readFileSync(FOLLOWUPS_FILE, 'utf8'));
    followUps2['919876543210'].nextFollowUpAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify(followUps2, null, 2));
    
    const dueAfterConfirm = getDueFollowUps();
    assert(!dueAfterConfirm.find(f => f.phone === '919876543210'), 'Confirmed user NOT in due list');

    // ========================
    // TEST 8: Stop follow-up manually
    // ========================
    header('TEST 8: Manual Stop (!stopfollow)');

    const stopped = stopFollowUp('919999888877');
    assert(stopped === true, 'Stop returned true');
    const afterStop = getAllFollowUps().find(f => f.phone === '919999888877');
    assert(afterStop.status === 'stopped', 'Status is stopped');

    // ========================
    // TEST 9: Max reminders auto-stop
    // ========================
    header('TEST 9: Max Reminders Auto-Stop');

    // Create a fresh follow-up and send 3 reminders
    fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify({}, null, 2));
    createFollowUp('911111111111@c.us', {
        name: 'Max Test',
        phone: '911111111111',
        vehicle: 'Honda',
        model: 'CBR650R'
    }, 'no_reply');

    recordReminderSent('911111111111');
    recordReminderSent('911111111111');
    recordReminderSent('911111111111');

    const maxTest = getAllFollowUps().find(f => f.phone === '911111111111');
    assert(maxTest.status === 'stopped', 'Auto-stopped after 3 reminders');
    assert(maxTest.remindersSent === 3, 'Reminder count is 3');

    // ========================
    // TEST 10: Stats
    // ========================
    header('TEST 10: Stats');

    const stats = getFollowUpStats();
    log('📊', JSON.stringify(stats, null, 2));
    assert(stats.total >= 1, 'Stats total is correct');

    // ========================
    // RESULTS
    // ========================
    header('RESULTS');
    console.log(`\n  ${GREEN}Passed: ${passed}${RESET}`);
    console.log(`  ${failed > 0 ? RED : GREEN}Failed: ${failed}${RESET}\n`);

    if (failed === 0) {
        console.log(`${GREEN}🎉 ALL TESTS PASSED! Follow-up system is working correctly.${RESET}\n`);
    } else {
        console.log(`${RED}⚠️  Some tests failed. Check the output above.${RESET}\n`);
    }

} finally {
    // Restore original followups.json
    if (backup !== null) {
        fs.writeFileSync(FOLLOWUPS_FILE, backup);
        log('🔄', 'Restored original followups.json');
    } else {
        fs.writeFileSync(FOLLOWUPS_FILE, JSON.stringify({}, null, 2));
        log('🔄', 'Reset followups.json to empty');
    }
}

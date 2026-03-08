const { getChatResponse } = require('./gemini_service');
const fs = require('fs');

async function testWebScraping() {
    console.log("-----------------------------------------");
    console.log("Asking Race Bot a highly specific question that requires it to read a website...");
    console.log("Question: Can you dig into https://dieseltronic.in/ and tell me what the new 'DieselTRONIC PRO' offers over the standard one?");
    console.log("-----------------------------------------");

    console.log("Simulating a KNOWN LEAD requesting information...");
    const answer = await getChatResponse("test_rag_user_001", "Tell me what the new 'DieselTRONIC PRO' offers over the standard one?", true);

    console.log("Race Bot Answer received. Writing to output.txt to avoid terminal garbling...");
    fs.writeFileSync('output.txt', answer, 'utf8');
    console.log("Done.");
}

testWebScraping();

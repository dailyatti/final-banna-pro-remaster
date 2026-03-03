
import https from 'https';

const apiKey = 'AIzaSyCtRC5uVobR4E3ZhT1TG40kUgD2Wo5mncI';

const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models?key=${apiKey}`,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
        try {
            const data = JSON.parse(body);
            if (data.models) {
                console.log("MODELS:");
                // Filter for relevant models to keep output short
                data.models
                    .map(m => m.name.replace('models/', ''))
                    .filter(n => n.includes('gemini') || n.includes('imagen'))
                    .forEach(n => console.log(n));
            } else { console.log("ERROR:", body); }
        } catch (e) { console.log("PARSE ERR:", body); }
    });
});
req.end();

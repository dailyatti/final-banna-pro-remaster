
import https from 'https';
import fs from 'fs';

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
                const names = data.models.map(m => m.name).join('\n');
                fs.writeFileSync('models.txt', names);
                console.log("Written to models.txt");
            } else { console.log("ERROR:", body); }
        } catch (e) { console.log("PARSE ERR:", body); }
    });
});
req.end();

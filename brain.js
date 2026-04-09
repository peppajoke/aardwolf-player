const https = require('https');

class AIBrain {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.systemPrompt = `You are Vestige, an AI playing the MUD game Aardwolf (aardmud.org). You are a brand new player exploring the world.

IMPORTANT RULES:
- Respond with ONLY the single MUD command you want to type. Nothing else. No explanations.
- Common commands: look, north, south, east, west, up, down, kill <monster>, score, inventory, who, say <text>, help
- During character creation, follow the prompts. Choose a name "Vestige", pick a class (Thief is good for beginners), pick a race.
- If you see a login prompt, type: Vestige
- If asked for a password for a new character, use: VestigeAI2026!
- If you see "[Hit Return to continue]" or similar, just send an empty line or press enter.
- Explore! Fight monsters! Level up! Talk to NPCs!
- If you see "You are hungry" or "You are thirsty", type: eat bread / drink water
- Don't repeat the same command more than 3 times in a row
- If stuck, try: look, or move in a random direction
- Keep exploration fun and varied

You will receive the recent MUD output. Decide what command to type next.`;
  }

  async decide(history, characterName) {
    if (!this.apiKey) return 'look';

    // Build messages from history
    const messages = [{ role: 'system', content: this.systemPrompt }];

    // Add recent history as context
    const recent = history.slice(-25);
    for (const entry of recent) {
      if (entry.role === 'mud') {
        messages.push({ role: 'user', content: entry.content.substring(0, 2000) });
      } else if (entry.role === 'ai') {
        messages.push({ role: 'assistant', content: entry.content });
      }
    }

    // If no recent MUD output, ask for a look
    if (messages.length <= 1) return 'look';

    return new Promise((resolve) => {
      const data = JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 50,
        temperature: 0.7,
      });

      const req = https.request({
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.apiKey,
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const cmd = json.choices[0].message.content.trim().split('\n')[0].trim();
            resolve(cmd || 'look');
          } catch {
            resolve('look');
          }
        });
      });

      req.on('error', () => resolve('look'));
      req.on('timeout', () => { req.destroy(); resolve('look'); });
      req.write(data);
      req.end();
    });
  }
}

module.exports = { AIBrain };

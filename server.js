const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { MudClient } = require('./mud');
const { AIBrain } = require('./brain');
const { Logger } = require('./logger');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const logger = new Logger();
const brain = new AIBrain();
const mud = new MudClient();

const state = {
  buffer: [],
  history: [],
  connected: false,
  lastCommand: null,
  characterName: 'Vestige',
};

function broadcast(type, data) {
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

mud.on('data', (text) => {
  state.buffer.push(text);
  broadcast('mud', { text });
  logger.log('mud', text);
});

mud.on('connected', () => {
  state.connected = true;
  broadcast('status', { connected: true });
  logger.log('system', 'Connected to Aardwolf');
});

mud.on('disconnected', () => {
  state.connected = false;
  broadcast('status', { connected: false });
  logger.log('system', 'Disconnected from Aardwolf');
  setTimeout(() => {
    logger.log('system', 'Attempting reconnect...');
    mud.connect();
  }, 10000);
});

let aiLoopRunning = false;

async function aiLoop() {
  if (aiLoopRunning) return;
  aiLoopRunning = true;

  while (true) {
    await sleep(3000);
    if (!state.connected || state.buffer.length === 0) continue;

    const output = state.buffer.join('');
    state.buffer = [];
    state.history.push({ role: 'mud', content: output });
    while (state.history.length > 50) state.history.shift();

    try {
      const command = await brain.decide(state.history, state.characterName);
      if (command && command.trim()) {
        state.lastCommand = command.trim();
        state.history.push({ role: 'ai', content: command.trim() });
        broadcast('command', { text: command.trim() });
        logger.log('ai', command.trim());
        mud.send(command.trim());
      }
    } catch (err) {
      logger.log('error', err.message);
      broadcast('error', { text: err.message });
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

wss.on('connection', (ws) => {
  const recent = state.history.slice(-30);
  recent.forEach(entry => {
    if (entry.role === 'mud') ws.send(JSON.stringify({ type: 'mud', text: entry.content }));
    else if (entry.role === 'ai') ws.send(JSON.stringify({ type: 'command', text: entry.content }));
  });
  ws.send(JSON.stringify({ type: 'status', connected: state.connected }));
});

app.get('/api/status', (req, res) => {
  res.json({
    connected: state.connected,
    characterName: state.characterName,
    historyLength: state.history.length,
    lastCommand: state.lastCommand,
  });
});

server.listen(PORT, () => {
  console.log('Aardwolf AI Player viewer on port ' + PORT);
  mud.connect();
  aiLoop();
});

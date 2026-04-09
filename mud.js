const net = require('net');
const { EventEmitter } = require('events');

class MudClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.host = 'aardmud.org';
    this.port = 4000;
    this.partialBuffer = '';
  }

  connect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
    }

    this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
      this.emit('connected');
    });

    this.socket.on('data', (data) => {
      // Handle IAC telnet negotiation
      const cleaned = this.handleTelnet(data);
      if (cleaned.length > 0) {
        const text = cleaned.toString('utf8');
        this.partialBuffer += text;

        // Emit on newlines or after accumulation
        if (this.partialBuffer.includes('\n') || this.partialBuffer.length > 500) {
          this.emit('data', this.partialBuffer);
          this.partialBuffer = '';
        }
      }
    });

    this.socket.on('close', () => {
      this.emit('disconnected');
    });

    this.socket.on('error', (err) => {
      console.error('MUD connection error:', err.message);
      this.emit('disconnected');
    });

    // Flush partial buffer periodically
    this.flushInterval = setInterval(() => {
      if (this.partialBuffer.length > 0) {
        this.emit('data', this.partialBuffer);
        this.partialBuffer = '';
      }
    }, 1000);
  }

  handleTelnet(data) {
    // Strip IAC sequences (telnet negotiation)
    const result = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === 255) { // IAC
        if (i + 1 < data.length) {
          const cmd = data[i + 1];
          if (cmd === 251 || cmd === 252 || cmd === 253 || cmd === 254) {
            // WILL/WONT/DO/DONT — respond with refusal
            if (i + 2 < data.length) {
              const opt = data[i + 2];
              if (this.socket && this.socket.writable) {
                // Refuse: respond WONT to DO, DONT to WILL
                if (cmd === 253) { // DO -> WONT
                  this.socket.write(Buffer.from([255, 252, opt]));
                } else if (cmd === 251) { // WILL -> DONT
                  this.socket.write(Buffer.from([255, 254, opt]));
                }
              }
              i += 3;
              continue;
            }
          } else if (cmd === 250) {
            // SB (subnegotiation) — skip until SE (240)
            i += 2;
            while (i < data.length && data[i] !== 240) i++;
            i++; // skip SE
            continue;
          } else {
            i += 2;
            continue;
          }
        }
        i++;
      } else {
        result.push(data[i]);
        i++;
      }
    }
    return Buffer.from(result);
  }

  send(command) {
    if (this.socket && this.socket.writable) {
      this.socket.write(command + '\r\n');
    }
  }

  disconnect() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
    }
  }
}

module.exports = { MudClient };

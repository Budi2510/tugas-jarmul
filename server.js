const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const express = require('express');
const selfsigned = require('selfsigned');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3443;
const app = express();
const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost-cert.pem');

function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.values(interfaces).forEach((netList = []) => {
    netList.forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    });
  });

  return addresses;
}

function ensureHttpsCertificate() {
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  const localIPs = getLocalIPv4Addresses();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...localIPs.map((ip) => ({ type: 7, ip })),
  ];

  const pems = selfsigned.generate(
    [
      { name: 'commonName', value: 'localhost' },
      { name: 'organizationName', value: 'Local WebRTC HTTPS Demo' },
    ],
    {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        {
          name: 'basicConstraints',
          cA: true,
        },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true,
          dataEncipherment: true,
        },
        {
          name: 'subjectAltName',
          altNames,
        },
      ],
    }
  );

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);

  console.log('HTTPS certificate generated automatically.');
  console.log('Certificate includes these local IPs:', localIPs.length ? localIPs.join(', ') : 'no LAN IP detected');

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const httpsOptions = ensureHttpsCertificate();
const server = https.createServer(httpsOptions, app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function getUsersInRoom(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];

  return Array.from(room).map((socketId) => {
    const peer = io.sockets.sockets.get(socketId);
    return {
      socketId,
      userName: peer?.data?.userName || 'User',
      filter: peer?.data?.filter || 'normal',
    };
  });
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userName }) => {
    if (!roomId) return;

    socket.data.roomId = roomId;
    socket.data.userName = userName || `User-${socket.id.slice(0, 4)}`;
    socket.data.filter = socket.data.filter || 'normal';

    const existingUsers = getUsersInRoom(roomId);

    socket.join(roomId);

    socket.emit('existing-users', existingUsers);

    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      userName: socket.data.userName,
      filter: socket.data.filter,
    });

    socket.to(roomId).emit('chat-message', {
      system: true,
      text: `${socket.data.userName} masuk ke room.`,
      createdAt: Date.now(),
    });
  });

  socket.on('leave-room', () => {
    const { roomId, userName } = socket.data;
    if (!roomId) return;

    socket.to(roomId).emit('user-left', {
      socketId: socket.id,
      userName: userName || 'User',
    });

    socket.to(roomId).emit('chat-message', {
      system: true,
      text: `${userName || 'User'} keluar dari room.`,
      createdAt: Date.now(),
    });

    socket.leave(roomId);
    socket.data.roomId = '';
  });

  socket.on('change-filter', ({ roomId, filter }) => {
    if (!roomId || !filter) return;

    socket.data.filter = filter;

    socket.to(roomId).emit('update-filter', {
      socketId: socket.id,
      filter,
    });
  });

  socket.on('offer', ({ target, offer }) => {
    socket.to(target).emit('offer', {
      from: socket.id,
      userName: socket.data.userName,
      filter: socket.data.filter || 'normal',
      offer,
    });
  });

  socket.on('answer', ({ target, answer }) => {
    socket.to(target).emit('answer', {
      from: socket.id,
      answer,
    });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', {
      from: socket.id,
      candidate,
    });
  });

  socket.on('chat-message', ({ roomId, text, userName }) => {
    if (!roomId || !text?.trim()) return;

    io.to(roomId).emit('chat-message', {
      socketId: socket.id,
      userName: userName || socket.data.userName || 'User',
      text: text.trim(),
      createdAt: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const { roomId, userName } = socket.data;
    if (roomId) {
      socket.to(roomId).emit('user-left', {
        socketId: socket.id,
        userName: userName || 'User',
      });

      socket.to(roomId).emit('chat-message', {
        system: true,
        text: `${userName || 'User'} keluar dari room.`,
        createdAt: Date.now(),
      });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPv4Addresses();
  console.log('\n===============================================');
  console.log(' HTTPS WebRTC Video Call Server is running');
  console.log('===============================================');
  console.log(`Local laptop: https://localhost:${PORT}`);

  if (localIPs.length) {
    console.log('\nOpen this link on another laptop in the same Wi-Fi:');
    localIPs.forEach((ip) => console.log(`https://${ip}:${PORT}`));
  } else {
    console.log('\nNo LAN IP detected. Make sure Wi-Fi/LAN is connected.');
  }

  console.log('\nIf browser shows certificate warning: Advanced > Proceed.');
  console.log('Then click Allow / Izinkan for Camera and Microphone.');
  console.log('===============================================\n');
});

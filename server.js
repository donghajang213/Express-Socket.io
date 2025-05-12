const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const users = {};
const LOG_FILE = path.join(__dirname, 'chat-log.json');

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '[]');
}

function saveMessage(nickname, message, room, type = 'public') {
  const timestamp = new Date().toISOString();
  const logEntry = { nickname, message, timestamp, room, type };

  fs.readFile(LOG_FILE, 'utf8', (err, data) => {
    if (err) return console.error('로그 파일 읽기 실패:', err);
    let logs = [];
    try {
      logs = JSON.parse(data);
    } catch (parseErr) {
      console.error('로그 파싱 오류:', parseErr);
    }
    logs.push(logEntry);
    fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), (err) => {
      if (err) console.error('로그 저장 실패:', err);
    });
  });
}

function broadcastUserList() {
  const list = Object.entries(users).map(([id, user]) => ({
    id,
    nickname: user.nickname,
  }));
  io.emit('user list', list);
}

io.on('connection', (socket) => {
  console.log('사용자 접속:', socket.id);

  socket.on('join room', ({ nickname, room }) => {
    users[socket.id] = { nickname, room };
    socket.join(room);

    socket.to(room).emit('chat message', `[알림] ${nickname}님이 "${room}" 방에 입장했습니다`);
    saveMessage("SYSTEM", `${nickname}님이 방에 입장했습니다`, room);
    broadcastUserList();
  });

  socket.on('chat message', (msg) => {
    const user = users[socket.id] || { nickname: '익명', room: 'default' };
    io.to(user.room).emit('chat message', `${user.nickname}: ${msg}`);
    saveMessage(user.nickname, msg, user.room);
  });

  socket.on('private message', ({ to, message }) => {
    const fromUser = users[socket.id];
    const toUser = users[to];
    if (fromUser && toUser) {
      io.to(to).emit('chat message', `[DM from ${fromUser.nickname}] ${message}`);
      socket.emit('chat message', `[DM to ${toUser.nickname}] ${message}`);
      saveMessage(fromUser.nickname, `[DM to ${toUser.nickname}] ${message}`, fromUser.room, 'dm');
    }
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.room).emit('chat message', `[알림] ${user.nickname}님이 퇴장하셨습니다`);
      saveMessage("SYSTEM", `${user.nickname}님이 퇴장하셨습니다`, user.room);
      delete users[socket.id];
      broadcastUserList();
    }
  });
});

http.listen(3000, () => {
  console.log('http://localhost:3000 에서 서버 실행 중');
});

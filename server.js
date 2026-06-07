const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 10000;

const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/room/:roomId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

function getUsersInRoom(roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);

  if (!room) return [];

  return Array.from(room).map((socketId) => {
    const peer = io.sockets.sockets.get(socketId);

    return {
      socketId,
      userName: peer?.data?.userName || "User",
      filter: peer?.data?.filter || "normal",
    };
  });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    if (!roomId) return;

    socket.data.roomId = roomId;
    socket.data.userName =
      userName || `User-${socket.id.slice(0, 4)}`;

    socket.data.filter =
      socket.data.filter || "normal";

    const existingUsers =
      getUsersInRoom(roomId);

    socket.join(roomId);

    socket.emit(
      "existing-users",
      existingUsers
    );

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName: socket.data.userName,
      filter: socket.data.filter,
    });

    socket.to(roomId).emit("chat-message", {
      system: true,
      text: `${socket.data.userName} masuk ke room.`,
      createdAt: Date.now(),
    });

    console.log(
      `${socket.data.userName} joined room ${roomId}`
    );
  });

  socket.on("leave-room", () => {
    const { roomId, userName } =
      socket.data;

    if (!roomId) return;

    socket.to(roomId).emit("user-left", {
      socketId: socket.id,
      userName: userName || "User",
    });

    socket.to(roomId).emit("chat-message", {
      system: true,
      text: `${userName || "User"} keluar dari room.`,
      createdAt: Date.now(),
    });

    socket.leave(roomId);

    socket.data.roomId = "";
  });

  socket.on(
    "change-filter",
    ({ roomId, filter }) => {
      if (!roomId || !filter) return;

      socket.data.filter = filter;

      socket.to(roomId).emit(
        "update-filter",
        {
          socketId: socket.id,
          filter,
        }
      );
    }
  );

  socket.on("offer", ({ target, offer }) => {
    socket.to(target).emit("offer", {
      from: socket.id,
      userName: socket.data.userName,
      filter:
        socket.data.filter || "normal",
      offer,
    });
  });

  socket.on(
    "answer",
    ({ target, answer }) => {
      socket.to(target).emit("answer", {
        from: socket.id,
        answer,
      });
    }
  );

  socket.on(
    "ice-candidate",
    ({ target, candidate }) => {
      socket.to(target).emit(
        "ice-candidate",
        {
          from: socket.id,
          candidate,
        }
      );
    }
  );

  socket.on(
    "chat-message",
    ({ roomId, text, userName }) => {
      if (!roomId || !text?.trim()) return;

      io.to(roomId).emit(
        "chat-message",
        {
          socketId: socket.id,
          userName:
            userName ||
            socket.data.userName ||
            "User",
          text: text.trim(),
          createdAt: Date.now(),
        }
      );
    }
  );

  socket.on("disconnect", () => {
    const { roomId, userName } =
      socket.data;

    if (roomId) {
      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        userName: userName || "User",
      });

      socket.to(roomId).emit("chat-message", {
        system: true,
        text: `${userName || "User"} keluar dari room.`,
        createdAt: Date.now(),
      });
    }

    console.log(
      "User disconnected:",
      socket.id
    );
  });
});

server.listen(PORT, () => {
  console.log("=================================");
  console.log("WebRTC Server Running");
  console.log("PORT:", PORT);
  console.log("=================================");
});
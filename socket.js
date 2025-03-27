// socket.js
const { Server } = require("socket.io");

let io;
const documentRooms = new Map(); // documentId -> Set(socketIds)

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Новое подключение", socket.id);

    // Присоединение к документу
    socket.on("joinDocument", ({ documentId, role }) => {
      socket.join(documentId);
      console.log(
        `📄 ${socket.id} присоединился к documentId ${documentId} как ${role}`
      );
    });

    // Когда пациент подписал документ
    socket.on("patientSigned", ({ documentId }) => {
      console.log(`✅ Документ ${documentId} подписан пациентом`);

      io.to(documentId).emit("documentSigned", {
        documentId,
        timestamp: new Date(),
      });
    });

    // Обработка отключения
    socket.on("disconnect", () => {
      console.log("❌ Отключен сокет", socket.id);
    });
  });
}

function getIO() {
  if (!io) throw new Error("Socket.io не инициализирован");
  return io;
}

module.exports = {
  initSocket,
  getIO,
};

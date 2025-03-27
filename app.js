// app.js
const dotenv = require("dotenv");

const http = require("http");
const { initSocket } = require("./socket");

// Загрузка переменных окружения
dotenv.config();
require("./utils/cronJobs"); // Подключаем cronjobs
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const fileRoutes = require("./routes/fileRoutes");
const contractorRoutes = require("./routes/contractorRoutes");
const patientRoutes = require("./routes/patientRoutes");
const swaggerDocs = require("./config/swaggerDocs.json");
const swaggerUi = require("swagger-ui-express");

// Подключение к MongoDB
connectDB();

const app = express();
app.use(express.json()); // Парсинг JSON запросов

// Добавление CORS
app.use(cors());

// Подключение Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Маршруты для авторизации и регистрации
app.use("/api/auth", authRoutes);

// Маршруты для работы с документами
app.use("/api/documents", documentRoutes);

// Маршруты для работы с файлами
app.use("/api/files", fileRoutes);

// Маршрут для работы с контрагентами
app.use("/api/contractors", contractorRoutes);

// Маршрут для работы с пациентами
app.use("/api/patients", patientRoutes);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// app.js
const dotenv = require("dotenv");
// Загрузка переменных окружения
dotenv.config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const fileRoutes = require("./routes/fileRoutes");
const swaggerDocs = require("./config/swaggerConfig"); // Импорт Swagger конфигурации
const swaggerUi = require("swagger-ui-express"); // Добавьте это в начале файла

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

// Маршрут для создания документа
app.use("/api/documents", documentRoutes); // Подключаем маршруты документов

app.use("/api/files", fileRoutes); // Добавляем маршруты для работы с файлами

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

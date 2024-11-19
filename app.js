// app.js
const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const fileRoutes = require("./routes/fileRoutes");

// Загрузка переменных окружения
dotenv.config();

// Подключение к MongoDB
connectDB();

const app = express();
app.use(express.json()); // Парсинг JSON запросов

// Маршруты для авторизации и регистрации
app.use("/api/auth", authRoutes);

// Маршрут для создания документа
app.use("/api/documents", documentRoutes); // Подключаем маршруты документов

app.use("/api/files", fileRoutes); // Добавляем маршруты для работы с файлами

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

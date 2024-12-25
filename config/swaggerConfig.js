const swaggerJsDoc = require("swagger-jsdoc");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Medoc Backend API",
      version: "1.0.0",
      description: "API документация для Medoc Backend",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http", // Исправлено с "https" на "http"
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [], // Название схемы безопасности должно быть одинаковым везде
      },
    ],
    servers: [
      {
        url: "https://medoc.vastness.ru", // URL вашего сервера
      },
    ],
  },
  apis: ["./routes/*.js"], // Пути к вашим API-файлам
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = swaggerDocs;

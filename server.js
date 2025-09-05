"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const database_1 = require("./config/database");
const socketHandler_1 = require("./socket/socketHandler");
const notificationService_1 = require("./services/notificationService");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use(limiter);
app.use((0, morgan_1.default)('combined'));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cors_1.default)({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Library Management System API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const libraries_1 = __importDefault(require("./routes/libraries"));
const titles_1 = __importDefault(require("./routes/titles"));
const inventories_1 = __importDefault(require("./routes/inventories"));
const copies_1 = __importDefault(require("./routes/copies"));
const borrowRequests_1 = __importDefault(require("./routes/borrowRequests"));
const borrowRecords_1 = __importDefault(require("./routes/borrowRecords"));
const csv_1 = __importDefault(require("./routes/csv"));
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/users', users_1.default);
app.use('/api/v1/libraries', libraries_1.default);
app.use('/api/v1/titles', titles_1.default);
app.use('/api/v1/inventories', inventories_1.default);
app.use('/api/v1/copies', copies_1.default);
app.use('/api/v1/borrow-requests', borrowRequests_1.default);
app.use('/api/v1/borrow-records', borrowRecords_1.default);
app.use('/api/v1/csv', csv_1.default);
app.get('/api/v1', (req, res) => {
    res.json({
        success: true,
        message: 'Library Management System API v1',
        endpoints: {
            auth: '/api/v1/auth',
            users: '/api/v1/users',
            libraries: '/api/v1/libraries',
            titles: '/api/v1/titles',
            inventories: '/api/v1/inventories',
            copies: '/api/v1/copies',
            borrowRequests: '/api/v1/borrow-requests',
            borrowRecords: '/api/v1/borrow-records',
            csv: '/api/v1/csv'
        }
    });
});
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
    });
});
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});
const startServer = async () => {
    try {
        await (0, database_1.connectDatabase)();
        const io = (0, socketHandler_1.initializeSocketIO)(server);
        notificationService_1.notificationService.setSocketIO(io);
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📚 Library Management System API v1`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`🔌 WebSocket server initialized`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map
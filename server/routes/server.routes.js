const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const serverController = require('../controllers/server.controller');
const { check } = require('express-validator');
const authMiddleware = require('../middleware/auth.middleware');

// Настройка загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/configs'));
  },
  filename: (req, file, cb) => {
    const fileExt = path.extname(file.originalname);
    const fileName = `${req.body.ipAddress}_${file.fieldname}${fileExt}`;
    cb(null, fileName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/octet-stream' || 
        file.originalname.endsWith('.ovpn')) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только .ovpn файлы'));
    }
  }
});

// Публичные маршруты с разными форматами URL (для совместимости с клиентом)
router.get('/public', serverController.getAllServers);
router.get('-public', serverController.getAllServers); // New hyphenated route to match client request
router.get('/public/:id', serverController.getServerById);
router.get('/public/:id/antizapret-config', serverController.getAntizapretConfig);
router.get('/public/:id/vpn-config', serverController.getFullVpnConfig);

// Получение списка всех серверов
router.get('/', serverController.getAllServers);

// Получение информации о конкретном сервере
router.get('/:id', serverController.getServerById);

// Добавление нового сервера
router.post(
  '/',
  upload.fields([
    { name: 'antizapretConfig', maxCount: 1 },
    { name: 'fullVpnConfig', maxCount: 1 }
  ]),
  [
    body('ipAddress').isIP().withMessage('Некорректный IP адрес')
  ],
  serverController.addServer
);

// Обновление сервера
router.put(
  '/:id',
  upload.fields([
    { name: 'antizapretConfig', maxCount: 1 },
    { name: 'fullVpnConfig', maxCount: 1 }
  ]),
  serverController.updateServer
);

// Удаление сервера
router.delete('/:id', serverController.deleteServer);

// Получение конфигурационного файла Antizapret
router.get('/:id/antizapret-config', serverController.getAntizapretConfig);

// Получение конфигурационного файла Полного VPN
router.get('/:id/vpn-config', serverController.getFullVpnConfig);

// Connection tracking endpoints
router.post('/:id/connect', authMiddleware, serverController.recordServerConnect);
router.post('/:id/disconnect', authMiddleware, serverController.recordServerDisconnect);

module.exports = router;
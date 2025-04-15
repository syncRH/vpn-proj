const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

const ServerSchema = new mongoose.Schema({
  ipAddress: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  antizapretConfig: { type: String, required: true },
  fullVpnConfig: { type: String, required: true },
  antizapretFilePath: { type: String, required: true },
  fullVpnFilePath: { type: String, required: true },
  activeConnections: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Обновление поля updatedAt перед сохранением
ServerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Server = mongoose.model('Server', ServerSchema);

async function createServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const antizapretPath = '/app/uploads/configs/test-antizapret.ovpn';
    const fullVpnPath = '/app/uploads/configs/test-full-vpn.ovpn';
    
    const antizapretConfig = await fs.readFile(antizapretPath, 'utf8');
    const fullVpnConfig = await fs.readFile(fullVpnPath, 'utf8');
    
    const server = new Server({
      ipAddress: '192.168.1.10',
      antizapretConfig,
      fullVpnConfig,
      antizapretFilePath: antizapretPath,
      fullVpnFilePath: fullVpnPath,
      isActive: true
    });
    
    await server.save();
    console.log('Сервер успешно создан:', server);
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при создании сервера:', err);
    process.exit(1);
  }
}

createServer(); 
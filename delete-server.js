const mongoose = require('mongoose');

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

const Server = mongoose.model('Server', ServerSchema);

async function deleteServer(serverId) {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Поиск и удаление сервера
    const server = await Server.findById(serverId);
    if (!server) {
      console.error('Сервер не найден');
      process.exit(1);
    }
    
    await Server.deleteOne({ _id: serverId });
    
    console.log('Сервер успешно удален:', serverId);
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при удалении сервера:', err);
    process.exit(1);
  }
}

// Укажите ID сервера, который нужно удалить
deleteServer('67f5721b5d40aaf96c16dd4c'); 
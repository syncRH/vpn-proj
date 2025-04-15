const mongoose = require('mongoose');

async function checkServers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vpn-service', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const servers = await mongoose.connection.db.collection('servers').find({}).toArray();
    console.log('Серверы в базе данных:', servers);
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при получении списка серверов:', err);
    process.exit(1);
  }
}

checkServers(); 
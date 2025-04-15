const fs = require('fs').promises;

async function fixServerController() {
  try {
    // Чтение файла
    const filePath = '/app/controllers/server.controller.js';
    const content = await fs.readFile(filePath, 'utf8');
    
    // Замена метода server.remove() на Server.deleteOne()
    const fixedContent = content.replace(
      /await server\.remove\(\);/g, 
      'await Server.deleteOne({ _id: serverId });'
    );
    
    // Запись обратно в файл
    await fs.writeFile(filePath, fixedContent, 'utf8');
    
    console.log('Контроллер сервера успешно исправлен');
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при исправлении контроллера сервера:', err);
    process.exit(1);
  }
}

fixServerController(); 
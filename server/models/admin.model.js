const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Schema для администратора
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'superadmin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Улучшенное сравнение паролей с поддержкой как хэшированных, так и обычных паролей
adminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Проверяем, является ли пароль хешем bcrypt (начинается с $2a$, $2b$ или $2y$)
    if (this.password.startsWith('$2')) {
      // Если да, используем bcrypt для сравнения
      console.log('Using bcrypt for password comparison');
      return await bcrypt.compare(candidatePassword, this.password);
    } else {
      // Если нет, используем простое сравнение
      console.log('Using direct comparison for password');
      return this.password === candidatePassword;
    }
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
};

module.exports = mongoose.model('Admin', adminSchema);
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  activationKey: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  activationDate: {
    type: Date,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    default: null
  },
  activationLimit: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  lastLogin: {
    type: Date,
    default: null
  },
  createdBy: {
    type: Schema.Types.Mixed,
    ref: 'Admin',
    required: false,
    default: 'admin-panel'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Обновление поля updatedAt перед сохранением
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Метод для проверки активности пользователя
UserSchema.methods.isValidUser = function() {
  if (!this.isActive) return false;
  if (this.expirationDate && new Date() > this.expirationDate) return false;
  return true;
};

module.exports = mongoose.model('User', UserSchema); 
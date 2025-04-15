const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ServerSchema = new Schema({
  name: {
    type: String,
    default: ''
  },
  host: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    required: true,
    unique: true
  },
  country: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  antizapretConfig: {
    type: String,
    required: true
  },
  fullVpnConfig: {
    type: String,
    required: true
  },
  antizapretFilePath: {
    type: String,
    required: true
  },
  fullVpnFilePath: {
    type: String,
    required: true
  },
  activeConnections: {
    type: Number,
    default: 0
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
ServerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Server', ServerSchema); 
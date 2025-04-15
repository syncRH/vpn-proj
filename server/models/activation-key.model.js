const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ActivationKeySchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  activatedAt: {
    type: Date,
    default: null
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expirationDate: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('ActivationKey', ActivationKeySchema); 
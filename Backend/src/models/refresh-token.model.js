const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);

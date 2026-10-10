const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    userKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "匿名使用者"
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserProfile", userProfileSchema);

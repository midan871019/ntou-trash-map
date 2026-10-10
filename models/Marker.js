const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    author: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "匿名使用者"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const cleanConfirmationSchema = new mongoose.Schema(
  {
    userKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    author: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "匿名使用者"
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    imagePath: {
      type: String,
      default: ""
    },
    imagePaths: {
      type: [String],
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const markerSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["activity", "trash", "beach-clean"],
      required: true
    },
    trashLevel: {
      type: String,
      enum: ["light", "medium", "heavy", null],
      default: null
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0
    },
    carbonSaved: {
      type: Number,
      min: 0,
      default: 0
    },
    trashTypes: {
      type: [String],
      default: []
    },
    riskLevel: {
      type: String,
      enum: ["low", "high", "extreme"],
      default: "low"
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    imagePath: {
      type: String,
      default: ""
    },
    creatorUserKey: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    creatorName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "匿名使用者"
    },
    startAt: {
      type: Date,
      default: null
    },
    endAt: {
      type: Date,
      default: null
    },
    organizer: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },
    organizerEmail: {
      type: String,
      trim: true,
      maxlength: 160,
      default: ""
    },
    locationName: {
      type: String,
      trim: true,
      maxlength: 160,
      default: ""
    },
    eventUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    maxParticipants: {
      type: Number,
      min: 0,
      default: 0
    },
    participants: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ["active", "cleaned", "expired"],
      default: "active"
    },
    cleanedAt: {
      type: Date,
      default: null
    },
    cleanedBy: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ""
    },
    cleanConfirmations: [cleanConfirmationSchema],
    comments: [commentSchema]
  },
  { timestamps: true }
);

markerSchema.pre("validate", function normalizeFields(next) {
  if (this.category !== "trash") {
    this.trashLevel = null;
    this.quantity = 0;
    this.carbonSaved = 0;
    this.trashTypes = [];
    this.riskLevel = "low";
  }

  if (!["activity", "beach-clean"].includes(this.category)) {
    this.startAt = null;
    this.endAt = null;
  }

  next();
});

module.exports = mongoose.model("Marker", markerSchema);

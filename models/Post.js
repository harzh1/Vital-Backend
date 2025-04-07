const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    caption: {
      type: String,
      required: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", "text"],
      default: "text",
    },
    category: {
      type: String,
      enum: [
        "General",
        "Fitness",
        "Nutrition",
        "Mental Health",
        "Lifestyle",
        "Motivation",
      ],
      default: "General",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    allowComments: {
      type: Boolean,
      default: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    textBackgroundColor: {
      type: String,
      default: "#000000",
      validate: {
        validator: function (v) {
          return /^#[0-9A-Fa-f]{6,8}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid hex color!`,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Post", postSchema);

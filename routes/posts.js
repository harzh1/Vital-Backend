const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Post = require("../models/Post");
const User = require("../models/User");
const auth = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Middleware to verify JWT token
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "..", "uploads", "posts");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  console.log("Received file:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Accept both image and video files
  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedVideoTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/3gpp",
    "video/x-matroska",
    "video/webm",
    "application/octet-stream", // Some video files might have this MIME type
  ];

  if (
    allowedImageTypes.includes(file.mimetype) ||
    allowedVideoTypes.includes(file.mimetype)
  ) {
    console.log("File accepted:", file.mimetype);
    cb(null, true);
  } else {
    console.log("File rejected. MIME type:", file.mimetype);
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Only images and videos are allowed!`
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Create a new post
router.post("/", auth, upload.single("media"), async (req, res) => {
  try {
    console.log("\n=== Starting Post Creation ===");
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);
    console.log("Request headers:", req.headers);
    console.log("User ID:", req.userId);

    if (!req.userId) {
      console.log("No user ID found in request");
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      caption,
      category,
      isPrivate,
      allowComments,
      textBackgroundColor,
      mediaType,
    } = req.body;

    // Validate required fields
    if (!caption) {
      console.log("Missing caption");
      return res.status(400).json({
        success: false,
        message: "Caption is required",
        receivedData: req.body,
      });
    }

    // Format textBackgroundColor to include # if missing
    let formattedTextBackgroundColor = "#000000";
    if (textBackgroundColor) {
      formattedTextBackgroundColor = textBackgroundColor.startsWith("#")
        ? textBackgroundColor
        : `#${textBackgroundColor}`;

      // Validate hex color format
      if (!/^#[0-9A-Fa-f]{6,8}$/.test(formattedTextBackgroundColor)) {
        console.log(
          "Invalid text background color:",
          formattedTextBackgroundColor
        );
        return res.status(400).json({
          success: false,
          message: "Invalid text background color format",
          receivedColor: formattedTextBackgroundColor,
        });
      }
    }

    let mediaUrl = null;
    let finalMediaType = mediaType || "text"; // Use the mediaType from request body

    if (req.file) {
      mediaUrl = `/uploads/posts/${req.file.filename}`;
      // Only override mediaType if it's not explicitly set in the request
      if (!mediaType) {
        if (req.file.mimetype.startsWith("video/")) {
          finalMediaType = "video";
        } else if (req.file.mimetype.startsWith("image/")) {
          finalMediaType = "image";
        }
      }
    }

    console.log("Creating post with data:", {
      user: req.userId,
      caption,
      category: category || "General",
      isPrivate: isPrivate === "true",
      allowComments: allowComments === "true",
      textBackgroundColor: formattedTextBackgroundColor,
      mediaUrl,
      mediaType: finalMediaType,
    });

    const post = new Post({
      user: req.userId,
      caption,
      category: category || "General",
      isPrivate: isPrivate === "true",
      allowComments: allowComments === "true",
      textBackgroundColor: formattedTextBackgroundColor,
      mediaUrl,
      mediaType: finalMediaType,
    });

    await post.save();
    await post.populate("user", "name email profilePicture");

    console.log("Post created successfully:", post);
    console.log("=== End Post Creation ===\n");

    res.status(201).json({
      _id: post._id,
      user: post.user,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      category: post.category,
      isPrivate: post.isPrivate,
      allowComments: post.allowComments,
      textBackgroundColor: post.textBackgroundColor,
      likes: post.likes,
      comments: post.comments,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    console.error("Error stack:", error.stack);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create post",
      error: error.stack,
    });
  }
});

// Get all posts (with pagination)
router.get("/", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ isPrivate: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name email profilePicture")
      .populate("likes", "name")
      .populate("comments.user", "name profilePicture");

    const total = await Post.countDocuments({ isPrivate: false });

    res.json({
      posts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's posts
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const posts = await Post.find({
      user: req.params.userId,
      $or: [{ isPrivate: false }, { user: req.userId }],
    })
      .sort({ createdAt: -1 })
      .populate("user", "name email profilePicture")
      .populate("likes", "name")
      .populate("comments.user", "name profilePicture");

    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single post
router.get("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("user", "email displayName profilePicture")
      .populate("comments");

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update a post
router.put("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json(updatedPost);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete a post
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (post.mediaUrl) {
      const filePath = path.join(__dirname, "..", post.mediaUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await post.remove();
    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Like/unlike a post
router.post("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const likeIndex = post.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      post.likes.push(req.userId);
    } else {
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Add comment to post
router.post("/:postId/comments", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!post.allowComments) {
      return res
        .status(403)
        .json({ message: "Comments are disabled for this post" });
    }

    const comment = {
      user: req.userId,
      text: req.body.text,
    };

    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "name profilePicture");

    res.json(post.comments[post.comments.length - 1]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Comment = require("../models/Comment");
const Post = require("../models/Post");

// Middleware to verify JWT token
const auth = async (req, res, next) => {
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

// Create a new comment
router.post("/", auth, async (req, res) => {
  try {
    const { postId, content } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = new Comment({
      user: req.userId,
      post: postId,
      content,
    });

    await comment.save();

    // Add comment to post's comments array
    post.comments.push(comment._id);
    await post.save();

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get comments for a post
router.get("/post/:postId", auth, async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.postId })
      .populate("user", "email displayName profilePicture")
      .populate("replies")
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update a comment
router.put("/:id", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedComment = await Comment.findByIdAndUpdate(
      req.params.id,
      { $set: { content: req.body.content } },
      { new: true }
    );

    res.json(updatedComment);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete a comment
router.delete("/:id", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Remove comment from post's comments array
    const post = await Post.findById(comment.post);
    if (post) {
      post.comments = post.comments.filter(
        (commentId) => commentId.toString() !== comment._id.toString()
      );
      await post.save();
    }

    await comment.remove();
    res.json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Like/unlike a comment
router.post("/:id/like", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const likeIndex = comment.likes.indexOf(req.userId);
    if (likeIndex === -1) {
      comment.likes.push(req.userId);
    } else {
      comment.likes.splice(likeIndex, 1);
    }

    await comment.save();
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Add a reply to a comment
router.post("/:id/reply", auth, async (req, res) => {
  try {
    const parentComment = await Comment.findById(req.params.id);
    if (!parentComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const reply = new Comment({
      user: req.userId,
      post: parentComment.post,
      content: req.body.content,
    });

    await reply.save();

    parentComment.replies.push(reply._id);
    await parentComment.save();

    res.status(201).json(reply);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;

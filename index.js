require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

const urlSchema = new mongoose.Schema(
  {
    shortId: { type: String, required: true, unique: true, index: true },
    longUrl: { type: String, required: true },
    accessCount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

const ShortUrl = mongoose.model("ShortUrl", urlSchema);

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

async function generateUniqueShortId(length = 7) {
  for (let i = 0; i < 10; i++) {
    const shortId = crypto.randomBytes(6).toString("base64url").slice(0, length);
    const exists = await ShortUrl.exists({ shortId });
    if (!exists) return shortId;
  }
  throw new Error("Could not generate unique shortId");
}

// POST /shortUrl -> create short URL
app.post("/shortUrl", async (req, res) => {
  try {
    const { longUrl } = req.body;

    if (!longUrl || !isValidUrl(longUrl)) {
      return res.status(400).json({ error: "Valid longUrl is required." });
    }

    const shortId = await generateUniqueShortId();

    const doc = await ShortUrl.create({
      shortId,
      longUrl,
      accessCount: 0
    });

    const base = `${req.protocol}://${req.get("host")}`;
    return res.status(201).json({
      message: "Short URL created.",
      shortId: doc.shortId,
      shortUrl: `${base}/${doc.shortId}`,
      longUrl: doc.longUrl,
      accessCount: doc.accessCount
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /:shortId -> redirect + increment access count
app.get("/:shortId", async (req, res) => {
  try {
    const { shortId } = req.params;
    const doc = await ShortUrl.findOne({ shortId });

    if (!doc) {
      return res.status(404).json({ error: "shortId not found." });
    }

    await ShortUrl.updateOne({ _id: doc._id }, { $inc: { accessCount: 1 } });
    return res.redirect(doc.longUrl);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /:shortId -> update longUrl or accessCount
app.patch("/:shortId", async (req, res) => {
  try {
    const { shortId } = req.params;
    const { longUrl, accessCount } = req.body;

    const updates = {};

    if (longUrl !== undefined) {
      if (!isValidUrl(longUrl)) {
        return res.status(400).json({ error: "longUrl must be a valid URL." });
      }
      updates.longUrl = longUrl;
    }

    if (accessCount !== undefined) {
      if (!Number.isInteger(accessCount) || accessCount < 0) {
        return res
          .status(400)
          .json({ error: "accessCount must be a non-negative integer." });
      }
      updates.accessCount = accessCount;
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "Provide longUrl and/or accessCount to update." });
    }

    const updated = await ShortUrl.findOneAndUpdate({ shortId }, updates, {
      new: true
    });

    if (!updated) {
      return res.status(404).json({ error: "shortId not found." });
    }

    return res.json({
      message: "Updated successfully.",
      data: {
        shortId: updated.shortId,
        longUrl: updated.longUrl,
        accessCount: updated.accessCount
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
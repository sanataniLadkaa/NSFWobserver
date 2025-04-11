const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const upload = require('./upload/multer-config');
const { isNSFW } = require('./nsfw/nsfw-check');

const app = express();
const PORT = 4000;

const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');
const MEDIA_DB_PATH = path.join(__dirname, 'data', 'media.json');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(processedDir, { recursive: true });
fs.mkdirSync(path.dirname(MEDIA_DB_PATH), { recursive: true });
if (!fs.existsSync(MEDIA_DB_PATH)) fs.writeFileSync(MEDIA_DB_PATH, '[]');

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use('/processed', express.static(processedDir));

// Upload with ID
app.post('/upload', (req, res) => {
  upload.single('media')(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const imageId = req.body.imageId;
    if (!imageId) return res.status(400).json({ error: 'Image ID is required' });

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const originalPath = file.path;
    const processedFilename = `processed-${imageId}${ext}`;
    const processedPath = path.join(processedDir, processedFilename);
    let finalURL = '';

    try {
      if (/\.(jpg|jpeg|png)$/i.test(ext)) {
        const buffer = fs.readFileSync(originalPath);

        const flagged = await isNSFW(buffer);
        if (flagged) {
          fs.unlinkSync(originalPath);
          return res.status(400).json({ error: 'NSFW content detected. Upload rejected.' });
        }

        await sharp(buffer)
  .resize({ width: 800 })
  .jpeg({ quality: 85 }) // or .png({ compressionLevel: 9 })
  .toFile(processedPath);

        setTimeout(() => {
          fs.unlink(originalPath, (err) => {
            if (err) console.warn("⚠️ Could not delete original image:", err.message);
          });
        }, 100);

        finalURL = `http://localhost:${PORT}/processed/${processedFilename}`;
      } else {
        finalURL = `http://localhost:${PORT}/uploads/${imageId}${ext}`;
        fs.renameSync(originalPath, path.join(uploadDir, `${imageId}${ext}`));
      }

      const media = {
        id: imageId,
        originalname: file.originalname,
        filename: `${imageId}${ext}`,
        mimetype: file.mimetype,
        size: file.size,
        url: finalURL,
        uploadDate: new Date().toISOString()
      };

      const allMedia = JSON.parse(fs.readFileSync(MEDIA_DB_PATH, 'utf8'));
      const existing = allMedia.find(m => m.id === imageId);
      if (existing) return res.status(400).json({ error: 'Image ID already exists' });

      allMedia.push(media);
      fs.writeFileSync(MEDIA_DB_PATH, JSON.stringify(allMedia, null, 2));

      console.log("✅ File processed & saved:", media.filename);
      res.json({ message: 'Upload successful', media });
    } catch (err) {
      console.error("❌ Processing error:", err.message);
      res.status(500).json({ error: 'Failed to process media file' });
    }
  });
});

// Get all media
app.get('/media', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(MEDIA_DB_PATH, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read media database' });
  }
});

// Search by ID
app.get('/media/:id', (req, res) => {
  const id = req.params.id;
  try {
    const data = JSON.parse(fs.readFileSync(MEDIA_DB_PATH, 'utf-8'));
    const result = data.find(item => item.id === id);
    if (!result) return res.status(404).json({ error: 'Image not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search media database' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

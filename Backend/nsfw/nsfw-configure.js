const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');

console.log('TensorFlow loaded ✅', tf.version.tfjs);

let model = null;

const loadModel = async () => {
  if (!model) {
    model = await nsfw.load();
    console.log("🔍 NSFW model loaded");
  }
  return model;
};

const isNSFW = async (imageBuffer) => {
  const nsfwModel = await loadModel();
  const image = tf.node.decodeImage(imageBuffer, 3);
  const predictions = await nsfwModel.classify(image);
  image.dispose();

  console.log("🧠 NSFW Predictions:", predictions);

  const predMap = {};
  predictions.forEach(pred => {
    predMap[pred.className] = pred.probability;
  });

  const porn = predMap['Porn'] || 0;
  const hentai = predMap['Hentai'] || 0;
  const sexy = predMap['Sexy'] || 0;

  // 👇 Custom logic for special conditions
  if (porn > 0.8 && sexy < 0.2 && hentai < 0.2) {
    console.log("🟢 High Porn but low Sexy & Hentai — NOT NSFW");
    return false;
  }

  if (sexy > 0.85 && porn < 0.2 && hentai < 0.2) {
    console.log("🟢 High Sexy but low Porn & Hentai — NOT NSFW");
    return false;
  }

  if (sexy > 0.7 && sexy <= 0.85) {
    console.log("⚠️ Moderate Sexy content — NSFW");
    return true;
  }

  // Default threshold logic
  const thresholds = {
    Porn: 0.8,
    Hentai: 0.7,
    Sexy: 0.7
  };

  for (const pred of predictions) {
    const threshold = thresholds[pred.className];
    if (threshold && pred.probability >= threshold) {
      console.log(`⚠️ NSFW detected: ${pred.className} (${(pred.probability * 100).toFixed(2)}%)`);
      console.log("✅ NSFW Filter Applied");
      return true;
    }
  }

  console.log("🟢 Content is Safe — NSFW Filter Not Applied");
  return false;
};

module.exports = { isNSFW };

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: "https://lecture-summarize-frontend-923epdb6k.vercel.app", // replace with your actual Vercel URL
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

// Multer setup

const upload = multer({ storage: multer.memoryStorage() });


async function summarizeText(text) {
  const response = await axios.post(
    'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
    {
      inputs: text,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data[0]?.summary_text || "Summary not available.";
}

// AssemblyAI setup
const ASSEMBLYAI_API = 'https://api.assemblyai.com/v2';
const headers = {
  authorization: process.env.ASSEMBLYAI_API_KEY,
};

// Upload audio endpoint
app.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    // Upload audio buffer directly to AssemblyAI
    const response = await axios({
      method: 'post',
      url: `${ASSEMBLYAI_API}/upload`,
      headers: {
        ...headers,
        'Transfer-Encoding': 'chunked',
      },
      data: req.file.buffer,
    });

    const audio_url = response.data.upload_url;

    // Start transcription
    const transcriptResponse = await axios.post(`${ASSEMBLYAI_API}/transcript`, {
      audio_url,
    }, { headers });

    const transcriptId = transcriptResponse.data.id;

    // Poll until done...
    const checkStatus = async () => {
      const statusResponse = await axios.get(`${ASSEMBLYAI_API}/transcript/${transcriptId}`, { headers });
      const status = statusResponse.data.status;

      if (status === 'completed') {
        const transcriptionText = statusResponse.data.text;
        const summary = await summarizeText(transcriptionText);
        res.json({ transcription: transcriptionText, summary });
      } else if (status === 'error') {
        res.status(500).json({ error: 'Transcription failed.' });
      } else {
        setTimeout(checkStatus, 3000);
      }
    };

    checkStatus();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

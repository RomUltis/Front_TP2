const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());

const corsOptions = {
    origin: [
        "http://172.29.19.20", 
        "http://172.29.19.20:33001", 
        "http://172.29.19.20:33002", 
        "http://172.29.19.20:33003"
    ],
    methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization"
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

const BACKEND_URL = "http://172.29.19.20:33002";

app.post('/register', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/register`, req.body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Erreur Proxy (register) :", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Erreur API Proxy (register)" });
    }
});

app.post('/login', async (req, res) => {
    try {
        const response = await axios.post(`${BACKEND_URL}/login`, req.body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error("Erreur Proxy (login) :", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Erreur API Proxy (login)" });
    }
});

app.post('/gps', async (req, res) => {
  try {
    const response = await axios.post(`${BACKEND_URL}/gps`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || ""
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur Proxy (gps) :", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success:false, message:"Erreur API Proxy (gps)" });
  }
});

app.get('/frames', async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/frames`, {
      params: req.query,
      headers: { 'Authorization': req.headers.authorization || "" }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur Proxy (frames) :", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success:false, message:"Erreur API Proxy (frames)" });
  }
});

app.get('/boats/latest', async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND_URL}/boats/latest`, {
      headers: { 'Authorization': req.headers.authorization || "" }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur Proxy (boats/latest) :", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ success:false, message:"Erreur API Proxy (boats/latest)" });
  }
});

app.delete('/gps/:id', async (req, res) => {
  try {
    const response = await axios.delete(`${BACKEND_URL}/gps/${req.params.id}`, {
      headers: {
        'Authorization': req.headers.authorization || ""
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Erreur Proxy (delete gps):", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || "Erreur API Proxy (delete gps)"
    });
  }
});

app.get('/', (req, res) => {
    res.send('Le proxy API fonctionne correctement.');
});

app.listen(33003, () => {
    console.log("Proxy API en cours d'exécution sur le port 33003");
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/collaborative-spreadsheet', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const sessionSchema = new mongoose.Schema({
  sessionKey: { type: String, required: true, unique: true },
  spreadsheetData: { type: [[String]], default: Array(50).fill().map(() => Array(50).fill('')) },
});

const Session = mongoose.model('Session', sessionSchema);

app.post('/create-session', async (req, res) => {
  try {
    const sessionKey = uuidv4();
    const session = new Session({ sessionKey });
    await session.save();
    res.json({ sessionKey });
  } catch (error) {
    res.status(500).json({ error: 'Error creating session' });
  }
});

app.post('/join-session', async (req, res) => {
  const { sessionKey } = req.body;
  try {
    const session = await Session.findOne({ sessionKey });
    if (session) {
      res.status(200).send('Session joined successfully');
    } else {
      res.status(404).send('Session not found');
    }
  } catch (error) {
    res.status(500).json({ error: 'Error joining session' });
  }
});

io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  socket.on('joinSession', async (sessionKey) => {
    try {
      const session = await Session.findOne({ sessionKey });
      if (session) {
        socket.join(sessionKey);
        console.log(`User ${socket.id} joined session ${sessionKey}`);
        // Send the current spreadsheet data to the new client
        socket.emit('spreadsheetUpdate', session.spreadsheetData);
        // Notify other clients in the session about the new participant
        socket.to(sessionKey).emit('newParticipant', `A new user has joined the session.`);
      } else {
        socket.emit('error', 'Session not found');
      }
    } catch (error) {
      socket.emit('error', 'Error joining session');
    }
  });

  socket.on('spreadsheetChange', async (sessionKey, newData) => {
    try {
      await Session.updateOne({ sessionKey }, { spreadsheetData: newData });
      // Broadcast the update to all clients in the session
      io.to(sessionKey).emit('spreadsheetUpdate', newData);
      console.log(`Broadcasted spreadsheetUpdate to session ${sessionKey}`);
    } catch (error) {
      console.error('Error updating spreadsheet:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected: ' + socket.id);
  });
});

server.listen(4000, () => {
  console.log('Server is running on port 4000');
});

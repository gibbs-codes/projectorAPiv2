const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');

const app = express();
const PORT = 8080;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data ? JSON.stringify(data) : ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data ? JSON.stringify(data) : '')
};

const fileStorage = {
  async ensureDataDir() {
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
      logger.info('Created data directory');
    }
  },

  async readFile(filename, defaultValue = null) {
    try {
      const filePath = path.join(DATA_DIR, filename);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return defaultValue;
      }
      throw error;
    }
  },

  async writeFile(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = `${filePath}.tmp`;
    
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  },

  async deleteFile(filename) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
};

const validation = {
  card: Joi.object({
    id: Joi.string().optional(),
    type: Joi.string().required(),
    config: Joi.object({
      apiUrl: Joi.string().uri().optional(),
      refreshInterval: Joi.number().min(1000).optional()
    }).unknown(true).required()
  }),

  profile: Joi.object({
    id: Joi.string().optional(),
    name: Joi.string().min(1).required(),
    zones: Joi.object({
      left: Joi.object({
        width: Joi.number().min(0).required(),
        height: Joi.number().min(0).required(),
        cards: Joi.array().items(Joi.string()).default([])
      }).required(),
      center: Joi.object({
        width: Joi.number().min(0).required(),
        height: Joi.number().min(0).required(),
        cards: Joi.array().items(Joi.string()).default([])
      }).required(),
      right: Joi.object({
        width: Joi.number().min(0).required(),
        height: Joi.number().min(0).required(),
        cards: Joi.array().items(Joi.string()).default([])
      }).required()
    }).required()
  }),

  activeProfile: Joi.object({
    profileId: Joi.string().required()
  })
};

function handleAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(error => {
      logger.error('Unhandled error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
}

app.get('/display/activeProfile', handleAsync(async (req, res) => {
  const active = await fileStorage.readFile('activeProfile.json', null);
  if (!active) {
    return res.status(404).json({ error: 'No active profile set' });
  }
  
  const profile = await fileStorage.readFile(`profile-${active.profileId}.json`, null);
  if (!profile) {
    return res.status(404).json({ error: 'Active profile not found' });
  }
  
  res.json({ ...active, profile });
}));

app.put('/display/activeProfile', handleAsync(async (req, res) => {
  const { error, value } = validation.activeProfile.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  const profile = await fileStorage.readFile(`profile-${value.profileId}.json`, null);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  const activeProfile = {
    profileId: value.profileId,
    updatedAt: new Date().toISOString()
  };
  
  await fileStorage.writeFile('activeProfile.json', activeProfile);
  logger.info('Active profile updated', { profileId: value.profileId });
  
  res.json({ ...activeProfile, profile });
}));

app.get('/display/profiles/:id', handleAsync(async (req, res) => {
  const profile = await fileStorage.readFile(`profile-${req.params.id}.json`, null);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(profile);
}));

app.put('/display/profiles/:id', handleAsync(async (req, res) => {
  const { error, value } = validation.profile.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  const profile = {
    ...value,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };
  
  await fileStorage.writeFile(`profile-${req.params.id}.json`, profile);
  logger.info('Profile saved', { id: req.params.id, name: profile.name });
  
  res.json(profile);
}));

app.delete('/display/profiles/:id', handleAsync(async (req, res) => {
  const profile = await fileStorage.readFile(`profile-${req.params.id}.json`, null);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  const active = await fileStorage.readFile('activeProfile.json', null);
  if (active && active.profileId === req.params.id) {
    return res.status(400).json({ error: 'Cannot delete active profile' });
  }
  
  await fileStorage.deleteFile(`profile-${req.params.id}.json`);
  logger.info('Profile deleted', { id: req.params.id });
  
  res.status(204).send();
}));

app.get('/display/cards/:id', handleAsync(async (req, res) => {
  const card = await fileStorage.readFile(`card-${req.params.id}.json`, null);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  res.json(card);
}));

app.put('/display/cards/:id', handleAsync(async (req, res) => {
  const { error, value } = validation.card.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  const card = {
    ...value,
    id: req.params.id,
    updatedAt: new Date().toISOString()
  };
  
  await fileStorage.writeFile(`card-${req.params.id}.json`, card);
  logger.info('Card saved', { id: req.params.id, type: card.type });
  
  res.json(card);
}));

app.delete('/display/cards/:id', handleAsync(async (req, res) => {
  const card = await fileStorage.readFile(`card-${req.params.id}.json`, null);
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }
  
  await fileStorage.deleteFile(`card-${req.params.id}.json`);
  logger.info('Card deleted', { id: req.params.id });
  
  res.status(204).send();
}));

app.get('/display/status', handleAsync(async (req, res) => {
  const files = await fs.readdir(DATA_DIR);
  const profiles = files.filter(f => f.startsWith('profile-')).length;
  const cards = files.filter(f => f.startsWith('card-')).length;
  const active = await fileStorage.readFile('activeProfile.json', null);
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cache: {
      profiles,
      cards,
      activeProfile: active ? active.profileId : null
    }
  });
}));

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  logger.error('Express error handler:', error);
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  try {
    await fileStorage.ensureDataDir();
    
    app.listen(PORT, () => {
      logger.info(`Projector API server running on port ${PORT}`);
      logger.info(`Data directory: ${DATA_DIR}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
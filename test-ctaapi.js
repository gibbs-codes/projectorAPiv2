const http = require('http');

const mockData = {
  '/api/data': [
    {
      route: "Red Line",
      destination: "Howard", 
      arrival_time: "2:15 PM",
      minutes_away: 5
    },
    {
      route: "Blue Line",
      destination: "O'Hare",
      arrival_time: "2:20 PM", 
      minutes_away: 8
    }
  ],
  '/api/events': [
    {
      title: "Team Meeting",
      start_time: "3:00 PM",
      description: "Weekly team sync",
      location: "Conference Room A"
    },
    {
      title: "Doctor Appointment",
      start_time: "4:30 PM",
      description: "Annual checkup"
    }
  ],
  '/api/habitica': {
    tasks: [
      {
        text: "Complete project documentation",
        type: "todo",
        priority: "high",
        completed: false,
        difficulty: 2
      },
      {
        text: "Review pull requests",
        type: "todo", 
        priority: "medium",
        completed: true,
        difficulty: 1
      }
    ]
  }
};

const server = http.createServer((req, res) => {
  console.log(`Mock CTAAAPI: ${req.method} ${req.url}`);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (mockData[req.url]) {
    res.writeHead(200);
    res.end(JSON.stringify(mockData[req.url]));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(3001, 'localhost', () => {
  console.log('Mock CTAAAPI server running on http://localhost:3001');
  console.log('Available endpoints:');
  Object.keys(mockData).forEach(endpoint => {
    console.log(`  http://localhost:3001${endpoint}`);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down mock CTAAAPI server...');
  server.close(() => {
    process.exit(0);
  });
});
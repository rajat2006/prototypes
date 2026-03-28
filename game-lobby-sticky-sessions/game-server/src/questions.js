const questions = [
  {
    id: 1,
    question: "What does HTTP stand for?",
    options: ["HyperText Transfer Protocol", "High Tech Transfer Program", "HyperText Transmission Process", "High Transfer Text Protocol"],
    correctIndex: 0,
    timeLimit: 15
  },
  {
    id: 2,
    question: "Which data structure uses FIFO (First In, First Out)?",
    options: ["Stack", "Queue", "Tree", "Graph"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 3,
    question: "What is the time complexity of binary search?",
    options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 4,
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Jupiter", "Mars", "Saturn"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 5,
    question: "What port does HTTPS use by default?",
    options: ["80", "8080", "443", "3000"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 6,
    question: "Which language is primarily used for iOS app development?",
    options: ["Kotlin", "Swift", "Dart", "Java"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 7,
    question: "What does DNS stand for?",
    options: ["Data Network System", "Domain Name System", "Digital Node Service", "Dynamic Network Schema"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 8,
    question: "Which sorting algorithm has the best average-case time complexity?",
    options: ["Bubble Sort", "Selection Sort", "Merge Sort", "Insertion Sort"],
    correctIndex: 2,
    timeLimit: 20
  },
  {
    id: 9,
    question: "What is the chemical symbol for Gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 10,
    question: "In which year was Node.js first released?",
    options: ["2005", "2009", "2012", "2015"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 11,
    question: "What does SQL stand for?",
    options: ["Structured Query Language", "Simple Question Language", "System Query Logic", "Standard Query Lib"],
    correctIndex: 0,
    timeLimit: 15
  },
  {
    id: 12,
    question: "Which protocol is used for sending emails?",
    options: ["FTP", "SMTP", "HTTP", "SSH"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 13,
    question: "How many bits are in a byte?",
    options: ["4", "8", "16", "32"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 14,
    question: "Which company developed the Go programming language?",
    options: ["Microsoft", "Apple", "Google", "Meta"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 15,
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    correctIndex: 3,
    timeLimit: 15
  },
  {
    id: 16,
    question: "Which CSS property is used to change text color?",
    options: ["font-color", "text-color", "color", "foreground"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 17,
    question: "What does the CAP theorem state you cannot have all three of?",
    options: ["Cache, API, Performance", "Consistency, Availability, Partition tolerance", "Concurrency, Atomicity, Persistence", "Compression, Access, Processing"],
    correctIndex: 1,
    timeLimit: 20
  },
  {
    id: 18,
    question: "Which command is used to create a new Git branch?",
    options: ["git new", "git branch", "git create", "git init"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 19,
    question: "What is the speed of light approximately?",
    options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"],
    correctIndex: 0,
    timeLimit: 20
  },
  {
    id: 20,
    question: "Which database is a document-oriented NoSQL database?",
    options: ["PostgreSQL", "MySQL", "MongoDB", "SQLite"],
    correctIndex: 2,
    timeLimit: 15
  },
  {
    id: 21,
    question: "What does REST stand for?",
    options: ["Remote Execution Service Technology", "Representational State Transfer", "Reliable Event Streaming Tool", "Request Entry System Transport"],
    correctIndex: 1,
    timeLimit: 15
  },
  {
    id: 22,
    question: "Which layer of the OSI model handles routing?",
    options: ["Data Link", "Transport", "Network", "Session"],
    correctIndex: 2,
    timeLimit: 20
  }
];

function getRandomQuestions(count) {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, questions.length));
}

module.exports = { questions, getRandomQuestions };

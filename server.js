const http = require("http");
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const PORT = 3000;
const HOSTNAME = "localhost";
const DATA_FILE = path.join(__dirname, "todos.json");
const LOG_FILE = path.join(__dirname, "logs.txt");

const logEmitter = new EventEmitter();

const writeLog = (message) => {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} - ${message}\n`;
  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) console.error("Logging failed:", err);
  });
};

logEmitter.on("log", writeLog);

const readTodos = (callback) => {
  fs.readFile(DATA_FILE, "utf8", (err, data) => {
    if (err) {
      return callback([]);
    }
    try {
      const todos = JSON.parse(data);
      callback(todos);
    } catch (e) {
      callback([]);
    }
  });
};

const writeTodos = (todos, callback) => {
  fs.writeFile(DATA_FILE, JSON.stringify(todos, null, 2), (err) => {
    if (err) {
      console.error("Failed to write todos:", err);
    }
    if (callback) callback();
  });
};

const sendResponse = (res, statusCode, data) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

const sendTextResponse = (res, statusCode, message) => {
  res.writeHead(statusCode, { "Content-Type": "text/plain" });
  res.end(message);
};

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const urlParts = url.split("/");

  if (method === "GET" && url.startsWith("/todos")) {
    logEmitter.emit("log", `${method} ${url}`);
    readTodos((todos) => {
      if (urlParts.length === 2) {
        const query = url.split("?")[1];
        const completed = query
          ? new URLSearchParams(query).get("completed")
          : null;

        const filtered = completed
          ? todos.filter((t) => t.completed === (completed === "true"))
          : todos;

        return sendResponse(res, 200, filtered);
      }

      if (urlParts.length === 3) {
        const id = parseInt(urlParts[2]);
        const todo = todos.find((t) => t.id === id);
        return todo
          ? sendResponse(res, 200, todo)
          : sendResponse(res, 404, { error: "Todo not found" });
      }
    });
  } else if (method === "POST" && url === "/todos") {
    logEmitter.emit("log", `${method} ${url}`);
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.title) {
          return sendResponse(res, 400, { error: "Title is required" });
        }

        readTodos((todos) => {
          const newTodo = {
            id: todos.length ? Math.max(...todos.map((t) => t.id)) + 1 : 1,
            title: data.title,
            completed: data.completed ?? false,
          };

          todos.push(newTodo);
          writeTodos(todos, () => sendResponse(res, 201, newTodo));
        });
      } catch (err) {
        sendResponse(res, 500, { error: "Invalid JSON" });
      }
    });
  } else if (
    method === "PUT" &&
    urlParts.length === 3 &&
    urlParts[1] === "todos"
  ) {
    logEmitter.emit("log", `${method} ${url}`);
    const id = parseInt(urlParts[2]);
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.title) {
          return sendResponse(res, 400, { error: "Title is required" });
        }

        readTodos((todos) => {
          const index = todos.findIndex((t) => t.id === id);
          if (index === -1) {
            return sendResponse(res, 404, { error: "Todo not found" });
          }

          todos[index] = {
            id,
            title: data.title,
            completed: data.completed ?? false,
          };

          writeTodos(todos, () => sendResponse(res, 200, todos[index]));
        });
      } catch (err) {
        sendResponse(res, 500, { error: "Invalid JSON" });
      }
    });
  } else if (
    method === "DELETE" &&
    urlParts.length === 3 &&
    urlParts[1] === "todos"
  ) {
    logEmitter.emit("log", `${method} ${url}`);
    const id = parseInt(urlParts[2]);
    readTodos((todos) => {
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) {
        return sendResponse(res, 404, { error: "Todo not found" });
      }

      const deleted = todos.splice(index, 1);
      writeTodos(todos, () => sendResponse(res, 200, deleted[0]));
    });
  } else {
    sendTextResponse(res, 404, "Page not found");
  }
});

server.listen(PORT, HOSTNAME, () => {
  console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});

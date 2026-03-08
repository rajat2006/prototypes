const { createClient } = require("redis");

let redisClient;

async function connectRedis() {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (err) => console.error("Redis error:", err));
  await redisClient.connect();
  console.log("Redis connected");
}

async function get(key) {
  const raw = await redisClient.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function set(key, value, ttlSeconds) {
  const ttl = ttlSeconds || parseInt(process.env.CACHE_TTL, 10) || 60;
  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
}

async function del(key) {
  await redisClient.del(key);
  console.log(`Cache invalidated: ${key}`);
}

module.exports = { connectRedis, get, set, del };

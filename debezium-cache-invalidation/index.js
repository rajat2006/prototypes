const express = require("express");
const { connectRedis } = require("./src/cache");
const { startConsumer } = require("./src/consumer");
const routes = require("./src/routes");

async function main() {
  // 1. Connect Redis
  await connectRedis();

  // 2. Start Kafka consumer (replaces startListener)
  await startConsumer();

  // 3. Start Express
  const app = express();
  app.use(express.json());
  app.use("/products", routes);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

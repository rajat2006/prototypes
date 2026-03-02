const express = require("express");
const { connectRedis } = require("./src/cache");
const { startListener } = require("./src/listener");
const routes = require("./src/routes");

async function main() {
  // connect redis
  await connectRedis();

  // start db listener
  await startListener();

  // now start accepting HTTP traffic
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

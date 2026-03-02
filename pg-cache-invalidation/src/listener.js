const { createListenerClient } = require("./db");
const cache = require("./cache");

async function startListener() {
  const client = await createListenerClient();

  await client.query("LISTEN cache_invalidation");
  console.log("Listening on channel: cache_invalidation");

  client.on("notification", async (msg) => {
    try {
      const payload = JSON.parse(msg.payload);
      const { op, id } = payload;

      console.log(`NOTIFY received: op=${op}, id=${id}`);

      await cache.del("products:all");

      if (op === "UPDATE" || op === "DELETE") {
        await cache.del(`products:${id}`);
      }
    } catch (err) {
      console.error("Error handling notification", err);
    }
  });

  client.on("error", (err) => {
    console.error("Listener client error:", err);
  });
}

module.exports = { startListener };

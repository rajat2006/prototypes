const { Kafka } = require("kafkajs");
const cache = require("./cache");

async function startConsumer() {
  const kafka = new Kafka({
    clientId: "cache-invalidator",
    brokers: [process.env.KAFKA_BROKER],
  });

  const consumer = kafka.consumer({ groupId: "cache-invalidation-group" });

  await consumer.connect();
  console.log("Kafka consumer connected");

  // Debezium names topics as: {topic.prefix}.{schema}.{table}
  await consumer.subscribe({
    topic: "dbserver1.public.products",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());

        const { op, before, after } = event.payload;

        // read - no op

        if (op != "r") {
          await cache.del("products:all");
        }

        // create - delete product:all key

        // update - delete product:all key and the id from payload.after

        if (op === "u") {
          await cache.del(`products:${after.id}`);
        }

        // delete - delete product:all key and the id from payload.before
        if (op === "d") {
          await cache.del(`products:${before.id}`);
        }
      } catch (err) {
        console.error("Error processing CDC event:", err);
      }
    },
  });
}

module.exports = { startConsumer };

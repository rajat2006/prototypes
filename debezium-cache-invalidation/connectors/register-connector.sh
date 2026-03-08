#!/bin/bash

# Wait for Kafka Connect to be ready
echo "Waiting for Kafka Connect..."
until curl -s http://localhost:8083/connectors > /dev/null 2>&1; do
  sleep 2
done
echo "Kafka Connect is ready!"

# Register the Debezium Postgres connector
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products-connector",
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "database.hostname": "postgres",
      "database.port": "5432",
      "database.user": "postgres",
      "database.password": "postgres",
      "database.dbname": "cache_demo",
      "topic.prefix": "dbserver1",
      "table.include.list": "public.products",
      "slot.name": "debezium_slot",
      "plugin.name": "pgoutput"
    }
  }'

echo ""
echo "Connector registered! Check status:"
echo "  curl http://localhost:8083/connectors/products-connector/status"

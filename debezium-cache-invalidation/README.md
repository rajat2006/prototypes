# debezium-cache-invalidation

A prototype demonstrating automatic cache invalidation using Debezium CDC (Change Data Capture) + Kafka + Redis.

## How it works

When a row in the `products` table is inserted, updated, or deleted, Debezium captures the change directly from PostgreSQL's Write-Ahead Log (WAL) — no triggers needed. The change event is published to a Kafka topic, and the Node.js app's Kafka consumer reacts by evicting stale Redis cache keys.

```
Write request
    │
    ▼
Postgres (UPDATE products)
    │
    ▼
WAL (Write-Ahead Log) captures the change
    │
    ▼
Debezium reads WAL via logical replication
    │
    ▼
Kafka topic: dbserver1.public.products
    │
    ▼
Node.js Kafka consumer receives CDC event
    │
    ▼
Redis cache keys evicted (products:all, products:<id>)
    │
    ▼
Next GET request repopulates the cache from Postgres
```

## Stack

- **PostgreSQL** — database (WAL as change source)
- **Apache Kafka** — message broker for CDC events
- **Zookeeper** — Kafka broker coordination
- **Kafka Connect + Debezium** — CDC connector that reads Postgres WAL
- **Redis** — cache layer
- **Node.js + Express** — HTTP API
- **Docker Compose** — runs all six services

## Project structure

```
debezium-cache-invalidation/
├── docker-compose.yml       # runs postgres, redis, zookeeper, kafka, kafka-connect, app
├── Dockerfile               # builds the Node.js app container
├── package.json
├── index.js                 # entry point — wires everything together
├── connectors/
│   └── register-connector.sh  # registers Debezium connector with Kafka Connect
├── sql/
│   └── init.sql             # schema + seed data (no triggers)
└── src/
    ├── db.js                # pg Pool (queries only, no LISTEN)
    ├── cache.js             # Redis get/set/del wrapper
    ├── consumer.js          # Kafka consumer — evicts cache on CDC events
    └── routes.js            # Express routes — cache-aside reads, write to DB
```

## Prerequisites

- Docker Desktop — https://www.docker.com/products/docker-desktop/

## Running

```bash
# 1. Start all services
docker compose up --build

# 2. Wait for all services to be healthy (~30-60 seconds for Kafka Connect)

# 3. In a separate terminal, register the Debezium connector
./connectors/register-connector.sh

# 4. Verify connector is running
curl -s http://localhost:8083/connectors/products-connector/status | jq
```

Expected startup output:
```
Redis connected
Kafka consumer connected
Server running on port 3000
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | List all products |
| GET | `/products/:id` | Get one product |
| POST | `/products` | Create a product |
| PUT | `/products/:id` | Update a product |
| DELETE | `/products/:id` | Delete a product |

Read responses include an `X-Cache: HIT` or `X-Cache: MISS` header showing whether the data came from Redis or Postgres.

## Testing the invalidation flow

```bash
# 1. Cold cache — MISS
curl -i http://localhost:3000/products

# 2. Warm cache — HIT
curl -i http://localhost:3000/products

# 3. Update a product — triggers CDC invalidation
curl -i -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget A v2", "price": 12.99}'

# 4. Cache was invalidated — MISS again with fresh data
curl -i http://localhost:3000/products/1

# 5. Inspect raw Debezium events in Kafka
docker compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic dbserver1.public.products \
  --from-beginning

# 6. Inspect Redis keys directly
docker compose exec redis redis-cli keys '*'

# 7. Check replication slot in Postgres
docker compose exec postgres psql -U postgres -d cache_demo \
  -c "SELECT slot_name, plugin, active FROM pg_replication_slots;"
```

## Comparison with pg-cache-invalidation

| Aspect | NOTIFY/TRIGGER | Debezium + Kafka |
|--------|---------------|-----------------|
| Change detection | SQL trigger + `pg_notify()` | WAL logical replication (no triggers) |
| Message transport | Postgres notification channel | Kafka topic |
| Durability | Lost if listener disconnects | Persisted in Kafka, replayable |
| Scalability | Single listener per connection | Multiple consumer group members |
| Latency | Near-instant (~ms) | Slightly higher (~100ms-1s) |
| Infrastructure | Just Postgres | Kafka + Zookeeper + Kafka Connect |

## Resetting

```bash
docker compose down -v   # stops containers and removes all volumes
docker compose up --build
```

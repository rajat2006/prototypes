# pg-cache-invalidation

A prototype demonstrating automatic cache invalidation using PostgreSQL `NOTIFY`/`TRIGGER` + Redis.

## How it works

When a row in the `products` table is inserted, updated, or deleted, a PostgreSQL trigger automatically fires `pg_notify()`. The Node.js app maintains a persistent `LISTEN` connection to Postgres and reacts to these notifications by evicting the stale Redis cache keys — without the write routes needing to know about the cache at all.

```
Write request
    │
    ▼
Postgres (UPDATE products)
    │
    ▼
Trigger fires → pg_notify('cache_invalidation', { op, id })
    │
    ▼
Node.js LISTEN connection receives notification
    │
    ▼
Redis cache keys evicted (products:all, products:<id>)
    │
    ▼
Next GET request repopulates the cache from Postgres
```

## Stack

- **PostgreSQL** — database + NOTIFY/TRIGGER mechanism
- **Redis** — cache layer
- **Node.js + Express** — HTTP API
- **Docker Compose** — runs all three services

## Project structure

```
pg-cache-invalidation/
├── docker-compose.yml   # runs postgres, redis, and the app
├── Dockerfile           # builds the Node.js app container
├── package.json
├── index.js             # entry point — wires everything together
├── sql/
│   └── init.sql         # schema, trigger function, seed data
└── src/
    ├── db.js            # pg Pool (queries) + pg Client (LISTEN)
    ├── cache.js         # Redis get/set/del wrapper
    ├── listener.js      # LISTEN loop — evicts cache on NOTIFY
    └── routes.js        # Express routes — cache-aside reads, write to DB
```

## Prerequisites

- Docker Desktop — https://www.docker.com/products/docker-desktop/

## Running

```bash
docker compose up --build
```

Expected startup output:
```
Redis connected
Listening on channel: cache_invalidation
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

# 3. Update a product — triggers cache invalidation
curl -i -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget A v2", "price": 12.99}'

# 4. Cache was invalidated — MISS again with fresh data
curl -i http://localhost:3000/products/1

# 5. Inspect Redis keys directly
docker compose exec redis redis-cli keys '*'
```

## Resetting

```bash
docker compose down -v   # stops containers and removes the Postgres data volume
docker compose up --build
```

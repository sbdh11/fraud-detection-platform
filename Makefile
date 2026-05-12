COMPOSE ?= docker compose

.PHONY: up down logs build rebuild ps restart backend-logs frontend-logs train health clean

up:           ## build (if needed) and start the whole stack
	$(COMPOSE) up -d --build

build:        ## build images without starting
	$(COMPOSE) build

rebuild:      ## force a clean rebuild
	$(COMPOSE) build --no-cache

down:         ## stop and remove containers
	$(COMPOSE) down

clean:        ## stop and remove containers + volumes (wipes db, mlflow, models)
	$(COMPOSE) down -v

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=120

backend-logs:
	$(COMPOSE) logs -f --tail=200 backend

frontend-logs:
	$(COMPOSE) logs -f --tail=120 frontend

restart:
	$(COMPOSE) restart backend frontend

health:       ## hit the backend health endpoint
	curl -s http://localhost:$${BACKEND_PORT:-8008}/api/health | python -m json.tool

train:        ## trigger a model retrain
	curl -s -X POST http://localhost:$${BACKEND_PORT:-8008}/api/models/train -H 'content-type: application/json' -d '{}' | python -m json.tool

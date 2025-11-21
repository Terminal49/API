# Terminal49 MCP Server - Makefile

.PHONY: help install test lint console stdio serve clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	bundle install

test: ## Run tests
	bundle exec rspec

lint: ## Run linter
	bundle exec rubocop

console: ## Start development console
	bundle exec rake dev:console

stdio: ## Start MCP server in stdio mode
	bundle exec ruby bin/terminal49-mcp

serve: ## Start MCP server in HTTP mode
	bundle exec puma -C config/puma.rb

clean: ## Clean temporary files
	rm -rf tmp/*
	rm -rf log/*
	rm -f spec/examples.txt

.DEFAULT_GOAL := help

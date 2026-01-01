# agent-gate

## 起動手順

前提: Node.js >= 20 と pnpm が必要です。

### 開発モードで起動

```bash
pnpm install
pnpm dev -- --pretty
```

### ビルドして実行

```bash
pnpm install
pnpm build
node dist/index.js analyze --pretty
node dist/index.js prepare --pretty
node dist/index.js validate --pretty
```

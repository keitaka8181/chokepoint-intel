# chokepoint-intel

海上の戦略的チョークポイント（現状はホルムズ海峡）を監視するダッシュボード。
Vite + React 製。船舶のAIS（自動船舶識別装置）位置情報をリアルタイム表示しつつ、
過去の通航量の推移や関連インシデント（攻撃・拿捕・AIS途絶など）を並べて見せる。

## 主な機能（`src/HormuzCrisisMonitor.jsx`）

- [AISStream.io](https://aisstream.io/) のWebSocketに接続し、ホルムズ海峡周辺のタンカー/貨物船の位置をライブ表示（`src/HormuzMap.jsx`、Mapbox GL使用）
- 過去90日分の通航量ベースライン vs 実績のライングラフ（Recharts）
- インシデントのタイムライン（攻撃・拿捕・MARAD勧告・AIS途絶・速度異常など）
- 監視対象海峡の切り替えUI（Hormuz / Malacca / Suez / Bab-el-Mandeb / Taiwan / Bosphorus。現状データがあるのはHormuzのみ）

`VITE_AISSTREAM_API_KEY` が未設定の場合は、モックデータにフォールバックして動作する。

## セットアップ

```bash
cp .env.example .env
# .env に Mapbox のパブリックトークンと（任意で）AISStream.io のAPIキーを設定
npm install
npm run dev
```

## 環境変数（`.env.example` より）

- `VITE_MAPBOX_TOKEN` — Mapbox のパブリックアクセストークン（URL制限を付けて発行すること）
- `VITE_AISSTREAM_API_KEY` — AISStream.io のAPIキー。未設定ならモック船舶データで動作

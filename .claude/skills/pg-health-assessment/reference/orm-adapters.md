# ORM adapters

The parsers read source text only. They never `import()` or execute project code. If a construct cannot be parsed, the table gets `confidence: medium|low` and a warning. If nothing can be parsed, fall back to live-only introspection and say so in the report.

| ORM | Tables | JSON columns | Indexes / FKs | Connection config |
|---|---|---|---|---|
| Drizzle | `pgTable('name', { ... }, (table) => [...])` | `jsonb('c')`, `json('c')` | `index().on(table.x)`, `uniqueIndex()`, `.references(() => t.id)`, `foreignKey({columns, foreignColumns})`, `primaryKey({columns})` | `drizzle.config.*` `dbCredentials` (url, or host/user/... from `process.env`) |
| Prisma | `model X { }` with `@@map` | `Json` fields | `@@index([a,b])`, `@@unique`, `@relation(fields, references)` | `datasource db { url = env("DATABASE_URL") }` |
| TypeORM | `@Entity('name') class` | `@Column('jsonb')` / `{ type: 'jsonb' }` | `@Index`, `@ManyToOne` (not extracted: low confidence) | `new DataSource({ url })` |
| Sequelize | `sequelize.define('t', {...})`, `Model.init({...}, {tableName})` | `DataTypes.JSON`, `DataTypes.JSONB` | `references: { model }` | `.sequelizerc`, config JSON |
| Knex | migrations (`createTable`) | not parsed statically | not parsed | `knexfile.*` |

## Pitfalls

- Drizzle columns without a name argument (`text()`) use the property key as the column name; with a name argument (`text('first_name')`) the argument wins.
- Drizzle `timestamp()` is `timestamp without time zone` unless `{ withTimezone: true }`.
- Prisma `DateTime` maps to `timestamp(3)` (without time zone); `@db.Timestamptz` changes that.
- Prisma relation scalar fields are columns; the relation field itself is not.
- Config files that compute the connection string (for example `dotenv` + `process.env.DB_*`) are detected as `env-parts`; the collector reads those variables from the environment or `.env` files, never from the config module.
- Knex, raw SQL migrations and unknown ORMs: live introspection only; drift checks are marked unverified.

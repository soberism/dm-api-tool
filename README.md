# dm-api-tool

Tiny npm CLI for generating focused TypeScript API files from Swagger/OpenAPI.

## MVP scope

- Generate one API and its related data types.
- Generate all APIs and their related data types.
- Keep commands short.

## Usage

```bash
npm i -g dm-api-tool
```

Initialize config in a frontend project:

```bash
dm init https://example.com/swagger-ui/index.html
```

Or write the built-in default config to the current directory:

```bash
dm set
```

Generate one API:

```bash
dm g POST /user/login
```

If a path only has one method, the method can be omitted:

```bash
dm g /health
```

Generate all APIs:

```bash
dm all
```

Generated API functions receive a request method as the first argument, so they can use your project's own HTTP layer instead of `fetch`:

```ts
import { update2 } from "./dm-api/update2";

const result = await update2(request.post, {
  id: 1,
  roleName: "Admin"
});
```

The request method only needs to match this shape:

```ts
type ApiRequestMethod<TResult = unknown> = (
  url: string,
  data?: Record<string, unknown> | string | unknown,
) => Promise<TResult>;
```

## Config

`dm init` creates `dm.config.json`:

```json
{
  "input": "https://example.com/swagger-ui/index.html",
  "output": "dm-api",
  "headers": {}
}
```

`input` can be an OpenAPI JSON URL, a Swagger UI URL, or a local JSON file. Generated files are written to `dm-api` by default, relative to the directory where the command is executed. If `dm.config.json` is missing, the CLI uses its built-in default config.

## Notes

This MVP focuses on JSON OpenAPI/Swagger specs. YAML support, custom request clients, auth helpers, and prettier formatting can be added after the core workflow is stable.

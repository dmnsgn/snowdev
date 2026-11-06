import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";

import { commands, DEFAULTS_OPTIONS, run } from "../index.js";
import { analyse } from "../build.js";

const execFile = promisify(execFileCb);

const FIXTURES = join(import.meta.dirname, "fixtures");
const BUNDLERS = ["rolldown", "rollup"];

const EXPECTED = {
  shapeMismatch: "module",
  // require() gets "main", shape-mismatch "module" entry has no parse export
  cjsConsumer: { from: "main", parsed: "parsed", joined: "a/b" },
  // Dual package hazard: module and main are both bundled
  instances: 2,
  exportsMap: "import",
  exportsMapFeature: true,
  cjsNamed: [1, 2, 1],
  cjsFunction: ["called", "extra"],
  cjsEsModule: ["default", "named"],
  jsnext: "jsnext",
  // import inside a dependency follows mainFields
  esmConsumer: "jsnext",
  browserString: "browser",
  browserObject: "browser",
  directoryMain: "lib",
  esmOnly: ["default", "named"],
  pattern: ["index", "pub", "deep", "exact key", "root pattern"],
  array: "first",
  assets: [true, true, "dark"],
  dts: "dts",
  conditions: ["production", "production"],
  conditionInstances: ["production"],
  browserModule: ["module", "module"],
  browserModuleInstances: ["module"],
  noMain: "module",
  // The installed package, not the polyfill of the Node.js builtin it is named after
  events: "npm package",
  shebang: ["shebang", "function"],
  shebangCjs: "shebang",
  cjsGlobal: ["function", true],
  brokenExports: "good",
  // A broken module is emptied: its importers build and get undefined
  brokenTransitive: ["transitive", "undefined"],
  // Only the failing file is emptied, not the CommonJS module requiring it
  brokenCjs: ["importer", "undefined"],
  dual: ["import", "require"],
  // Emptied: rolldown can't bundle CSS and neither bundler invalid JSON
  brokenAssets: ["importer", 0],
  patternMulti: "a",
  requireBrowser: "browser",
  requireBrowserMap: "main browser",
  // A missing "main" keeps what the bundler resolved
  requireMissingMain: "module",
  cjsDirname: ["string", "string"],
  absent: [],
};

const createProject = async (root, fixtures = join(FIXTURES, "packages")) => {
  const packages = join(root, "packages");
  const cwd = join(root, "project");

  await cp(fixtures, packages, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const names = await readdir(packages);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "project",
      version: "1.0.0",
      type: "module",
      dependencies: Object.fromEntries(
        names.map((name) => [name, `file:../packages/${name}`]),
      ),
    }),
  );
  // Copies instead of symlinks: linked packages are handled differently by install
  await execFile("npm", ["install", "--install-links", "--offline"], { cwd });

  return cwd;
};

const createWorkspace = async (root) => {
  const packages = join(root, "packages");
  const cwd = join(root, "project");

  await cp(join(FIXTURES, "packages"), packages, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const names = await readdir(packages);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "workspace",
      private: true,
      workspaces: ["packages/*", "project"],
    }),
  );
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: "project",
      version: "1.0.0",
      type: "module",
      dependencies: Object.fromEntries(names.map((name) => [name, "*"])),
    }),
  );
  await execFile("npm", ["install", "--offline"], { cwd: root });

  return cwd;
};

const install = (cwd, bundler, dir, options) =>
  run(commands.install, {
    bundler,
    cwd,
    dependencies: "prod",
    cache: false,
    cacheFolder: join(cwd, ".cache"),
    minify: false,
    NODE_ENV: "production",
    rollup: { output: { dir } },
    ...options,
  });

const loadExports = async (dir) => {
  const { stdout } = await execFile(
    process.execPath,
    [
      "--import",
      join(FIXTURES, "import-map-hooks.js"),
      join(FIXTURES, "load-exports.js"),
    ],
    { env: { ...process.env, IMPORT_MAP_PATH: join(dir, "import-map.json") } },
  );
  return JSON.parse(stdout);
};

const readImports = async (dir) =>
  JSON.parse(await readFile(join(dir, "import-map.json"), "utf8")).imports;

const assertNoPathLeak = async (dir, root) => {
  const path = await realpath(root);
  for (const file of await readdir(dir, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    assert.ok(
      !(await readFile(join(dir, file), "utf8")).includes(path),
      `"${file}" contains "${path}"`,
    );
  }
};

describe("commands", () => {
  for (const name of Object.keys(commands)) {
    it(`loads ${name}`, () => import(`../${name}.js`));
  }
});

describe("install", () => {
  let root;
  let cwd;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "snowdev-test-"));
    cwd = await createProject(root);
  });

  after(() => rm(root, { recursive: true, force: true }));

  for (const bundler of BUNDLERS) {
    it(`exposes every export shape through the import map with ${bundler}`, async () => {
      const dir = join(cwd, `web_modules_${bundler}`);
      const { error } = await install(cwd, bundler, dir);

      assert.ifError(error);
      assert.deepEqual(await loadExports(dir), EXPECTED);
      assert.doesNotMatch(
        await readFile(join(dir, "shebang-cjs.js"), "utf8"),
        /^#!/,
      );
      await assertNoPathLeak(dir, root);
    });
  }

  for (const bundler of BUNDLERS) {
    it(`resolves hoisted and symlinked workspace packages with ${bundler}`, async () => {
      const workspaceCwd = await createWorkspace(
        join(root, `workspace-${bundler}`),
      );
      const dir = join(workspaceCwd, "web_modules");
      const { error } = await install(workspaceCwd, bundler, dir);

      assert.ifError(error);
      assert.deepEqual(await loadExports(dir), EXPECTED);
    });
  }

  for (const bundler of BUNDLERS) {
    it(`applies NODE_ENV to every export condition with ${bundler}`, async () => {
      const dir = join(cwd, `web_modules_development_${bundler}`);
      const { error } = await install(cwd, bundler, dir, {
        NODE_ENV: "development",
      });

      assert.ifError(error);
      assert.deepEqual((await loadExports(dir)).conditions, [
        "development",
        "development",
      ]);
    });
  }

  for (const bundler of BUNDLERS) {
    it(`replaces the default order of resolve.mainFields with ${bundler}`, async () => {
      const dir = join(cwd, `web_modules_main_fields_${bundler}`);
      const { error } = await install(cwd, bundler, dir, {
        resolve: { mainFields: ["browser", "module", "main"] },
      });

      assert.ifError(error);
      assert.equal((await loadExports(dir)).browserModule[0], "browser");
    });
  }

  for (const bundler of BUNDLERS) {
    const project = async (name) => {
      const projectRoot = await mkdtemp(join(root, `${name}-${bundler}-`));
      const projectCwd = await createProject(
        projectRoot,
        join(FIXTURES, "edge", name),
      );
      return [projectCwd, join(projectCwd, "web_modules")];
    };

    it(`keeps the bundling error when every entry fails with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("all-broken");
      const { error } = await install(projectCwd, bundler, dir);

      assert.match(error.message, /index\.js|Unexpected|Expected/);
      assert.doesNotMatch(error.message, /input/i);
    });

    it(`isolates more failing modules than retries with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("many-broken");
      const { error, failedModules } = await install(projectCwd, bundler, dir);

      assert.ifError(error);
      assert.equal(failedModules.length, 5);
      assert.deepEqual(Object.keys(await readImports(dir)), ["many/good"]);
    });

    it(`stops bundling failing entries with noOp ids with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("ignored-broken");
      const { error } = await install(projectCwd, bundler, dir);

      assert.ifError(error);
      assert.equal("ignored/bad" in (await readImports(dir)), false);
      assert.doesNotMatch(
        await readFile(join(dir, "ignored", "good.js"), "utf8"),
        /["']inspector["']/,
      );
    });

    // https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module
    it(`ignores files of browser maps with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("ignored-broken");
      const { error } = await install(projectCwd, bundler, dir);

      assert.ifError(error);
      for (const file of ["good.js", "ignored.js"]) {
        assert.doesNotMatch(
          await readFile(join(dir, "ignored", file), "utf8"),
          /"(ignored|extensionless)"/,
        );
      }
    });

    it(`honours transpileExclude for polyfills with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("transpile-exclude");
      const { error } = await install(projectCwd, bundler, dir, {
        transpileExclude: /node_modules\/excluded/,
      });

      assert.ifError(error);
      const files = await readdir(dir, { recursive: true });
      assert.deepEqual(
        files.filter((file) => file.includes("polyfills")),
        [],
      );
    });

    it(`installs external entries with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("entries");
      const { error } = await install(projectCwd, bundler, dir, {
        rollup: { output: { dir }, input: { external: ["import-only"] } },
      });

      assert.ifError(error);
      assert.match(
        await readFile(join(dir, "import-only.js"), "utf8"),
        /"index"/,
      );
    });

    it(`resolves import conditions of entries with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("entries");
      const { error } = await install(projectCwd, bundler, dir);

      assert.ifError(error);
      assert.deepEqual(Object.keys(await readImports(dir)).sort(), [
        "import-only",
        "import-only/sub",
      ]);
    });

    it(`writes a relative output dir in cwd with ${bundler}`, async () => {
      const [projectCwd] = await project("entries");
      const { error } = await install(projectCwd, bundler, "web_modules");

      assert.ifError(error);
      assert.ok(
        (
          await readFile(
            join(projectCwd, "web_modules", "import-only.js"),
            "utf8",
          )
        ).length,
      );
    });

    it(`honours resolve.browserField with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("platform");
      const { error } = await install(projectCwd, bundler, dir, {
        resolve: { browserField: false },
      });

      assert.ifError(error);
      assert.match(await readFile(join(dir, "platform.js"), "utf8"), /"node"/);
    });

    it(`anchors entries with custom plugins with ${bundler}`, async () => {
      const [projectCwd, dir] = await project("platform");
      const { error } = await install(projectCwd, bundler, dir, {
        rollup: { output: { dir }, input: { plugins: [] } },
      });

      assert.ifError(error);
      assert.ok((await readImports(dir)).platform);
    });
  }

  for (const bundler of BUNDLERS) {
    it(`removes hardcoded entries failing to bundle with ${bundler}`, async () => {
      const projectCwd = await createProject(
        join(root, `hardcoded-${bundler}`),
        join(FIXTURES, "edge", "hardcoded"),
      );
      const dir = join(projectCwd, "web_modules");
      const { error } = await install(projectCwd, bundler, dir, {
        dependencies: ["hard", "hard/bad.js", "hard/extra.js"],
      });

      assert.ifError(error);
      assert.deepEqual(Object.keys(await readImports(dir)).sort(), [
        "hard",
        "hard/extra.js",
      ]);
    });

    it(`rejects package targets outside of their package with ${bundler}`, async () => {
      const projectRoot = join(root, `traversal-${bundler}`);
      const projectCwd = await createProject(
        projectRoot,
        join(FIXTURES, "edge", "traversal"),
      );
      for (const file of ["secret.js", "secret.cjs"]) {
        await writeFile(join(projectRoot, file), "globalThis.leak = 'SECRET';");
      }
      await writeFile(join(projectRoot, "secret.css"), "/* SECRET */");
      // npm strips symlinks from packages: linked ones have to be created here
      await symlink(
        join(projectRoot, "secret.js"),
        join(projectCwd, "node_modules", "evil-exports", "link.js"),
      );

      const dir = join(projectCwd, "web_modules");
      const { error } = await install(projectCwd, bundler, dir);

      assert.ifError(error);
      assert.deepEqual(Object.keys(await readImports(dir)).sort(), [
        "evil-exports",
        "evil-require",
        "evil-require-consumer",
      ]);
      const files = await readdir(dir, {
        recursive: true,
        withFileTypes: true,
      });
      for (const file of files.filter((dirent) => dirent.isFile())) {
        const content = await readFile(
          join(file.parentPath, file.name),
          "utf8",
        );
        assert.doesNotMatch(content, /SECRET/, file.name);
      }
    });
  }

  it("keeps plugin order when bundling again", async () => {
    const projectCwd = await createProject(
      join(root, "enforce"),
      join(FIXTURES, "edge", "many-broken"),
    );
    const dir = join(projectCwd, "web_modules");
    const positions = [];
    const { error } = await install(projectCwd, "rollup", dir, {
      rollup: {
        output: { dir },
        extraPlugins: [
          {
            name: "probe",
            enforce: "pre",
            buildStart({ plugins }) {
              positions.push(plugins.findIndex(({ name }) => name === "probe"));
            },
          },
        ],
      },
    });

    assert.ifError(error);
    assert.equal(new Set(positions).size, 1);
  });

  // npm masks UUIDs in the paths it outputs
  for (const [name, create] of Object.entries({
    project: createProject,
    workspace: createWorkspace,
  })) {
    it(`supports ${name} paths containing a UUID`, async () => {
      const uuidCwd = await create(join(root, randomUUID()));
      const dir = join(uuidCwd, "web_modules");
      const { error } = await install(uuidCwd, "rolldown", dir);

      assert.ifError(error);
      assert.deepEqual(await loadExports(dir), EXPECTED);
    });
  }

  it("resolves aliased packages in paths containing a UUID", async () => {
    const aliasRoot = join(root, randomUUID());
    const aliasCwd = join(aliasRoot, "project");
    await cp(
      join(FIXTURES, "packages", "esm-only"),
      join(aliasRoot, "esm-only"),
      {
        recursive: true,
      },
    );
    await mkdir(aliasCwd);
    await writeFile(
      join(aliasCwd, "package.json"),
      JSON.stringify({
        name: "project",
        version: "1.0.0",
        type: "module",
        dependencies: { alias: "file:../esm-only" },
      }),
    );
    await execFile("npm", ["install", "--install-links", "--offline"], {
      cwd: aliasCwd,
    });

    const dir = join(aliasCwd, "web_modules");
    const { error } = await install(aliasCwd, "rolldown", dir);

    assert.ifError(error);
    assert.ok(Object.keys(await readImports(dir)).length);
  });
});

describe("options", () => {
  const probe = async (options) => options;
  let cwd;

  before(async () => {
    cwd = await mkdtemp(join(tmpdir(), "snowdev-test-"));
    await writeFile(join(cwd, "package.json"), "{}");
  });

  after(() => rm(cwd, { recursive: true, force: true }));

  it("replaces default arrays", async () => {
    const { ignore, resolve } = await run(probe, {
      cwd,
      probe: { resolve: { conditions: ["custom"] } },
      ignore: ["custom"],
      resolve: { exclude: ["custom"], mainFields: ["main"] },
    });

    assert.deepEqual(ignore, ["custom", "**/web_modules/**"]);
    assert.deepEqual(resolve.conditions, ["custom"]);
    assert.deepEqual(resolve.exclude, ["custom"]);
    assert.deepEqual(resolve.mainFields, ["main"]);
    assert.deepEqual(resolve.copy, DEFAULTS_OPTIONS.resolve.copy);
  });

  it("keeps defaults intact between runs", async () => {
    const ignore = [...DEFAULTS_OPTIONS.ignore];
    await run(probe, { cwd });

    assert.deepEqual(DEFAULTS_OPTIONS.ignore, ignore);
  });
});

describe("analyse", () => {
  let cwd;

  before(async () => {
    // Bundlers report real paths: the temporary folder can be a symlink
    cwd = await realpath(await mkdtemp(join(tmpdir(), "snowdev-test-")));
    await mkdir(join(cwd, "src"));
    await mkdir(join(cwd, "lib"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "project", exports: { "./*": "./src/*" } }),
    );
    for (const file of [
      "a.css",
      "a.d.ts",
      "a.js.map",
      "data.json",
      "README.md",
    ]) {
      await writeFile(join(cwd, "src", file), "");
    }
    await writeFile(join(cwd, "src", "a.js"), "export const a = 1;");
    for (const file of ["unused.js", "tool.config.js"]) {
      await writeFile(join(cwd, "lib", file), "export const b = 1;");
    }
  });

  after(() => rm(cwd, { recursive: true, force: true }));

  it("analyses code exports, whatever install bundles", async () => {
    const results = await analyse(
      cwd,
      [
        join(cwd, "src", "a.js"),
        join(cwd, "lib", "unused.js"),
        join(cwd, "lib", "tool.config.js"),
      ],
      {
        ...DEFAULTS_OPTIONS,
        resolve: {
          ...DEFAULTS_OPTIONS.resolve,
          exclude: ["**/a.js"],
        },
      },
      { sizes: false },
    );

    assert.match(results, /lib\/unused\.js/);
    assert.doesNotMatch(results, /src\/a\.js|tool\.config/);
  });
});

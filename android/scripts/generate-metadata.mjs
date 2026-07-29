#!/usr/bin/env node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage: node android/scripts/generate-metadata.mjs " +
      "--generator <android-metadata-generator.jar> " +
      "--android-jar <android.jar> [--jar <dependency.jar>]... " +
      "[--out <directory>]",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const values = new Map();
  const jars = [];
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name?.startsWith("--") || value === undefined) usage();
    const key = name.slice(2);
    if (key === "jar") jars.push(resolve(value));
    else values.set(key, value);
  }
  const generator = values.get("generator");
  const androidJar = values.get("android-jar");
  if (!generator || !androidJar) usage("Both --generator and --android-jar are required.");
  return {
    generator: resolve(generator),
    androidJar: resolve(androidJar),
    jars,
    out: resolve(values.get("out") ?? join(dirname(import.meta.filename), "..", "metadata")),
  };
}

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(
        new Error(
          `${basename(command)} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
  });
}

const options = parseArgs(process.argv.slice(2));
await mkdir(options.out, { recursive: true });
const work = await mkdtemp(join(tmpdir(), "scriptc-android-metadata-"));
try {
  const dependencies = [options.androidJar, ...options.jars];
  await Promise.all([
    writeFile(join(work, "mdg-output-dir.txt"), `${options.out}\n`),
    writeFile(join(work, "mdg-java-dependencies.txt"), `${dependencies.join("\n")}\n`),
    writeFile(join(work, "mdg-java-out.txt"), ""),
  ]);
  await run("java", ["-jar", options.generator], work);
  const digest = async (path) =>
    createHash("sha256").update(await readFile(path)).digest("hex");
  const streams = [
    "treeNodeStream.dat",
    "treeStringsStream.dat",
    "treeValueStream.dat",
  ];
  await writeFile(
    join(options.out, "manifest.json"),
    `${JSON.stringify(
      {
        format: "nativescript-android-metadata-v1",
        generator: {
          file: basename(options.generator),
          sha256: await digest(options.generator),
        },
        dependencies: await Promise.all(
          dependencies.map(async (path) => ({
            file: basename(path),
            sha256: await digest(path),
          })),
        ),
        streams: Object.fromEntries(
          await Promise.all(
            streams.map(async (name) => [name, await digest(join(options.out, name))]),
          ),
        ),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`NativeScript Android metadata written to ${options.out}`);
} finally {
  await rm(work, { recursive: true, force: true });
}

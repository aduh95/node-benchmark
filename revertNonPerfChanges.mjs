#!/usr/bin/env node
import os from "os";
import readline from "readline";
import { spawn } from "child_process";

const [, , comparePath, archivePath, threshold = 9] = process.argv;
const { length: cpuCores } = os.cpus();

if (process.argv.length < 4) {
  console.error("Usage: $0 <path-to-compare.R> <archive-path> <threshold?=9>");
  console.error("\t Example: $0 benchmark/compare.R events.tgz");
  process.exit(1);
}

const subprocesses = new Set();
const subprocessExitPromises = new WeakMap();
async function spawnSubprocess(...args) {
  if (subprocesses.size >= cpuCores) {
    await Promise.any(
      Array.from(subprocesses, (cp) => {
        if (subprocessExitPromises.has(cp)) subprocessExitPromises.get(cp);
        else {
          const promise = new Promise((d) => cp.once("exit", d));
          subprocessExitPromises.set(cp, promise);
          return promise;
        }
      })
    );
  }
  const subprocess = spawn(...args);
  subprocesses.add(subprocess);

  subprocess.on("error", console.error);
  subprocess.stderr.pipe(process.stderr);

  subprocess.once("exit", () => {
    subprocesses.delete(subprocess);
  });

  return subprocess;
}

const ls = await spawnSubprocess("tar", ["-tzf", archivePath, "'*.csv'"]);

const row = /^([^*]+)\s+(\**\s*)(-?\d+\.\d\d)\s%(?:\s+.\d+\.\d+%){3}$/;
const results = {};
const handleLine = (diffFile) => (line) => {
  if (line.endsWith("%")) {
    const [, test, confidence, resultString] = line.match(row);
    results[test] ??= {
      files: [],
      data: [],
      hasConfidentResults: false,
    };

    results[test].files.push(diffFile);
    results[test].data.push(parseFloat(resultString));

    if (confidence) {
      results[test].hasConfidentResults = true;
    }
  }
};

for await (const csv of readline.createInterface({ input: ls.stdin })) {
  const rProcess = await spawnSubprocess("Rscript", [comparePath]);
  const untar = await spawnSubprocess("tar", ["-xOzf", archivePath, csv]);

  untar.stdout.pipe(rProcess.stdin);
  readline
    .createInterface({ input: rProcess.stdout })
    .on("line", handleLine(csv.replace(/\.csv$/, ".diff")));
}

await Promise.all(
  Array.from(subprocesses, (cp) => {
    if (subprocessExitPromises.has(cp)) subprocessExitPromises.get(cp);
    else {
      const promise = new Promise((d) => cp.once("exit", d));
      subprocessExitPromises.set(cp, promise);
      return promise;
    }
  })
);

function stats(arr) {
  const all = arr.filter(Number);
  console.log(`Mean: ${mean(all)}`);
  console.log(`Median: ${median(all)}`);
  const max = Math.max(...all);
  console.log(`Change ${arr.indexOf(max)}: ${max} instead of ${median(all)}`);
  // lineNumbers.add(arr.indexOf(max));
  console.log(`\tBest result: ${max} (for change ${arr.indexOf(max)})`);
  const min = Math.min(...all);
  console.log(`\tWorst result: ${min} (for change ${arr.indexOf(min)})`);
}
function mean(arr) {
  let i = 0;
  let total = 0;
  for (const result of arr) {
    total += result;
    i++;
  }
  return total / i;
}
function median(arr) {
  const sortedValues = [...arr];
  sortedValues.sort((a, b) => a - b);
  return sortedValues[((arr.length - 1) / 2) | 0];
}

const diffFiles2Apply = new Set();
for (const { files, data, hasConfidentResults } of Object.values(results)) {
  //   console.log(all);
  if (hasConfidentResults) {
    // console.log(`${test.trim()}:`);
    // console.log(
    //   `Ratio of confident results: ${confidentResults.length / all.length}`
    // );
    // stats(all);
    // stats(confidentResults);
    const computedMedian = median(data);
    if (computedMedian < -3) {
      const max = Math.max(...data);

      if (max - computedMedian > threshold) {
        diffFiles2Apply.add(files[data.indexOf(max)]);
      }
    }
  }
}

(
  await spawnSubprocess("tar", ["-xOzf", archivePath, ...diffFiles2Apply])
).stdout.pipe(process.stdout);

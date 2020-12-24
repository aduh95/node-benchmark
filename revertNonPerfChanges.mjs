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

let aliveSubProcesses = 0;
async function spawnSubprocess(...args) {
  while (aliveSubProcesses >= cpuCores) {
    await new Promise(setImmediate);
  }
  const subprocess = spawn(...args);

  subprocess.on("error", console.error);
  subprocess.stderr.pipe(process.stderr);

  subprocess.once("exit", () => {
    aliveSubProcesses--;
  });
  aliveSubProcesses++;

  return subprocess;
}

const ls = await spawnSubprocess("tar", ["-tzf", archivePath, "*.csv"]);

const row = /^([^*]+)\s+(\**\s*)(-?\d+\.\d\d)\s%(?:\s+.\d+\.\d+%){3}$/;
let testNameMaxLength = 0;
const results = {};
const handleLine = (diffFile) => (line) => {
  if (line.endsWith("%")) {
    const [, testName, confidence, resultString] = line.match(row);
    const test = testName.trim();
    if (test.length > testNameMaxLength) testNameMaxLength = test.length;

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

for await (const csv of readline.createInterface({ input: ls.stdout })) {
  const rProcess = await spawnSubprocess("Rscript", [comparePath]);
  const untar = await spawnSubprocess("tar", ["-xOzf", archivePath, csv]);

  untar.stdout.pipe(rProcess.stdin);
  readline
    .createInterface({ input: rProcess.stdout })
    .on("line", handleLine(csv.replace(/\.csv$/, ".diff")));
}

while (aliveSubProcesses) {
  await new Promise(setImmediate);
}

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
console.error(`${"Test name".padEnd(testNameMaxLength)}\tMedian\tBest\tDiff`);
for (const [test, { files, data, hasConfidentResults }] of Object.entries(
  results
)) {
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
      const diff = max - computedMedian;

      if (diff > threshold) {
        console.error(
          `${test.padEnd(
            testNameMaxLength
          )}\t${computedMedian}%\t${max}%\t${diff.toFixed(2)}%`
        );
        diffFiles2Apply.add(files[data.indexOf(max)]);
      }
    }
  }
}

(
  await spawnSubprocess("tar", ["-xOzf", archivePath, ...diffFiles2Apply])
).stdout.pipe(process.stdout);

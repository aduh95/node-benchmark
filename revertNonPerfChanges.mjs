#!/usr/bin/env node
import os from "os";
import readline from "readline";
import { spawn } from "child_process";
import { createReadStream } from "fs";

const [, , comparePath, filePath] = process.argv;
const { length: cpuCores } = os.cpus();

const lineNumberRegex = /^[^-]+-(\d+)\.csv$/;
const row = /^([^*]+)\s+(\**\s*)(-?\d+\.\d\d)\s%(?:\s+.\d+\.\d+%){3}$/;
const results = {};
const handleLine = (currentLineNumber) => (line) => {
  if (line.endsWith("%")) {
    const [, test, confidence, resultString] = line.match(row);
    results[test] ??= {
      all: [],
      confidentResults: [],
    };

    const result = parseFloat(resultString);
    results[test].all[currentLineNumber] = result;
    if (confidence) {
      results[test].confidentResults[currentLineNumber] = result;
    }
  }
};

let aliveSubProcesses = 0;
async function spawnSubprocess(...args) {
  while (aliveSubProcesses >= cpuCores) {
    await new Promise(setImmediate);
  }
  return spawn(...args);
}
for await (const line of readline.createInterface({ input: process.stdin })) {
  const rProcess = await spawnSubprocess("Rscript", [comparePath]);

  rProcess.on("error", console.error);
  rProcess.stderr.pipe(process.stderr);

  createReadStream(line).pipe(rProcess.stdin);
  readline
    .createInterface({ input: rProcess.stdout })
    .on("line", handleLine(line.match(lineNumberRegex)[1]));
  rProcess.on("exit", () => {
    aliveSubProcesses--;
  });
  aliveSubProcesses++;
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

const lineNumbers = new Set();
for (const { all, confidentResults } of Object.values(results)) {
  //   console.log(all);
  if (confidentResults.length !== 0 && new Set(all).size > 2) {
    // console.log(`${test.trim()}:`);
    // console.log(
    //   `Ratio of confident results: ${confidentResults.length / all.length}`
    // );
    // stats(all);
    // stats(confidentResults);
    const max = Math.max(...all.filter(Number));
    lineNumbers.add(all.indexOf(max));
  }
}

{
  const gitDiff = spawn("git", ["diff", "HEAD", "upstream/master", filePath]);
  const diffSep = /^@@\s-\d+,\d+\s\+(\d+),\d+\s@@/;

  gitDiff.on("error", console.error);
  gitDiff.stderr.pipe(process.stderr);

  let outputEnabled = true;
  for await (const line of readline.createInterface({
    input: gitDiff.stdout,
  })) {
    if (line.startsWith("@@")) {
      outputEnabled = lineNumbers.has(parseInt(line.match(diffSep)[1]));
    }
    if (outputEnabled) {
      process.stdout.write(`${line}\n`);
    }
  }
}
